'''Normalize provider RawBundles into the Darkmap relational + search schema.'''
from typing import Dict, List, Optional

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import audit
from .extract import domain_of, extract
from .models import (Account, Brand, Comment, Entity, MediaAsset, Post, SearchDocument, utcnow)
from .providers.base import RawBundle


def _lower(value: Optional[str]) -> Optional[str]:
    return value.lower() if isinstance(value, str) else None


def upsert_account(session: Session, bundle: RawBundle) -> Account:
    ra = bundle.account
    handle = (ra.handle or '').lstrip('@')
    if not handle:
        raise ValueError('bundle has no account handle')
    acc = session.scalar(select(Account).where(
        Account.platform == ra.platform, Account.handle_lower == handle.lower()))
    if acc is None:
        acc = Account(platform=ra.platform, handle=handle, handle_lower=handle.lower(),
                      first_seen_at=utcnow())
        session.add(acc)
    for field in ('platform_account_id', 'display_name', 'biography', 'external_url',
                  'profile_pic_url', 'is_verified', 'is_business', 'followers_count',
                  'follows_count', 'media_count', 'account_created_at'):
        value = getattr(ra, field)
        if value is not None:
            setattr(acc, field, value)
    acc.last_seen_at = utcnow()
    acc.provenance = bundle.provenance or {}
    acc.raw = ra.raw or {}
    session.flush()
    return acc


def _store_entities(session: Session, *, account_id: int, post_id: Optional[int],
                    comment_id: Optional[int], text: str, source_field: str) -> List[Entity]:
    found = extract(text)
    rows: List[Entity] = []
    for kind, values in found.items():
        for value in values:
            rows.append(Entity(account_id=account_id, post_id=post_id, comment_id=comment_id,
                               kind=kind, value=value[:600], value_lower=value.lower()[:600],
                               domain=domain_of(value) if kind == 'url' else None,
                               source_field=source_field))
    session.add_all(rows)
    return rows


def ingest_bundle(session: Session, bundle: RawBundle,
                  brand: Optional[Brand] = None) -> Dict[str, int]:
    acc = upsert_account(session, bundle)
    if brand is not None and acc.brand_id is None:
        acc.brand_id = brand.id

    # Entities are rebuilt on every ingest so the index never drifts.
    session.execute(delete(Entity).where(Entity.account_id == acc.id))
    _store_entities(session, account_id=acc.id, post_id=None, comment_id=None,
                    text=' '.join(filter(None, [acc.biography, acc.display_name])),
                    source_field='bio')
    if acc.external_url:
        session.add(Entity(account_id=acc.id, kind='url', value=acc.external_url[:600],
                           value_lower=acc.external_url.lower()[:600],
                           domain=domain_of(acc.external_url), source_field='external_url'))

    counts = {'posts': 0, 'media': 0, 'comments': 0}
    for rp in bundle.posts:
        pid = rp.platform_post_id or rp.shortcode or rp.permalink
        post = session.scalar(select(Post).where(
            Post.account_id == acc.id, Post.platform_post_id == pid)) if pid else None
        if post is None:
            post = Post(account_id=acc.id, platform_post_id=pid)
            session.add(post)
        post.shortcode = rp.shortcode
        post.post_type = (rp.post_type or 'post').lower()
        post.permalink = rp.permalink
        post.caption = rp.caption
        post.caption_lower = _lower(rp.caption)
        post.posted_at = rp.posted_at
        post.like_count = rp.like_count
        post.comment_count = rp.comment_count
        post.view_count = rp.view_count
        post.share_count = rp.share_count
        post.language = rp.language
        post.provenance = bundle.provenance or {}
        post.raw = rp.raw or {}
        post.ingested_at = utcnow()
        session.flush()
        counts['posts'] += 1

        session.execute(delete(MediaAsset).where(MediaAsset.post_id == post.id))
        for rm in rp.media:
            media_observations = dict(rm.exif or {})
            for key in ('transcript', 'qr_payloads', 'brand_match_score',
                        'synthetic_media_score'):
                value = getattr(rm, key, None)
                if value not in (None, [], ''):
                    media_observations[key] = value
            session.add(MediaAsset(
                post_id=post.id, media_type=rm.media_type, media_url=rm.media_url,
                thumbnail_url=rm.thumbnail_url, width=rm.width, height=rm.height,
                duration_seconds=rm.duration_seconds, mime_type=rm.mime_type,
                byte_size=rm.byte_size, perceptual_hash=rm.perceptual_hash,
                ocr_text=rm.ocr_text, exif=media_observations,
                provenance=bundle.provenance or {}))
            counts['media'] += 1

        session.execute(delete(Comment).where(Comment.post_id == post.id))
        session.flush()
        for rc in rp.comments:
            comment = Comment(post_id=post.id, platform_comment_id=rc.platform_comment_id,
                              parent_platform_comment_id=rc.parent_platform_comment_id,
                              author_handle=rc.author_handle, text=rc.text,
                              text_lower=_lower(rc.text), like_count=rc.like_count,
                              created_at=rc.created_at, provenance=bundle.provenance or {})
            session.add(comment)
            session.flush()
            counts['comments'] += 1
            _store_entities(session, account_id=acc.id, post_id=post.id, comment_id=comment.id,
                            text=rc.text or '', source_field='comment')

        caption_text = ' '.join(filter(None, [rp.caption] + [m.ocr_text for m in rp.media]))
        _store_entities(session, account_id=acc.id, post_id=post.id, comment_id=None,
                        text=caption_text, source_field='caption')

    session.flush()
    reindex_account(session, acc)
    audit.record(session, action='ingest.normalize', provider=(bundle.provenance or {}).get('provider'),
                 target=acc.handle, status='ok',
                 lawful_basis=(bundle.provenance or {}).get('lawful_basis'), detail=counts)
    counts['account_id'] = acc.id
    return counts


def reindex_account(session: Session, acc: Account) -> None:
    ents = session.scalars(select(Entity).where(Entity.account_id == acc.id)).all()

    def vals(kind: str, post_id=None):
        return sorted({e.value_lower for e in ents
                       if e.kind == kind and (post_id is None or e.post_id == post_id)})

    session.execute(delete(SearchDocument).where(SearchDocument.account_id == acc.id))
    body = ' \n '.join(filter(None, [acc.display_name, acc.biography, acc.external_url]))
    session.add(SearchDocument(
        doc_type='account', account_id=acc.id, post_id=None, handle=acc.handle,
        title=acc.display_name or acc.handle, body=body, body_lower=(body or '').lower(),
        hashtags=vals('hashtag'), mentions=vals('mention'),
        domains=sorted({e.domain for e in ents if e.kind == 'url' and e.domain}),
        risk_score=acc.latest_risk_score, posted_at=acc.last_seen_at))

    for post in session.scalars(select(Post).where(Post.account_id == acc.id)).all():
        ocr = ' '.join(m.ocr_text or '' for m in post.media)
        comment_text = ' \n '.join(comment.text or '' for comment in post.comments)
        body = ' \n '.join(filter(None, [post.caption, ocr, comment_text]))
        session.add(SearchDocument(
            doc_type='post', account_id=acc.id, post_id=post.id, handle=acc.handle,
            title=f'{acc.handle} {post.post_type}', body=body,
            body_lower=(body or '').lower(),
            hashtags=vals('hashtag', post.id), mentions=vals('mention', post.id),
            domains=sorted({e.domain for e in ents
                            if e.kind == 'url' and e.post_id == post.id and e.domain}),
            risk_score=acc.latest_risk_score, posted_at=post.posted_at))
    session.flush()

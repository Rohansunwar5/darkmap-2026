'''Build the analysis dossier for an account from the normalized schema.'''
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Account, Brand, Entity, Post

MAX_POSTS = 40
MAX_COMMENTS = 12


def post_document(post: Post) -> Dict[str, Any]:
    """Serialize one stored post for deterministic content-level analysis."""
    return {
        'id': post.id,
        'platform_post_id': post.platform_post_id,
        'post_type': post.post_type,
        'permalink': post.permalink,
        'caption': post.caption,
        'posted_at': post.posted_at.isoformat() if post.posted_at else None,
        'engagement': {'likes': post.like_count, 'comments': post.comment_count,
                       'views': post.view_count, 'shares': post.share_count},
        'media': [{'media_type': media.media_type, 'mime_type': media.mime_type,
                   'width': media.width, 'height': media.height,
                   'duration_seconds': media.duration_seconds,
                   'perceptual_hash': media.perceptual_hash, 'ocr_text': media.ocr_text,
                   'media_url': media.media_url, 'thumbnail_url': media.thumbnail_url,
                   'analysis': media.exif or {}}
                  for media in post.media],
        'comments': [{'author_handle': comment.author_handle, 'text': comment.text,
                      'platform_comment_id': comment.platform_comment_id,
                      'parent_platform_comment_id': comment.parent_platform_comment_id,
                      'like_count': comment.like_count,
                      'created_at': (comment.created_at.isoformat()
                                     if comment.created_at else None)}
                     for comment in post.comments[:MAX_COMMENTS]],
    }


def _brand_for(session: Session, acc: Account, brand_id: Optional[int]) -> Optional[Brand]:
    if brand_id:
        return session.get(Brand, brand_id)
    if acc.brand_id:
        return session.get(Brand, acc.brand_id)
    # best-effort: first brand whose name appears in handle/bio
    haystack = ' '.join(filter(None, [acc.handle_lower, (acc.biography or '').lower(),
                                      (acc.display_name or '').lower()]))
    for brand in session.scalars(select(Brand)).all():
        tokens = [brand.name] + list(brand.keywords or [])
        if any(t and t.lower() in haystack for t in tokens):
            return brand
    return None


def build(session: Session, account_id: int, brand_id: Optional[int] = None,
          media_analysis: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    acc = session.get(Account, account_id)
    if acc is None:
        raise ValueError(f'account {account_id} not found')
    brand = _brand_for(session, acc, brand_id)

    posts = session.scalars(
        select(Post).where(Post.account_id == acc.id)
        .order_by(Post.posted_at.desc().nullslast() if hasattr(Post.posted_at.desc(), 'nullslast')
                  else Post.posted_at.desc())
        .limit(MAX_POSTS)).all()

    post_docs = []
    stored_media_analysis = []
    for p in posts:
        post_docs.append(post_document(p))
        for m in p.media:
            observation = dict(m.exif or {})
            if m.ocr_text:
                observation['ocr_text'] = m.ocr_text
            if m.perceptual_hash:
                observation['perceptual_hash'] = m.perceptual_hash
            if observation:
                observation.update({'post_id': p.id, 'media_id': m.id,
                                    'media_url': m.media_url,
                                    'thumbnail_url': m.thumbnail_url})
                stored_media_analysis.append(observation)

    entities = [{'kind': e.kind, 'value': e.value, 'domain': e.domain,
                 'source_field': e.source_field, 'post_id': e.post_id,
                 'comment_id': e.comment_id}
                for e in session.scalars(
                    select(Entity).where(Entity.account_id == acc.id).limit(500)).all()]

    return {
        'brand': ({'name': brand.name,
                   'official_handles': brand.official_handles or [],
                   'official_domains': brand.official_domains or [],
                   'keywords': brand.keywords or []} if brand else None),
        'account': {
            'id': acc.id,
            'platform': acc.platform,
            'handle': acc.handle,
            'display_name': acc.display_name,
            'biography': acc.biography,
            'external_url': acc.external_url,
            'is_verified': acc.is_verified,
            'is_business': acc.is_business,
            'followers_count': acc.followers_count,
            'follows_count': acc.follows_count,
            'media_count': acc.media_count,
            'account_created_at': (acc.account_created_at.isoformat()
                                   if acc.account_created_at else None),
            'first_seen_at': acc.first_seen_at.isoformat() if acc.first_seen_at else None,
        },
        'provenance': acc.provenance or {},
        'posts': post_docs,
        'entities': entities,
        'media_analysis': list(media_analysis or []) + stored_media_analysis,
    }

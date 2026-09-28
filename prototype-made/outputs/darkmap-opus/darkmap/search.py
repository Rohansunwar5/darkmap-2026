'''Search over the normalized schema (portable SQLite/PostgreSQL).'''
import datetime as dt
from typing import Any, Dict, List, Optional

from sqlalchemy import Text, cast, func, or_, select
from sqlalchemy.orm import Session

from .models import Account, Comment, MediaAsset, Post, SearchDocument


def _like_fragment(value: str) -> str:
    return value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


def _snippet(body: Optional[str], term: Optional[str], width: int = 180) -> Optional[str]:
    if not body:
        return None
    if not term:
        return body[:width]
    idx = body.lower().find(term.lower())
    if idx < 0:
        return body[:width]
    start = max(0, idx - width // 3)
    return ('...' if start else '') + body[start:start + width] + ('...' if start + width < len(body) else '')


def search(session: Session, *, q: Optional[str] = None, doc_type: Optional[str] = None,
           scope: str = 'all',
           account_ids: Optional[List[int]] = None,
           handle: Optional[str] = None, hashtag: Optional[str] = None,
           domain: Optional[str] = None, mention: Optional[str] = None,
           min_risk: Optional[float] = None, since: Optional[dt.datetime] = None,
           until: Optional[dt.datetime] = None, limit: int = 25,
           offset: int = 0) -> Dict[str, Any]:
    stmt = select(SearchDocument)
    if doc_type:
        stmt = stmt.where(SearchDocument.doc_type == doc_type)
    if account_ids is not None:
        if not account_ids:
            return {'query': q, 'scope': scope, 'total': 0, 'total_all': 0,
                    'facets': {'accounts': 0, 'posts': 0, 'hashtags': 0,
                               'mentions': 0, 'urls': 0}, 'hits': []}
        stmt = stmt.where(SearchDocument.account_id.in_(account_ids))
    if handle:
        stmt = stmt.where(func.lower(SearchDocument.handle) == handle.lower().lstrip('@'))
    if min_risk is not None:
        stmt = stmt.where(SearchDocument.risk_score >= min_risk)
    if since:
        stmt = stmt.where(SearchDocument.posted_at >= since)
    if until:
        stmt = stmt.where(SearchDocument.posted_at <= until)
    normalized_query = q.lower().strip().lstrip('#@') if q else ''
    if normalized_query:
        term = f'%{_like_fragment(normalized_query)}%'
        stmt = stmt.where(or_(SearchDocument.body_lower.like(term, escape='\\'),
                              func.lower(SearchDocument.handle).like(term, escape='\\'),
                              func.lower(SearchDocument.title).like(term, escape='\\'),
                              func.lower(cast(SearchDocument.hashtags, Text)).like(term, escape='\\'),
                              func.lower(cast(SearchDocument.mentions, Text)).like(term, escape='\\'),
                              func.lower(cast(SearchDocument.domains, Text)).like(term, escape='\\')))

    rows: List[SearchDocument] = list(session.scalars(stmt.limit(2000)).all())
    row_account_ids = {int(row.account_id) for row in rows if row.account_id is not None}
    row_post_ids = {int(row.post_id) for row in rows if row.post_id is not None}
    accounts = ({item.id: item for item in session.scalars(
        select(Account).where(Account.id.in_(row_account_ids))).all()}
        if row_account_ids else {})
    posts = ({item.id: item for item in session.scalars(
        select(Post).where(Post.id.in_(row_post_ids))).all()}
        if row_post_ids else {})
    media_by_post: Dict[int, MediaAsset] = {}
    all_media_by_post: Dict[int, List[MediaAsset]] = {}
    comments_by_post: Dict[int, List[Comment]] = {}
    if row_post_ids:
        for item in session.scalars(
                select(MediaAsset).where(MediaAsset.post_id.in_(row_post_ids))
                .order_by(MediaAsset.id)).all():
            all_media_by_post.setdefault(item.post_id, []).append(item)
            current = media_by_post.get(item.post_id)
            if current is None or (not current.thumbnail_url and item.thumbnail_url):
                media_by_post[item.post_id] = item
        for item in session.scalars(
                select(Comment).where(Comment.post_id.in_(row_post_ids))
                .order_by(Comment.created_at, Comment.id)).all():
            comments_by_post.setdefault(item.post_id, []).append(item)

    def has(json_list, needle: str) -> bool:
        needle = needle.lower().lstrip('#@')
        return any(needle == str(v).lower().lstrip('#@') for v in (json_list or []))

    def contains(json_list, needle: str) -> bool:
        needle = needle.lower().lstrip('#@')
        return any(needle in str(v).lower().lstrip('#@') for v in (json_list or []))

    def matched_fields(r: SearchDocument) -> List[str]:
        if not normalized_query:
            fields = [r.doc_type]
            if r.hashtags:
                fields.append('hashtags')
            if r.mentions:
                fields.append('mentions')
            if r.domains:
                fields.append('urls')
            return fields
        fields = []
        if normalized_query in (r.handle or '').lower():
            fields.append('account')
        if normalized_query in (r.title or '').lower():
            fields.append('title')
        if normalized_query in (r.body_lower or ''):
            fields.append('content')
        if contains(r.hashtags, normalized_query):
            fields.append('hashtags')
        if contains(r.mentions, normalized_query):
            fields.append('mentions')
        if contains(r.domains, normalized_query):
            fields.append('urls')
        return fields

    if hashtag:
        rows = [r for r in rows if has(r.hashtags, hashtag)]
    if mention:
        rows = [r for r in rows if has(r.mentions, mention)]
    if domain:
        d = domain.lower()
        rows = [r for r in rows if any(d == str(x).lower() or str(x).lower().endswith('.' + d)
                                       for x in (r.domains or []))]

    rows_with_fields = [(r, matched_fields(r)) for r in rows]
    if normalized_query:
        rows_with_fields = [(r, fields) for r, fields in rows_with_fields if fields]

    facets = {
        'accounts': sum(r.doc_type == 'account' for r, _ in rows_with_fields),
        'posts': sum(r.doc_type == 'post' for r, _ in rows_with_fields),
        'hashtags': sum('hashtags' in fields for _, fields in rows_with_fields),
        'mentions': sum('mentions' in fields for _, fields in rows_with_fields),
        'urls': sum('urls' in fields for _, fields in rows_with_fields),
    }
    total_all = len(rows_with_fields)
    if scope == 'accounts':
        rows_with_fields = [(r, fields) for r, fields in rows_with_fields if r.doc_type == 'account']
    elif scope == 'posts':
        rows_with_fields = [(r, fields) for r, fields in rows_with_fields if r.doc_type == 'post']
    elif scope in ('hashtags', 'mentions', 'urls'):
        rows_with_fields = [(r, fields) for r, fields in rows_with_fields if scope in fields]

    def rank_factors(r: SearchDocument) -> Dict[str, float]:
        # Fraud evidence remains the main factor. Among similarly relevant/scored results,
        # smaller accounts rise because throwaway impersonators usually have limited reach;
        # established and verified mention pages receive a downward investigation-priority
        # adjustment without being allowed to hide strong fraud evidence.
        factors = {
            'risk': float(r.risk_score or 0) / 10.0,
            'query_relevance': 0.0,
            'content_relevance': 0.0,
            'low_follower_priority': 0.0,
            'verified_discount': 0.0,
            'document_type': 0.2 if r.doc_type == 'account' else 0.0,
        }
        if normalized_query:
            ql = normalized_query
            handle_lower = (r.handle or '').lower()
            if handle_lower == ql:
                factors['query_relevance'] = 3.0
            elif handle_lower.startswith(ql):
                factors['query_relevance'] = 2.2
            elif ql in handle_lower:
                factors['query_relevance'] = 1.5
            if r.body_lower:
                factors['content_relevance'] = min(1.0, r.body_lower.count(ql) * 0.25)
        account = accounts.get(r.account_id)
        if account and account.is_verified:
            factors['verified_discount'] = -0.9
        followers = account.followers_count if account else None
        if isinstance(followers, int):
            if followers < 100:
                factors['low_follower_priority'] = 2.6
            elif followers < 1_000:
                factors['low_follower_priority'] = 2.2
            elif followers < 10_000:
                factors['low_follower_priority'] = 1.5
            elif followers < 100_000:
                factors['low_follower_priority'] = 0.5
            elif followers < 1_000_000:
                factors['low_follower_priority'] = -0.8
            else:
                factors['low_follower_priority'] = -1.3
        return factors

    def rank(r: SearchDocument) -> float:
        return sum(rank_factors(r).values())

    rows_with_fields.sort(key=lambda item: (rank(item[0]), item[0].posted_at or dt.datetime.min),
                          reverse=True)
    total = len(rows_with_fields)
    page = rows_with_fields[offset:offset + limit]
    hits = []
    for r, fields in page:
        account = accounts.get(r.account_id)
        post = posts.get(r.post_id) if r.post_id is not None else None
        media = media_by_post.get(r.post_id) if r.post_id is not None else None
        all_media = all_media_by_post.get(r.post_id, []) if r.post_id is not None else []
        comments = comments_by_post.get(r.post_id, []) if r.post_id is not None else []
        instagram_url = (post.permalink if post else
                         (f'https://www.instagram.com/{r.handle}/' if r.handle else None))
        profile_pic_url = account.profile_pic_url if account else None
        thumbnails = [item.thumbnail_url for item in all_media if item.thumbnail_url]
        still_images = [item.media_url for item in all_media
                        if item.media_url and (item.media_type or '').lower() == 'image'
                        and not item.media_url.lower().split('?', 1)[0].endswith(
                            ('.mp4', '.m4v', '.mov', '.webm'))]
        image_url = next(iter(thumbnails + still_images), None) or profile_pic_url
        hits.append({
            'doc_type': r.doc_type, 'account_id': r.account_id, 'post_id': r.post_id,
            'handle': r.handle, 'title': r.title, 'snippet': _snippet(r.body, normalized_query),
            'instagram_url': instagram_url, 'image_url': image_url,
            'profile_pic_url': profile_pic_url,
            'outbound_url': account.external_url if account and not post else None,
            'post_type': post.post_type if post else None,
            'is_verified': account.is_verified if account else None,
            'followers_count': account.followers_count if account else None,
            'follows_count': account.follows_count if account else None,
            'media_count': account.media_count if account else None,
            'like_count': post.like_count if post else None,
            'comment_count': post.comment_count if post else None,
            'view_count': post.view_count if post else None,
            'share_count': post.share_count if post else None,
            'language': post.language if post else None,
            'hashtags': r.hashtags or [], 'mentions': r.mentions or [],
            'domains': r.domains or [], 'matched_fields': fields,
            'content': r.body,
            'media': [{
                'type': item.media_type, 'url': item.media_url,
                'thumbnail_url': item.thumbnail_url, 'width': item.width,
                'height': item.height, 'duration_seconds': item.duration_seconds,
                'mime_type': item.mime_type, 'ocr_text': item.ocr_text,
            } for item in all_media],
            'comments': [{
                'author': item.author_handle, 'text': item.text,
                'like_count': item.like_count, 'created_at': item.created_at,
                'parent_id': item.parent_platform_comment_id,
            } for item in comments],
            'provenance': ((post.provenance if post else account.provenance) or {})
            if account else {},
            'risk_score': r.risk_score, 'posted_at': r.posted_at,
            'score': round(rank(r), 3),
            'ranking_factors': {key: round(value, 3)
                                for key, value in rank_factors(r).items()},
        })
    return {'query': q, 'scope': scope, 'total': total, 'total_all': total_all,
            'facets': facets, 'hits': hits}

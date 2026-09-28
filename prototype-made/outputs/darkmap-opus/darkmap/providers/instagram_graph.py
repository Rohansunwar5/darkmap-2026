'''Primary compliant Instagram collector built on Meta's official Graph API.

Supported collection modes:
* account: Business Discovery metadata and media for another professional account.
* owned: profile, media, and comments for the connected professional account.
* hashtag_recent / hashtag_top: public media returned by the approved Hashtag Search API.
* keyword: recent + top hashtag media with deduplication and professional-profile enrichment.
* tagged: media in which the connected professional account is tagged.

The provider never logs access-token query parameters, never follows arbitrary paging URLs,
and stops at configured item/page limits. Meta permissions still determine which fields are
actually returned.
'''
import datetime as dt
import re
import time
from collections import OrderedDict
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import select

from .. import audit
from ..config import get_settings
from ..http import FetchFailed, ManagedClient
from ..models import AuditLog, utcnow
from ..quota import QuotaExceeded
from .base import (CollectionNotPermitted, IngestionProvider, ProviderNotConfigured, RawAccount,
                   RawBundle, RawComment, RawMedia, RawPost)
from .export_file import parse_ts

PROFILE_FIELDS = (
    'id,username,name,biography,website,profile_picture_url,followers_count,follows_count,'
    'media_count'
)
MEDIA_FIELDS = (
    'id,username,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,'
    'timestamp,like_count,comments_count,view_count,children{media_type,media_url,thumbnail_url}'
)
COMMENT_FIELDS = 'id,parent_id,username,text,like_count,timestamp'
HASHTAG_RE = re.compile(r'^[A-Za-z0-9_]{1,100}$')
USERNAME_RE = re.compile(r'^[A-Za-z0-9._]{1,30}$')
MODES = {'account', 'owned', 'hashtag_recent', 'hashtag_top', 'keyword', 'tagged'}


class InstagramGraphProvider(IngestionProvider):
    name = 'instagram_graph'
    lawful_basis = 'official_api'

    def __init__(self, session, params=None, client: Optional[httpx.Client] = None,
                 sleep=time.sleep):
        super().__init__(session, params)
        self._client = client
        self._sleep = sleep

    def _settings(self):
        settings = get_settings()
        token = self.params.get('access_token') or settings.ig_access_token
        business_id = self.params.get('business_id') or settings.ig_business_id
        return settings, token, business_id

    def _mode(self) -> str:
        mode = str(self.params.get('mode') or 'account').lower()
        if mode not in MODES:
            raise CollectionNotPermitted(f'unsupported Instagram collection mode {mode!r}')
        return mode

    def check_configuration(self) -> None:
        _settings, token, business_id = self._settings()
        if not token or not business_id:
            raise ProviderNotConfigured(
                'instagram_graph requires DARKMAP_IG_ACCESS_TOKEN and DARKMAP_IG_BUSINESS_ID')

    def _managed(self) -> ManagedClient:
        return ManagedClient(self.session, self.name, self.lawful_basis,
                             client=self._client, sleep=self._sleep,
                             allow_cache=not self.params.get('fresh', False))

    def _limits(self):
        max_items = max(1, min(int(self.params.get('max_items', self.params.get('limit', 100))),
                               500))
        page_size = max(1, min(int(self.params.get('page_size', 50)), 100, max_items))
        max_pages = max(1, min(int(self.params.get('max_pages', 10)), 20))
        return max_items, page_size, max_pages

    def _page_edge(self, client: ManagedClient, url: str, params: Dict[str, Any],
                   data_path=('data',)) -> List[Dict[str, Any]]:
        max_items, page_size, max_pages = self._limits()
        items: List[Dict[str, Any]] = []
        cursor = None
        for _page in range(max_pages):
            page_params = dict(params)
            page_params['limit'] = min(page_size, max_items - len(items))
            if cursor:
                page_params['after'] = cursor
            payload = client.get(url, params=page_params).json() or {}
            node: Any = payload
            for key in data_path:
                node = (node or {}).get(key)
            items.extend(item for item in (node or []) if isinstance(item, dict))
            if len(items) >= max_items:
                break
            paging = payload
            for key in data_path[:-1]:
                paging = (paging or {}).get(key)
            paging = (paging or {}).get('paging') or {}
            cursor = (paging.get('cursors') or {}).get('after')
            if not cursor:
                break
        return items[:max_items]

    @staticmethod
    def _media(node: Dict[str, Any], comments=None) -> RawPost:
        product = str(node.get('media_product_type') or '').lower()
        kind = 'reel' if product in ('reels', 'clips') else (
            'carousel' if node.get('media_type') == 'CAROUSEL_ALBUM' else 'post')
        media = [RawMedia(media_type=str(node.get('media_type') or '').lower() or None,
                          media_url=node.get('media_url'),
                          thumbnail_url=node.get('thumbnail_url'))]
        for child in ((node.get('children') or {}).get('data') or []):
            media.append(RawMedia(media_type=str(child.get('media_type') or '').lower() or None,
                                  media_url=child.get('media_url'),
                                  thumbnail_url=child.get('thumbnail_url')))
        return RawPost(
            platform_post_id=str(node['id']) if node.get('id') is not None else None,
            post_type=kind, permalink=node.get('permalink'), caption=node.get('caption'),
            posted_at=parse_ts(node.get('timestamp')), like_count=node.get('like_count'),
            comment_count=node.get('comments_count'), view_count=node.get('view_count'),
            media=media, comments=comments or [], raw=node)

    @staticmethod
    def _account(node: Dict[str, Any], fallback: str) -> RawAccount:
        return RawAccount(
            handle=(node.get('username') or fallback).lstrip('@'),
            platform_account_id=str(node['id']) if node.get('id') is not None else None,
            display_name=node.get('name'), biography=node.get('biography'),
            external_url=node.get('website'), profile_pic_url=node.get('profile_picture_url'),
            is_business=True, followers_count=node.get('followers_count'),
            follows_count=node.get('follows_count'), media_count=node.get('media_count'),
            raw={key: value for key, value in node.items() if key != 'media'})

    def _provenance(self, mode: str, query: str, endpoint: str) -> Dict[str, Any]:
        return {
            'provider': self.name,
            'lawful_basis': self.lawful_basis,
            'collection_mode': mode,
            'query': query,
            'endpoint': endpoint,
            'api_version': get_settings().ig_api_base.rsplit('/', 1)[-1],
            'retrieved_at': dt.datetime.now(dt.timezone.utc).isoformat(),
        }

    def _account_discovery(self, client: ManagedClient, handle: str) -> List[RawBundle]:
        settings, token, business_id = self._settings()
        target = handle.lstrip('@').strip()
        if not USERNAME_RE.fullmatch(target):
            raise CollectionNotPermitted(
                'account mode requires a valid Instagram username (letters, numbers, dots, '
                'underscores; at most 30 characters)')
        max_items, page_size, max_pages = self._limits()
        media_nodes: List[Dict[str, Any]] = []
        profile: Dict[str, Any] = {}
        cursor = None
        url = f'{settings.ig_api_base}/{business_id}'
        for _page in range(max_pages):
            after = f'.after({cursor})' if cursor else ''
            fields = (f'business_discovery.username({target}){{{PROFILE_FIELDS},'
                      f'media.limit({min(page_size, max_items - len(media_nodes))}){after}'
                      f'{{{MEDIA_FIELDS}}}}}')
            payload = client.get(url, params={'fields': fields, 'access_token': token}).json() or {}
            discovered = payload.get('business_discovery') or {}
            if not profile:
                profile = discovered
            media = discovered.get('media') or {}
            media_nodes.extend(item for item in (media.get('data') or [])
                               if isinstance(item, dict))
            cursor = ((media.get('paging') or {}).get('cursors') or {}).get('after')
            if not cursor or len(media_nodes) >= max_items:
                break
        if not profile:
            raise CollectionNotPermitted(
                'Meta returned no Business Discovery data; the target may be private, personal, '
                'age-gated, unavailable, or outside the token permissions')
        provenance = self._provenance('account', target, url)
        bundle = RawBundle(account=self._account(profile, target),
                           posts=[self._media(node) for node in media_nodes[:max_items]],
                           provenance=provenance)
        return [bundle]

    def _profile_discovery(self, client: ManagedClient, handle: str) -> Optional[RawAccount]:
        """Fetch profile metadata for a discovered professional username without its feed."""
        settings, token, business_id = self._settings()
        target = handle.lstrip('@').strip()
        if not USERNAME_RE.fullmatch(target):
            return None
        url = f'{settings.ig_api_base}/{business_id}'
        fields = f'business_discovery.username({target}){{{PROFILE_FIELDS}}}'
        try:
            payload = client.get(url, params={'fields': fields, 'access_token': token}).json() or {}
        except FetchFailed as exc:
            audit.record(self.session, action='instagram.profile_enrichment', provider=self.name,
                         target=target, status='skipped', lawful_basis=self.lawful_basis,
                         detail={'reason': str(exc)[:300]})
            return None
        discovered = payload.get('business_discovery') or {}
        return self._account(discovered, target) if discovered else None

    def _comments(self, client: ManagedClient, media_id: str, token: str) -> List[RawComment]:
        if not self.params.get('include_comments', True):
            return []
        settings = get_settings()
        requested = max(1, min(int(self.params.get('comments_per_post', 50)), 100))
        original = self.params.get('max_items')
        self.params['max_items'] = requested
        try:
            nodes = self._page_edge(
                client, f'{settings.ig_api_base}/{media_id}/comments',
                {'fields': COMMENT_FIELDS, 'access_token': token})
        finally:
            if original is None:
                self.params.pop('max_items', None)
            else:
                self.params['max_items'] = original
        return [RawComment(
            platform_comment_id=str(item['id']) if item.get('id') is not None else None,
            parent_platform_comment_id=(str(item['parent_id'])
                                        if item.get('parent_id') is not None else None),
            author_handle=(item.get('username') or '').lstrip('@') or None,
            text=item.get('text'), like_count=item.get('like_count'),
            created_at=parse_ts(item.get('timestamp'))) for item in nodes]

    def _owned(self, client: ManagedClient) -> List[RawBundle]:
        settings, token, business_id = self._settings()
        profile_url = f'{settings.ig_api_base}/{business_id}'
        profile = client.get(profile_url, params={
            'fields': PROFILE_FIELDS, 'access_token': token}).json() or {}
        media_url = f'{settings.ig_api_base}/{business_id}/media'
        nodes = self._page_edge(client, media_url, {
            'fields': MEDIA_FIELDS, 'access_token': token})
        posts = []
        for node in nodes:
            media_id = str(node.get('id') or '')
            comments = self._comments(client, media_id, token) if media_id else []
            posts.append(self._media(node, comments))
        handle = str(profile.get('username') or business_id)
        return [RawBundle(account=self._account(profile, handle), posts=posts,
                          provenance=self._provenance('owned', handle, media_url))]

    def _multi_account_media(self, nodes: List[Dict[str, Any]], mode: str, query: str,
                             endpoint: str) -> List[RawBundle]:
        grouped: Dict[str, List[Dict[str, Any]]] = OrderedDict()
        for node in nodes:
            username = str(node.get('username') or '').lstrip('@').strip()
            if username:
                grouped.setdefault(username, []).append(node)
        provenance = self._provenance(mode, query, endpoint)
        return [RawBundle(account=RawAccount(handle=username),
                          posts=[self._media(item) for item in items],
                          provenance=dict(provenance))
                for username, items in grouped.items()]

    def _hashtag(self, client: ManagedClient, hashtag: str, mode: str) -> List[RawBundle]:
        settings, token, business_id = self._settings()
        tag = hashtag.lstrip('#').strip()
        if not HASHTAG_RE.fullmatch(tag):
            raise CollectionNotPermitted(
                'hashtag must contain only letters, numbers, or underscores')
        cutoff = utcnow() - dt.timedelta(days=7)
        recent = self.session.execute(select(AuditLog.target, AuditLog.at).where(
            AuditLog.action == 'instagram.hashtag_query',
            AuditLog.provider == self.name,
            AuditLog.at >= cutoff,
            AuditLog.actor == f'ig-user:{business_id}',
        ).order_by(AuditLog.at)).all()
        queried = {str(row.target or '').casefold() for row in recent}
        if tag.casefold() not in queried and len(queried) >= 30:
            oldest = recent[0].at if recent else utcnow()
            retry_after = max(1.0, ((oldest + dt.timedelta(days=7)) - utcnow()).total_seconds())
            raise QuotaExceeded('instagram_hashtags', 'rolling_7_days', retry_after)
        lookup_url = f'{settings.ig_api_base}/ig_hashtag_search'
        lookup = client.get(lookup_url, params={
            'user_id': business_id, 'q': tag, 'access_token': token}).json() or {}
        if tag.casefold() not in queried:
            audit.record(self.session, action='instagram.hashtag_query', provider=self.name,
                         target=tag.casefold(), actor=f'ig-user:{business_id}', status='ok',
                         lawful_basis=self.lawful_basis,
                         detail={'rolling_unique_count': len(queried) + 1})
        rows = lookup.get('data') or []
        hashtag_id = (rows[0] if rows else {}).get('id')
        if not hashtag_id:
            return []
        edge = 'recent_media' if mode == 'hashtag_recent' else 'top_media'
        media_url = f'{settings.ig_api_base}/{hashtag_id}/{edge}'
        nodes = self._page_edge(client, media_url, {
            'user_id': business_id, 'fields': MEDIA_FIELDS, 'access_token': token})
        return self._multi_account_media(nodes, mode, tag, media_url)

    def _keyword(self, client: ManagedClient, query: str) -> List[RawBundle]:
        """Run the broadest live discovery supported by Meta's official API.

        Meta does not expose unrestricted caption or account-name keyword search. A keyword is
        therefore resolved as an exact hashtag and queried against both recent and top media.
        Authors discovered in those results are enriched through Business Discovery when they
        are professional accounts visible to the configured token.
        """
        tag = query.lstrip('#').strip()
        if not HASHTAG_RE.fullmatch(tag):
            raise CollectionNotPermitted(
                'live keyword search maps to an exact Instagram hashtag and accepts only '
                'letters, numbers, or underscores; use @username for an exact account search')

        combined: "OrderedDict[str, RawBundle]" = OrderedDict()
        seen_posts: Dict[str, set] = {}
        endpoints = []
        for hashtag_mode in ('hashtag_recent', 'hashtag_top'):
            for bundle in self._hashtag(client, tag, hashtag_mode):
                handle = bundle.account.handle.casefold()
                if handle not in combined:
                    combined[handle] = RawBundle(
                        account=bundle.account, posts=[], provenance=dict(bundle.provenance))
                    seen_posts[handle] = set()
                endpoints.append(bundle.provenance.get('endpoint'))
                for post in bundle.posts:
                    key = post.platform_post_id or post.permalink or repr(post.raw)
                    if key not in seen_posts[handle]:
                        combined[handle].posts.append(post)
                        seen_posts[handle].add(key)

        profile_limit = max(0, min(int(self.params.get('profile_limit', 25)), 50))
        provenance = self._provenance('keyword', tag, ' + '.join(dict.fromkeys(filter(None, endpoints))))
        for index, bundle in enumerate(combined.values()):
            if index < profile_limit:
                profile = self._profile_discovery(client, bundle.account.handle)
                if profile is not None:
                    bundle.account = profile
            bundle.provenance = dict(provenance)
        return list(combined.values())

    def _tagged(self, client: ManagedClient) -> List[RawBundle]:
        settings, token, business_id = self._settings()
        url = f'{settings.ig_api_base}/{business_id}/tags'
        nodes = self._page_edge(client, url, {
            'fields': MEDIA_FIELDS, 'access_token': token})
        return self._multi_account_media(nodes, 'tagged', business_id, url)

    def fetch_many(self, handle: str) -> List[RawBundle]:
        self.check_configuration()
        mode = self._mode()
        with self._managed() as client:
            if mode == 'account':
                bundles = self._account_discovery(client, handle)
            elif mode == 'owned':
                bundles = self._owned(client)
            elif mode in ('hashtag_recent', 'hashtag_top'):
                bundles = self._hashtag(client, handle, mode)
            elif mode == 'keyword':
                bundles = self._keyword(client, handle)
            else:
                bundles = self._tagged(client)
        audit.record(self.session, action='ingest.fetch', provider=self.name,
                     target=handle.lstrip('@#'), status='ok', lawful_basis=self.lawful_basis,
                     detail={'mode': mode, 'accounts': len(bundles),
                             'posts': sum(len(bundle.posts) for bundle in bundles)})
        return bundles

    def fetch(self, handle: str) -> RawBundle:
        bundles = self.fetch_many(handle)
        if not bundles:
            raise CollectionNotPermitted('Instagram API returned no ingestible media/accounts')
        return bundles[0]

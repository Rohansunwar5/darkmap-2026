'''Public Instagram collection through Bright Data's contracted Scraper APIs.

This provider is the Meta-free collection path. It authenticates only to Bright Data,
never accepts Instagram cookies or passwords, and keeps all requests behind Darkmap's quota,
cache, retry/backoff, and audit controls.
'''
from __future__ import annotations

import datetime as dt
import json
import os
import re
import time
from collections import OrderedDict, defaultdict
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import quote_plus, urlsplit, urlunsplit

import httpx

from .. import audit
from ..config import get_settings
from ..http import FetchFailed, ManagedClient, SourceUnavailable
from .base import (CollectionNotPermitted, IngestionProvider, ProviderNotConfigured, RawAccount,
                   RawBundle, RawComment, RawMedia, RawPost)
from .export_file import parse_ts

PROFILE_DATASET = 'gd_l1vikfch901nx3by4'
POST_DATASET = 'gd_lk5ns7kz21pck8jpis'
REEL_DATASET = 'gd_lyclm20il4r5helnj'
COMMENT_DATASET = 'gd_ltppn085pokosxh13'
USERNAME_RE = re.compile(r'^[A-Za-z0-9._]{1,30}$')
MENTION_RE = re.compile(r'(?<![A-Za-z0-9._])@([A-Za-z0-9._]{1,30})')
SOURCE_HANDLE_RE = re.compile(
    r'instagram\s*[·|:\-]\s*@?([A-Za-z0-9._]{1,30})', re.IGNORECASE)
SUPPORTED_MODES = {'account', 'keyword', 'hashtag_recent', 'hashtag_top'}
RESERVED_PROFILE_PATHS = {
    'about', 'accounts', 'api', 'developer', 'direct', 'directory', 'emails', 'explore',
    'legal', 'privacy', 'reels', 'stories', 'web',
}
SERVERLESS_TOTAL_BUDGET_SECONDS = 145.0
SERVERLESS_PROCESSING_RESERVE_SECONDS = 12.0
SERVERLESS_DISCOVERY_BUDGET_SECONDS = 48.0


def _discovery_queries(keyword: str) -> List[Tuple[str, str]]:
    """Build a threat-first SERP plan for one protected-brand keyword.

    Serverless searches have a fixed wall-clock budget. Put queries most likely to expose
    actionable abuse first so a partial collection contains fraud evidence instead of only
    ordinary brand mentions. Broader coverage remains at the end when time permits.
    """
    return [
        # Keep high-signal phrases in separate searches. Google sometimes rewrites OR groups,
        # which made known scam-promotion evidence appear in one run and disappear in the next.
        # Separate reel/post searches are stable and preserve the exact Instagram permalink.
        (f'site:instagram.com/reel/ "{keyword}" "telegram channel"', 'in'),
        (f'site:instagram.com/reel/ "{keyword}" "loot"', 'in'),
        (f'site:instagram.com/reel/ "{keyword}" "free cash"', 'in'),
        (f'site:instagram.com/p/ "{keyword}" "telegram"', 'in'),
        (f'site:instagram.com/reel/ "{keyword}" "link in bio"', 'in'),
        (f'site:instagram.com "{keyword}" '
         '("giveaway" OR "discount" OR "scam")', 'in'),
        (f'site:instagram.com '
         f'("{keyword}_support" OR "{keyword}.support" OR "{keyword} customer care")', 'in'),
        # Discover the primary brand profile early enough for its profile snapshot to finish in
        # the first page budget, after the most actionable promotion/support branches.
        (f'site:instagram.com "{keyword}"', 'in'),
        (f'site:instagram.com "{keyword}" '
         '("support" OR "customer care" OR "helpdesk") '
         '("phone" OR "contact" OR "whatsapp" OR "refund")', 'in'),
        (f'site:instagram.com "{keyword}" '
         '("UPI" OR "payment" OR "delivery fee" OR "claim")', 'in'),
        (f'site:instagram.com "{keyword}" '
         '("account blocked" OR "KYC" OR "OTP" OR "login" OR "password reset")', 'in'),
        (f'site:instagram.com "{keyword}" '
         '("replica" OR "first copy" OR "factory price")', 'in'),
        (f'site:instagram.com "{keyword}" '
         '("job" OR "internship" OR "HR" OR "registration fee")', 'in'),
        (f'site:instagram.com "{keyword}" '
         '("APK" OR "install for refund" OR "investment" OR "trading signals")', 'in'),
        (f'site:instagram.com/p/ "{keyword}"', 'in'),
        (f'site:instagram.com/reel/ "{keyword}"', 'in'),
        (f'site:instagram.com "{keyword}"', 'us'),
    ]


def _first(node: Dict[str, Any], *names: str) -> Any:
    for name in names:
        value = node.get(name)
        if value not in (None, ''):
            return value
    return None


def _as_int(value: Any) -> Optional[int]:
    if value in (None, ''):
        return None
    # Dataset revisions sometimes wrap public counters as {"count": ...} instead of returning
    # a scalar. Preserve the value rather than treating a populated counter as missing.
    if isinstance(value, dict):
        return _as_int(_first(value, 'count', 'value', 'total'))
    text = str(value).strip().replace(',', '')
    # Search/profile payloads occasionally abbreviate public counters (for example
    # ``12.4K`` or ``3.1M followers``).  Normalise those values before they reach the
    # account model so an available follower count is not presented as missing.
    abbreviated = re.fullmatch(
        r'([0-9]+(?:\.[0-9]+)?)\s*([kmb])(?:\s+(?:followers?|following|posts?))?',
        text, re.IGNORECASE)
    if abbreviated:
        multiplier = {'k': 1_000, 'm': 1_000_000, 'b': 1_000_000_000}[
            abbreviated.group(2).lower()]
        return int(float(abbreviated.group(1)) * multiplier)
    # Some exports include the unit after a full, unabbreviated number.
    scalar = re.fullmatch(r'([0-9]+(?:\.[0-9]+)?)\s*(?:followers?|following|posts?)?',
                          text, re.IGNORECASE)
    try:
        return int(float(scalar.group(1) if scalar else text))
    except (TypeError, ValueError):
        return None


def _serp_followers(item: Dict[str, Any]) -> Optional[int]:
    """Read a public follower counter from full or light search-result shapes."""
    direct = _as_int(_first(
        item, 'followers', 'followers_count', 'follower_count', 'followed_by_count'))
    if direct is not None:
        return direct
    text = ' '.join(str(item.get(key) or '')
                    for key in ('title', 'description', 'snippet', 'source'))
    match = re.search(r'\b([0-9][0-9,.]*\s*[kmb]?)\s+followers?\b', text,
                      re.IGNORECASE)
    return _as_int(match.group(1)) if match else None


def _as_url(value: Any) -> Optional[str]:
    """Return the first usable URL from Bright Data's scalar, object, or list shapes."""
    if isinstance(value, list):
        for item in value:
            normalized = _as_url(item)
            if normalized:
                return normalized
        return None
    if isinstance(value, dict):
        return _as_url(_first(value, 'url', 'link', 'href'))
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return None


def _looks_like_video_url(value: Optional[str]) -> bool:
    if not value:
        return False
    try:
        path = urlsplit(value).path.casefold()
    except (TypeError, ValueError):
        path = str(value).casefold()
    return path.endswith(('.mp4', '.m4v', '.mov', '.webm'))


def _records(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict) and not item.get('error')]
    if isinstance(payload, dict):
        for key in ('data', 'results', 'items'):
            if isinstance(payload.get(key), list):
                return [item for item in payload[key]
                        if isinstance(item, dict) and not item.get('error')]
    return []


def _response_payload(response: Any) -> Any:
    """Decode Bright Data JSON responses, including newline-delimited snapshots."""
    text = response.text or ''
    try:
        return json.loads(text or 'null')
    except json.JSONDecodeError as error:
        records: List[Any] = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                raise error
        if records:
            return records
        raise


def _discovery_records(response: Any) -> List[Dict[str, Any]]:
    """A blank/invalid gateway response is a failed read, never evidence of zero matches."""
    payload = _response_payload(response)
    if isinstance(payload, dict) and 'body' in payload:
        payload = json.loads(payload['body']) if isinstance(payload['body'], str) else payload['body']
    if not isinstance(payload, dict) or not isinstance(payload.get('organic'), list):
        raise ValueError('Collection search returned an empty or invalid response')
    return [item for item in payload['organic'] if isinstance(item, dict)]


def _canonical_instagram_url(value: str) -> Optional[str]:
    try:
        parsed = urlsplit(value)
    except ValueError:
        return None
    if parsed.scheme != 'https' or (parsed.hostname or '').lower() not in {
            'instagram.com', 'www.instagram.com'}:
        return None
    parts = [part for part in parsed.path.split('/') if part]
    if not parts:
        return None
    return urlunsplit(('https', 'www.instagram.com', '/' + '/'.join(parts) + '/', '', ''))


def _url_kind(url: str) -> Optional[str]:
    parsed = urlsplit(url)
    parts = [part for part in parsed.path.split('/') if part]
    if not parts:
        return None
    if parts[0].lower() == 'p' and len(parts) >= 2:
        return 'post'
    if parts[0].lower() in {'reel', 'reels'} and len(parts) >= 2:
        return 'reel'
    if (len(parts) >= 3 and USERNAME_RE.fullmatch(parts[0])
            and parts[1].lower() in {'p', 'reel', 'reels'}):
        return 'post' if parts[1].lower() == 'p' else 'reel'
    if len(parts) == 1 and parts[0].lower() not in RESERVED_PROFILE_PATHS:
        return 'profile'
    return None


class BrightDataInstagramProvider(IngestionProvider):
    name = 'bright_data_instagram'
    lawful_basis = 'licensed_public_data_api'

    def __init__(self, session, params=None, client: Optional[httpx.Client] = None,
                 sleep=time.sleep):
        super().__init__(session, params)
        self._client = client
        self._sleep = sleep
        self._deadline: Optional[float] = None
        self.collection_partial = False
        self._serp_fallback: List[RawBundle] = []

    def _mode(self) -> str:
        mode = str(self.params.get('mode') or 'account').lower()
        if mode not in SUPPORTED_MODES:
            raise CollectionNotPermitted(
                f'Bright Data supports account and keyword/hashtag discovery, not {mode!r}; '
                'owned and tagged modes require the authorized Meta API')
        return mode

    def check_configuration(self) -> None:
        settings = get_settings()
        if not settings.bright_data_api_key:
            raise ProviderNotConfigured(
                'bright_data_instagram requires BRIGHT_DATA_API_KEY')
        if self._mode() != 'account' and not settings.bright_data_serp_zone:
            raise ProviderNotConfigured(
                'Bright Data keyword search requires BRIGHT_DATA_SERP_ZONE')

    def _managed(self) -> ManagedClient:
        return ManagedClient(self.session, self.name, self.lawful_basis,
                             client=self._client, sleep=self._sleep,
                             allow_cache=not self.params.get('fresh', False),
                             request_timeout=12.0 if os.getenv('VERCEL') else None)

    def _time_left(self) -> Optional[float]:
        if self._deadline is None:
            return None
        return max(0.0, self._deadline - time.monotonic())

    @staticmethod
    def _headers() -> Dict[str, str]:
        return {'Authorization': f'Bearer {get_settings().bright_data_api_key}',
                'Content-Type': 'application/json'}

    def _limit(self) -> int:
        return max(1, min(int(self.params.get('max_items', 100)), 500))

    def _await_snapshots(
            self, client: ManagedClient, tasks: List[Tuple[str, str]],
            tolerate_failures: bool = False,
            partial_grace_seconds: Optional[float] = None,
            max_wait_seconds: Optional[float] = None,
            ) -> Tuple[Dict[str, List[Dict[str, Any]]], List[FetchFailed]]:
        settings = get_settings()
        wait_seconds = (settings.bright_data_max_wait_seconds if max_wait_seconds is None
                        else min(settings.bright_data_max_wait_seconds, max_wait_seconds))
        deadline = time.monotonic() + max(5, wait_seconds)
        if self._deadline is not None:
            deadline = min(deadline, self._deadline - SERVERLESS_PROCESSING_RESERVE_SECONDS)
        pending = {snapshot_id: dataset_id for dataset_id, snapshot_id in tasks}
        collected: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        failures: List[FetchFailed] = []
        partial_ready_at: Optional[float] = None
        while pending and time.monotonic() < deadline:
            for snapshot_id, dataset_id in list(pending.items()):
                if time.monotonic() >= deadline:
                    break
                progress_url = (
                    f'{settings.bright_data_api_base}/datasets/v3/progress/{snapshot_id}')
                try:
                    progress = client.get(progress_url, headers=self._headers(),
                                          use_cache=False, consume_quota=False,
                                          max_retries=0).json() or {}
                except SourceUnavailable:
                    raise
                except FetchFailed as error:
                    failures.append(error)
                    pending.pop(snapshot_id, None)
                    continue
                status = str(progress.get('status') or '').lower()
                if status in {'ready', 'completed', 'done', 'success'}:
                    download_url = (
                        f'{settings.bright_data_api_base}/datasets/v3/snapshot/{snapshot_id}')
                    try:
                        response = client.get(download_url, params={'format': 'json'},
                                              headers=self._headers(), use_cache=False,
                                              max_retries=(0 if self._deadline is not None else 1))
                        collected[dataset_id].extend(_records(_response_payload(response)))
                        if collected[dataset_id] and partial_ready_at is None:
                            partial_ready_at = time.monotonic()
                    except SourceUnavailable:
                        raise
                    except FetchFailed as error:
                        failures.append(error)
                    pending.pop(snapshot_id, None)
                elif status in {'failed', 'error', 'cancelled', 'canceled'}:
                    failures.append(FetchFailed(
                        f'Bright Data snapshot {snapshot_id} ended with status {status}'))
                    pending.pop(snapshot_id, None)
            if (pending and partial_grace_seconds is not None and partial_ready_at is not None
                    and time.monotonic() - partial_ready_at >= partial_grace_seconds):
                break
            if pending and time.monotonic() < deadline:
                # Progress checks are read-only monitoring calls, so they do not consume the
                # collection quota. Five seconds is Bright Data's recommended polling cadence.
                self._sleep(min(5.0, max(0.0, deadline - time.monotonic())))
        for snapshot_id in pending:
            failures.append(FetchFailed(
                f'Bright Data snapshot {snapshot_id} did not finish within '
                f'{wait_seconds:g} seconds'))
        if failures and not tolerate_failures and not any(collected.values()):
            raise failures[0]
        return dict(collected), failures

    def _trigger_scrape(self, client: ManagedClient, dataset_id: str,
                        inputs: List[Dict[str, Any]],
                        **query: Any) -> List[Tuple[str, str]]:
        if not inputs:
            return []
        settings = get_settings()
        tasks: List[Tuple[str, str]] = []
        # Triggering is fast and avoids the one-minute synchronous /scrape timeout.
        for start in range(0, len(inputs), 20):
            if (self._deadline is not None
                    and (self._time_left() or 0) <= SERVERLESS_PROCESSING_RESERVE_SECONDS + 5):
                break
            response = client.post(
                f'{settings.bright_data_api_base}/datasets/v3/trigger',
                params={'dataset_id': dataset_id, 'include_errors': 'true', **query},
                json=inputs[start:start + 20], headers=self._headers(), use_cache=False,
                max_retries=0 if self._deadline is not None else None)
            payload = _response_payload(response)
            snapshot_id = payload.get('snapshot_id') if isinstance(payload, dict) else None
            if not snapshot_id:
                raise FetchFailed('Bright Data trigger did not return a snapshot_id')
            tasks.append((dataset_id, str(snapshot_id)))
        return tasks

    def _scrape(self, client: ManagedClient, dataset_id: str,
                inputs: List[Dict[str, Any]], **query: Any) -> List[Dict[str, Any]]:
        tasks = self._trigger_scrape(client, dataset_id, inputs, **query)
        if not tasks:
            return []
        collected, _ = self._await_snapshots(client, tasks)
        return collected.get(dataset_id, [])

    def _discover_urls(self, client: ManagedClient, keyword: str) -> Dict[str, List[str]]:
        clean = ' '.join(keyword.split()).strip()
        if not clean or any(ord(char) < 32 for char in clean):
            raise CollectionNotPermitted('keyword must contain visible text')
        settings = get_settings()
        # parsed_light returns only the first ten organic results. Focused searches produce much
        # better coverage than one broad query, while keeping each URL traceable to a public SERP.
        queries = _discovery_queries(clean)
        organic: List[Dict[str, Any]] = []
        search_failures = 0
        search_retries = 0
        queries_completed = 0
        discovery_deadline = time.monotonic() + SERVERLESS_DISCOVERY_BUDGET_SECONDS
        if self._deadline is not None:
            discovery_deadline = min(
                discovery_deadline,
                self._deadline - 75.0,
            )
        for query_index, (query, country) in enumerate(queries):
            if self._deadline is not None and time.monotonic() >= discovery_deadline:
                break
            queries_completed += 1
            google_url = ('https://www.google.com/search?q=' + quote_plus(query) +
                          f'&hl=en&gl={country}')
            if query_index < 5:
                # Ask for a wider, uncollapsed threat result set. Without this Google may merge
                # near-duplicate reels from coordinated promotion accounts and hide evidence.
                google_url += '&num=20&filter=0'
            query_organic: Optional[List[Dict[str, Any]]] = None
            # The SERP gateway occasionally replies HTTP 200 with an empty body. Retry only the
            # five critical searches, once, so a transient response cannot erase the best fraud
            # evidence while the whole request remains inside the serverless quota and deadline.
            attempts = 2 if query_index < 5 else 1
            for attempt in range(attempts):
                if attempt:
                    search_retries += 1
                retry_url = google_url + ('&start=0' if attempt else '')
                try:
                    response = client.post(
                        f'{settings.bright_data_api_base}/request', headers=self._headers(),
                        json={'zone': settings.bright_data_serp_zone, 'url': retry_url,
                              'format': 'raw',
                              # Full parsing exposes the Instagram author and a search thumbnail.
                              # Use it for each isolated promotion search so its evidence survives
                              # even when asynchronous media enrichment exceeds the request budget.
                              'data_format': ('parsed' if query_index < 5
                                              else 'parsed_light')},
                        use_cache=(attempt == 0),
                        max_retries=0 if self._deadline is not None else None)
                    query_organic = _discovery_records(response)
                    if query_organic or attempt + 1 == attempts:
                        break
                except SourceUnavailable:
                    raise
                except (FetchFailed, ValueError):
                    query_organic = None
            if query_organic is None:
                search_failures += 1
                continue
            organic.extend(query_organic)
        audit.record(self.session, action='ingest.discover', provider=self.name,
                     target=clean, status='ok', lawful_basis=self.lawful_basis,
                     detail={'queries': len(queries), 'query_failures': search_failures,
                             'query_retries': search_retries,
                             'queries_completed': queries_completed,
                             'organic_results': len(organic)})
        if search_failures or queries_completed < len(queries):
            self.collection_partial = True
        return self._bucket_discovery(organic, clean)

    def _bucket_discovery(self, organic: List[Dict[str, Any]], clean: str) -> Dict[str, List[str]]:
        """Normalize discovered URLs; also reused by resumable paged collection."""
        buckets: Dict[str, List[str]] = {
            'profile': [], 'probe_profile': [], 'post': [], 'reel': []}
        seen = set()
        fallback_by_handle: Dict[str, RawBundle] = OrderedDict()
        for item in organic:
            url = _canonical_instagram_url(str(item.get('link') or ''))
            kind = _url_kind(url) if url else None
            if url and kind and url not in seen:
                buckets[kind].append(url)
                seen.add(url)
            # Google's light SERP output may wrap profile links in /goto URLs. The title
            # still contains the public @username, which is enough to form a canonical URL.
            text = ' '.join(str(item.get(key) or '')
                            for key in ('title', 'description', 'snippet'))
            mentioned_handles = [value.rstrip('.') for value in MENTION_RE.findall(text)]
            author_handle: Optional[str] = None
            source_handle = SOURCE_HANDLE_RE.search(str(item.get('source') or ''))
            if source_handle:
                author_handle = source_handle.group(1).rstrip('.')
            if url and kind in {'post', 'reel'}:
                path_parts = [part for part in urlsplit(url).path.split('/') if part]
                if (len(path_parts) >= 3 and USERNAME_RE.fullmatch(path_parts[0])
                        and path_parts[1].lower() in {'p', 'reel', 'reels'}):
                    author_handle = path_parts[0]
            # Mentions inside a caption identify subjects or destinations, not the author. Full
            # threat-search results expose the author separately; attach the post only to that
            # account to avoid duplicating the same reel under @brand and channel references.
            handles = ([author_handle] if author_handle else
                       ([] if kind in {'post', 'reel'} else mentioned_handles))
            if url and kind == 'profile':
                path_parts = [part for part in urlsplit(url).path.split('/') if part]
                if path_parts and USERNAME_RE.fullmatch(path_parts[0]):
                    handles.insert(0, path_parts[0])
            for username in OrderedDict.fromkeys(handles):
                username = username.rstrip('.')
                if not username:
                    continue
                profile_url = f'https://www.instagram.com/{username}/'
                if profile_url not in seen:
                    buckets['profile'].append(profile_url)
                    seen.add(profile_url)
                bundle = fallback_by_handle.get(username.casefold())
                if bundle is None:
                    search_image = _as_url(_first(
                        item, 'image', 'thumbnail', 'thumbnail_url', 'image_url'))
                    compact_raw = {key: value for key, value in item.items()
                                   if key not in {'image', 'image_base64', 'icon'}}
                    bundle = RawBundle(
                        account=RawAccount(handle=username, display_name=username,
                                           biography=(text[:1200] if kind == 'profile' else None),
                                           # A parsed search result sometimes includes the public
                                           # profile thumbnail before the profile dataset finishes.
                                           profile_pic_url=(search_image
                                                            if kind == 'profile' else None),
                                           followers_count=_serp_followers(item),
                                           raw={'serp_result': compact_raw}),
                        provenance=self._provenance('keyword_serp_fallback', clean))
                    fallback_by_handle[username.casefold()] = bundle
                if url and kind in {'post', 'reel'}:
                    parts = [part for part in urlsplit(url).path.split('/') if part]
                    shortcode = parts[2] if len(parts) >= 3 and parts[0] == username else parts[1]
                    if not any(post.permalink == url for post in bundle.posts):
                        image = _as_url(item.get('image'))
                        media = ([RawMedia(media_type='image', thumbnail_url=image)]
                                 if image and (image.startswith('https://')
                                               or image.startswith('data:image/')) else [])
                        bundle.posts.append(RawPost(
                            platform_post_id=url, shortcode=shortcode, post_type=kind,
                            permalink=url, caption=text[:2200], media=media,
                            raw={'serp_result': compact_raw}))
        # A single brand-like keyword is also a plausible exact username. Keep this candidate
        # when search discovery is empty; the licensed profile dataset validates existence.
        exact_username = clean.lstrip('@').lower()
        if USERNAME_RE.fullmatch(exact_username):
            # Probe common brand-abuse handle patterns through the licensed profile dataset.
            # Nonexistent handles are returned as dataset errors and are discarded.
            variants = [
                exact_username,
                f'{exact_username}.official', f'{exact_username}_official',
                f'{exact_username}.support', f'{exact_username}_support',
                f'{exact_username}.help', f'{exact_username}_help',
                f'{exact_username}.customercare', f'{exact_username}_customercare',
                f'{exact_username}.care', f'{exact_username}care',
                f'{exact_username}.giveaway', f'{exact_username}.shop',
                f'{exact_username}.store', f'{exact_username}.outlet',
                f'{exact_username}.deals', f'{exact_username}_deals',
                f'{exact_username}.offers', f'{exact_username}_offers',
                f'{exact_username}.loot', f'{exact_username}.telegram',
                f'{exact_username}.claim', f'{exact_username}.rewards',
                f'{exact_username}.refund', f'{exact_username}.helpdesk',
                f'{exact_username}.jobs', f'{exact_username}.hr',
                f'{exact_username}.invest', f'{exact_username}.trading',
            ]
            for username in variants:
                if not USERNAME_RE.fullmatch(username):
                    continue
                profile_url = f'https://www.instagram.com/{username}/'
                if profile_url not in buckets['probe_profile']:
                    buckets['probe_profile'].append(profile_url)
            exact_url = f'https://www.instagram.com/{exact_username}/'
            if exact_url in buckets['probe_profile']:
                buckets['probe_profile'].remove(exact_url)
            buckets['probe_profile'].insert(0, exact_url)
        self._serp_fallback = list(fallback_by_handle.values())[:self._limit()]
        return buckets

    @staticmethod
    def _media_items(node: Dict[str, Any]) -> List[RawMedia]:
        def observations(item: Dict[str, Any]) -> Dict[str, Any]:
            qr = _first(item, 'qr_payloads', 'qr_codes', 'decoded_qr_codes') or []
            if isinstance(qr, str):
                qr = [qr]
            if isinstance(qr, list):
                qr = [str(value.get('data') or value.get('url') or value)
                      if isinstance(value, dict) else str(value) for value in qr]
            else:
                qr = []
            return {
                'ocr_text': _first(item, 'ocr_text', 'image_text', 'text_in_image'),
                'transcript': _first(item, 'transcript', 'video_transcript', 'audio_transcript'),
                'qr_payloads': qr,
                'perceptual_hash': _first(item, 'perceptual_hash', 'phash', 'image_hash'),
                'brand_match_score': _first(item, 'brand_match_score', 'logo_match_score'),
                'synthetic_media_score': _first(item, 'synthetic_media_score',
                                                'deepfake_score'),
            }

        def raw_media(media_type: str, media_url=None, thumbnail_url=None,
                      item: Optional[Dict[str, Any]] = None) -> RawMedia:
            data = observations(item or node)
            return RawMedia(media_type=media_type, media_url=media_url,
                            thumbnail_url=thumbnail_url,
                            perceptual_hash=data['perceptual_hash'],
                            ocr_text=data['ocr_text'], transcript=data['transcript'],
                            qr_payloads=data['qr_payloads'],
                            brand_match_score=data['brand_match_score'],
                            synthetic_media_score=data['synthetic_media_score'])

        result: List[RawMedia] = []
        for value in node.get('photos') or []:
            if isinstance(value, str):
                result.append(raw_media(
                    'video' if _looks_like_video_url(value) else 'image', media_url=value))
            elif isinstance(value, dict):
                url = _as_url(value)
                result.append(raw_media(
                    'video' if _looks_like_video_url(url) else 'image', media_url=url,
                    thumbnail_url=_as_url(_first(
                        value, 'thumbnail_url', 'thumbnail', 'display_url', 'preview_url')),
                    item=value))
        for value in node.get('videos') or []:
            if isinstance(value, str):
                result.append(raw_media('video', media_url=value))
            elif isinstance(value, dict):
                result.append(raw_media('video',
                                        media_url=_as_url(_first(value, 'url', 'video_url')),
                                        thumbnail_url=_as_url(_first(
                                            value, 'thumbnail_url', 'thumbnail', 'image_url',
                                            'display_url', 'preview_url', 'cover_url')),
                                        item=value))
        image = _as_url(_first(
            node, 'thumbnail_url', 'thumbnail', 'display_url', 'image_url',
            'video_thumbnail', 'cover_url', 'preview_url'))
        video = _as_url(_first(node, 'video_url', 'video'))
        # Some reel exports place the MP4 in image_url. Never send that value to an <img>.
        if _looks_like_video_url(image):
            video = video or image
            image = None
        if image and not any(item.media_url == image for item in result):
            result.append(raw_media('image', media_url=image))
        if video and not any(item.media_url == video for item in result):
            result.append(raw_media('video', media_url=video, thumbnail_url=image))
        return result

    @staticmethod
    def _comment(node: Dict[str, Any], parent_id: Optional[str] = None) -> RawComment:
        comment_id = _first(node, 'comment_id', 'id', 'pk')
        return RawComment(
            platform_comment_id=str(comment_id) if comment_id is not None else None,
            parent_platform_comment_id=parent_id,
            author_handle=str(_first(node, 'comment_user', 'username', 'user') or '').lstrip('@') or None,
            text=_first(node, 'comment', 'text'),
            like_count=_as_int(_first(node, 'likes_number', 'like_count', 'likes')),
            created_at=parse_ts(_first(node, 'comment_date', 'created_at', 'timestamp')))

    @classmethod
    def _post(cls, node: Dict[str, Any], comments: Optional[List[RawComment]] = None) -> RawPost:
        url = _canonical_instagram_url(str(_first(node, 'url', 'post_url', 'permalink') or ''))
        content_type = str(_first(node, 'content_type', 'media_type', 'type') or '').lower()
        kind = 'reel' if (url and _url_kind(url) == 'reel') or 'reel' in content_type else (
            'carousel' if 'carousel' in content_type else 'post')
        caption = _first(node, 'description', 'caption', 'text')
        hashtags = node.get('hashtags') or node.get('post_hashtags') or []
        if caption and hashtags:
            tokens = ['#' + str(tag).lstrip('#') for tag in hashtags
                      if str(tag).lstrip('#') and ('#' + str(tag).lstrip('#')).casefold()
                      not in str(caption).casefold()]
            if tokens:
                caption = str(caption) + '\n' + ' '.join(tokens)
        post_id = _first(node, 'post_id', 'id', 'pk', 'content_id')
        shortcode = _first(node, 'shortcode', 'code')
        if not shortcode and url:
            parts = [part for part in urlsplit(url).path.split('/') if part]
            shortcode = parts[1] if len(parts) > 1 and parts[0] in {'p', 'reel', 'reels'} else None
        embedded_comments = []
        raw_comments = _first(node, 'latest_comments', 'comments_data', 'comments')
        if isinstance(raw_comments, list):
            for item in raw_comments:
                if isinstance(item, dict):
                    embedded_comments.append(cls._comment(item))
        return RawPost(
            platform_post_id=str(post_id) if post_id is not None else shortcode,
            shortcode=str(shortcode) if shortcode is not None else None,
            post_type=kind, permalink=url, caption=str(caption) if caption is not None else None,
            posted_at=parse_ts(_first(node, 'date_posted', 'datetime', 'timestamp', 'taken_at')),
            like_count=_as_int(_first(node, 'likes', 'like_count', 'like_count_and_view_count_disabled')),
            comment_count=_as_int(_first(node, 'num_comments', 'comments', 'comment_count')),
            view_count=_as_int(_first(node, 'views', 'video_view_count', 'video_play_count', 'plays')),
            media=cls._media_items(node),
            comments=comments if comments is not None else embedded_comments,
            raw=node)

    @classmethod
    def _account(cls, node: Dict[str, Any], fallback: str = '') -> RawAccount:
        candidates = [node]
        for key in ('user', 'owner', 'author', 'profile', 'account_data', 'user_data'):
            value = node.get(key)
            if isinstance(value, dict):
                candidates.append(value)

        def pick(*names: str) -> Any:
            for candidate in candidates:
                value = _first(candidate, *names)
                if value not in (None, ''):
                    return value
            return None

        raw_handle = pick('account', 'username', 'user_name', 'handle')
        if isinstance(raw_handle, (dict, list)):
            raw_handle = None
        handle = str(raw_handle or fallback).lstrip('@')
        account_id = pick('id', 'fbid', 'pk', 'partner_id')
        external = _as_url(pick('external_url', 'website'))
        profile_pic = _as_url(pick(
            'profile_image_link', 'profile_pic_url', 'profile_image', 'profile_pic_url_hd',
            'profile_picture_url', 'profile_picture', 'profile_image_url',
            'user_profile_pic_url', 'user_profile_pic', 'author_profile_pic',
            'author_profile_picture', 'owner_profile_pic_url', 'owner_profile_picture_url',
            'avatar_url', 'avatar', 'profile_pic'))
        return RawAccount(
            handle=handle,
            platform_account_id=str(account_id) if account_id is not None else None,
            display_name=pick('full_name', 'profile_name', 'display_name', 'name'),
            biography=pick('biography', 'bio'), external_url=external,
            profile_pic_url=profile_pic,
            is_verified=pick('is_verified', 'verified'),
            is_business=pick('is_business_account', 'is_professional_account'),
            followers_count=_as_int(pick(
                'followers', 'followers_count', 'follower_count', 'followed_by_count',
                'edge_followed_by', 'edge_followed_by_count', 'subscriber_count')),
            follows_count=_as_int(pick(
                'following', 'follows_count', 'following_count', 'edge_follow')),
            media_count=_as_int(pick(
                'posts_count', 'media_count', 'post_count', 'edge_owner_to_timeline_media')),
            raw={key: value for key, value in node.items() if key != 'posts'})

    @staticmethod
    def _author(node: Dict[str, Any]) -> str:
        value = _first(node, 'user_posted', 'username', 'owner_username', 'account', 'post_user')
        return str(value or '').lstrip('@').strip()

    def _comments(self, client: ManagedClient, posts: Iterable[RawPost]) -> Dict[str, List[RawComment]]:
        urls = list(OrderedDict.fromkeys(
            post.permalink for post in posts if post.permalink))[:self._limit()]
        if not urls or not self.params.get('include_comments', True):
            return {}
        tasks = self._trigger_scrape(client, COMMENT_DATASET, [{'url': url} for url in urls])
        if not tasks:
            return {}
        # Comment enrichment is optional and must not consume the entire live-search request.
        # Post/profile records remain useful and often contain a sample of embedded comments.
        collected, failures = self._await_snapshots(
            client, tasks, tolerate_failures=True,
            max_wait_seconds=(15.0 if self._deadline is not None else None))
        if failures:
            self.collection_partial = True
        records = collected.get(COMMENT_DATASET, [])
        limit = max(1, min(int(self.params.get('comments_per_post', 50)), 100))
        grouped: Dict[str, List[RawComment]] = defaultdict(list)
        for node in records:
            post_url = _canonical_instagram_url(str(node.get('post_url') or ''))
            if not post_url or len(grouped[post_url]) >= limit:
                continue
            parent = self._comment(node)
            grouped[post_url].append(parent)
            for reply in node.get('replies') or []:
                if isinstance(reply, dict) and len(grouped[post_url]) < limit:
                    grouped[post_url].append(
                        self._comment(reply, parent.platform_comment_id))
        return grouped

    def _profile_records(self, client: ManagedClient, usernames: List[str],
                         force_one: bool = False) -> List[Dict[str, Any]]:
        profile_limit = max(0, min(int(self.params.get('profile_limit', 25)), 50))
        if force_one:
            profile_limit = max(1, profile_limit)
        if profile_limit == 0:
            return []
        clean = [name for name in OrderedDict.fromkeys(usernames)
                 if USERNAME_RE.fullmatch(name)][:profile_limit]
        return self._scrape(client, PROFILE_DATASET,
                            [{'user_name': name} for name in clean],
                            type='discover_new', discover_by='user_name')

    def _account_search(self, client: ManagedClient, query: str) -> List[RawBundle]:
        username = query.lstrip('@').strip()
        if not USERNAME_RE.fullmatch(username):
            raise CollectionNotPermitted(
                'account search requires an Instagram username containing letters, numbers, '
                'dots, or underscores')
        records = self._profile_records(client, [username], force_one=True)
        bundles: List[RawBundle] = []
        for node in records:
            account = self._account(node, username)
            posts = [self._post(post) for post in (node.get('posts') or [])
                     if isinstance(post, dict)][:self._limit()]
            try:
                comments = self._comments(client, posts)
            except SourceUnavailable:
                raise
            except FetchFailed:
                comments = {}
                self.collection_partial = True
            for post in posts:
                post.comments = comments.get(post.permalink or '', [])
            bundles.append(RawBundle(account=account, posts=posts,
                                     provenance=self._provenance('account', username)))
        return bundles

    def _keyword_search(self, client: ManagedClient, query: str) -> List[RawBundle]:
        urls = self._discover_urls(client, query)
        limit = self._limit()
        errors: List[FetchFailed] = []
        tasks: List[Tuple[str, str]] = []

        def trigger(dataset_id: str, inputs: List[Dict[str, Any]],
                    **query_params: Any) -> None:
            try:
                tasks.extend(self._trigger_scrape(
                    client, dataset_id, inputs, **query_params))
            except SourceUnavailable:
                raise
            except FetchFailed as error:
                errors.append(error)

        profile_limit = max(0, min(int(self.params.get('profile_limit', 25)), 50))
        profile_names = []
        profile_candidates = urls['probe_profile'] + urls['profile']
        for profile_url in profile_candidates[:min(limit, profile_limit)]:
            parts = [part for part in urlsplit(profile_url).path.split('/') if part]
            if parts and USERNAME_RE.fullmatch(parts[0]):
                profile_names.append(parts[0])

        # Profile enrichment is required even when discovery returns profile URLs only. It adds
        # biography, verification, follower counts, profile pictures, and the profile's embedded
        # recent posts. All datasets are triggered before polling so they can run concurrently.
        profile_names = list(OrderedDict.fromkeys(profile_names))
        if profile_names:
            # Probe suspicious brand-like handles first. On a partial serverless collection this
            # returns low-follower support/deal/refund impostors before the official profile or
            # high-follower general mentions consume the enrichment window.
            exact = query.lstrip('@#').strip().casefold()
            suspicious = [name for name in profile_names if name.casefold() != exact]
            exact_names = [name for name in profile_names if name.casefold() == exact]
            if suspicious:
                trigger(PROFILE_DATASET, [{'user_name': name} for name in suspicious],
                        type='discover_new', discover_by='user_name')
            if exact_names:
                trigger(PROFILE_DATASET, [{'user_name': name} for name in exact_names],
                        type='discover_new', discover_by='user_name')
        trigger(POST_DATASET, [{'url': url} for url in urls['post'][:limit]])
        trigger(REEL_DATASET, [{'url': url} for url in urls['reel'][:limit]])
        collected, snapshot_errors = self._await_snapshots(
            client, tasks, tolerate_failures=True,
            partial_grace_seconds=(35.0 if self._deadline is not None else 70.0)
        ) if tasks else ({}, [])
        errors.extend(snapshot_errors)
        if errors:
            self.collection_partial = True
        profiles = collected.get(PROFILE_DATASET, [])
        posts = collected.get(POST_DATASET, []) + collected.get(REEL_DATASET, [])
        posts = posts[:limit]

        profile_by_handle = {self._account(node).handle.casefold(): node for node in profiles
                             if self._account(node).handle}

        # Keep only profiles backed by a public SERP result when enrichment times out. Generated
        # abuse-pattern probes must be validated by the profile dataset before they are shown.
        for profile_url in urls['profile'][:min(limit, profile_limit)]:
            parts = [part for part in urlsplit(profile_url).path.split('/') if part]
            if parts and USERNAME_RE.fullmatch(parts[0]):
                profile_by_handle.setdefault(parts[0].casefold(), {
                    'account': parts[0], 'url': profile_url,
                })

        if not profiles and not posts and errors and not profile_by_handle:
            if self._serp_fallback:
                self.collection_partial = True
                return self._serp_fallback
            raise errors[0]

        grouped: Dict[str, List[RawPost]] = OrderedDict()
        raw_by_handle: Dict[str, str] = {}
        author_node_by_handle: Dict[str, Dict[str, Any]] = {}
        for node in posts:
            author = self._author(node)
            if not author:
                continue
            grouped.setdefault(author.casefold(), []).append(self._post(node))
            raw_by_handle[author.casefold()] = author
            author_node_by_handle.setdefault(author.casefold(), node)
        try:
            comments = self._comments(client, (post for items in grouped.values() for post in items))
        except SourceUnavailable:
            raise
        except FetchFailed:
            comments = {}
            self.collection_partial = True

        bundles: List[RawBundle] = []
        for key, items in grouped.items():
            for post in items:
                post.comments = comments.get(post.permalink or '', [])
            profile = profile_by_handle.get(key) or author_node_by_handle.get(key)
            account = self._account(profile, raw_by_handle[key]) if profile else RawAccount(
                handle=raw_by_handle[key])
            bundles.append(RawBundle(account=account, posts=items,
                                     provenance=self._provenance('keyword', query)))

        for key, node in profile_by_handle.items():
            if key not in grouped:
                account = self._account(node)
                profile_posts = [self._post(post) for post in (node.get('posts') or [])
                                 if isinstance(post, dict)][:limit]
                bundles.append(RawBundle(account=account, posts=profile_posts,
                                         provenance=self._provenance('keyword', query)))

        # Search results are valid public evidence on their own. Preserve them when a dataset
        # snapshot is still processing so high-risk posts do not disappear from a partial Vercel
        # response. Enriched records win; fallback posts only fill missing permalinks.
        by_handle = {bundle.account.handle.casefold(): bundle for bundle in bundles}
        for fallback in self._serp_fallback:
            key = fallback.account.handle.casefold()
            existing = by_handle.get(key)
            if existing is None:
                bundles.append(fallback)
                by_handle[key] = fallback
                continue
            known = {post.permalink for post in existing.posts if post.permalink}
            existing.posts.extend(post for post in fallback.posts
                                  if post.permalink and post.permalink not in known)
        return bundles

    def _provenance(self, mode: str, query: str) -> Dict[str, Any]:
        return {
            'provider': self.name,
            'lawful_basis': self.lawful_basis,
            'collection_mode': mode,
            'query': query,
            'source': 'Bright Data Instagram Scraper API',
            'retrieved_at': dt.datetime.now(dt.timezone.utc).isoformat(),
        }

    def fetch_many(self, handle: str) -> List[RawBundle]:
        self.check_configuration()
        mode = self._mode()
        self.collection_partial = False
        self._serp_fallback = []
        if os.getenv('VERCEL'):
            self._deadline = time.monotonic() + SERVERLESS_TOTAL_BUDGET_SECONDS
        try:
            with self._managed() as client:
                bundles = (self._account_search(client, handle) if mode == 'account'
                           else self._keyword_search(client, handle.lstrip('#').strip()))
        finally:
            self._deadline = None
        bundles = [bundle for bundle in bundles if bundle.account.handle]
        audit.record(self.session, action='ingest.fetch', provider=self.name,
                     target=handle.lstrip('@#'), status='ok', lawful_basis=self.lawful_basis,
                     detail={'mode': mode, 'accounts': len(bundles),
                             'posts': sum(len(bundle.posts) for bundle in bundles)})
        return bundles

    def fetch(self, handle: str) -> RawBundle:
        bundles = self.fetch_many(handle)
        if not bundles:
            raise CollectionNotPermitted('Bright Data returned no public Instagram results')
        return bundles[0]

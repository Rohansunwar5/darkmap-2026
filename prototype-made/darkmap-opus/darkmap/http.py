'''Managed HTTP client: quota -> cache -> request -> retry/backoff -> audit.

Design rules (non-negotiable):
  * One configured identity per provider. No rotation, no spoofed fingerprints.
  * A declared, honest User-Agent.
  * 429/503 => honour Retry-After, exponential backoff with jitter, then give up.
  * 401/403 => treat as "not authorized"; fail closed and audit. Never attempt a workaround.
'''
import random
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx
from sqlalchemy.orm import Session

from . import audit, cache
from .config import get_settings
from .quota import QuotaExceeded, consume

RETRYABLE = {408, 425, 429, 500, 502, 503, 504}


class NotAuthorized(Exception):
    '''The source explicitly refused access. Darkmap stops here by policy.'''


class FetchFailed(Exception):
    def __init__(self, message, *, status_code=None, retry_after=None):
        super().__init__(message)
        self.status_code = status_code
        self.retry_after = retry_after


class SourceUnavailable(FetchFailed):
    """An account-level refusal that retries cannot resolve. Only safe text leaves here."""
    def __init__(self, code, message, *, status_code=None):
        super().__init__(message, status_code=status_code)
        self.code = code


def check_source_availability(status_code, text):
    # Some collection endpoints return account errors as 400, rather than 401/403.
    # Do not repeat these requests or expose raw error bodies/credentials to the UI.
    message = (text or '').casefold()
    if 'customer is not active' in message or 'account is inactive' in message:
        raise SourceUnavailable('source_account_inactive',
            'The connected collection account is inactive. Reactivate it in the collection service dashboard, then retry this search.',
            status_code=status_code)
    if status_code == 402 or any(term in message for term in (
            'insufficient balance', 'not enough credits', 'insufficient credits', 'credits exhausted')):
        raise SourceUnavailable('source_credits_required',
            'The connected collection account has insufficient credits. Restore its balance, then retry this search.',
            status_code=status_code)


@dataclass
class Response:
    status_code: int
    text: str
    headers: Dict[str, str]
    from_cache: bool = False

    def json(self) -> Any:
        import json as _json
        return _json.loads(self.text or 'null')


class ManagedClient:
    def __init__(self, session: Session, provider: str, lawful_basis: str,
                 client: Optional[httpx.Client] = None, sleep=time.sleep,
                 follow_redirects: bool = True,
                 request_timeout: Optional[float] = None, allow_cache: bool = True):
        self.session = session
        self.provider = provider
        self.lawful_basis = lawful_basis
        self.settings = get_settings()
        self._client = client
        self._owns_client = client is None
        self._sleep = sleep
        self._follow_redirects = follow_redirects
        self._request_timeout = request_timeout
        self._allow_cache = allow_cache

    def __enter__(self):
        if self._client is None:
            self._client = httpx.Client(timeout=self._request_timeout or 30.0,
                                        headers={'User-Agent': self.settings.user_agent},
                                        follow_redirects=self._follow_redirects)
        return self

    def __exit__(self, *exc):
        if self._owns_client and self._client is not None:
            self._client.close()
        return False

    def _backoff(self, attempt: int, retry_after: Optional[str]) -> float:
        if retry_after:
            try:
                return max(0.0, float(retry_after))
            except ValueError:
                pass
        base = self.settings.backoff_base * (2 ** attempt)
        return min(base, self.settings.backoff_max) * (0.5 + random.random() / 2)

    def get(self, url: str, params: Optional[Dict[str, Any]] = None,
            headers: Optional[Dict[str, str]] = None, use_cache: bool = True,
            consume_quota: bool = True,
            max_retries: Optional[int] = None) -> Response:
        key = cache.make_key('GET', url, params)
        use_cache = use_cache and self._allow_cache
        if use_cache:
            hit = cache.get(self.session, key)
            if hit is not None:
                audit.record(self.session, action='http.cache_hit', provider=self.provider,
                             target=url, status='hit', lawful_basis=self.lawful_basis)
                return Response(hit.status_code, hit.body or '', hit.headers or {}, True)

        last_error = None
        retry_limit = self.settings.max_retries if max_retries is None else max(0, max_retries)
        for attempt in range(retry_limit + 1):
            if consume_quota:
                try:
                    consume(self.session, self.provider)
                except QuotaExceeded as exc:
                    audit.record(self.session, action='http.quota_exceeded', provider=self.provider,
                                 target=url, status='blocked', lawful_basis=self.lawful_basis,
                                 detail={'window': exc.window, 'retry_after': exc.retry_after})
                    raise

            started = time.time()
            try:
                resp = self._client.get(url, params=params, headers=headers or {})
            except httpx.HTTPError as exc:
                last_error = str(exc)
                audit.record(self.session, action='http.error', provider=self.provider,
                             target=url, status='transport_error',
                             lawful_basis=self.lawful_basis, detail={'error': last_error,
                                                                     'attempt': attempt})
                if attempt >= retry_limit:
                    raise FetchFailed(last_error) from exc
                self._sleep(self._backoff(attempt, None))
                continue

            dur = int((time.time() - started) * 1000)
            audit.record(self.session, action='http.request', provider=self.provider, target=url,
                         status=str(resp.status_code), lawful_basis=self.lawful_basis,
                         duration_ms=dur, detail={'attempt': attempt,
                                                  'bytes': len(resp.content or b'')})

            if resp.status_code in (401, 403):
                # Policy: an explicit refusal ends the fetch. No evasion is attempted.
                raise NotAuthorized(
                    f'{self.provider} returned {resp.status_code} for {url}; '
                    'access is not authorized. Obtain API credentials or a user-provided export.')

            if resp.status_code in RETRYABLE and attempt < retry_limit:
                delay = self._backoff(attempt, resp.headers.get('Retry-After'))
                audit.record(self.session, action='http.backoff', provider=self.provider,
                             target=url, status=str(resp.status_code),
                             lawful_basis=self.lawful_basis, detail={'sleep_seconds': delay})
                self._sleep(delay)
                continue

            if resp.status_code >= 400:
                check_source_availability(resp.status_code, resp.text)
                raise FetchFailed(f'{resp.status_code} from {url}',
                                  status_code=resp.status_code,
                                  retry_after=resp.headers.get('Retry-After'))

            if use_cache:
                cache.put(self.session, key, resp.status_code, resp.text,
                          dict(resp.headers), self.settings.cache_ttl)
            return Response(resp.status_code, resp.text, dict(resp.headers), False)

        raise FetchFailed(last_error or 'exhausted retries')

    def post(self, url: str, params: Optional[Dict[str, Any]] = None,
             json: Any = None, headers: Optional[Dict[str, str]] = None,
             use_cache: bool = True,
             max_retries: Optional[int] = None) -> Response:
        '''POST JSON with the same quota, retry, cache, and audit controls as GET.

        Authorization headers are deliberately excluded from cache keys and audit details.
        The caller must keep credentials in environment-backed configuration.
        '''
        key = cache.make_key('POST', url, {'params': params or {}, 'json': json})
        use_cache = use_cache and self._allow_cache
        if use_cache:
            hit = cache.get(self.session, key)
            if hit is not None:
                audit.record(self.session, action='http.cache_hit', provider=self.provider,
                             target=url, status='hit', lawful_basis=self.lawful_basis)
                return Response(hit.status_code, hit.body or '', hit.headers or {}, True)

        last_error = None
        retry_limit = self.settings.max_retries if max_retries is None else max(0, max_retries)
        for attempt in range(retry_limit + 1):
            try:
                consume(self.session, self.provider)
            except QuotaExceeded as exc:
                audit.record(self.session, action='http.quota_exceeded', provider=self.provider,
                             target=url, status='blocked', lawful_basis=self.lawful_basis,
                             detail={'window': exc.window, 'retry_after': exc.retry_after})
                raise

            started = time.time()
            try:
                resp = self._client.post(url, params=params, json=json, headers=headers or {})
            except httpx.HTTPError as exc:
                last_error = str(exc)
                audit.record(self.session, action='http.error', provider=self.provider,
                             target=url, status='transport_error',
                             lawful_basis=self.lawful_basis,
                             detail={'error': last_error, 'attempt': attempt})
                if attempt >= retry_limit:
                    raise FetchFailed(last_error) from exc
                self._sleep(self._backoff(attempt, None))
                continue

            dur = int((time.time() - started) * 1000)
            audit.record(self.session, action='http.request', provider=self.provider, target=url,
                         status=str(resp.status_code), lawful_basis=self.lawful_basis,
                         duration_ms=dur,
                         detail={'attempt': attempt, 'bytes': len(resp.content or b'')})

            if resp.status_code in (401, 403):
                raise NotAuthorized(
                    f'{self.provider} returned {resp.status_code} for {url}; '
                    'access is not authorized. Check the provider API key and subscription.')

            if resp.status_code in RETRYABLE and attempt < retry_limit:
                delay = self._backoff(attempt, resp.headers.get('Retry-After'))
                audit.record(self.session, action='http.backoff', provider=self.provider,
                             target=url, status=str(resp.status_code),
                             lawful_basis=self.lawful_basis,
                             detail={'sleep_seconds': delay})
                self._sleep(delay)
                continue

            if resp.status_code >= 400:
                check_source_availability(resp.status_code, resp.text)
                message = resp.text[:300] if resp.text else ''
                raise FetchFailed(f'{resp.status_code} from {url}: {message}',
                                  status_code=resp.status_code,
                                  retry_after=resp.headers.get('Retry-After'))

            if use_cache:
                cache.put(self.session, key, resp.status_code, resp.text,
                          dict(resp.headers), self.settings.cache_ttl)
            return Response(resp.status_code, resp.text, dict(resp.headers), False)

        raise FetchFailed(last_error or 'exhausted retries')

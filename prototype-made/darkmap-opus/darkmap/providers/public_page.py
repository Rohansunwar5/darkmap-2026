'''Clearly-permitted public page ingestion.

Guard rails, all of which must pass before a single byte is requested:
  1. The host must be on the operator's explicit allowlist (DARKMAP_PUBLIC_PAGE_ALLOWLIST).
  2. robots.txt must allow our declared User-Agent for the path.
  3. The request goes through ManagedClient: quota, cache, backoff, audit.

Only openly published metadata (Open Graph / oEmbed style tags) is parsed. There is no
headless browser, no session replay, no CAPTCHA handling. If the page is gated, ingestion
fails with CollectionNotPermitted and the operator should use the API or an export instead.
'''
import datetime as dt
import re
import urllib.parse
import urllib.robotparser as robotparser
from typing import Dict, Optional

from .. import audit
from ..config import get_settings
from ..http import ManagedClient, NotAuthorized
from .base import CollectionNotPermitted, IngestionProvider, RawAccount, RawBundle

META_RE = re.compile(r'<meta[^>]+>', re.IGNORECASE)
ATTR_RE = re.compile(r'(property|name|content)\s*=\s*"([^"]*)"', re.IGNORECASE)


def parse_meta(html: str) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for tag in META_RE.findall(html or ''):
        attrs = {k.lower(): v for k, v in ATTR_RE.findall(tag)}
        key = attrs.get('property') or attrs.get('name')
        if key and 'content' in attrs:
            out[key.lower()] = attrs['content']
    return out


class PublicPageProvider(IngestionProvider):
    name = 'public_page'
    lawful_basis = 'permitted_public_page'

    def _url(self, handle: str) -> str:
        template = self.params.get('url_template')
        if template:
            return template.format(handle=urllib.parse.quote(handle.lstrip('@')))
        return self.params.get('url') or ''

    def check_configuration(self) -> None:
        if not (self.params.get('url') or self.params.get('url_template')):
            raise CollectionNotPermitted(
                'public_page requires params.url or params.url_template pointing at a page you '
                'are permitted to fetch')

    def _robots_allows(self, url: str) -> bool:
        parts = urllib.parse.urlsplit(url)
        robots_url = f'{parts.scheme}://{parts.netloc}/robots.txt'
        rp = robotparser.RobotFileParser()
        try:
            with ManagedClient(self.session, self.name, self.lawful_basis,
                               follow_redirects=False) as client:
                resp = client.get(robots_url)
            if 300 <= resp.status_code < 400:
                return False
            rp.parse((resp.text or '').splitlines())
        except NotAuthorized:
            return False
        except Exception:
            # Unknown robots state is treated as "do not fetch" (fail closed).
            return False
        return rp.can_fetch(get_settings().user_agent, url)

    def fetch(self, handle: str) -> RawBundle:
        self.check_configuration()
        s = get_settings()
        url = self._url(handle)
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname:
            raise CollectionNotPermitted('public_page accepts only absolute http/https URLs')
        host = parsed.hostname.lower()
        if host not in s.public_page_allowlist:
            audit.record(self.session, action='ingest.blocked', provider=self.name, target=url,
                         status='not_allowlisted', lawful_basis=self.lawful_basis,
                         detail={'host': host})
            raise CollectionNotPermitted(
                f'host "{host}" is not on DARKMAP_PUBLIC_PAGE_ALLOWLIST; '
                'add it only if you are authorized to fetch it')
        if not self._robots_allows(url):
            audit.record(self.session, action='ingest.blocked', provider=self.name, target=url,
                         status='robots_disallow', lawful_basis=self.lawful_basis)
            raise CollectionNotPermitted(f'robots.txt disallows fetching {url}')

        with ManagedClient(self.session, self.name, self.lawful_basis,
                           follow_redirects=False) as client:
            resp = client.get(url)
        if 300 <= resp.status_code < 400:
            raise CollectionNotPermitted(
                'public-page redirects are not followed; allowlist and fetch the final URL directly')
        meta = parse_meta(resp.text)
        account = RawAccount(
            handle=handle.lstrip('@'),
            display_name=meta.get('og:title') or meta.get('twitter:title'),
            biography=meta.get('og:description') or meta.get('description'),
            profile_pic_url=meta.get('og:image'),
            external_url=meta.get('og:url') or url,
            raw={'meta': meta},
        )
        provenance = {
            'provider': self.name,
            'lawful_basis': self.lawful_basis,
            'url': url,
            'robots_checked': True,
            'allowlisted_host': host,
            'retrieved_at': dt.datetime.utcnow().isoformat(),
            'note': 'open-graph metadata only; no authenticated or gated content',
        }
        audit.record(self.session, action='ingest.fetch', provider=self.name, target=url,
                     status='ok', lawful_basis=self.lawful_basis,
                     detail={'cached': resp.from_cache, 'meta_keys': sorted(meta)[:20]})
        return RawBundle(account=account, posts=[], provenance=provenance)


def first_nonempty(*values) -> Optional[str]:
    for v in values:
        if v:
            return v
    return None

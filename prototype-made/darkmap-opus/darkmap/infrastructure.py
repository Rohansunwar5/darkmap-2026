'''Safe, on-demand inspection of public outbound URLs and redirect chains.'''
import ipaddress
import socket
import ssl
import urllib.parse
from typing import Any, Dict, List

import httpx

from .extract import domain_of

MAX_REDIRECTS = 6


def _public_addresses(host: str) -> List[str]:
    addresses = []
    for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM):
        address = item[4][0]
        ip = ipaddress.ip_address(address)
        if (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or
                ip.is_reserved or ip.is_unspecified):
            raise ValueError('destination resolves to a non-public address')
        addresses.append(address)
    if not addresses:
        raise ValueError('destination did not resolve')
    return sorted(set(addresses))


def _validate(url: str) -> urllib.parse.SplitResult:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
        raise ValueError('only public HTTP(S) URLs can be inspected')
    if parsed.username or parsed.password:
        raise ValueError('credential-bearing URLs are not allowed')
    _public_addresses(parsed.hostname)
    return parsed


def _tls(host: str) -> Dict[str, Any]:
    context = ssl.create_default_context()
    try:
        with socket.create_connection((host, 443), timeout=4) as raw:
            with context.wrap_socket(raw, server_hostname=host) as secured:
                cert = secured.getpeercert()
        return {'available': True, 'issuer': dict(x[0] for x in cert.get('issuer', [])),
                'subject': dict(x[0] for x in cert.get('subject', [])),
                'not_before': cert.get('notBefore'), 'not_after': cert.get('notAfter'),
                'serial_number': cert.get('serialNumber')}
    except Exception as exc:
        return {'available': False, 'error': str(exc)[:240]}


def inspect_url(url: str) -> Dict[str, Any]:
    current = url.strip()
    parsed = _validate(current)
    chain = []
    with httpx.Client(timeout=httpx.Timeout(8, connect=4), follow_redirects=False,
                      headers={'User-Agent': 'Darkmap-Brand-Protection/2.0'}) as client:
        for _ in range(MAX_REDIRECTS + 1):
            parsed = _validate(current)
            response = client.get(current, headers={'Range': 'bytes=0-2047'})
            chain.append({'url': current, 'status': response.status_code,
                          'domain': domain_of(current),
                          'content_type': response.headers.get('content-type'),
                          'server': response.headers.get('server'),
                          'location': response.headers.get('location')})
            if response.status_code not in {301, 302, 303, 307, 308}:
                break
            location = response.headers.get('location')
            if not location:
                break
            current = urllib.parse.urljoin(current, location)
        else:  # pragma: no cover - loop has explicit bound
            raise ValueError('redirect limit exceeded')
    final_domain = domain_of(current)
    return {
        'input_url': url, 'final_url': current, 'final_domain': final_domain,
        'redirect_chain': chain, 'redirect_count': max(0, len(chain) - 1),
        'resolved_addresses': _public_addresses(parsed.hostname),
        'tls': _tls(final_domain) if current.startswith('https://') else {'available': False},
        'domain_age': {'available': False, 'reason': 'domain intelligence provider not configured'},
        'reputation': {'available': False, 'reason': 'reputation provider not configured'},
    }

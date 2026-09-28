'''Entity extraction from free text (captions, bios, comments).'''
import re
import urllib.parse
from typing import Dict, List

HASHTAG_RE = re.compile(r'(?<![A-Za-z0-9_])#([A-Za-z0-9_\u00c0-\u024f]{1,60})')
MENTION_RE = re.compile(r'(?<![A-Za-z0-9_])@([A-Za-z0-9_.]{1,40})')
URL_RE = re.compile(r'\b((?:https?://|www\.)[^\s<>"\')]+)', re.IGNORECASE)
BARE_DOMAIN_RE = re.compile(
    r'\b((?:t\.me|telegram\.me|telegram\.dog)/[a-z0-9_+.-]+|'
    r'[a-z0-9-]+(?:\.[a-z0-9-]+)+\.(?:com|net|org|shop|store|top|xyz|ru|cn|info|live|link|click|icu|online|site|vip))\b',
    re.IGNORECASE)
EMAIL_RE = re.compile(r'\b[\w.+-]+@[\w-]+\.[\w.-]+\b')
PHONE_RE = re.compile(r'(?<!\d)(?:\+?\d[\d\s().-]{7,18}\d)(?!\d)')
UPI_RE = re.compile(
    r'(?<![\w.+-])([a-z0-9][a-z0-9._-]{1,80}@(?:upi|ybl|ibl|axl|okaxis|okhdfcbank|'
    r'okicici|oksbi|paytm|apl|ptyes|freecharge|airtel|fbl|indus|kotak))(?![\w.-])',
    re.IGNORECASE)
BTC_RE = re.compile(r'\b(?:bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b')
ETH_RE = re.compile(r'\b0x[a-fA-F0-9]{40}\b')
TRON_RE = re.compile(r'\bT[1-9A-HJ-NP-Za-km-z]{33}\b')
PAYMENT_RE = re.compile(
    r'\b(?:cashapp|cash app|\$[a-z0-9]{3,20}|venmo|zelle|paypal\.me/[\w-]+|western union|'
    r'bitcoin|btc address|usdt|crypto wallet|gift cards?|upi(?: id)?|gpay|google pay|phonepe|'
    r'paytm|bank transfer|wire transfer)\b', re.IGNORECASE)
DOWNLOAD_RE = re.compile(
    r'\b(?:https?://|www\.)[^\s<>"\')]+\.(?:apk|xapk|exe|msi|dmg|pkg|zip|rar)(?:\?[^\s<>"\')]+)?',
    re.IGNORECASE)
TELEGRAM_HANDLE_RE = re.compile(r'(?<![\w])(?:telegram|tg)\s*[:=-]?\s*@([a-z0-9_]{5,32})',
                                re.IGNORECASE)


def domain_of(url: str) -> str:
    if not url:
        return ''
    candidate = url if '://' in url else 'http://' + url
    try:
        host = urllib.parse.urlsplit(candidate).netloc.lower()
    except ValueError:
        return ''
    host = host.split('@')[-1].split(':')[0]
    return host[4:] if host.startswith('www.') else host


def extract(text: str) -> Dict[str, List[str]]:
    text = text or ''
    urls = [u.rstrip('.,);:!?') for u in URL_RE.findall(text)]
    known = {domain_of(u) for u in urls}
    for bare in BARE_DOMAIN_RE.findall(text):
        if domain_of(bare) not in known:
            urls.append(bare)
            known.add(domain_of(bare))
    crypto = list(BTC_RE.findall(text)) + list(ETH_RE.findall(text)) + list(TRON_RE.findall(text))
    phones = []
    phone_text = BTC_RE.sub(' ', ETH_RE.sub(' ', TRON_RE.sub(' ', text)))
    for value in PHONE_RE.findall(phone_text):
        normalized = re.sub(r'[^\d+]', '', value)
        digits = re.sub(r'\D', '', normalized)
        if 8 <= len(digits) <= 15:
            phones.append(normalized)
    return {
        'hashtag': _dedupe(h.lower() for h in HASHTAG_RE.findall(text)),
        'mention': _dedupe(m.lower().strip('.') for m in MENTION_RE.findall(text)),
        'url': _dedupe(urls),
        'email': _dedupe(e.lower() for e in EMAIL_RE.findall(text)),
        'payment': _dedupe(p.lower() for p in PAYMENT_RE.findall(text)),
        'upi': _dedupe(value.lower() for value in UPI_RE.findall(text)),
        'crypto_wallet': _dedupe(crypto),
        'phone': _dedupe(phones),
        'download': _dedupe(value.rstrip('.,);:!?') for value in DOWNLOAD_RE.findall(text)),
        'telegram': _dedupe(value.lower() for value in TELEGRAM_HANDLE_RE.findall(text)),
    }


def _dedupe(items) -> List[str]:
    seen, out = set(), []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out

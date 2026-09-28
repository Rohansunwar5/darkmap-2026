// Port of REF darkmap/extract.py. Regexes translated per Global Constraints rule 5.
import { ValueError } from '../errors.js';
import { B, D, PY_SPACE_CHARS, findall, pyDedupe, pyLen, pyRstrip, pyStrip } from './pycompat.js';
import { urlsplit } from './urlsplit.js';

const NOT_URL = `[^${PY_SPACE_CHARS}<>"')]`;
const WCLASS = '\\p{L}\\p{N}_';
const HASHTAG_RE = /(?<![A-Za-z0-9_])#([A-Za-z0-9_À-ɏ]{1,60})/gu;
const MENTION_RE = /(?<![A-Za-z0-9_])@([A-Za-z0-9_.]{1,40})/gu;
const URL_RE = new RegExp(`${B}((?:https?://|www\\.)${NOT_URL}+)`, 'giu');
const BARE_DOMAIN_RE = new RegExp(`${B}((?:t\\.me|telegram\\.me|telegram\\.dog)/[a-z0-9_+.-]+|`
  + '[a-z0-9-]+(?:\\.[a-z0-9-]+)+\\.(?:com|net|org|shop|store|top|xyz|ru|cn|info|live|link|click|icu|online|site|vip))'
  + B, 'giu');
const EMAIL_RE = new RegExp(`${B}[${WCLASS}.+-]+@[${WCLASS}-]+\\.[${WCLASS}.-]+${B}`, 'gu');
const PHONE_RE = new RegExp(`(?<!${D})(?:\\+?${D}[\\p{Nd}${PY_SPACE_CHARS}().-]{7,18}${D})(?!${D})`, 'gu');
const UPI_RE = new RegExp(`(?<![${WCLASS}.+-])([a-z0-9][a-z0-9._-]{1,80}@(?:upi|ybl|ibl|axl|okaxis|okhdfcbank|`
  + `okicici|oksbi|paytm|apl|ptyes|freecharge|airtel|fbl|indus|kotak))(?![${WCLASS}.-])`, 'giu');
const BTC_RE = new RegExp(`${B}(?:bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})${B}`, 'gu');
const ETH_RE = new RegExp(`${B}0x[a-fA-F0-9]{40}${B}`, 'gu');
const TRON_RE = new RegExp(`${B}T[1-9A-HJ-NP-Za-km-z]{33}${B}`, 'gu');
const PAYMENT_RE = new RegExp(`${B}(?:cashapp|cash app|\\$[a-z0-9]{3,20}|venmo|zelle|paypal\\.me/[${WCLASS}-]+|`
  + 'western union|bitcoin|btc address|usdt|crypto wallet|gift cards?|upi(?: id)?|gpay|google pay|phonepe|'
  + `paytm|bank transfer|wire transfer)${B}`, 'giu');
const DOWNLOAD_RE = new RegExp(`${B}(?:https?://|www\\.)${NOT_URL}+\\.(?:apk|xapk|exe|msi|dmg|pkg|zip|rar)`
  + `(?:\\?${NOT_URL}+)?`, 'giu');
const TELEGRAM_HANDLE_RE = new RegExp(`(?<![${WCLASS}])(?:telegram|tg)[${PY_SPACE_CHARS}]*[:=-]?`
  + `[${PY_SPACE_CHARS}]*@([a-z0-9_]{5,32})`, 'giu');

export function domainOf(url) {
  if (!url) return '';
  const candidate = url.includes('://') ? url : `http://${url}`;
  let host;
  try {
    host = urlsplit(candidate).netloc.toLowerCase();
  } catch (error) {
    if (error instanceof ValueError) return '';
    throw error;
  }
  host = host.split('@').at(-1).split(':')[0];
  return host.startsWith('www.') ? host.slice(4) : host;
}

export function extract(text) {
  text = text || '';
  const urls = findall(URL_RE, text).map(u => pyRstrip(u, '.,);:!?'));
  const known = new Set(urls.map(domainOf));
  for (const bare of findall(BARE_DOMAIN_RE, text)) {
    if (!known.has(domainOf(bare))) { urls.push(bare); known.add(domainOf(bare)); }
  }
  const crypto = [...findall(BTC_RE, text), ...findall(ETH_RE, text), ...findall(TRON_RE, text)];
  const phoneText = text.replace(TRON_RE, ' ').replace(ETH_RE, ' ').replace(BTC_RE, ' ');
  const phones = [];
  for (const value of findall(PHONE_RE, phoneText)) {
    const normalized = value.replace(/[^\p{Nd}+]/gu, '');
    const digits = normalized.replace(/[^\p{Nd}]/gu, '');
    if (pyLen(digits) >= 8 && pyLen(digits) <= 15) phones.push(normalized);
  }
  return {
    hashtag: pyDedupe(findall(HASHTAG_RE, text).map(h => h.toLowerCase())),
    mention: pyDedupe(findall(MENTION_RE, text).map(m => pyStrip(m.toLowerCase(), '.'))),
    url: pyDedupe(urls),
    email: pyDedupe(findall(EMAIL_RE, text).map(e => e.toLowerCase())),
    payment: pyDedupe(findall(PAYMENT_RE, text).map(p => p.toLowerCase())),
    upi: pyDedupe(findall(UPI_RE, text).map(v => v.toLowerCase())),
    crypto_wallet: pyDedupe(crypto),
    phone: pyDedupe(phones),
    download: pyDedupe(findall(DOWNLOAD_RE, text).map(v => pyRstrip(v, '.,);:!?'))),
    telegram: pyDedupe(findall(TELEGRAM_HANDLE_RE, text).map(v => v.toLowerCase())),
  };
}

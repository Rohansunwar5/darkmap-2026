// Port of REF darkmap/ai/heuristics.py: deterministic, explainable risk signals. They always run, are fully
// auditable, and give a floor of coverage without an AI provider. Each signal carries category, weight, evidence
// field and quote. Names follow REF in camelCase; every key that lands in the output stays snake_case.
import { domainOf } from './extract.js';
import { B, D, S, codePoints, counter, dedupe, or, pyFixed, pyLen, pyLstrip, pyRepr, pyRound, pySlice, pyStr,
  pyStrip, pySum, sorted, truthy } from './pycompat.js';
import { SequenceMatcher } from './sequence-matcher.js';

// Term lists and tables: REF heuristics.py:14-173, verbatim and in REF order.
const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'cutt.ly', 'rb.gy', 'is.gd', 'shorturl.at', 'linktr.ee',
  'bit.do', 'rebrand.ly', 's.id', 'tiny.cc'
]);
const MESSAGING_DOMAINS = new Set([
  't.me', 'telegram.me', 'telegram.dog', 'wa.me', 'whatsapp.com', 'chat.whatsapp.com'
]);
const RISKY_TLDS = new Set([
  'top', 'xyz', 'icu', 'click', 'link', 'live', 'shop', 'store', 'vip', 'cn', 'ru', 'online', 'site', 'buzz',
  'rest', 'monster'
]);
const ROLE_TOKENS = [
  'official', 'support', 'help', 'helpdesk', 'service', 'care', 'customercare', 'team', 'hq', 'admin',
  'security', 'verify', 'verified', 'billing', 'refund', 'claims', 'agent', 'assist'
];
const LOOKALIKE_TOKENS = [
  'real', 'the', 'its', 'official', 'original', 'global', 'store', 'shop', 'outlet', 'sale', 'usa', 'uk', 'eu',
  'online', 'world'
];
const COUNTERFEIT_TERMS = [
  'replica', 'reps', '1:1', 'aaa quality', 'mirror quality', 'unauthorized', 'factory price',
  'wholesale price', 'dm to order', 'dm for price', 'cheap price', 'best replica', 'clone', 'copy version',
  'oem quality', 'no box', 'tier 1 quality'
];
const GIVEAWAY_TERMS = [
  'giveaway', 'you have been selected', 'you won', 'winner', 'congratulations you', 'claim your prize',
  'lucky winner', 'free gift', 'claim now', 'selected winner'
];
const PAYMENT_TERMS = [
  'delivery fee', 'shipping fee', 'processing fee', 'small fee', 'cashapp', 'zelle', 'venmo', 'gift card',
  'bitcoin', 'usdt', 'crypto', 'western union', 'wire transfer', 'pay first', 'advance payment', 'upi id',
  'pay via upi', 'booking fee', 'refund fee', 'prize fee', 'claim charge', 'registration fee', 'training fee'
];
const CREDENTIAL_TERMS = [
  'verify your account', 'confirm your identity', 'account will be disabled', 'account has been flagged',
  'copyright violation', 'appeal form', 'login here', 'log in to verify', 'enter your password', 'otp code',
  'two factor code', 'send us your password', 'secure your account now', 'reactivate your account',
  'submit your credentials', 'unusual login', 'reset your password', 'unlock your account',
  'complete your kyc', 'submit recovery code', 'enter card number', 'enter cvv', 'submit card details'
];
const SUPPORT_TERMS = [
  'dm us for help', 'contact support', 'customer support', 'we can help you', 'refund team',
  'recovery service', 'account recovery', 'unban service', 'hacked account help'
];
const URGENCY_TERMS = [
  'within 24 hours', 'immediately', 'last chance', 'act now', 'final warning', 'expires today', 'urgent',
  'account is blocked', 'account blocked', 'order is blocked', 'order blocked', 'suspended', 'locked'
];
const DEAL_LURE_TERMS = [
  'loot', 'loot deal', 'loot offer', 'loot alert', 'deal alert', 'price glitch', 'secret deal',
  'exclusive deal', 'exclusive offer', 'limited offer', 'flash sale', 'big offer', 'mega offer',
  'lowest price', 'coupon code', 'promo code', 'free voucher', 'free coupon', 'cashback', 'cashback offer',
  'cashback unlock', 'instant cashback', 'credit limit', 'instant credit', 'recharge offer',
  'bill payment offer', '90% off', '95% off', 'free product', 'free frame', 'free glasses', 'free lenses',
  'free eyewear', 'free cash', 'free credit', 'almost free', 'massive discount'
];
const ACTION_TERMS = [
  'join now', 'join here', 'join channel', 'join group', 'link in bio', 'link below', 'click the link',
  'tap the link', 'dm now', 'dm us', 'message now', 'claim now', 'register now', 'apply now', 'limited slots',
  'follow me', 'comment for', 'comment how', 'comment link', 'link will auto', 'comment cash', 'comment code',
  'comment deal', 'link will be sent', 'check dm', 'dm for link', 'watch now', 'grab it', "don't miss",
  'don’t miss'
];
const INTERACTION_GATE_TERMS = [
  'follow me', 'comment for', 'comment how', 'comment link', 'comment cash', 'comment code', 'comment deal',
  'link will auto', 'link will be sent', 'check dm', 'dm for link'
];
const CHANNEL_TERMS = [
  'telegram', 'telegram channel', 'telegram group', 'whatsapp group', 'whatsapp channel', 'join our channel',
  'join our group'
];
const PHISHING_LURE_TERMS = [
  'verify now', 'login to claim', 'log in to claim', 'claim page', 'claim link', 'secure login',
  'sign in to claim', 'enter otp', 'share otp'
];
const PROMOTIONAL_LURE_TERMS = [...DEAL_LURE_TERMS, ...GIVEAWAY_TERMS, ...PAYMENT_TERMS,
  'for free', 'completely free', 'absolutely free', 'worth ₹', 'worth rs', 'worth inr'];
const PROMO_HANDLE_TOKENS = [
  'deal', 'deals', 'offer', 'offers', 'loot', 'promo', 'coupon', 'reward', 'rewards', 'giveaway'
];
const COUPON_REWARD_TERMS = [
  'voucher', 'coupon', 'reward points', 'loyalty points', 'redeem points', 'gift voucher', 'promo voucher',
  'cashback reward'
];
const RECRUITMENT_TERMS = [
  'job offer', 'hiring now', 'we are hiring', 'recruitment', 'recruiter', 'internship', 'brand ambassador',
  'campus ambassador', 'work from home', 'hr team', 'human resources', 'regional manager', 'joining letter',
  'offer letter', 'interview fee', 'training payment', 'registration fee'
];
const EXECUTIVE_TERMS = [
  'ceo', 'chief executive', 'founder', 'chairman', 'director', 'executive', 'regional manager', 'country head',
  'vice president', 'vp '
];
const MALWARE_TERMS = [
  'download apk', 'install apk', 'apk file', 'browser extension', 'software update', 'security update',
  'download to claim', 'install for refund', 'remote support', 'remote access', 'anydesk', 'teamviewer',
  'quicksupport', 'rustdesk', 'screen share', 'sideload'
];
const FILE_SHARING_DOMAINS = new Set([
  'drive.google.com', 'dropbox.com', 'mediafire.com', 'mega.nz', 'wetransfer.com', 'sendspace.com',
  'apkcombo.com', 'apkpure.com', 'apkfab.com', 'githubusercontent.com'
]);
const INVESTMENT_TERMS = [
  'invest now', 'trading group', 'trading signals', 'signal group', 'guaranteed return', 'guaranteed profit',
  'double your money', 'crypto investment', 'deposit crypto', 'daily returns', 'passive income',
  'risk free returns', '100% returns'
];
const VICTIM_TERMS = [
  'i paid', 'paid already', 'money lost', 'order never arrived', 'never received', 'account hacked',
  'this is fake', 'this is scam', 'scammed me', 'fraud account', 'do not pay', 'otp stolen',
  'refund not received'
];
const AUTHENTICATION_TERMS = [
  'password', 'otp', 'one time password', 'recovery code', '2fa code', 'verification code', 'card details',
  'card number', 'cvv', 'pin number'
];
const QR_TERMS = [
  'scan qr', 'scan the qr', 'qr code', 'scan to pay', 'scan to login', 'scan to claim'
];
const SENSITIVE_REQUEST_TERMS = [
  'enter your', 'send your', 'send us', 'share your', 'submit your', 'provide your', 'type your',
  'upload your', 'confirm your', 'give us your', 'reply with your'
];
const SAFETY_WARNING_TERMS = [
  'never share', 'do not share', "don't share", 'dont share', 'will never ask', 'beware of', 'fraud awareness',
  'scam awareness', 'stay safe', 'protect yourself'
];
const RESELLER_TERMS = [
  'unauthorized reseller', 'grey market', 'gray market', 'parallel import', 'not authorized',
  'without warranty', 'imported stock'
];
export const CATEGORY_WEIGHTS = {
  brand_impersonation: 1.0,
  counterfeit: 0.95,
  scam_phishing: 1.0,
  suspicious_naming: 0.6,
  logo_misuse: 0.6,
  risky_urls: 0.8,
  giveaway_payment_scam: 0.95,
  fake_support: 0.9,
  credential_harvesting: 1.0,
  coordinated_abuse: 0.7,
  payment_fraud: 1.0,
  executive_impersonation: 0.9,
  recruitment_fraud: 0.95,
  malicious_downloads: 1.0,
  investment_fraud: 1.0,
  victim_signals: 0.75,
  account_change_risk: 0.7,
};
export const ALERT_FAMILIES = {
  credential_takeover: [
    'credential_harvesting'
  ],
  payment_fraud: [
    'payment_fraud'
  ],
  fake_customer_support: [
    'fake_support'
  ],
  scam_promotions: [
    'giveaway_payment_scam', 'scam_phishing'
  ],
  counterfeit_sales: [
    'counterfeit'
  ],
  employee_recruiter_impersonation: [
    'executive_impersonation', 'recruitment_fraud'
  ],
  malicious_apps_downloads: [
    'malicious_downloads'
  ],
  investment_financial_impersonation: [
    'investment_fraud'
  ],
};
export const DIMENSION_CATEGORIES = {
  deception: [
    'brand_impersonation', 'suspicious_naming', 'logo_misuse', 'fake_support', 'executive_impersonation',
    'recruitment_fraud'
  ],
  harm: [
    'credential_harvesting', 'scam_phishing', 'payment_fraud', 'counterfeit', 'giveaway_payment_scam',
    'malicious_downloads', 'investment_fraud'
  ],
  exposure: [
    'victim_signals'
  ],
  coordination: [
    'coordinated_abuse', 'account_change_risk'
  ],
};
export const ESTABLISHED_FOLLOWER_THRESHOLD = 100000;
export const VERIFIED_ESTABLISHED_FOLLOWER_THRESHOLD = 10000;
export const DIRECT_HARM_SIGNALS = new Set([
  'brand_lure_to_off_platform_channel', 'brand_phishing_call_to_action', 'interaction_gated_brand_offer',
  'brand_job_plus_fee_request', 'brand_investment_channel_or_wallet', 'brand_download_call_to_action',
  'brandlike_domain', 'credential_themed_url', 'sensitive_authentication_request', 'qr_plus_sensitive_action',
  'qr_sensitive_destination', 'qr_payment_destination', 'promotion_plus_payment_request',
  'support_reply_hijack', 'support_moves_off_platform', 'direct_executable_download',
  'unofficial_download_destination', 'payment_identifier_reused', 'executive_investment_endorsement',
  'synthetic_investment_media'
]);

// Python's 0.85 ** idx for idx 0-5 (tests/golden/pycompat.json pow085), so V8's Math.pow rounding never matters.
const POW_085 = [1.0, 0.85, 0.7224999999999999, 0.6141249999999999, 0.5220062499999999, 0.44370531249999995];

const norm = text => or(text, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function sig(category, signal, field, quote, weight, rationale) {
  return { source: 'heuristic', category, signal, field, quote: pySlice(or(quote, ''), 0, 240),
    weight: pyRound(Math.min(1.0, Math.max(0.0, weight)), 3), rationale };
}

function findTerms(text, terms) {
  const low = or(text, '').toLowerCase();
  // Search-result snippets often insert quotation marks, emoji, or OCR punctuation between words (for example,
  // `comment “LINK”`). Compare a space-normalized form as well as the original text.
  const spaced = pyStrip(low.replace(/[^a-z0-9]+/g, ' '));
  const matches = [];
  for (const term of terms) {
    const normalizedTerm = pyStrip(term.toLowerCase().replace(/[^a-z0-9]+/g, ' '));
    if (low.includes(term.toLowerCase()) || (normalizedTerm && spaced.includes(normalizedTerm))) matches.push(term);
  }
  return matches;
}

const PERCENT_OFF_RE = new RegExp(`${B}(?:up${S}+to${S}+)?${D}{1,3}${S}*%${S}*(?:off|discount)${B}`, 'u');
const AMOUNT = `(?:₹|rs\\.?|inr)${S}*[\\p{Nd},]+(?:\\.${D}+)?`;
const BENEFIT = `(?:cash${S}*back|cashback|credit${S}+limit|refund|voucher|reward|free)`;
const AMOUNT_BENEFIT_RE = new RegExp(`(?:${AMOUNT}[^\\n]{0,36}${BENEFIT}|${BENEFIT}[^\\n]{0,36}${AMOUNT})`, 'u');

// Recognize written and quantified financial promotions without assuming fraud.
function dealLureHits(text) {
  const low = or(text, '').toLowerCase();
  const hits = findTerms(low, DEAL_LURE_TERMS);
  if (PERCENT_OFF_RE.test(low)) hits.push('quantified percentage discount');
  if (AMOUNT_BENEFIT_RE.test(low)) hits.push('quantified financial benefit');
  return dedupe(hits);
}

// Accept a configured domain and its subdomains as official destinations.
const officialDomain = (domain, officialDomains) =>
  [...officialDomains].some(item => domain === item || domain.endsWith(`.${item}`));

export function handleSimilarity(handle, brandNames) {
  const h = norm(handle);
  let best = 0.0;
  for (const name of brandNames) {
    const n = norm(name);
    if (!n || !h) continue;
    let ratio = new SequenceMatcher(h, n).ratio();
    if (h.includes(n)) ratio = Math.max(ratio, h !== n ? 0.85 : 1.0);
    best = Math.max(best, ratio);
  }
  return best;
}

// Python f"{d.get(key, '')}": '' only when the key is absent; a present None prints 'None'.
const fget = (object, key) => (Object.hasOwn(object, key) ? pyStr(object[key]) : '');

const CREDENTIAL_URL_RE = /(login|verify|secure|appeal|recover|account|wallet|billing)/iu;
const DOWNLOAD_URL_RE = /\.(?:apk|xapk|exe|msi|dmg|pkg|zip|rar)(?:\?|(?=\n?$))/iu;
const QR_SENSITIVE_RE = /(login|signin|verify|kyc|password|otp|account)/iu;
const QR_PAYMENT_RE = /(pay|upi|wallet|claim|refund)/iu;
const SUPPORT_ROLE_TOKENS = ['support', 'help', 'helpdesk', 'service', 'care', 'customercare', 'billing', 'refund',
  'security', 'verify'];
const IMPORTANT_CHANGE_FIELDS = ['handle', 'display_name', 'biography', 'external_url', 'language',
  'content_category'];

// Return {overall_score, category_scores, dimensions, alert_families, independent_indicators, signals, notes}.
export function analyze(dossier) {
  const brand = or(dossier.brand, {});
  let brandNames = truthy(brand.name) ? [brand.name] : [];
  brandNames = [...brandNames, ...or(brand.keywords, [])];
  brandNames = brandNames.filter(b => truthy(b));
  const officialHandles = new Set(or(brand.official_handles, []).map(h => pyLstrip(h.toLowerCase(), '@')));
  const officialDomains = new Set(or(brand.official_domains, []).map(d => d.toLowerCase()));

  const account = or(dossier.account, {});
  const posts = or(dossier.posts, []);
  const handle = or(account.handle, '').toLowerCase();
  const bio = or(account.biography, '');
  const name = or(account.display_name, '');
  const identityText = `${bio} ${name}`.toLowerCase();
  const contentOnly = truthy(dossier.content_only);
  const disclosedUnofficial = !contentOnly && ['unofficial fan', 'fan page', 'not affiliated', 'parody account',
    'community page', 'tribute account'].some(phrase => identityText.includes(phrase));

  let signals = [];
  const notes = [];

  // ---------- brand impersonation / naming ----------
  // A registered handle is the strongest trust signal. A profile URL on a configured first-party domain also
  // establishes ownership without forcing every brand to maintain aliases.
  const profileDomain = domainOf(or(account.external_url, ''));
  const isOfficial = officialHandles.has(handle)
    || Boolean(profileDomain && officialDomain(profileDomain, officialDomains));
  if (isOfficial) {
    if (officialHandles.has(handle)) notes.push('handle matches a registered official brand handle');
    else notes.push('profile URL matches a registered official brand domain');
  }
  const sim = brandNames.length ? handleSimilarity(handle, brandNames) : 0.0;
  const nameSim = brandNames.length ? handleSimilarity(name, brandNames) : 0.0;
  if (!isOfficial && sim >= 0.72) {
    signals.push(sig('brand_impersonation', 'handle_resembles_brand', 'account.handle', handle,
      Math.min(1.0, (sim - 0.6) / 0.4), `handle similarity to protected brand is ${pyFixed(sim, 2)}`));
  }
  if (!isOfficial && nameSim >= 0.8) {
    signals.push(sig('brand_impersonation', 'display_name_resembles_brand', 'account.display_name', name,
      Math.min(1.0, (nameSim - 0.7) / 0.3), `display name similarity is ${pyFixed(nameSim, 2)}`));
  }
  if (!isOfficial && ['official account', 'verified account', 'official page', 'only official']
    .some(k => identityText.includes(k))) {
    signals.push(sig('brand_impersonation', 'claims_official_status', 'account.biography', bio, 0.8,
      'account claims official status without verification'));
  }

  const roleHits = ROLE_TOKENS.filter(t => norm(handle).includes(t) || norm(name).includes(t));
  const lookalikeHits = LOOKALIKE_TOKENS.filter(t => norm(handle).startsWith(norm(t)));
  if (roleHits.length && (sim >= 0.55 || !brandNames.length)) {
    signals.push(sig('suspicious_naming', 'role_token_in_handle', 'account.handle', handle,
      0.55 + 0.1 * Math.min(3, roleHits.length), `handle contains support/authority tokens: ${pyRepr(roleHits)}`));
  }
  if (!isOfficial && sim >= 0.75 && roleHits.length) {
    signals.push(sig('brand_impersonation', 'brand_plus_authority_handle', 'account.handle', handle, 0.65,
      'nonofficial handle combines the protected brand with support/authority wording'));
  }
  const promoHandleHits = PROMO_HANDLE_TOKENS.filter(t => norm(handle).includes(t) || norm(name).includes(t));
  if (!isOfficial && sim >= 0.72 && promoHandleHits.length) {
    signals.push(sig('brand_impersonation', 'brand_plus_promotional_handle', 'account.handle', handle, 0.7,
      `nonofficial brand-like identity uses promotional wording: ${pyRepr(promoHandleHits)}`));
    signals.push(sig('suspicious_naming', 'promotional_brand_handle', 'account.handle', handle, 0.55,
      'handle presents itself as a brand deal, offer, reward, or giveaway account'));
  }
  if (lookalikeHits.length && sim >= 0.6) {
    signals.push(sig('suspicious_naming', 'lookalike_prefix', 'account.handle', handle, 0.5,
      `handle uses lookalike prefix ${pyRepr(lookalikeHits)}`));
  }
  if (/[0-9]{3,}(?=\n?$)/.test(handle) || handle.split('_').length - 1 >= 3 || handle.split('.').length - 1 >= 3) {
    signals.push(sig('suspicious_naming', 'noisy_handle_pattern', 'account.handle', handle, 0.35,
      'handle uses digit/separator padding typical of throwaways'));
  }
  if (codePoints(handle).some(ch => ch.codePointAt(0) > 127)) {
    signals.push(sig('suspicious_naming', 'non_ascii_handle', 'account.handle', handle, 0.45,
      'handle contains non-ASCII characters (homoglyph risk)'));
  }

  const supportRoleHits = roleHits.filter(t => SUPPORT_ROLE_TOKENS.includes(t));
  if (!isOfficial && supportRoleHits.length) {
    signals.push(sig('fake_support', 'support_persona_handle', 'account.handle', handle, 0.6,
      'handle presents as a brand support/security desk'));
  }

  const followers = account.followers_count ?? null;
  const displayIsPlaceholder = truthy(name) && norm(name) === norm(handle);
  const profileDetailsMissing = or(dossier.provenance, {}).collection_mode === 'keyword_serp_fallback' || (
    followers == null
    && account.follows_count == null
    && account.media_count == null
    && !pyStrip(bio)
    && !truthy(account.external_url)
    && (!pyStrip(name) || displayIsPlaceholder));
  // ponytail: Number.isInteger stands in for isinstance(followers, int); an integral float such as 250000.0
  // would count as an int here. Follower counts always arrive as integers.
  const isEstablished = (Number.isInteger(followers) && followers >= ESTABLISHED_FOLLOWER_THRESHOLD)
    || (truthy(account.is_verified) && Number.isInteger(followers)
      && followers >= VERIFIED_ESTABLISHED_FOLLOWER_THRESHOLD);
  const verifiedMetricsMissing = truthy(account.is_verified) && followers == null;
  // Reach is a useful credibility signal for a brand-like identity. It ranks small lookalike accounts ahead of
  // high-reach publishers, but it cannot establish wrongdoing by itself.
  if (Number.isInteger(followers) && sim >= 0.75 && !isOfficial) {
    let lowReachWeight;
    let reachRationale;
    if (followers < 500) {
      lowReachWeight = 0.45;
      reachRationale = 'brand-like identity has fewer than 500 followers';
    } else if (followers < 5_000) {
      lowReachWeight = 0.32;
      reachRationale = 'brand-like identity has fewer than 5,000 followers';
    } else if (followers < 20_000) {
      lowReachWeight = 0.2;
      reachRationale = 'brand-like identity has limited reach for a claimed brand presence';
    } else {
      lowReachWeight = 0.0;
      reachRationale = '';
    }
    if (lowReachWeight) {
      signals.push(sig('brand_impersonation', 'brandlike_but_low_reach', 'account.followers_count', String(followers),
        lowReachWeight, reachRationale));
    }
  }

  // ---------- URLs ----------
  const entities = dossier.entities ?? [];
  const externalDomains = new Set();
  for (const ent of entities) {
    if (ent.kind !== 'url') continue;
    const value = or(ent.value, '');
    const dom = truthy(ent.domain) ? ent.domain : domainOf(value);
    if (!dom || officialDomain(dom, officialDomains)) continue;
    externalDomains.add(dom);
    const field = `entities.url[${fget(ent, 'source_field')}]`;
    const tld = dom.slice(dom.lastIndexOf('.') + 1);
    if (SHORTENERS.has(dom)) {
      signals.push(sig('risky_urls', 'url_shortener', field, value, 0.5,
        'destination is obscured by a link shortener'));
    }
    if (MESSAGING_DOMAINS.has(dom)) {
      signals.push(sig('risky_urls', 'off_platform_messaging_link', field, value, 0.75,
        'moves users from Instagram into a Telegram or WhatsApp channel'));
    }
    if (RISKY_TLDS.has(tld)) {
      signals.push(sig('risky_urls', 'high_risk_tld', field, value, 0.45,
        `.${tld} is over-represented in abuse reporting`));
    }
    if (dom.startsWith('xn--') || dom.includes('--')) {
      signals.push(sig('risky_urls', 'punycode_or_homoglyph_domain', field, value, 0.7,
        'domain uses punycode/hyphen patterns used for lookalikes'));
    }
    if (brandNames.length && handleSimilarity(dom.split('.')[0], brandNames) >= 0.72
        && !officialDomain(dom, officialDomains)) {
      signals.push(sig('brand_impersonation', 'brandlike_domain', field, value, 0.75,
        'outbound domain imitates the protected brand'));
    }
    if (CREDENTIAL_URL_RE.test(dom + value)) {
      signals.push(sig('credential_harvesting', 'credential_themed_url', field, value, 0.6,
        'URL path/host is themed around login or verification'));
    }
    if (FILE_SHARING_DOMAINS.has(dom) || DOWNLOAD_URL_RE.test(value)) {
      signals.push(sig('malicious_downloads', 'unofficial_download_destination', field, value, 0.75,
        'link leads to a downloadable application/archive or file host'));
    }
  }

  // Concrete financial/contact artifacts are retained as investigator pivots. An artifact alone is not proof;
  // the composite rules below require accompanying solicitation language.
  const entityKinds = counter(entities.map(e => e.kind ?? null));
  const kinds = kind => entityKinds.get(kind) ?? 0;
  for (const ent of entities) {
    const kind = ent.kind ?? null;
    const value = or(ent.value, '');
    const field = `entities.${pyStr(kind)}[${fget(ent, 'source_field')}]`;
    if (kind === 'upi') {
      signals.push(sig('payment_fraud', 'upi_identifier_exposed', field, value, 0.58,
        'post/profile publishes a UPI payment identifier'));
    } else if (kind === 'crypto_wallet') {
      signals.push(sig('payment_fraud', 'crypto_wallet_exposed', field, value, 0.62,
        'post/profile publishes a cryptocurrency wallet address'));
    } else if (kind === 'download') {
      signals.push(sig('malicious_downloads', 'direct_executable_download', field, value, 0.82,
        'direct executable/application download was extracted'));
    } else if (kind === 'phone' && !isOfficial && supportRoleHits.length) {
      signals.push(sig('fake_support', 'support_phone_number', field, value, 0.55,
        'brand support persona publishes a phone contact'));
    } else if (kind === 'telegram') {
      signals.push(sig('risky_urls', 'telegram_handle', field, `@${value}`, 0.55,
        'moves a user into an off-platform Telegram conversation'));
    }
  }

  // ---------- text corpora ----------
  const corpora = contentOnly ? [] : [['account.biography', bio]];
  posts.forEach((p, i) => {
    corpora.push([`posts[${i}].caption`, or(p.caption, '')]);
    or(p.media, []).forEach((m, j) => {
      if (truthy(m.ocr_text)) corpora.push([`posts[${i}].media[${j}].ocr_text`, m.ocr_text]);
    });
    or(p.comments, []).forEach((c, j) => corpora.push([`posts[${i}].comments[${j}].text`, or(c.text, '')]));
  });

  const scan = (category, terms, signal, base, rationale) => {
    for (const [field, text] of corpora) {
      const hits = findTerms(text, terms);
      if (hits.length) {
        signals.push(sig(category, signal, field, text, Math.min(1.0, base + 0.1 * (hits.length - 1)),
          `${rationale}: ${pyRepr(hits.slice(0, 4))}`));
      }
    }
  };

  scan('counterfeit', COUNTERFEIT_TERMS, 'counterfeit_sales_language', 0.65, 'counterfeit/replica sales vocabulary');
  scan('giveaway_payment_scam', GIVEAWAY_TERMS, 'giveaway_winner_language', 0.6,
    'unsolicited prize/giveaway claim language');
  scan('giveaway_payment_scam', PAYMENT_TERMS, 'upfront_payment_request', 0.65,
    'request for fee or irreversible payment rail');
  scan('credential_harvesting', CREDENTIAL_TERMS, 'credential_request_language', 0.75,
    'asks the victim to verify/log in or supply credentials');
  scan('fake_support', SUPPORT_TERMS, 'support_solicitation', 0.5, 'solicits DMs as if operating brand support');
  scan('scam_phishing', URGENCY_TERMS, 'urgency_pressure', 0.35, 'artificial urgency/pressure language');
  for (const [field, text] of corpora) {
    const hits = dealLureHits(text);
    if (hits.length) {
      signals.push(sig('giveaway_payment_scam', 'deal_lure_language', field, text,
        Math.min(1.0, 0.6 + 0.1 * (hits.length - 1)),
        `uses loot, cashback, credit, coupon, or quantified-discount bait: ${pyRepr(hits.slice(0, 4))}`));
    }
  }
  scan('credential_harvesting', PHISHING_LURE_TERMS, 'phishing_lure_language', 0.8,
    'directs users to a login, KYC, claim, or OTP flow');
  scan('payment_fraud', PAYMENT_TERMS, 'payment_rail_or_advance_fee', 0.68,
    'requests an advance fee or hard-to-reverse payment method');
  scan('giveaway_payment_scam', COUPON_REWARD_TERMS, 'coupon_reward_redemption_lure', 0.52,
    'promises voucher, reward, or loyalty-point redemption');
  scan('counterfeit', RESELLER_TERMS, 'unauthorized_reseller_language', 0.64,
    'describes grey-market or unauthorized resale');
  scan('recruitment_fraud', RECRUITMENT_TERMS, 'recruitment_solicitation', 0.62,
    'uses job, internship, recruiter, or ambassador solicitation language');
  scan('executive_impersonation', EXECUTIVE_TERMS, 'executive_role_claim', 0.48,
    'claims an executive, founder, or senior manager identity');
  scan('malicious_downloads', MALWARE_TERMS, 'application_or_remote_access_lure', 0.75,
    'pushes an application, update, APK, extension, or remote-access tool');
  scan('investment_fraud', INVESTMENT_TERMS, 'investment_solicitation', 0.67,
    'promotes trading signals, deposits, or implausibly guaranteed returns');
  scan('victim_signals', VICTIM_TERMS, 'victim_report_language', 0.58,
    'comments or captions report payment loss, non-delivery, hacking, or fraud');

  // A brand mention alone can be ordinary discussion. Escalate only when a nonofficial account combines that
  // brand with a lure and a concrete action/off-platform destination.
  const normalizedBrands = brandNames.map(norm).filter(value => value);
  const hasMessagingLink = [...externalDomains].some(d => MESSAGING_DOMAINS.has(d));
  for (const [field, text] of corpora) {
    const low = or(text, '').toLowerCase();
    const compact = norm(low);
    const brandHits = normalizedBrands.filter(value => compact.includes(value)).length > 0;
    const dealHits = dedupe([...dealLureHits(low), ...findTerms(low, [...GIVEAWAY_TERMS, ...PAYMENT_TERMS])]).length > 0;
    const actionHits = findTerms(low, ACTION_TERMS).length > 0;
    const interactionHits = findTerms(low, INTERACTION_GATE_TERMS).length > 0;
    const channelHits = findTerms(low, CHANNEL_TERMS).length > 0;
    const phishingHits = findTerms(low, [...PHISHING_LURE_TERMS, ...CREDENTIAL_TERMS]).length > 0;
    const has = terms => findTerms(low, terms).length > 0;
    if (!isOfficial && brandHits && dealHits && (actionHits || channelHits || hasMessagingLink)) {
      signals.push(sig('brand_impersonation', 'brand_used_in_promotional_solicitation', field, text, 0.8,
        'a nonofficial account uses the protected brand in an actionable offer'));
    }
    if (!isOfficial && brandHits && (dealHits || phishingHits) && (channelHits || hasMessagingLink)) {
      signals.push(sig('scam_phishing', 'brand_lure_to_off_platform_channel', field, text, 0.92,
        'brand-themed offer or login lure moves users to Telegram/WhatsApp'));
    }
    if (!isOfficial && brandHits && phishingHits && actionHits) {
      signals.push(sig('scam_phishing', 'brand_phishing_call_to_action', field, text, 0.95,
        'brand-themed credential or claim lure includes a direct action request'));
    }
    if (!isOfficial && brandHits && dealHits && interactionHits) {
      signals.push(sig('scam_phishing', 'interaction_gated_brand_offer', field, text, 0.88,
        'brand-themed offer promises a link after a follow, comment, or direct message'));
    }
    if (!isOfficial && brandHits && has(RECRUITMENT_TERMS) && (has(PAYMENT_TERMS) || kinds('upi') || kinds('payment'))) {
      signals.push(sig('recruitment_fraud', 'brand_job_plus_fee_request', field, text, 0.95,
        'brand-themed job/recruitment solicitation also requests a fee or payment'));
      signals.push(sig('brand_impersonation', 'brand_recruiter_impersonation', field, text, 0.82,
        'nonofficial account claims to recruit or hire for the protected brand'));
    }
    if (!isOfficial && brandHits && has(INVESTMENT_TERMS)
        && (channelHits || hasMessagingLink || kinds('crypto_wallet'))) {
      signals.push(sig('investment_fraud', 'brand_investment_channel_or_wallet', field, text, 0.96,
        'brand-themed investment solicitation routes to a channel or crypto wallet'));
      signals.push(sig('brand_impersonation', 'brand_used_for_financial_solicitation', field, text, 0.84,
        'protected brand identity is used to solicit investments'));
    }
    if (!isOfficial && brandHits && has(MALWARE_TERMS) && actionHits) {
      signals.push(sig('malicious_downloads', 'brand_download_call_to_action', field, text, 0.96,
        'brand-themed claim/refund flow instructs the user to install software'));
      signals.push(sig('brand_impersonation', 'brand_used_for_software_lure', field, text, 0.82,
        'nonofficial content uses the protected brand to promote a download'));
    }

    // Support scams often appear as replies under posts. Preserve the comment field path so an investigator can
    // distinguish a reply-hijack from the original brand post.
    if (field.endsWith('.text') && has(SUPPORT_TERMS) && (has(URGENCY_TERMS) || channelHits || kinds('phone'))) {
      signals.push(sig('fake_support', 'support_reply_hijack', field, text, 0.88,
        'comment solicits a victim as support and adds urgency/contact'));
    }

    const sensitiveHits = has(AUTHENTICATION_TERMS);
    const sensitiveRequests = has(SENSITIVE_REQUEST_TERMS);
    const safetyWarning = has(SAFETY_WARNING_TERMS);
    if (sensitiveHits && sensitiveRequests && !safetyWarning) {
      signals.push(sig('credential_harvesting', 'sensitive_authentication_request', field, text, 0.82,
        'explicitly asks the target to provide an authentication secret'));
    }

    if (has(QR_TERMS) && (has(PHISHING_LURE_TERMS) || (sensitiveHits && sensitiveRequests)) && !safetyWarning) {
      signals.push(sig('credential_harvesting', 'qr_plus_sensitive_action', field, text, 0.9,
        'QR instruction is paired with a login or credential request'));
    }

    if (has(INVESTMENT_TERMS) && has(EXECUTIVE_TERMS)) {
      signals.push(sig('executive_impersonation', 'executive_investment_endorsement', field, text, 0.76,
        'investment promotion invokes a senior executive identity'));
    }
  }

  // phishing composite: urgency + credential/payment in the same text
  for (const [field, text] of corpora) {
    const low = or(text, '').toLowerCase();
    const has = terms => findTerms(low, terms).length > 0;
    if (has(URGENCY_TERMS) && (has(CREDENTIAL_TERMS) || has(PAYMENT_TERMS))) {
      signals.push(sig('scam_phishing', 'urgency_plus_action_request', field, text, 0.8,
        'combines urgency with a credential or payment request'));
    }
    if (has([...GIVEAWAY_TERMS, ...DEAL_LURE_TERMS]) && (has(PAYMENT_TERMS) || kinds('upi') || kinds('crypto_wallet'))) {
      signals.push(sig('payment_fraud', 'promotion_plus_payment_request', field, text, 0.92,
        'prize/deal lure requires a fee or payment transfer'));
    }
    if (has(SUPPORT_TERMS) && (has(CHANNEL_TERMS) || kinds('phone') || hasMessagingLink)) {
      signals.push(sig('fake_support', 'support_moves_off_platform', field, text, 0.86,
        'support persona moves the victim to phone, WhatsApp, or Telegram'));
    }
  }

  // ---------- logo / media ----------
  // ponytail: pyRepr prints an integral float as "1" where Python's str(m) prints "1.0" (see pycompat.js).
  const mediaAnalysis = or(dossier.media_analysis, []);
  const hasMedia = posts.some(p => truthy(or(p.media, [])));
  if (truthy(mediaAnalysis)) {
    mediaAnalysis.forEach((m, i) => {
      const score = Number(or(m.brand_match_score, 0));
      if (score >= 0.6 && !isOfficial) {
        signals.push(sig('logo_misuse', 'brand_mark_detected', `media_analysis[${i}]`, pySlice(pyRepr(m), 0, 200),
          Math.min(1.0, score), 'supplied media analysis detected the protected mark'));
      }
      const ocrText = pyStr(or(m.ocr_text, ''));
      const transcript = pyStr(or(m.transcript, ''));
      const qrPayloads = or(m.qr_payloads, truthy(m.qr_payload) ? [m.qr_payload] : []);
      const syntheticScore = Number(or(m.synthetic_media_score, 0));
      for (const [sourceName, observed] of [['ocr_text', ocrText], ['transcript', transcript]]) {
        const observedLow = observed.toLowerCase();
        const mediaSensitive = findTerms(observedLow, AUTHENTICATION_TERMS);
        const mediaRequests = findTerms(observedLow, SENSITIVE_REQUEST_TERMS);
        if ((findTerms(observedLow, [...CREDENTIAL_TERMS, ...PHISHING_LURE_TERMS]).length
            || (mediaSensitive.length && mediaRequests.length))
            && !findTerms(observedLow, SAFETY_WARNING_TERMS).length) {
          signals.push(sig('credential_harvesting', `${sourceName}_sensitive_lure`, `media_analysis[${i}].${sourceName}`,
            observed, 0.82, 'media text/audio explicitly requests credentials'));
        }
        if (findTerms(observedLow, PAYMENT_TERMS).length) {
          signals.push(sig('payment_fraud', `${sourceName}_payment_lure`, `media_analysis[${i}].${sourceName}`,
            observed, 0.76, 'media text/audio requests a fee or payment transfer'));
        }
        if (findTerms(observed, MALWARE_TERMS).length) {
          signals.push(sig('malicious_downloads', `${sourceName}_download_lure`, `media_analysis[${i}].${sourceName}`,
            observed, 0.85, 'media text/audio instructs users to install software'));
        }
        if (findTerms(observed, INVESTMENT_TERMS).length) {
          signals.push(sig('investment_fraud', `${sourceName}_investment_lure`, `media_analysis[${i}].${sourceName}`,
            observed, 0.78, 'media text/audio promotes investments or guaranteed returns'));
        }
      }
      for (const raw of qrPayloads.slice(0, 5)) {
        const payload = pyStr(raw);
        const dom = domainOf(payload);
        signals.push(sig('risky_urls', 'qr_destination', `media_analysis[${i}].qr_payloads`, payload, 0.66,
          'QR code destination was decoded for investigation'));
        if (QR_SENSITIVE_RE.test(payload)) {
          signals.push(sig('credential_harvesting', 'qr_sensitive_destination', `media_analysis[${i}].qr_payloads`,
            payload, 0.92, 'decoded QR destination is themed around login, KYC, or credentials'));
        } else if (QR_PAYMENT_RE.test(payload)) {
          signals.push(sig('payment_fraud', 'qr_payment_destination', `media_analysis[${i}].qr_payloads`, payload,
            0.78, 'decoded QR destination is themed around payment or refund'));
        }
        if (dom && !officialDomains.has(dom)) {
          signals.push(sig('risky_urls', 'qr_external_domain', `media_analysis[${i}].qr_payloads`, payload, 0.62,
            'QR code leads outside the protected brand domain'));
        }
      }
      if (syntheticScore >= 0.7 && findTerms(`${transcript} ${ocrText}`, INVESTMENT_TERMS).length) {
        signals.push(sig('investment_fraud', 'synthetic_investment_media', `media_analysis[${i}]`,
          pySlice(pyRepr(m), 0, 240), syntheticScore, 'likely synthetic media is paired with an investment pitch'));
      }
    });
  } else if (hasMedia) {
    notes.push('media_analysis_unavailable');
  }

  // ---------- coordinated abuse ----------
  const captions = posts.filter(p => truthy(p.caption)).map(p => pyStrip(or(p.caption, '')).toLowerCase());
  const dupes = [...counter(captions)].filter(([c, n]) => n >= 3 && pyLen(c) > 25).map(([c]) => c);
  if (dupes.length) {
    signals.push(sig('coordinated_abuse', 'repeated_caption_template', 'posts[].caption', dupes[0], 0.55,
      `${dupes.length} caption template(s) repeated 3+ times`));
  }
  const commenters = new Map();
  for (const p of posts) {
    for (const c of or(p.comments, [])) {
      if (truthy(c.author_handle)) {
        const key = c.author_handle.toLowerCase();
        commenters.set(key, (commenters.get(key) ?? 0) + 1);
      }
    }
  }
  const ring = [...commenters].filter(([, n]) => n >= 3).map(([h]) => h);
  if (ring.length >= 2) {
    signals.push(sig('coordinated_abuse', 'repeat_commenter_cluster', 'posts[].comments[].author_handle',
      ring.slice(0, 5).join(', '), 0.5, `${ring.length} accounts comment repeatedly across posts`));
  }
  const mentionCounts = counter(entities.filter(e => e.kind === 'mention').map(e => e.value));
  const heavy = [...mentionCounts].filter(([, n]) => n >= 5).map(([m]) => m);
  if (heavy.length) {
    signals.push(sig('coordinated_abuse', 'mention_amplification', 'entities.mention', heavy.slice(0, 5).join(', '),
      0.4, 'the same accounts are mentioned repeatedly (amplification pattern)'));
  }

  or(dossier.shared_artifacts, []).forEach((artifact, idx) => {
    const kind = artifact.kind ?? null;
    const count = Math.trunc(Number(or(artifact.account_count, 0)));
    if (count < 2) return;
    const value = pyStr(or(artifact.value, ''));
    signals.push(sig('coordinated_abuse', `shared_${pyStr(kind)}`, `shared_artifacts[${idx}]`, value,
      Math.min(0.95, 0.58 + 0.08 * Math.min(count, 4)), `artifact is reused across ${count} Instagram accounts`));
    if (['upi', 'crypto_wallet', 'payment'].includes(kind)) {
      signals.push(sig('payment_fraud', 'payment_identifier_reused', `shared_artifacts[${idx}]`, value, 0.9,
        `the same payment destination appears across ${count} accounts`));
    }
    if (['url', 'download', 'telegram'].includes(kind)) {
      signals.push(sig('risky_urls', 'infrastructure_reused', `shared_artifacts[${idx}]`, value, 0.75,
        `the same destination is promoted by ${count} accounts`));
    }
  });

  const accountChanges = or(dossier.account_changes, []);
  if (truthy(accountChanges)) {
    const important = accountChanges.filter(change => IMPORTANT_CHANGE_FIELDS.includes(change.field));
    if (important.length) {
      signals.push(sig('account_change_risk', 'sudden_profile_change', 'account_changes',
        pyRepr(important.slice(0, 4)), Math.min(0.9, 0.45 + 0.1 * important.length),
        'profile identity, destination, language, or content category changed'));
    }
  }

  const velocity = or(dossier.velocity, {});
  if (Math.trunc(Number(or(velocity.posts_last_hour, 0))) >= 8) {
    signals.push(sig('coordinated_abuse', 'rapid_posting_burst', 'velocity.posts_last_hour',
      pyStr(velocity.posts_last_hour), 0.7, 'account published at unusually high hourly velocity'));
  }
  if (Math.trunc(Number(or(velocity.duplicate_post_count, 0))) >= 3) {
    signals.push(sig('coordinated_abuse', 'duplicate_post_velocity', 'velocity.duplicate_post_count',
      pyStr(velocity.duplicate_post_count), 0.62, 'multiple duplicated posts suggest automated campaign activity'));
  }
  const followerDelta = velocity.follower_delta;
  if (Number.isInteger(followerDelta) && followerDelta >= 5000) {
    signals.push(sig('victim_signals', 'rapid_follower_growth', 'velocity.follower_delta', pyStr(followerDelta), 0.48,
      'large follower increase raises exposure and campaign velocity'));
  }

  // A post result should be scored for what that specific post says or links to. Account identity risk is kept
  // on the account result and must not make every post look critical.
  if (contentOnly) signals = signals.filter(signal => !(signal.field ?? '').startsWith('account.'));

  // ---------- aggregate ----------
  const categoryScores = Object.fromEntries(Object.keys(CATEGORY_WEIGHTS).map(c => [c, 0.0]));
  const grouped = new Map();
  for (const s of signals) {
    if (!grouped.has(s.category)) grouped.set(s.category, []);
    grouped.get(s.category).push(s.weight);
  }
  for (const [cat, ws] of grouped) {
    if (!Object.hasOwn(categoryScores, cat)) continue;
    // saturating combination: strongest signal dominates, extras add decaying support
    let combined = 1.0;
    sorted(ws, { reverse: true }).slice(0, 6).forEach((w, idx) => { combined *= (1 - w * POW_085[idx]); });
    categoryScores[cat] = pyRound(Math.min(100.0, (1 - combined) * 100), 2);
  }

  const directHarmPresent = signals.some(signal => DIRECT_HARM_SIGNALS.has(signal.signal));
  const suppressAllBut = () => {
    for (const cat of Object.keys(categoryScores)) if (cat !== 'account_change_risk') categoryScores[cat] = 0.0;
  };
  if (isOfficial) {
    // A configured official account is not an impostor merely because it mentions KYC, payments, customer
    // support, a promotion, or a fraud-awareness example.
    notes.push('trusted_official_handle: automated fraud-family scoring suppressed');
    suppressAllBut();
  } else if ((isEstablished || verifiedMetricsMissing) && !directHarmPresent) {
    // Verified/high-reach accounts still need a concrete harmful flow before being shown as fraud.
    notes.push('established_profile: vocabulary-only alert scoring suppressed');
    suppressAllBut();
  } else if (!contentOnly && profileDetailsMissing && !directHarmPresent) {
    // A bare search snippet is discovery evidence, not proof of impersonation. Missing profile metadata must
    // never increase risk; only a concrete harmful flow bypasses this gate.
    notes.push('incomplete_profile: ungrounded alert scoring suppressed');
    suppressAllBut();
  } else if (disclosedUnofficial) {
    // A clear fan/parody disclosure only reduces identity categories; scam and URL signals remain.
    categoryScores.brand_impersonation = pyRound(categoryScores.brand_impersonation * 0.3, 2);
    categoryScores.suspicious_naming = pyRound(categoryScores.suspicious_naming * 0.5, 2);
    notes.push('account explicitly discloses unofficial/fan status');
  }

  const weighted = Object.keys(categoryScores).map(c => categoryScores[c] * CATEGORY_WEIGHTS[c]);
  const top = sorted(weighted, { reverse: true });
  let overall = 0.0;
  if (top.length) overall = top[0] + pySum(top.slice(1, 4).map(v => v * 0.18));
  overall = pyRound(Math.min(100.0, overall), 2);

  // Exposure is observed reach plus victim reports. Unknown metrics remain unknown rather than being treated as
  // zero. Coordination is evidence of shared/repeated activity.
  const engagementValues = [];
  for (const post of posts) {
    for (const value of Object.values(or(post.engagement, {}))) {
      if (typeof value === 'number' && value >= 0) engagementValues.push(value);
    }
  }
  const exposureMetric = Math.max(...engagementValues, Number(or(followers, 0)));
  let exposureScore = Math.min(100.0, 12.5 * Math.max(0.0, Math.log10(exposureMetric + 1)));
  exposureScore = Math.max(exposureScore, categoryScores.victim_signals ?? 0);
  const dimensions = {};
  for (const [dimension, categories] of Object.entries(DIMENSION_CATEGORIES)) {
    const values = sorted(categories.map(cat => categoryScores[cat] ?? 0.0), { reverse: true });
    dimensions[dimension] = pyRound(Math.min(100.0, (values.length ? values[0] : 0.0)
      + pySum(values.slice(1, 3).map(v => v * 0.15))), 2);
  }
  dimensions.exposure = pyRound(Math.max(dimensions.exposure ?? 0.0, exposureScore), 2);

  // Each unique signal is an independent indicator; related duplicate text hits count once.
  const independent = new Set(signals.filter(s => Number(or(s.weight, 0)) >= 0.5)
    .map(s => `${s.category}\u0000${s.signal}`));
  const alertFamilies = {};
  for (const [family, categories] of Object.entries(ALERT_FAMILIES)) {
    const familySignals = signals.filter(s => categories.includes(s.category));
    const familyScore = categories.length ? Math.max(...categories.map(cat => categoryScores[cat] ?? 0.0)) : 0.0;
    alertFamilies[family] = {
      score: pyRound(familyScore, 2),
      active: familyScore >= 45,
      critical: familyScore >= 80
        && new Set(familySignals.filter(s => (s.weight ?? 0) >= 0.5).map(s => s.signal)).size >= 2,
      signals: sorted(dedupe(familySignals.map(s => s.signal))).slice(0, 12),
    };
  }

  // Critical status normally needs two separate grounded indicators, so a single keyword or lone brand
  // resemblance cannot enter the critical queue.
  if (overall >= 85 && independent.size < 2) {
    overall = 84.0;
    notes.push('critical_score_capped: fewer than two independent indicators');
  }

  for (const signal of signals) {
    signal.alert_family = Object.keys(ALERT_FAMILIES)
      .find(family => ALERT_FAMILIES[family].includes(signal.category)) ?? null;
    signal.dimension = Object.keys(DIMENSION_CATEGORIES)
      .find(dimension => DIMENSION_CATEGORIES[dimension].includes(signal.category)) ?? null;
  }

  return { overall_score: overall, category_scores: categoryScores, dimensions, alert_families: alertFamilies,
    independent_indicators: independent.size, signals, notes };
}

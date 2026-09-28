'''Deterministic, explainable risk signals.

These always run, are fully auditable, and give Darkmap a floor of coverage when the AI
provider is unavailable. Each signal carries category, weight, evidence field and quote.
'''
import difflib
import math
import re
from collections import Counter
from typing import Any, Dict, List, Optional

from ..extract import domain_of

SHORTENERS = {'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'cutt.ly', 'rb.gy', 'is.gd',
              'shorturl.at', 'linktr.ee', 'bit.do', 'rebrand.ly', 's.id', 'tiny.cc'}
MESSAGING_DOMAINS = {'t.me', 'telegram.me', 'telegram.dog', 'wa.me', 'whatsapp.com',
                     'chat.whatsapp.com'}
RISKY_TLDS = {'top', 'xyz', 'icu', 'click', 'link', 'live', 'shop', 'store', 'vip', 'cn', 'ru',
              'online', 'site', 'buzz', 'rest', 'monster'}
ROLE_TOKENS = ['official', 'support', 'help', 'helpdesk', 'service', 'care', 'customercare',
               'team', 'hq', 'admin', 'security', 'verify', 'verified', 'billing', 'refund',
               'claims', 'agent', 'assist']
LOOKALIKE_TOKENS = ['real', 'the', 'its', 'official', 'original', 'global', 'store', 'shop',
                    'outlet', 'sale', 'usa', 'uk', 'eu', 'online', 'world']
COUNTERFEIT_TERMS = ['replica', 'reps', '1:1', 'aaa quality', 'mirror quality', 'unauthorized',
                     'factory price', 'wholesale price', 'dm to order', 'dm for price',
                     'cheap price', 'best replica', 'clone', 'copy version', 'oem quality',
                     'no box', 'tier 1 quality']
GIVEAWAY_TERMS = ['giveaway', 'you have been selected', 'you won', 'winner', 'congratulations you',
                  'claim your prize', 'lucky winner', 'free gift', 'claim now', 'selected winner']
PAYMENT_TERMS = ['delivery fee', 'shipping fee', 'processing fee', 'small fee', 'cashapp',
                 'zelle', 'venmo', 'gift card', 'bitcoin', 'usdt', 'crypto', 'western union',
                 'wire transfer', 'pay first', 'advance payment', 'upi id', 'pay via upi',
                 'booking fee', 'refund fee', 'prize fee', 'claim charge', 'registration fee',
                 'training fee']
CREDENTIAL_TERMS = ['verify your account', 'confirm your identity', 'account will be disabled',
                    'account has been flagged', 'copyright violation', 'appeal form',
                    'login here', 'log in to verify', 'enter your password', 'otp code',
                    'two factor code', 'send us your password', 'secure your account now',
                    'reactivate your account', 'submit your credentials', 'unusual login',
                    'reset your password', 'unlock your account', 'complete your kyc',
                    'submit recovery code', 'enter card number', 'enter cvv',
                    'submit card details']
SUPPORT_TERMS = ['dm us for help', 'contact support', 'customer support', 'we can help you',
                 'refund team', 'recovery service', 'account recovery', 'unban service',
                 'hacked account help']
URGENCY_TERMS = ['within 24 hours', 'immediately', 'last chance', 'act now', 'final warning',
                 'expires today', 'urgent', 'account is blocked', 'account blocked',
                 'order is blocked', 'order blocked', 'suspended', 'locked']
DEAL_LURE_TERMS = ['loot', 'loot deal', 'loot offer', 'loot alert', 'deal alert', 'price glitch',
                   'secret deal', 'exclusive deal', 'exclusive offer', 'limited offer',
                   'flash sale', 'big offer', 'mega offer', 'lowest price',
                   'coupon code', 'promo code', 'free voucher', 'free coupon',
                   'cashback', 'cashback offer', 'cashback unlock', 'instant cashback',
                   'credit limit', 'instant credit', 'recharge offer', 'bill payment offer',
                   '90% off', '95% off', 'free product', 'free frame',
                   'free glasses', 'free lenses', 'free eyewear', 'free cash', 'free credit',
                   'almost free', 'massive discount']
ACTION_TERMS = ['join now', 'join here', 'join channel', 'join group', 'link in bio',
                'link below', 'click the link', 'tap the link', 'dm now', 'dm us',
                'message now', 'claim now', 'register now', 'apply now', 'limited slots',
                'follow me', 'comment for', 'comment how', 'comment link', 'link will auto',
                'comment cash', 'comment code', 'comment deal', 'link will be sent',
                'check dm', 'dm for link', 'watch now', 'grab it',
                "don't miss", 'don’t miss']
INTERACTION_GATE_TERMS = ['follow me', 'comment for', 'comment how', 'comment link',
                          'comment cash', 'comment code', 'comment deal', 'link will auto',
                          'link will be sent', 'check dm', 'dm for link']
CHANNEL_TERMS = ['telegram', 'telegram channel', 'telegram group', 'whatsapp group',
                 'whatsapp channel', 'join our channel', 'join our group']
PHISHING_LURE_TERMS = ['verify now', 'login to claim', 'log in to claim', 'claim page',
                       'claim link', 'secure login',
                       'sign in to claim', 'enter otp', 'share otp']
PROMOTIONAL_LURE_TERMS = DEAL_LURE_TERMS + GIVEAWAY_TERMS + PAYMENT_TERMS + [
    'for free', 'completely free', 'absolutely free', 'worth ₹', 'worth rs', 'worth inr']
PROMO_HANDLE_TOKENS = ['deal', 'deals', 'offer', 'offers', 'loot', 'promo', 'coupon',
                       'reward', 'rewards', 'giveaway']
COUPON_REWARD_TERMS = ['voucher', 'coupon', 'reward points', 'loyalty points', 'redeem points',
                       'gift voucher', 'promo voucher', 'cashback reward']
RECRUITMENT_TERMS = ['job offer', 'hiring now', 'we are hiring', 'recruitment', 'recruiter',
                     'internship', 'brand ambassador', 'campus ambassador', 'work from home',
                     'hr team', 'human resources', 'regional manager', 'joining letter',
                     'offer letter', 'interview fee', 'training payment', 'registration fee']
EXECUTIVE_TERMS = ['ceo', 'chief executive', 'founder', 'chairman', 'director', 'executive',
                   'regional manager', 'country head', 'vice president', 'vp ']
MALWARE_TERMS = ['download apk', 'install apk', 'apk file', 'browser extension',
                 'software update', 'security update', 'download to claim',
                 'install for refund', 'remote support', 'remote access', 'anydesk',
                 'teamviewer', 'quicksupport', 'rustdesk', 'screen share', 'sideload']
FILE_SHARING_DOMAINS = {'drive.google.com', 'dropbox.com', 'mediafire.com', 'mega.nz',
                        'wetransfer.com', 'sendspace.com', 'apkcombo.com', 'apkpure.com',
                        'apkfab.com', 'githubusercontent.com'}
INVESTMENT_TERMS = ['invest now', 'trading group', 'trading signals', 'signal group',
                    'guaranteed return', 'guaranteed profit', 'double your money',
                    'crypto investment', 'deposit crypto', 'daily returns', 'passive income',
                    'risk free returns', '100% returns']
VICTIM_TERMS = ['i paid', 'paid already', 'money lost', 'order never arrived',
                'never received', 'account hacked', 'this is fake', 'this is scam',
                'scammed me', 'fraud account', 'do not pay', 'otp stolen', 'refund not received']
AUTHENTICATION_TERMS = ['password', 'otp', 'one time password', 'recovery code', '2fa code',
                        'verification code', 'card details', 'card number', 'cvv', 'pin number']
QR_TERMS = ['scan qr', 'scan the qr', 'qr code', 'scan to pay', 'scan to login', 'scan to claim']
SENSITIVE_REQUEST_TERMS = ['enter your', 'send your', 'send us', 'share your', 'submit your',
                           'provide your', 'type your', 'upload your', 'confirm your',
                           'give us your', 'reply with your']
SAFETY_WARNING_TERMS = ['never share', 'do not share', "don't share", 'dont share',
                        'will never ask', 'beware of', 'fraud awareness', 'scam awareness',
                        'stay safe', 'protect yourself']
RESELLER_TERMS = ['unauthorized reseller', 'grey market', 'gray market', 'parallel import',
                  'not authorized', 'without warranty', 'imported stock']

CATEGORY_WEIGHTS = {
    'brand_impersonation': 1.0,
    'counterfeit': 0.95,
    'scam_phishing': 1.0,
    'suspicious_naming': 0.6,
    'logo_misuse': 0.6,
    'risky_urls': 0.8,
    'giveaway_payment_scam': 0.95,
    'fake_support': 0.9,
    'credential_harvesting': 1.0,
    'coordinated_abuse': 0.7,
    'payment_fraud': 1.0,
    'executive_impersonation': 0.9,
    'recruitment_fraud': 0.95,
    'malicious_downloads': 1.0,
    'investment_fraud': 1.0,
    'victim_signals': 0.75,
    'account_change_risk': 0.7,
}

ALERT_FAMILIES = {
    'credential_takeover': {'credential_harvesting'},
    'payment_fraud': {'payment_fraud'},
    'fake_customer_support': {'fake_support'},
    'scam_promotions': {'giveaway_payment_scam', 'scam_phishing'},
    'counterfeit_sales': {'counterfeit'},
    'employee_recruiter_impersonation': {'executive_impersonation', 'recruitment_fraud'},
    'malicious_apps_downloads': {'malicious_downloads'},
    'investment_financial_impersonation': {'investment_fraud'},
}

DIMENSION_CATEGORIES = {
    'deception': {'brand_impersonation', 'suspicious_naming', 'logo_misuse', 'fake_support',
                  'executive_impersonation', 'recruitment_fraud'},
    'harm': {'credential_harvesting', 'scam_phishing', 'payment_fraud', 'counterfeit',
             'giveaway_payment_scam', 'malicious_downloads', 'investment_fraud'},
    'exposure': {'victim_signals'},
    'coordination': {'coordinated_abuse', 'account_change_risk'},
}

# A high-reach or verified profile is not proof that it is an official brand account: abusive
# accounts can buy followers or obtain a verification badge.  It is, however, strong context
# against escalating ordinary product, banking, security-awareness, or customer-service words.
# These are the grounded signals that still justify an alert on an established profile.
ESTABLISHED_FOLLOWER_THRESHOLD = 100_000
VERIFIED_ESTABLISHED_FOLLOWER_THRESHOLD = 10_000
# These signals describe an actual harmful flow or destination. Broad vocabulary such as
# "replica", "loot", or "remote support" is intentionally excluded: legitimate publishers
# and official brand accounts can use those words in news, entertainment, warnings, or ordinary
# promotions. Vocabulary remains useful evidence, but cannot override missing/trusted profile
# context by itself.
DIRECT_HARM_SIGNALS = {
    'brand_lure_to_off_platform_channel', 'brand_phishing_call_to_action',
    'interaction_gated_brand_offer', 'brand_job_plus_fee_request',
    'brand_investment_channel_or_wallet', 'brand_download_call_to_action',
    'brandlike_domain', 'credential_themed_url', 'sensitive_authentication_request',
    'qr_plus_sensitive_action', 'qr_sensitive_destination', 'qr_payment_destination',
    'promotion_plus_payment_request', 'support_reply_hijack', 'support_moves_off_platform',
    'direct_executable_download', 'unofficial_download_destination',
    'payment_identifier_reused',
    'executive_investment_endorsement', 'synthetic_investment_media',
}


def _norm(text: Optional[str]) -> str:
    return re.sub(r'[^a-z0-9]+', '', (text or '').lower())


def _sig(category: str, signal: str, field: str, quote: str, weight: float,
         rationale: str) -> Dict[str, Any]:
    return {'source': 'heuristic', 'category': category, 'signal': signal, 'field': field,
            'quote': (quote or '')[:240], 'weight': round(min(1.0, max(0.0, weight)), 3),
            'rationale': rationale}


def _find_terms(text: str, terms: List[str]) -> List[str]:
    low = (text or '').lower()
    # Search-result snippets often insert quotation marks, emoji, or OCR punctuation between
    # words (for example, `comment “LINK”`). Compare a space-normalized form as well as the
    # original text so the call to action is not lost without weakening the phrase vocabulary.
    spaced = re.sub(r'[^a-z0-9]+', ' ', low).strip()
    matches = []
    for term in terms:
        normalized_term = re.sub(r'[^a-z0-9]+', ' ', term.lower()).strip()
        if term.lower() in low or (normalized_term and normalized_term in spaced):
            matches.append(term)
    return matches


def _deal_lure_hits(text: str) -> List[str]:
    """Recognize written and quantified financial promotions without assuming fraud."""
    low = (text or '').lower()
    hits = _find_terms(low, DEAL_LURE_TERMS)
    if re.search(r'\b(?:up\s+to\s+)?\d{1,3}\s*%\s*(?:off|discount)\b', low):
        hits.append('quantified percentage discount')
    amount = r'(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?'
    benefit = r'(?:cash\s*back|cashback|credit\s+limit|refund|voucher|reward|free)'
    if re.search(rf'(?:{amount}.{{0,36}}{benefit}|{benefit}.{{0,36}}{amount})', low):
        hits.append('quantified financial benefit')
    return list(dict.fromkeys(hits))


def _official_domain(domain: str, official_domains: set) -> bool:
    """Accept a configured domain and its subdomains as official destinations."""
    return any(domain == item or domain.endswith('.' + item) for item in official_domains)


def handle_similarity(handle: str, brand_names: List[str]) -> float:
    h = _norm(handle)
    best = 0.0
    for name in brand_names:
        n = _norm(name)
        if not n or not h:
            continue
        ratio = difflib.SequenceMatcher(None, h, n).ratio()
        if n in h:
            ratio = max(ratio, 0.85 if h != n else 1.0)
        best = max(best, ratio)
    return best


def analyze(dossier: Dict[str, Any]) -> Dict[str, Any]:
    '''Return {category_scores, signals, notes} from a dossier dict.'''
    brand = dossier.get('brand') or {}
    brand_names = [brand.get('name')] if brand.get('name') else []
    brand_names += list(brand.get('keywords') or [])
    brand_names = [b for b in brand_names if b]
    official_handles = {h.lower().lstrip('@') for h in (brand.get('official_handles') or [])}
    official_domains = {d.lower() for d in (brand.get('official_domains') or [])}

    account = dossier.get('account') or {}
    posts = dossier.get('posts') or []
    handle = (account.get('handle') or '').lower()
    bio = account.get('biography') or ''
    name = account.get('display_name') or ''
    identity_text = (bio + ' ' + name).lower()
    content_only = bool(dossier.get('content_only'))
    disclosed_unofficial = not content_only and any(phrase in identity_text for phrase in (
        'unofficial fan', 'fan page', 'not affiliated', 'parody account',
        'community page', 'tribute account'))

    signals: List[Dict[str, Any]] = []
    notes: List[str] = []

    # ---------- brand impersonation / naming ----------
    # A registered handle is the strongest trust signal. A profile URL on a configured first-
    # party domain also establishes ownership without forcing every brand to maintain aliases.
    profile_domain = domain_of(account.get('external_url') or '')
    is_official = handle in official_handles or bool(
        profile_domain and _official_domain(profile_domain, official_domains))
    if is_official:
        if handle in official_handles:
            notes.append('handle matches a registered official brand handle')
        else:
            notes.append('profile URL matches a registered official brand domain')
    sim = handle_similarity(handle, brand_names) if brand_names else 0.0
    name_sim = handle_similarity(name, brand_names) if brand_names else 0.0
    if not is_official and sim >= 0.72:
        signals.append(_sig('brand_impersonation', 'handle_resembles_brand', 'account.handle',
                            handle, min(1.0, (sim - 0.6) / 0.4),
                            f'handle similarity to protected brand is {sim:.2f}'))
    if not is_official and name_sim >= 0.8:
        signals.append(_sig('brand_impersonation', 'display_name_resembles_brand',
                            'account.display_name', name, min(1.0, (name_sim - 0.7) / 0.3),
                            f'display name similarity is {name_sim:.2f}'))
    if not is_official and any(k in identity_text
                               for k in ('official account', 'verified account',
                                         'official page', 'only official')):
        signals.append(_sig('brand_impersonation', 'claims_official_status', 'account.biography',
                            bio, 0.8, 'account claims official status without verification'))

    role_hits = [t for t in ROLE_TOKENS if t in _norm(handle) or t in _norm(name)]
    lookalike_hits = [t for t in LOOKALIKE_TOKENS if _norm(handle).startswith(_norm(t))]
    if role_hits and (sim >= 0.55 or not brand_names):
        signals.append(_sig('suspicious_naming', 'role_token_in_handle', 'account.handle',
                            handle, 0.55 + 0.1 * min(3, len(role_hits)),
                            f'handle contains support/authority tokens: {role_hits}'))
    if not is_official and sim >= 0.75 and role_hits:
        signals.append(_sig(
            'brand_impersonation', 'brand_plus_authority_handle', 'account.handle',
            handle, 0.65,
            'nonofficial handle combines the protected brand with support/authority wording'))
    promo_handle_hits = [t for t in PROMO_HANDLE_TOKENS
                         if t in _norm(handle) or t in _norm(name)]
    if not is_official and sim >= 0.72 and promo_handle_hits:
        signals.append(_sig(
            'brand_impersonation', 'brand_plus_promotional_handle', 'account.handle',
            handle, 0.7,
            f'nonofficial brand-like identity uses promotional wording: {promo_handle_hits}'))
        signals.append(_sig(
            'suspicious_naming', 'promotional_brand_handle', 'account.handle', handle, 0.55,
            'handle presents itself as a brand deal, offer, reward, or giveaway account'))
    if lookalike_hits and sim >= 0.6:
        signals.append(_sig('suspicious_naming', 'lookalike_prefix', 'account.handle', handle,
                            0.5, f'handle uses lookalike prefix {lookalike_hits}'))
    if re.search(r'[0-9]{3,}$', handle) or handle.count('_') >= 3 or handle.count('.') >= 3:
        signals.append(_sig('suspicious_naming', 'noisy_handle_pattern', 'account.handle', handle,
                            0.35, 'handle uses digit/separator padding typical of throwaways'))
    if any(ord(ch) > 127 for ch in handle):
        signals.append(_sig('suspicious_naming', 'non_ascii_handle', 'account.handle', handle,
                            0.45, 'handle contains non-ASCII characters (homoglyph risk)'))

    support_role_hits = [t for t in role_hits if t in ('support', 'help', 'helpdesk', 'service',
                                                        'care', 'customercare', 'billing',
                                                        'refund', 'security', 'verify')]
    if not is_official and support_role_hits:
        signals.append(_sig('fake_support', 'support_persona_handle', 'account.handle', handle,
                            0.6, 'handle presents as a brand support/security desk'))

    followers = account.get('followers_count')
    display_is_placeholder = bool(name) and _norm(name) == _norm(handle)
    profile_details_missing = (
        (dossier.get('provenance') or {}).get('collection_mode') == 'keyword_serp_fallback'
    ) or (
        followers is None
        and account.get('follows_count') is None
        and account.get('media_count') is None
        and not bio.strip()
        and not account.get('external_url')
        and (not name.strip() or display_is_placeholder)
    )
    is_established = (
        isinstance(followers, int) and followers >= ESTABLISHED_FOLLOWER_THRESHOLD
    ) or (
        bool(account.get('is_verified')) and isinstance(followers, int)
        and followers >= VERIFIED_ESTABLISHED_FOLLOWER_THRESHOLD
    )
    verified_metrics_missing = bool(account.get('is_verified')) and followers is None
    # Reach is a useful credibility signal for a brand-like identity. It ranks small lookalike
    # accounts ahead of high-reach publishers, but it cannot establish wrongdoing by itself.
    # The critical gate below still requires a separate, independently grounded indicator.
    if isinstance(followers, int) and sim >= 0.75 and not is_official:
        if followers < 500:
            low_reach_weight = 0.45
            reach_rationale = 'brand-like identity has fewer than 500 followers'
        elif followers < 5_000:
            low_reach_weight = 0.32
            reach_rationale = 'brand-like identity has fewer than 5,000 followers'
        elif followers < 20_000:
            low_reach_weight = 0.2
            reach_rationale = 'brand-like identity has limited reach for a claimed brand presence'
        else:
            low_reach_weight = 0.0
            reach_rationale = ''
        if low_reach_weight:
            signals.append(_sig('brand_impersonation', 'brandlike_but_low_reach',
                                'account.followers_count', str(followers), low_reach_weight,
                                reach_rationale))

    # ---------- URLs ----------
    external_domains = set()
    for ent in dossier.get('entities', []):
        if ent.get('kind') != 'url':
            continue
        value = ent.get('value') or ''
        dom = ent.get('domain') or domain_of(value)
        if not dom or _official_domain(dom, official_domains):
            continue
        external_domains.add(dom)
        field = f"entities.url[{ent.get('source_field','')}]"
        tld = dom.rsplit('.', 1)[-1]
        if dom in SHORTENERS:
            signals.append(_sig('risky_urls', 'url_shortener', field, value, 0.5,
                                'destination is obscured by a link shortener'))
        if dom in MESSAGING_DOMAINS:
            signals.append(_sig('risky_urls', 'off_platform_messaging_link', field, value, 0.75,
                                'moves users from Instagram into a Telegram or WhatsApp channel'))
        if tld in RISKY_TLDS:
            signals.append(_sig('risky_urls', 'high_risk_tld', field, value, 0.45,
                                f'.{tld} is over-represented in abuse reporting'))
        if dom.startswith('xn--') or '--' in dom:
            signals.append(_sig('risky_urls', 'punycode_or_homoglyph_domain', field, value, 0.7,
                                'domain uses punycode/hyphen patterns used for lookalikes'))
        if brand_names and handle_similarity(dom.split('.')[0], brand_names) >= 0.72 \
                and not _official_domain(dom, official_domains):
            signals.append(_sig('brand_impersonation', 'brandlike_domain', field, value, 0.75,
                                'outbound domain imitates the protected brand'))
        if re.search(r'(login|verify|secure|appeal|recover|account|wallet|billing)', dom + value,
                     re.IGNORECASE):
            signals.append(_sig('credential_harvesting', 'credential_themed_url', field, value,
                                0.6, 'URL path/host is themed around login or verification'))
        if dom in FILE_SHARING_DOMAINS or re.search(r'\.(?:apk|xapk|exe|msi|dmg|pkg|zip|rar)(?:\?|$)',
                                                    value, re.IGNORECASE):
            signals.append(_sig('malicious_downloads', 'unofficial_download_destination', field,
                                value, 0.75,
                                'link leads to a downloadable application/archive or file host'))

    # Concrete financial/contact artifacts are retained as investigator pivots. An artifact
    # alone is not proof; the composite rules below require accompanying solicitation language.
    entity_kinds = Counter(e.get('kind') for e in dossier.get('entities', []))
    for ent in dossier.get('entities', []):
        kind = ent.get('kind')
        value = ent.get('value') or ''
        field = f"entities.{kind}[{ent.get('source_field','')}]"
        if kind == 'upi':
            signals.append(_sig('payment_fraud', 'upi_identifier_exposed', field, value, 0.58,
                                'post/profile publishes a UPI payment identifier'))
        elif kind == 'crypto_wallet':
            signals.append(_sig('payment_fraud', 'crypto_wallet_exposed', field, value, 0.62,
                                'post/profile publishes a cryptocurrency wallet address'))
        elif kind == 'download':
            signals.append(_sig('malicious_downloads', 'direct_executable_download', field, value,
                                0.82, 'direct executable/application download was extracted'))
        elif kind == 'phone' and not is_official and support_role_hits:
            signals.append(_sig('fake_support', 'support_phone_number', field, value, 0.55,
                                'brand support persona publishes a phone contact'))
        elif kind == 'telegram':
            signals.append(_sig('risky_urls', 'telegram_handle', field, '@' + value, 0.55,
                                'moves a user into an off-platform Telegram conversation'))

    # ---------- text corpora ----------
    corpora = [] if content_only else [('account.biography', bio)]
    for i, p in enumerate(posts):
        corpora.append((f'posts[{i}].caption', p.get('caption') or ''))
        for j, m in enumerate(p.get('media') or []):
            if m.get('ocr_text'):
                corpora.append((f'posts[{i}].media[{j}].ocr_text', m['ocr_text']))
        for j, c in enumerate(p.get('comments') or []):
            corpora.append((f'posts[{i}].comments[{j}].text', c.get('text') or ''))

    def scan(category: str, terms: List[str], signal: str, base: float, rationale: str):
        for field, text in corpora:
            hits = _find_terms(text, terms)
            if hits:
                signals.append(_sig(category, signal, field, text,
                                    min(1.0, base + 0.1 * (len(hits) - 1)),
                                    f'{rationale}: {hits[:4]}'))

    scan('counterfeit', COUNTERFEIT_TERMS, 'counterfeit_sales_language', 0.65,
         'counterfeit/replica sales vocabulary')
    scan('giveaway_payment_scam', GIVEAWAY_TERMS, 'giveaway_winner_language', 0.6,
         'unsolicited prize/giveaway claim language')
    scan('giveaway_payment_scam', PAYMENT_TERMS, 'upfront_payment_request', 0.65,
         'request for fee or irreversible payment rail')
    scan('credential_harvesting', CREDENTIAL_TERMS, 'credential_request_language', 0.75,
         'asks the victim to verify/log in or supply credentials')
    scan('fake_support', SUPPORT_TERMS, 'support_solicitation', 0.5,
         'solicits DMs as if operating brand support')
    scan('scam_phishing', URGENCY_TERMS, 'urgency_pressure', 0.35,
         'artificial urgency/pressure language')
    for field, text in corpora:
        deal_lure_hits = _deal_lure_hits(text)
        if deal_lure_hits:
            signals.append(_sig(
                'giveaway_payment_scam', 'deal_lure_language', field, text,
                min(1.0, 0.6 + 0.1 * (len(deal_lure_hits) - 1)),
                f'uses loot, cashback, credit, coupon, or quantified-discount bait: '
                f'{deal_lure_hits[:4]}'))
    scan('credential_harvesting', PHISHING_LURE_TERMS, 'phishing_lure_language', 0.8,
         'directs users to a login, KYC, claim, or OTP flow')
    scan('payment_fraud', PAYMENT_TERMS, 'payment_rail_or_advance_fee', 0.68,
         'requests an advance fee or hard-to-reverse payment method')
    scan('giveaway_payment_scam', COUPON_REWARD_TERMS, 'coupon_reward_redemption_lure', 0.52,
         'promises voucher, reward, or loyalty-point redemption')
    scan('counterfeit', RESELLER_TERMS, 'unauthorized_reseller_language', 0.64,
         'describes grey-market or unauthorized resale')
    scan('recruitment_fraud', RECRUITMENT_TERMS, 'recruitment_solicitation', 0.62,
         'uses job, internship, recruiter, or ambassador solicitation language')
    scan('executive_impersonation', EXECUTIVE_TERMS, 'executive_role_claim', 0.48,
         'claims an executive, founder, or senior manager identity')
    scan('malicious_downloads', MALWARE_TERMS, 'application_or_remote_access_lure', 0.75,
         'pushes an application, update, APK, extension, or remote-access tool')
    scan('investment_fraud', INVESTMENT_TERMS, 'investment_solicitation', 0.67,
         'promotes trading signals, deposits, or implausibly guaranteed returns')
    scan('victim_signals', VICTIM_TERMS, 'victim_report_language', 0.58,
         'comments or captions report payment loss, non-delivery, hacking, or fraud')

    # A brand mention alone can be ordinary discussion. Escalate only when a nonofficial account
    # combines that brand with a lure and a concrete action/off-platform destination.
    normalized_brands = [_norm(value) for value in brand_names if _norm(value)]
    has_messaging_link = bool(external_domains & MESSAGING_DOMAINS)
    for field, text in corpora:
        low = (text or '').lower()
        compact = _norm(low)
        brand_hits = [value for value in normalized_brands if value in compact]
        deal_hits = list(dict.fromkeys(
            _deal_lure_hits(low) + _find_terms(low, GIVEAWAY_TERMS + PAYMENT_TERMS)))
        action_hits = _find_terms(low, ACTION_TERMS)
        interaction_hits = _find_terms(low, INTERACTION_GATE_TERMS)
        channel_hits = _find_terms(low, CHANNEL_TERMS)
        phishing_hits = _find_terms(low, PHISHING_LURE_TERMS + CREDENTIAL_TERMS)
        if not is_official and brand_hits and deal_hits and (action_hits or channel_hits
                                                             or has_messaging_link):
            signals.append(_sig(
                'brand_impersonation', 'brand_used_in_promotional_solicitation', field, text,
                0.8, 'a nonofficial account uses the protected brand in an actionable offer'))
        if not is_official and brand_hits and (deal_hits or phishing_hits) and (
                channel_hits or has_messaging_link):
            signals.append(_sig(
                'scam_phishing', 'brand_lure_to_off_platform_channel', field, text, 0.92,
                'brand-themed offer or login lure moves users to Telegram/WhatsApp'))
        if not is_official and brand_hits and phishing_hits and action_hits:
            signals.append(_sig(
                'scam_phishing', 'brand_phishing_call_to_action', field, text, 0.95,
                'brand-themed credential or claim lure includes a direct action request'))
        if not is_official and brand_hits and deal_hits and interaction_hits:
            signals.append(_sig(
                'scam_phishing', 'interaction_gated_brand_offer', field, text, 0.88,
                'brand-themed offer promises a link after a follow, comment, or direct message'))
        if not is_official and brand_hits and _find_terms(low, RECRUITMENT_TERMS) and (
                _find_terms(low, PAYMENT_TERMS) or entity_kinds['upi'] or entity_kinds['payment']):
            signals.append(_sig(
                'recruitment_fraud', 'brand_job_plus_fee_request', field, text, 0.95,
                'brand-themed job/recruitment solicitation also requests a fee or payment'))
            signals.append(_sig(
                'brand_impersonation', 'brand_recruiter_impersonation', field, text, 0.82,
                'nonofficial account claims to recruit or hire for the protected brand'))
        if not is_official and brand_hits and _find_terms(low, INVESTMENT_TERMS) and (
                channel_hits or has_messaging_link or entity_kinds['crypto_wallet']):
            signals.append(_sig(
                'investment_fraud', 'brand_investment_channel_or_wallet', field, text, 0.96,
                'brand-themed investment solicitation routes to a channel or crypto wallet'))
            signals.append(_sig(
                'brand_impersonation', 'brand_used_for_financial_solicitation', field, text, 0.84,
                'protected brand identity is used to solicit investments'))
        if not is_official and brand_hits and _find_terms(low, MALWARE_TERMS) and action_hits:
            signals.append(_sig(
                'malicious_downloads', 'brand_download_call_to_action', field, text, 0.96,
                'brand-themed claim/refund flow instructs the user to install software'))
            signals.append(_sig(
                'brand_impersonation', 'brand_used_for_software_lure', field, text, 0.82,
                'nonofficial content uses the protected brand to promote a download'))

        # Support scams often appear as replies under posts. Preserve the comment field path so
        # an investigator can distinguish a reply-hijack from the original brand post.
        if field.endswith('.text') and _find_terms(low, SUPPORT_TERMS) and (
                _find_terms(low, URGENCY_TERMS) or channel_hits or entity_kinds['phone']):
            signals.append(_sig('fake_support', 'support_reply_hijack', field, text, 0.88,
                                'comment solicits a victim as support and adds urgency/contact'))

        sensitive_hits = _find_terms(low, AUTHENTICATION_TERMS)
        sensitive_requests = _find_terms(low, SENSITIVE_REQUEST_TERMS)
        safety_warning = bool(_find_terms(low, SAFETY_WARNING_TERMS))
        if sensitive_hits and sensitive_requests and not safety_warning:
            signals.append(_sig('credential_harvesting', 'sensitive_authentication_request',
                                field, text, 0.82,
                                'explicitly asks the target to provide an authentication secret'))

        if (_find_terms(low, QR_TERMS)
                and (_find_terms(low, PHISHING_LURE_TERMS) or
                     (sensitive_hits and sensitive_requests))
                and not safety_warning):
            signals.append(_sig('credential_harvesting', 'qr_plus_sensitive_action', field, text,
                                0.9, 'QR instruction is paired with a login or credential request'))

        if _find_terms(low, INVESTMENT_TERMS) and _find_terms(low, EXECUTIVE_TERMS):
            signals.append(_sig('executive_impersonation', 'executive_investment_endorsement',
                                field, text, 0.76,
                                'investment promotion invokes a senior executive identity'))

    # phishing composite: urgency + credential/payment in the same text
    for field, text in corpora:
        low = (text or '').lower()
        if _find_terms(low, URGENCY_TERMS) and (
                _find_terms(low, CREDENTIAL_TERMS) or _find_terms(low, PAYMENT_TERMS)):
            signals.append(_sig('scam_phishing', 'urgency_plus_action_request', field, text, 0.8,
                                'combines urgency with a credential or payment request'))
        if _find_terms(low, GIVEAWAY_TERMS + DEAL_LURE_TERMS) and (
                _find_terms(low, PAYMENT_TERMS) or entity_kinds['upi'] or
                entity_kinds['crypto_wallet']):
            signals.append(_sig('payment_fraud', 'promotion_plus_payment_request', field, text,
                                0.92, 'prize/deal lure requires a fee or payment transfer'))
        if _find_terms(low, SUPPORT_TERMS) and (
                _find_terms(low, CHANNEL_TERMS) or entity_kinds['phone'] or has_messaging_link):
            signals.append(_sig('fake_support', 'support_moves_off_platform', field, text, 0.86,
                                'support persona moves the victim to phone, WhatsApp, or Telegram'))

    # ---------- logo / media ----------
    media_analysis = dossier.get('media_analysis') or []
    has_media = any((p.get('media') or []) for p in posts)
    if media_analysis:
        for i, m in enumerate(media_analysis):
            score = float(m.get('brand_match_score') or 0)
            if score >= 0.6 and not is_official:
                signals.append(_sig('logo_misuse', 'brand_mark_detected',
                                    f'media_analysis[{i}]', str(m)[:200], min(1.0, score),
                                    'supplied media analysis detected the protected mark'))
            ocr_text = str(m.get('ocr_text') or '')
            transcript = str(m.get('transcript') or '')
            qr_payloads = m.get('qr_payloads') or ([] if not m.get('qr_payload')
                                                   else [m.get('qr_payload')])
            synthetic_score = float(m.get('synthetic_media_score') or 0)
            for source_name, observed in (('ocr_text', ocr_text), ('transcript', transcript)):
                observed_low = observed.lower()
                media_sensitive = _find_terms(observed_low, AUTHENTICATION_TERMS)
                media_requests = _find_terms(observed_low, SENSITIVE_REQUEST_TERMS)
                if (_find_terms(observed_low, CREDENTIAL_TERMS + PHISHING_LURE_TERMS)
                        or (media_sensitive and media_requests)) and not _find_terms(
                            observed_low, SAFETY_WARNING_TERMS):
                    signals.append(_sig('credential_harvesting', f'{source_name}_sensitive_lure',
                                        f'media_analysis[{i}].{source_name}', observed, 0.82,
                                        'media text/audio explicitly requests credentials'))
                if _find_terms(observed_low, PAYMENT_TERMS):
                    signals.append(_sig('payment_fraud', f'{source_name}_payment_lure',
                                        f'media_analysis[{i}].{source_name}', observed, 0.76,
                                        'media text/audio requests a fee or payment transfer'))
                if _find_terms(observed, MALWARE_TERMS):
                    signals.append(_sig('malicious_downloads', f'{source_name}_download_lure',
                                        f'media_analysis[{i}].{source_name}', observed, 0.85,
                                        'media text/audio instructs users to install software'))
                if _find_terms(observed, INVESTMENT_TERMS):
                    signals.append(_sig('investment_fraud', f'{source_name}_investment_lure',
                                        f'media_analysis[{i}].{source_name}', observed, 0.78,
                                        'media text/audio promotes investments or guaranteed returns'))
            for payload in qr_payloads[:5]:
                payload = str(payload)
                dom = domain_of(payload)
                signals.append(_sig('risky_urls', 'qr_destination',
                                    f'media_analysis[{i}].qr_payloads', payload, 0.66,
                                    'QR code destination was decoded for investigation'))
                if re.search(r'(login|signin|verify|kyc|password|otp|account)', payload,
                             re.IGNORECASE):
                    signals.append(_sig('credential_harvesting', 'qr_sensitive_destination',
                                        f'media_analysis[{i}].qr_payloads', payload, 0.92,
                                        'decoded QR destination is themed around login, KYC, or credentials'))
                elif re.search(r'(pay|upi|wallet|claim|refund)', payload, re.IGNORECASE):
                    signals.append(_sig('payment_fraud', 'qr_payment_destination',
                                        f'media_analysis[{i}].qr_payloads', payload, 0.78,
                                        'decoded QR destination is themed around payment or refund'))
                if dom and dom not in official_domains:
                    signals.append(_sig('risky_urls', 'qr_external_domain',
                                        f'media_analysis[{i}].qr_payloads', payload, 0.62,
                                        'QR code leads outside the protected brand domain'))
            if synthetic_score >= 0.7 and _find_terms(transcript + ' ' + ocr_text,
                                                       INVESTMENT_TERMS):
                signals.append(_sig('investment_fraud', 'synthetic_investment_media',
                                    f'media_analysis[{i}]', str(m)[:240], synthetic_score,
                                    'likely synthetic media is paired with an investment pitch'))
    elif has_media:
        notes.append('media_analysis_unavailable')

    # ---------- coordinated abuse ----------
    captions = [(p.get('caption') or '').strip().lower() for p in posts if p.get('caption')]
    dupes = [c for c, n in Counter(captions).items() if n >= 3 and len(c) > 25]
    if dupes:
        signals.append(_sig('coordinated_abuse', 'repeated_caption_template', 'posts[].caption',
                            dupes[0], 0.55,
                            f'{len(dupes)} caption template(s) repeated 3+ times'))
    commenters = Counter()
    for p in posts:
        for c in p.get('comments') or []:
            if c.get('author_handle'):
                commenters[c['author_handle'].lower()] += 1
    ring = [h for h, n in commenters.items() if n >= 3]
    if len(ring) >= 2:
        signals.append(_sig('coordinated_abuse', 'repeat_commenter_cluster',
                            'posts[].comments[].author_handle', ', '.join(ring[:5]), 0.5,
                            f'{len(ring)} accounts comment repeatedly across posts'))
    mention_counts = Counter(e['value'] for e in dossier.get('entities', [])
                             if e.get('kind') == 'mention')
    heavy = [m for m, n in mention_counts.items() if n >= 5]
    if heavy:
        signals.append(_sig('coordinated_abuse', 'mention_amplification', 'entities.mention',
                            ', '.join(heavy[:5]), 0.4,
                            'the same accounts are mentioned repeatedly (amplification pattern)'))

    for idx, artifact in enumerate(dossier.get('shared_artifacts') or []):
        kind = artifact.get('kind')
        count = int(artifact.get('account_count') or 0)
        if count < 2:
            continue
        value = str(artifact.get('value') or '')
        signals.append(_sig('coordinated_abuse', f'shared_{kind}',
                            f'shared_artifacts[{idx}]', value,
                            min(0.95, 0.58 + 0.08 * min(count, 4)),
                            f'artifact is reused across {count} Instagram accounts'))
        if kind in {'upi', 'crypto_wallet', 'payment'}:
            signals.append(_sig('payment_fraud', 'payment_identifier_reused',
                                f'shared_artifacts[{idx}]', value, 0.9,
                                f'the same payment destination appears across {count} accounts'))
        if kind in {'url', 'download', 'telegram'}:
            signals.append(_sig('risky_urls', 'infrastructure_reused',
                                f'shared_artifacts[{idx}]', value, 0.75,
                                f'the same destination is promoted by {count} accounts'))

    account_changes = dossier.get('account_changes') or []
    if account_changes:
        important = [change for change in account_changes
                     if change.get('field') in {'handle', 'display_name', 'biography',
                                                 'external_url', 'language', 'content_category'}]
        if important:
            signals.append(_sig('account_change_risk', 'sudden_profile_change',
                                'account_changes', str(important[:4]),
                                min(0.9, 0.45 + 0.1 * len(important)),
                                'profile identity, destination, language, or content category changed'))

    velocity = dossier.get('velocity') or {}
    if int(velocity.get('posts_last_hour') or 0) >= 8:
        signals.append(_sig('coordinated_abuse', 'rapid_posting_burst', 'velocity.posts_last_hour',
                            str(velocity['posts_last_hour']), 0.7,
                            'account published at unusually high hourly velocity'))
    if int(velocity.get('duplicate_post_count') or 0) >= 3:
        signals.append(_sig('coordinated_abuse', 'duplicate_post_velocity',
                            'velocity.duplicate_post_count',
                            str(velocity['duplicate_post_count']), 0.62,
                            'multiple duplicated posts suggest automated campaign activity'))
    follower_delta = velocity.get('follower_delta')
    if isinstance(follower_delta, int) and follower_delta >= 5000:
        signals.append(_sig('victim_signals', 'rapid_follower_growth',
                            'velocity.follower_delta', str(follower_delta), 0.48,
                            'large follower increase raises exposure and campaign velocity'))

    # A post result should be scored for what that specific post says or links to. Account
    # identity risk is kept on the account result and must not make every post look critical.
    if content_only:
        signals = [signal for signal in signals
                   if not signal.get('field', '').startswith('account.')]

    # ---------- aggregate ----------
    category_scores: Dict[str, float] = {c: 0.0 for c in CATEGORY_WEIGHTS}
    grouped: Dict[str, List[float]] = {}
    for s in signals:
        grouped.setdefault(s['category'], []).append(s['weight'])
    for cat, weights in grouped.items():
        if cat not in category_scores:
            continue
        weights = sorted(weights, reverse=True)
        # saturating combination: strongest signal dominates, extras add decaying support
        combined = 1.0
        for idx, w in enumerate(weights[:6]):
            combined *= (1 - w * (0.85 ** idx))
        category_scores[cat] = round(min(100.0, (1 - combined) * 100), 2)

    direct_harm_present = any(signal.get('signal') in DIRECT_HARM_SIGNALS for signal in signals)
    if is_official:
        # A configured official account is not an impostor merely because it mentions KYC,
        # payments, customer support, a promotion, or a fraud-awareness example. Those are
        # normal parts of a bank or retailer's public communications. Account compromise is
        # handled through profile-change monitoring and must not be inferred from vocabulary.
        notes.append('trusted_official_handle: automated fraud-family scoring suppressed')
        for cat in category_scores:
            if cat != 'account_change_risk':
                category_scores[cat] = 0.0
    elif (is_established or verified_metrics_missing) and not direct_harm_present:
        # Verified/high-reach accounts still need a concrete harmful flow before being shown as
        # fraud. This avoids treating legitimate publishers, banks, and retailer campaigns as
        # scam accounts because they discuss KYC, UPI, support, refunds, promotions, or safety.
        notes.append('established_profile: vocabulary-only alert scoring suppressed')
        for cat in category_scores:
            if cat != 'account_change_risk':
                category_scores[cat] = 0.0
    elif not content_only and profile_details_missing and not direct_harm_present:
        # A bare search snippet is discovery evidence, not proof of impersonation. Missing
        # followers, verification, biography and profile metadata must never increase risk.
        # Generic offer/counterfeit/download words do not bypass this gate; only a concrete
        # harmful flow, such as a brand lure leading to Telegram, payment, credentials, or a
        # download, can do so.
        notes.append('incomplete_profile: ungrounded alert scoring suppressed')
        for cat in category_scores:
            if cat != 'account_change_risk':
                category_scores[cat] = 0.0
    elif disclosed_unofficial:
        # A clear fan/parody disclosure is evidence against deceptive identity use. It only
        # reduces identity categories; scam, phishing, counterfeit and URL signals remain.
        category_scores['brand_impersonation'] = round(
            category_scores['brand_impersonation'] * 0.3, 2)
        category_scores['suspicious_naming'] = round(
            category_scores['suspicious_naming'] * 0.5, 2)
        notes.append('account explicitly discloses unofficial/fan status')

    weighted = [category_scores[c] * CATEGORY_WEIGHTS[c] for c in category_scores]
    top = sorted(weighted, reverse=True)
    overall = 0.0
    if top:
        overall = top[0] + sum(v * 0.18 for v in top[1:4])
    overall = round(min(100.0, overall), 2)

    # Exposure is observed reach plus victim reports. Unknown metrics remain unknown rather
    # than being treated as zero. Coordination is evidence of shared/repeated activity.
    engagement_values = []
    for post in posts:
        for value in (post.get('engagement') or {}).values():
            if isinstance(value, (int, float)) and value >= 0:
                engagement_values.append(float(value))
    exposure_metric = max(engagement_values + [float(followers or 0)])
    exposure_score = min(100.0, 12.5 * max(0.0, math.log10(exposure_metric + 1)))
    exposure_score = max(exposure_score, category_scores.get('victim_signals', 0))
    dimensions = {}
    for dimension, categories in DIMENSION_CATEGORIES.items():
        values = sorted((category_scores.get(cat, 0.0) for cat in categories), reverse=True)
        dimensions[dimension] = round(min(100.0, (values[0] if values else 0.0) +
                                                  sum(v * 0.15 for v in values[1:3])), 2)
    dimensions['exposure'] = round(max(dimensions.get('exposure', 0.0), exposure_score), 2)

    # Each unique signal is an independent indicator; related duplicate text hits count once.
    independent = sorted({(s.get('category'), s.get('signal')) for s in signals
                          if float(s.get('weight') or 0) >= 0.5})
    alert_families = {}
    for family, categories in ALERT_FAMILIES.items():
        family_signals = [s for s in signals if s.get('category') in categories]
        family_score = max((category_scores.get(cat, 0.0) for cat in categories), default=0.0)
        alert_families[family] = {
            'score': round(family_score, 2),
            'active': family_score >= 45,
            'critical': family_score >= 80 and len({s.get('signal') for s in family_signals
                                                    if s.get('weight', 0) >= 0.5}) >= 2,
            'signals': sorted({s.get('signal') for s in family_signals})[:12],
        }

    # Critical status normally needs two separate grounded indicators. This gate prevents a
    # single keyword or lone brand resemblance from entering the critical queue.
    if overall >= 85 and len(independent) < 2:
        overall = 84.0
        notes.append('critical_score_capped: fewer than two independent indicators')

    for signal in signals:
        signal['alert_family'] = next((family for family, categories in ALERT_FAMILIES.items()
                                       if signal.get('category') in categories), None)
        signal['dimension'] = next((dimension for dimension, categories
                                    in DIMENSION_CATEGORIES.items()
                                    if signal.get('category') in categories), None)

    return {'overall_score': overall, 'category_scores': category_scores,
            'dimensions': dimensions, 'alert_families': alert_families,
            'independent_indicators': len(independent),
            'signals': signals, 'notes': notes}

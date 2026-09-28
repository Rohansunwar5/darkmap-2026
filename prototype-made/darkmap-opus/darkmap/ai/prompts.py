'''Prompt construction for the Claude Opus risk analyst.'''
import json
from typing import Any, Dict

CATEGORIES = [
    'brand_impersonation',
    'counterfeit',
    'scam_phishing',
    'suspicious_naming',
    'logo_misuse',
    'risky_urls',
    'giveaway_payment_scam',
    'fake_support',
    'credential_harvesting',
    'coordinated_abuse',
    'payment_fraud',
    'executive_impersonation',
    'recruitment_fraud',
    'malicious_downloads',
    'investment_fraud',
    'victim_signals',
    'account_change_risk',
]

ACTIONS = ['monitor', 'investigate', 'evidence_package', 'enforce']

SYSTEM_PROMPT = (
    'You are Darkmap, a brand-protection risk analyst. You review a dossier of lawfully '
    'collected social media data about a single account and assess risk to a protected brand.\n'
    'Rules:\n'
    '1. Ground every claim in the dossier. Quote the exact field and text you relied on.\n'
    '2. Never assert facts you cannot see (account age, ownership, intent) - list them as '
    'limitations instead.\n'
    '3. Similarity to a brand is not proof of infringement. Fan, review, resale, parody and '
    'news accounts are legitimate; say so when the evidence supports it.\n'
    '4. Media/pixel analysis is unavailable unless the dossier contains media_analysis entries. '
    'If absent, score logo_misuse conservatively and record the limitation.\n'
    '5. Calibrate: 0-24 benign, 25-49 low, 50-69 elevated, 70-84 high, 85-100 severe.\n'
    '6. Consider credential/ATO phishing, payment fraud, fake support, scam promotions, '
    'counterfeit sales, employee/recruiter impersonation, malicious downloads, and investment '
    'impersonation separately.\n'
    '7. A severe/critical assessment normally requires at least two independent grounded '
    'indicators. A brand mention or one suspicious word is insufficient.\n'
    '8. Output STRICT JSON only - no prose, no markdown fences.'
)

SCHEMA = {
    'overall_score': 'number 0-100',
    'confidence': 'number 0-1',
    'summary': 'string, <= 600 chars, analyst tone',
    'category_scores': {c: 'number 0-100' for c in CATEGORIES},
    'evidence': [{
        'category': f'one of {CATEGORIES}',
        'signal': 'short machine-readable slug',
        'field': 'dossier field path, e.g. posts[2].caption',
        'quote': 'verbatim excerpt (<= 240 chars)',
        'weight': 'number 0-1',
        'rationale': 'one sentence',
    }],
    'limitations': ['string'],
    'recommended_action': f'one of {ACTIONS}',
}


def build_user_prompt(dossier: Dict[str, Any]) -> str:
    return (
        'Protected brand context and observed account dossier follow.\n\n'
        '<dossier>\n' + json.dumps(dossier, ensure_ascii=False, indent=2, default=str) +
        '\n</dossier>\n\n'
        'Deterministic heuristic signals already computed by Darkmap are included under '
        '"heuristic_signals". Treat them as hints, not ground truth: confirm, downgrade, or '
        'contradict them using the raw evidence.\n\n'
        'Respond with JSON matching exactly this schema:\n' +
        json.dumps(SCHEMA, ensure_ascii=False, indent=2)
    )

from fastapi.testclient import TestClient

from darkmap.ai.base import AnalysisResult
from darkmap.ai.heuristics import analyze
from darkmap.extract import extract
from darkmap.risk import fuse


BRAND = {'name': 'Acme', 'official_handles': ['acme'],
         'official_domains': ['acme.com'], 'keywords': ['Acme']}


def dossier(text, *, handle='acme_helpdesk247', entities=None, media=None, comments=None):
    return {
        'brand': BRAND,
        'account': {'handle': handle, 'display_name': 'Acme Support',
                    'biography': text, 'followers_count': 140},
        'posts': [{'caption': text, 'engagement': {'views': 12000}, 'media': [],
                   'comments': comments or []}],
        'entities': entities or [], 'media_analysis': media or [],
        'shared_artifacts': [], 'account_changes': [], 'velocity': {},
    }


def test_extracts_investigation_pivots():
    found = extract('Pay winner@okhdfcbank or 0x52908400098527886E0F7030069857D2E4169EE7. '
                    'Call +91 98765 43210 and download https://bad.example/app.apk')
    assert found['upi'] == ['winner@okhdfcbank']
    assert found['crypto_wallet']
    assert found['phone'] == ['+919876543210']
    assert found['download'] == ['https://bad.example/app.apk']


def test_eight_priority_alert_families_are_separate_and_explainable():
    scenarios = {
        'credential_takeover': dossier(
            'Acme account blocked. Login here to unlock account and enter OTP now.',
            entities=[{'kind': 'url', 'value': 'https://acme-verify.top/login',
                       'domain': 'acme-verify.top', 'source_field': 'bio'}]),
        'payment_fraud': dossier(
            'Acme prize winner: pay delivery fee via UPI then claim now.',
            entities=[{'kind': 'upi', 'value': 'winner@paytm', 'source_field': 'caption'}]),
        'fake_customer_support': dossier(
            'Acme customer support: your order is blocked. Contact support on WhatsApp now.',
            entities=[{'kind': 'phone', 'value': '+919876543210', 'source_field': 'bio'}]),
        'scam_promotions': dossier(
            'Acme 95% off loot giveaway. Follow me and comment LINK to receive link.'),
        'counterfeit_sales': dossier(
            'Acme replica first copy mirror quality at factory price. DM to order.'),
        'employee_recruiter_impersonation': dossier(
            'Acme HR team hiring now for internship. Pay registration fee via UPI.',
            entities=[{'kind': 'upi', 'value': 'acmejobs@paytm', 'source_field': 'caption'}]),
        'malicious_apps_downloads': dossier(
            'Acme refund: download APK and install for refund now.',
            entities=[{'kind': 'download', 'value': 'https://files.example/refund.apk',
                       'domain': 'files.example', 'source_field': 'caption'}]),
        'investment_financial_impersonation': dossier(
            'Acme CEO guaranteed returns. Join Telegram trading signals and deposit crypto.',
            entities=[{'kind': 'crypto_wallet',
                       'value': '0x52908400098527886E0F7030069857D2E4169EE7',
                       'source_field': 'caption'},
                      {'kind': 'url', 'value': 'https://t.me/acmeprofits',
                       'domain': 't.me', 'source_field': 'caption'}]),
    }
    for family, doc in scenarios.items():
        result = analyze(doc)
        assert result['alert_families'][family]['active'], family
        assert result['alert_families'][family]['signals'], family
        assert result['independent_indicators'] >= 2, family
        assert {'deception', 'harm', 'exposure', 'coordination'} == set(result['dimensions'])
        assert all('alert_family' in signal and 'dimension' in signal
                   for signal in result['signals'])


def test_qr_media_and_victim_reports_become_grounded_signals():
    doc = dossier('Acme secure account update', media=[{
        'brand_match_score': .91,
        'ocr_text': 'Scan QR to unlock your account and enter OTP',
        'qr_payloads': ['https://acme-login.top/verify'],
    }], comments=[{'author_handle': 'victim',
                   'text': 'I paid but order never arrived. This is fake.'}])
    result = analyze(doc)
    names = {signal['signal'] for signal in result['signals']}
    assert 'qr_sensitive_destination' in names
    assert 'victim_report_language' in names
    assert result['dimensions']['exposure'] > 0


def test_legitimate_qr_payment_product_news_is_not_credential_takeover():
    result = analyze({
        'brand': {'name': 'Lenskart', 'official_handles': ['lenskart'],
                  'official_domains': ['lenskart.com'], 'keywords': ['Lenskart']},
        'account': {'handle': 'startupstalkingindia',
                    'display_name': 'Startup Story', 'biography': '',
                    'followers_count': 309000},
        'posts': [{
            'caption': ('Lenskart has announced that its upcoming smartglasses will come with '
                        'built-in UPI integration, allowing users to scan QR codes and make '
                        'payments instantly using voice authentication.'),
            'engagement': {'likes': 286}, 'media': [], 'comments': [],
        }],
        'entities': [], 'media_analysis': [], 'shared_artifacts': [],
        'account_changes': [], 'velocity': {},
    })

    assert result['category_scores']['credential_harvesting'] == 0
    assert result['alert_families']['credential_takeover']['active'] is False
    assert result['overall_score'] < 45


def test_single_indicator_is_not_critical():
    result = analyze({'brand': BRAND,
                      'account': {'handle': 'random_shop', 'display_name': 'Random shop',
                                  'biography': '', 'followers_count': 10},
                      'posts': [{'caption': 'replica', 'media': [], 'comments': []}],
                      'entities': [], 'media_analysis': []})
    assert result['overall_score'] < 85


def test_ai_fusion_cannot_bypass_two_indicator_critical_gate():
    heuristic = {
        'overall_score': 84,
        'independent_indicators': 1,
        'category_scores': {'credential_harvesting': 90},
    }
    ai = AnalysisResult(
        available=True, overall_score=100,
        category_scores={'credential_harvesting': 100}, confidence=.95,
    )

    assert fuse(heuristic, ai, .65)['overall_score'] == 84


def test_alert_campaign_case_endpoints_exist(app_env):
    from darkmap.api import app
    with TestClient(app) as client:
        assert client.get('/v1/alerts').status_code == 200
        assert client.get('/v1/campaigns').status_code == 200
        response = client.post('/v1/cases', json={'title': 'Test investigation'})
        assert response.status_code == 201
        case = response.json()
        assert case['status'] == 'open'
        package = client.get(f"/v1/cases/{case['id']}/evidence-package")
        assert package.status_code == 200
        assert package.json()['format'] == 'darkmap-evidence-package/v1'

from darkmap.ai.heuristics import analyze, handle_similarity

BRAND = {'name': 'Luminaire', 'official_handles': ['luminaire'],
         'official_domains': ['luminaire.com'], 'keywords': ['luminaire', 'aurora series']}


def _dossier(account, posts=None, entities=None):
    return {'brand': BRAND, 'account': account, 'posts': posts or [],
            'entities': entities or [], 'media_analysis': []}


def test_handle_similarity():
    assert handle_similarity('luminaire.support.hq', ['Luminaire']) > 0.8
    assert handle_similarity('totally_unrelated', ['Luminaire']) < 0.5


def test_phishing_support_account_scores_high():
    doc = _dossier(
        {'handle': 'luminaire.support.hq', 'display_name': 'Luminaire Official Support',
         'biography': 'Official account. Verify your account here.', 'followers_count': 200},
        posts=[{'caption': 'URGENT: your account has been flagged. Log in to verify within '
                           '24 hours or your account will be disabled.',
                'media': [], 'comments': []}],
        entities=[{'kind': 'url', 'value': 'http://luminaire-verify.top/login',
                   'domain': 'luminaire-verify.top', 'source_field': 'bio'}])
    out = analyze(doc)
    cats = out['category_scores']
    assert out['overall_score'] >= 70
    assert cats['credential_harvesting'] >= 50
    assert cats['brand_impersonation'] >= 50
    assert cats['fake_support'] >= 40
    assert cats['risky_urls'] >= 30
    signals = {s['signal'] for s in out['signals']}
    assert 'credential_request_language' in signals
    assert all(s['quote'] is not None for s in out['signals'])


def test_counterfeit_and_coordination():
    caption = 'Aurora series replica, 1:1 mirror quality, cheap price. DM for price. extra text'
    doc = _dossier(
        {'handle': 'lumi.outlet.store88', 'display_name': 'Lumi Outlet Best Replica',
         'biography': 'AAA quality. wholesale price. DM to order.', 'followers_count': 9000},
        posts=[{'caption': caption, 'media': [], 'comments': []} for _ in range(3)],
        entities=[{'kind': 'url', 'value': 'http://www.lumi-outlet.xyz',
                   'domain': 'lumi-outlet.xyz', 'source_field': 'bio'}])
    out = analyze(doc)
    assert out['category_scores']['counterfeit'] >= 60
    assert out['category_scores']['coordinated_abuse'] > 0
    assert out['category_scores']['risky_urls'] > 0


def test_official_account_is_suppressed():
    doc = _dossier({'handle': 'luminaire', 'display_name': 'Luminaire',
                    'biography': 'Official Luminaire account. Shop luminaire.com',
                    'followers_count': 800000},
                   entities=[{'kind': 'url', 'value': 'https://luminaire.com',
                              'domain': 'luminaire.com', 'source_field': 'external_url'}])
    out = analyze(doc)
    assert out['overall_score'] < 25
    assert out['category_scores']['brand_impersonation'] < 20


def test_official_promotional_posts_are_not_ranked_as_abuse():
    doc = _dossier(
        {'handle': 'luminaire', 'display_name': 'Luminaire',
         'biography': 'Official Luminaire account', 'followers_count': 800000},
        posts=[{'caption': 'Luminaire free frame offer. Last chance, claim now!',
                'media': [], 'comments': []} for _ in range(6)])
    assert analyze(doc)['overall_score'] < 40


def test_bare_search_profile_is_not_ranked_high_from_brand_similarity():
    doc = _dossier({
        'handle': 'luminaire_in', 'display_name': 'luminaire_in',
        'biography': 'Luminaire India (@luminaire_in) • Instagram photos and videos',
        'followers_count': None, 'follows_count': None, 'media_count': None,
    })
    doc['provenance'] = {'collection_mode': 'keyword_serp_fallback'}

    result = analyze(doc)

    assert result['overall_score'] == 0
    assert 'incomplete_profile: ungrounded alert scoring suppressed' in result['notes']


def test_verified_profile_does_not_need_follower_count_to_suppress_identity_only_risk():
    doc = _dossier({
        'handle': 'luminaire_india', 'display_name': 'Luminaire India',
        'biography': 'Official account featuring new collections',
        'followers_count': None, 'is_verified': True,
    })

    result = analyze(doc)

    assert result['overall_score'] == 0
    assert 'established_profile: vocabulary-only alert scoring suppressed' in result['notes']


def test_official_bank_kyc_and_contact_centre_posts_are_not_fraud_alerts():
    doc = {
        'brand': {'name': 'SBI', 'official_handles': ['theofficialsbi'],
                  'official_domains': ['sbi.bank.in'], 'keywords': ['SBI']},
        'account': {'handle': 'theofficialsbi', 'display_name': 'State Bank of India',
                    'biography': 'Official account', 'followers_count': None},
        'posts': [{
            'caption': ('Update your KYC with ease. Call the SBI Contact Centre at '
                        '1800 1234. Use https://crh.sbi.bank.in for feedback.'),
            'media': [], 'comments': [],
        }],
        'entities': [
            {'kind': 'url', 'value': 'https://crh.sbi.bank.in/sm_feedback',
             'domain': 'crh.sbi.bank.in', 'source_field': 'caption'},
            {'kind': 'phone', 'value': '18001234', 'source_field': 'caption'},
        ],
        'media_analysis': [],
    }
    result = analyze(doc)
    assert result['overall_score'] == 0
    assert result['category_scores']['credential_harvesting'] == 0
    assert result['category_scores']['fake_support'] == 0
    assert result['alert_families']['credential_takeover']['active'] is False


def test_generic_kyc_or_upi_education_is_not_credential_or_payment_fraud():
    doc = _dossier(
        {'handle': 'finance_explainer', 'display_name': 'Finance explainer',
         'biography': '', 'followers_count': 12000},
        posts=[{'caption': ('This explainer covers KYC updates, UPI refunds, and how to '
                           'contact your bank safely.'), 'media': [], 'comments': []}])
    result = analyze(doc)
    assert result['category_scores']['credential_harvesting'] == 0
    assert result['category_scores']['payment_fraud'] == 0


def test_established_profile_with_ordinary_banking_language_is_not_escalated():
    doc = _dossier(
        {'handle': 'trusted_finance_news', 'display_name': 'Trusted Finance News',
         'biography': 'Verified publisher covering banking safety', 'is_verified': True,
         'followers_count': 950000},
        posts=[{'caption': ('Our KYC and UPI safety explainer covers account recovery, refunds, '
                            'and how to contact your bank through official channels.'),
                'media': [], 'comments': []}])
    result = analyze(doc)
    assert result['overall_score'] == 0
    assert result['category_scores']['credential_harvesting'] == 0
    assert 'established_profile: vocabulary-only alert scoring suppressed' in result['notes']


def test_established_profile_with_direct_phishing_flow_remains_actionable():
    doc = _dossier(
        {'handle': 'verified_deals_daily', 'display_name': 'Verified Deals Daily',
         'biography': '', 'is_verified': True, 'followers_count': 1000000},
        posts=[{'caption': ('Luminaire 95% off today. Join our Telegram channel and log in to '
                            'claim your voucher now.'), 'media': [], 'comments': []}])
    result = analyze(doc)
    assert result['overall_score'] >= 85
    assert result['alert_families']['scam_promotions']['active'] is True


def test_profile_linked_to_registered_brand_domain_is_trusted():
    doc = _dossier(
        {'handle': 'luminaire_india', 'display_name': 'Luminaire India',
         'biography': 'Customer support and offers', 'followers_count': None,
         'external_url': 'https://shop.luminaire.com/india'},
        posts=[{'caption': 'Free voucher offer. Contact support for your order.',
                'media': [], 'comments': []}])
    result = analyze(doc)
    assert result['overall_score'] == 0
    assert 'profile URL matches a registered official brand domain' in result['notes']


def test_low_reach_brand_lookalike_is_a_ranking_clue_not_a_critical_alert():
    doc = _dossier(
        {'handle': 'luminaire_247', 'display_name': 'New arrivals', 'biography': '',
         'followers_count': 147},
        posts=[{'caption': 'New Luminaire collection.', 'media': [], 'comments': []}])
    result = analyze(doc)
    low_reach = next(item for item in result['signals']
                     if item['signal'] == 'brandlike_but_low_reach')
    assert low_reach['weight'] == 0.45
    assert result['independent_indicators'] < 2
    assert result['overall_score'] <= 84


def test_bare_search_snippet_is_not_scored_as_brand_impersonation():
    doc = _dossier({
        'handle': 'luminaire_in',
        'display_name': 'luminaire_in',
        'biography': '',
        'followers_count': None,
        'follows_count': None,
        'media_count': None,
    })

    result = analyze(doc)

    assert result['overall_score'] == 0
    assert result['category_scores']['brand_impersonation'] == 0
    assert 'incomplete_profile: ungrounded alert scoring suppressed' in result['notes']


def test_unrelated_bare_publisher_is_not_fraud_from_loot_or_counterfeit_words():
    doc = {
        'brand': {'name': 'Netflix', 'official_handles': ['netflix'],
                  'official_domains': ['netflix.com'], 'keywords': ['Netflix']},
        'account': {'handle': 'appletv', 'display_name': 'appletv',
                    'biography': 'appletv', 'followers_count': None,
                    'follows_count': None, 'media_count': None},
        'posts': [{'caption': ('A TV episode mentions a loot box and replica prop. '
                               '#appletv #loot #mayarudolph'),
                   'media': [], 'comments': []}],
        'entities': [{'kind': 'mention', 'value': 'appletv', 'source_field': 'caption'}],
        'media_analysis': [],
        'provenance': {'collection_mode': 'keyword_serp_fallback'},
    }

    result = analyze(doc)

    assert result['overall_score'] == 0
    assert result['alert_families']['scam_promotions']['active'] is False
    assert result['alert_families']['counterfeit_sales']['active'] is False
    assert 'incomplete_profile: ungrounded alert scoring suppressed' in result['notes']


def test_established_publisher_is_not_fraud_from_loot_or_counterfeit_words():
    doc = {
        'brand': {'name': 'Netflix', 'official_handles': ['netflix'],
                  'official_domains': ['netflix.com'], 'keywords': ['Netflix']},
        'account': {'handle': 'appletv', 'display_name': 'Apple TV',
                    'biography': 'The official home of Apple TV',
                    'followers_count': 5_000_000, 'is_verified': True},
        'posts': [{'caption': 'A TV episode about a loot box and replica movie prop.',
                   'media': [], 'comments': []}],
        'entities': [], 'media_analysis': [],
    }

    result = analyze(doc)

    assert result['overall_score'] == 0
    assert result['alert_families']['scam_promotions']['active'] is False
    assert result['alert_families']['counterfeit_sales']['active'] is False
    assert 'established_profile: vocabulary-only alert scoring suppressed' in result['notes']


def test_fan_page_stays_low():
    doc = _dossier({'handle': 'luminaire.lovers', 'display_name': 'Luminaire Lovers (fan page)',
                    'biography': 'Unofficial fan page. Not affiliated with the brand. No sales.',
                    'followers_count': 14000},
                   posts=[{'caption': 'Spotted an Aurora pendant in Lisbon. Credit @luminaire',
                           'media': [], 'comments': []}])
    out = analyze(doc)
    assert out['category_scores']['counterfeit'] == 0
    assert out['category_scores']['credential_harvesting'] == 0
    assert out['overall_score'] < 70


def test_media_limitation_note():
    doc = _dossier({'handle': 'someshop', 'biography': 'hello'},
                   posts=[{'caption': 'hi', 'media': [{'media_type': 'image'}], 'comments': []}])
    assert 'media_analysis_unavailable' in analyze(doc)['notes']


def test_brand_loot_offer_with_telegram_link_is_critical():
    doc = _dossier(
        {'handle': 'dailydeals_india', 'display_name': 'Daily Loot Deals',
         'biography': 'Join our Telegram channel for limited offers',
         'followers_count': 180},
        posts=[{'caption': 'Luminaire loot deal: 90% off and free product. Join now using the '
                           'link in bio and claim now.', 'media': [], 'comments': []}],
        entities=[{'kind': 'url', 'value': 't.me/luminaire_loot',
                   'domain': 't.me', 'source_field': 'external_url'}])
    out = analyze(doc)
    assert out['overall_score'] >= 85
    signals = {item['signal'] for item in out['signals']}
    assert 'off_platform_messaging_link' in signals
    assert 'brand_lure_to_off_platform_channel' in signals
    assert 'brand_used_in_promotional_solicitation' in signals


def test_brand_scam_complaint_without_solicitation_is_not_critical():
    doc = _dossier(
        {'handle': 'consumer_reviews', 'display_name': 'Consumer Reviews',
         'biography': 'Independent customer reviews', 'followers_count': 50000},
        posts=[{'caption': 'I think Luminaire scammed me. Sharing my experience for awareness.',
                'media': [], 'comments': []}])
    assert analyze(doc)['overall_score'] < 45


def test_standalone_loot_telegram_reference_is_critical():
    doc = _dossier(
        {'handle': 'shopaholics80club', 'display_name': 'Shopping deals',
         'biography': '', 'followers_count': 1200},
        posts=[{'caption': 'Luminaire 100₹ frame loot🤫 Link in my telegram channel 👍 '
                           '#luminaire #shopping #eyeglass', 'media': [], 'comments': []}])
    out = analyze(doc)
    assert out['overall_score'] >= 85
    signals = {item['signal'] for item in out['signals']}
    assert 'brand_lure_to_off_platform_channel' in signals
    assert 'brand_used_in_promotional_solicitation' in signals


def test_interaction_gated_free_offer_is_critical():
    doc = _dossier(
        {'handle': 'ugcwithgirl', 'display_name': 'UGC deals',
         'biography': '', 'followers_count': 900},
        posts=[{'caption': 'Get Luminaire glasses worth ₹2000 free. Follow me and comment '
                           'LINK; the link will be sent automatically.',
                'media': [], 'comments': []}])
    assert analyze(doc)['overall_score'] >= 85


def test_quoted_comment_free_cash_telegram_lure_is_critical():
    doc = _dossier(
        {'handle': 'the._.rebel08', 'display_name': 'Daily offers',
         'biography': '', 'followers_count': None},
        posts=[{'caption': 'Luminaire is giving 600/- free cash. Comment “cash” to get it. '
                           'Comment "LINK" or check the bio link to join our Telegram channel.',
                'media': [], 'comments': []}])
    out = analyze(doc)
    signals = {item['signal'] for item in out['signals']}

    assert out['overall_score'] >= 85
    assert 'interaction_gated_brand_offer' in signals
    assert 'brand_lure_to_off_platform_channel' in signals


def test_free_eyewear_telegram_promotion_is_critical():
    doc = _dossier(
        {'handle': 'offerofworld', 'display_name': 'Offer World',
         'biography': '', 'followers_count': None},
        posts=[{'caption': 'Luminaire free eyewear exchange. Hamara Telegram channel join kare.',
                'media': [], 'comments': []}])

    assert analyze(doc)['overall_score'] >= 85


def test_content_only_mode_does_not_inherit_profile_identity_risk():
    doc = _dossier(
        {'handle': 'luminaire_support_official', 'display_name': 'Luminaire Support',
         'biography': 'Official customer service', 'followers_count': 3},
        posts=[{'caption': 'A plain product photo.', 'media': [], 'comments': []}])
    doc['content_only'] = True
    assert analyze(doc)['overall_score'] == 0


def test_paytm_cashback_telegram_reel_is_critical_in_content_only_mode():
    doc = {
        'brand': {'name': 'Paytm', 'official_handles': ['paytm'],
                  'official_domains': ['paytm.com'], 'keywords': ['Paytm']},
        'account': {'handle': 'desi_dime', 'display_name': 'desi_dime',
                    'followers_count': None},
        'posts': [{'caption': ('100 ka bill pay karo, ₹50 FASTag cashback unlock karo. '
                               '@paytm Join Our Telegram Channel: '
                               'https://t.me/earningsharmaj'),
                   'media': [], 'comments': []}],
        'entities': [{'kind': 'url', 'value': 'https://t.me/earningsharmaj',
                      'domain': 't.me', 'source_field': 'caption'}],
        'media_analysis': [], 'content_only': True,
        'provenance': {'collection_mode': 'keyword_serp_fallback'},
    }

    result = analyze(doc)
    signals = {item['signal'] for item in result['signals']}

    assert result['overall_score'] >= 85
    assert result['alert_families']['scam_promotions']['critical'] is True
    assert 'deal_lure_language' in signals
    assert 'brand_lure_to_off_platform_channel' in signals


def test_quantified_paytm_offer_with_link_in_bio_is_high_priority():
    doc = {
        'brand': {'name': 'Paytm', 'official_handles': ['paytm'],
                  'official_domains': ['paytm.com'], 'keywords': ['Paytm']},
        'account': {'handle': 'desi_dime', 'display_name': 'desi_dime',
                    'followers_count': None},
        'posts': [{'caption': ('LINK IN BIO. Paytm se bills ya recharge karte ho? '
                               'Eligible cards par 15% OFF up to ₹150 every month.'),
                   'media': [], 'comments': []}],
        'entities': [], 'media_analysis': [], 'content_only': True,
        'provenance': {'collection_mode': 'keyword_serp_fallback'},
    }

    result = analyze(doc)

    assert result['overall_score'] >= 85
    assert result['category_scores']['giveaway_payment_scam'] >= 60
    assert result['category_scores']['brand_impersonation'] >= 75


def test_official_paytm_product_reel_stays_low():
    doc = {
        'brand': {'name': 'Paytm', 'official_handles': ['paytm'],
                  'official_domains': ['paytm.com'], 'keywords': ['Paytm']},
        'account': {'handle': 'paytm', 'display_name': 'Paytm',
                    'followers_count': 4_000_000, 'is_verified': True},
        'posts': [{'caption': ('With Paytm UPI Lite, pay in a flash using PIN and fingerprint '
                               'authentication. Try now, only on Paytm.'),
                   'media': [], 'comments': []}],
        'entities': [], 'media_analysis': [], 'content_only': True,
    }

    assert analyze(doc)['overall_score'] == 0

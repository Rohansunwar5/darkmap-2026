'''Tests for the Darkmap risk engine: recommend_action, fuse and assess_account.'''
import datetime as dt

import pytest

from darkmap import risk
from darkmap.ai.base import AnalysisProvider, AnalysisResult, NullAnalysisProvider
from darkmap.models import (Account, Brand, Comment, Entity, MediaAsset, Post, RiskAssessment,
                            SearchDocument)


# --------------------------------------------------------------------------- helpers

class StubProvider(AnalysisProvider):
    '''Deterministic stand-in for the Claude provider. Never touches the network.'''

    name = 'stub'

    def __init__(self, result: AnalysisResult):
        self.result = result
        self.calls = []

    def analyze(self, dossier):
        self.calls.append(dossier)
        return self.result


def _ai_result(**overrides) -> AnalysisResult:
    base = dict(
        available=True,
        overall_score=88.0,
        category_scores={
            'brand_impersonation': 90.0,
            'credential_harvesting': 84.0,
            'scam_phishing': 70.0,
        },
        evidence=[
            {'source': 'ai', 'category': 'brand_impersonation', 'signal': 'logo_and_name_copy',
             'field': 'account.display_name', 'quote': 'Luminaire Official Support',
             'weight': 0.95, 'rationale': 'display name copies the protected brand'},
            {'source': 'ai', 'category': 'credential_harvesting', 'signal': 'login_link',
             'field': 'entities.url[bio]', 'quote': 'http://luminaire-verify.top/login',
             'weight': 0.9, 'rationale': 'links to a credential capture page'},
        ],
        confidence=0.8,
        limitations=['model_may_miss_non_english_context'],
        recommended_action='enforce',
        summary='Coordinated impersonation of the protected brand with credential capture.',
        model='stub-model-1',
        raw={'ok': True},
    )
    base.update(overrides)
    return AnalysisResult(**base)


def _seed_account(session, *, handle='luminaire.support.help',
                  display_name='Luminaire Official Support', with_posts=True):
    brand = Brand(name='Luminaire', official_handles=['luminaire'],
                  official_domains=['luminaire.com'], keywords=['Luminaire Glow'])
    session.add(brand)
    session.flush()

    acc = Account(
        platform='instagram',
        platform_account_id='acc-1',
        handle=handle,
        handle_lower=handle.lower(),
        display_name=display_name,
        biography='Official account. Verify your account within 24 hours or it will be disabled. '
                  'http://luminaire-verify.top/login',
        external_url='http://luminaire-verify.top/login',
        followers_count=120,
        brand_id=brand.id,
        provenance={'lawful_basis': 'permitted_public_page'},
    )
    session.add(acc)
    session.flush()

    session.add(Entity(account_id=acc.id, kind='url',
                       value='http://luminaire-verify.top/login',
                       value_lower='http://luminaire-verify.top/login',
                       domain='luminaire-verify.top', source_field='bio'))

    if with_posts:
        post = Post(account_id=acc.id, platform_post_id='p1', post_type='post',
                    permalink='https://example.invalid/p/1',
                    caption='Congratulations you are a lucky winner! Pay a small delivery fee '
                            'immediately to claim your prize.',
                    caption_lower='congratulations you are a lucky winner')
        session.add(post)
        session.flush()
        session.add(MediaAsset(post_id=post.id, media_type='image', mime_type='image/jpeg',
                               width=100, height=100))
        session.add(Comment(post_id=post.id, author_handle='shill_one',
                            text='dm us for help', text_lower='dm us for help'))
    session.flush()
    return acc, brand


# --------------------------------------------------------------------------- recommend_action

@pytest.mark.parametrize('score,cats,conf,expected', [
    (95.0, {'scam_phishing': 90.0}, 0.9, 'enforce'),
    (88.0, {'scam_phishing': 90.0}, 0.4, 'evidence_package'),
    (72.0, {}, 0.9, 'evidence_package'),
    (20.0, {'credential_harvesting': 85.0}, 0.6, 'evidence_package'),
    (20.0, {'credential_harvesting': 85.0}, 0.2, 'monitor'),
    (50.0, {'counterfeit': 10.0}, 0.6, 'investigate'),
    (44.9, {}, 0.99, 'monitor'),
])
def test_recommend_action_thresholds(score, cats, conf, expected):
    assert risk.recommend_action(score, cats, conf) == expected


def test_recommend_action_hard_category_escalates_from_any_of_four():
    for cat in ('credential_harvesting', 'scam_phishing', 'counterfeit', 'brand_impersonation'):
        assert risk.recommend_action(10.0, {cat: 80.0}, 0.5) == 'evidence_package'


def test_recommend_action_enforce_requires_both_score_and_confidence():
    assert risk.recommend_action(85.0, {}, 0.55) == 'enforce'
    assert risk.recommend_action(85.0, {}, 0.54) == 'evidence_package'


# --------------------------------------------------------------------------- fuse

def _heur(overall, cats):
    full = {c: 0.0 for c in risk.CATEGORIES}
    full.update(cats)
    return {'overall_score': overall, 'category_scores': full, 'signals': [], 'notes': []}


def test_fuse_ignores_ai_weight_when_ai_unavailable():
    heur = _heur(60.0, {'counterfeit': 60.0})
    ai = AnalysisResult(available=False, overall_score=99.0,
                        category_scores={'counterfeit': 99.0})
    fused = risk.fuse(heur, ai, 0.6)
    assert fused['category_scores']['counterfeit'] == 60.0
    assert fused['overall_score'] == 60.0


def test_fuse_blends_scores_when_ai_available():
    heur = _heur(40.0, {'scam_phishing': 40.0})
    ai = AnalysisResult(available=True, overall_score=80.0,
                        category_scores={'scam_phishing': 80.0}, confidence=0.7)
    fused = risk.fuse(heur, ai, 0.5)
    assert fused['category_scores']['scam_phishing'] == 60.0
    assert fused['overall_score'] == 60.0


def test_fuse_preserves_strong_single_engine_signal():
    heur = _heur(0.0, {'credential_harvesting': 0.0})
    ai = AnalysisResult(available=True, overall_score=0.0,
                        category_scores={'credential_harvesting': 100.0})
    fused = risk.fuse(heur, ai, 0.1)
    # blended would be 10, floor is 0.75 * 100
    assert fused['category_scores']['credential_harvesting'] == 75.0
    # overall is lifted to at least 0.8 * top category
    assert fused['overall_score'] == 60.0


def test_fuse_clamps_to_100_and_covers_all_categories():
    heur = _heur(100.0, {c: 100.0 for c in risk.CATEGORIES})
    ai = AnalysisResult(available=True, overall_score=100.0,
                        category_scores={c: 100.0 for c in risk.CATEGORIES})
    fused = risk.fuse(heur, ai, 0.5)
    assert set(fused['category_scores']) == set(risk.CATEGORIES)
    assert fused['overall_score'] == 100.0
    assert all(v == 100.0 for v in fused['category_scores'].values())


# --------------------------------------------------------------------------- assess_account (AI up)

def test_assess_account_with_available_ai(session):
    acc, brand = _seed_account(session)
    provider = StubProvider(_ai_result())

    assessment = risk.assess_account(session, acc.id, brand_id=brand.id, provider=provider)

    assert len(provider.calls) == 1
    assert 'heuristic_signals' in provider.calls[0]
    assert assessment.ai_available is True
    assert assessment.ai_score == 88.0
    assert assessment.model == 'stub-model-1'
    assert assessment.engine_version == risk.ENGINE_VERSION
    assert assessment.brand_id == brand.id
    assert assessment.summary.startswith('Coordinated impersonation')
    assert assessment.recommended_action == 'enforce'
    assert 0.0 < assessment.confidence <= 0.97
    assert 0.0 <= assessment.overall_score <= 100.0
    assert set(assessment.category_scores) == set(risk.CATEGORIES)


def test_assess_account_evidence_is_explainable_and_sorted(session):
    acc, brand = _seed_account(session)
    provider = StubProvider(_ai_result())

    assessment = risk.assess_account(session, acc.id, brand_id=brand.id, provider=provider)

    evidence = assessment.evidence
    assert 1 < len(evidence) <= 60
    weights = [e.get('weight', 0) for e in evidence]
    assert weights == sorted(weights, reverse=True)
    sources = {e['source'] for e in evidence}
    assert 'heuristic' in sources and 'ai' in sources
    for item in evidence:
        assert {'source', 'category', 'signal', 'field', 'quote', 'weight',
                'rationale'} <= set(item)
    assert any(e['signal'] == 'login_link' for e in evidence)


def test_assess_account_action_never_downgrades_below_computed(session):
    acc, brand = _seed_account(session)
    # AI says 'monitor' but scores hard categories very high -> computed wins
    provider = StubProvider(_ai_result(recommended_action='monitor'))

    assessment = risk.assess_account(session, acc.id, brand_id=brand.id, provider=provider)
    computed = risk.recommend_action(assessment.overall_score, assessment.category_scores,
                                     assessment.confidence)
    order = ['monitor', 'investigate', 'evidence_package', 'enforce']
    assert order.index(assessment.recommended_action) >= order.index(computed)
    assert order.index(assessment.recommended_action) >= order.index('monitor')


def test_assess_account_ai_limitations_are_merged(session):
    acc, brand = _seed_account(session)
    provider = StubProvider(_ai_result())

    assessment = risk.assess_account(session, acc.id, brand_id=brand.id, provider=provider)

    assert 'model_may_miss_non_english_context' in assessment.limitations
    assert not any(l.startswith('ai_analysis_unavailable') for l in assessment.limitations)
    assert any(l.startswith('automated_assessment') for l in assessment.limitations)
    assert len(assessment.limitations) == len(set(assessment.limitations))
    assert len(assessment.limitations) <= 20


def test_assess_account_confidence_higher_with_ai(session):
    acc, brand = _seed_account(session)
    with_ai = risk.assess_account(session, acc.id, brand_id=brand.id,
                                  provider=StubProvider(_ai_result()))
    without_ai = risk.assess_account(session, acc.id, brand_id=brand.id,
                                     provider=NullAnalysisProvider())
    assert with_ai.confidence > without_ai.confidence


def test_assess_account_media_analysis_removes_media_limitation(session):
    acc, brand = _seed_account(session)
    media = [{'brand_match_score': 0.9, 'note': 'brand mark detected'}]
    assessment = risk.assess_account(session, acc.id, brand_id=brand.id, media_analysis=media,
                                     provider=StubProvider(_ai_result()))
    assert not any(l.startswith('media_analysis_unavailable') for l in assessment.limitations)
    assert assessment.category_scores['logo_misuse'] > 0


# --------------------------------------------------------------------------- assess_account (AI down)

def test_assess_account_without_ai_uses_heuristics_only(session):
    acc, brand = _seed_account(session)
    provider = NullAnalysisProvider()

    assessment = risk.assess_account(session, acc.id, brand_id=brand.id, provider=provider)

    assert assessment.ai_available is False
    assert assessment.ai_score is None
    assert assessment.overall_score >= assessment.heuristic_score - 0.01
    assert assessment.summary.startswith('Heuristic-only assessment of @')
    assert 'Luminaire' in assessment.summary
    assert any(l.startswith('ai_analysis_unavailable') for l in assessment.limitations)
    assert 'ai_provider_not_configured' in assessment.limitations
    assert all(e['source'] == 'heuristic' for e in assessment.evidence)


def test_assess_account_without_ai_flags_missing_context(session):
    acc = Account(platform='instagram', handle='rand0m_user_999',
                  handle_lower='rand0m_user_999', display_name='Random User',
                  biography='just here for fun', provenance={})
    session.add(acc)
    session.flush()

    assessment = risk.assess_account(session, acc.id, provider=NullAnalysisProvider())

    joined = ' '.join(assessment.limitations)
    assert 'no_brand_context' in joined
    assert 'no_post_data' in joined
    assert 'no_comment_data' in joined
    assert assessment.brand_id is None
    assert 'no matched brand context' in assessment.summary
    assert assessment.recommended_action in ('monitor', 'investigate', 'evidence_package',
                                             'enforce')


def test_assess_account_metadata_only_source_limitation(session):
    acc, brand = _seed_account(session)
    assessment = risk.assess_account(session, acc.id, brand_id=brand.id,
                                     provider=NullAnalysisProvider())
    assert any(l.startswith('metadata_only_source') for l in assessment.limitations)


# --------------------------------------------------------------------------- persistence / indexing

def test_assess_account_persists_assessment_and_updates_account(session):
    acc, brand = _seed_account(session)
    assessment = risk.assess_account(session, acc.id, brand_id=brand.id,
                                     provider=StubProvider(_ai_result()))
    session.commit()

    stored = session.get(RiskAssessment, assessment.id)
    assert stored is not None
    assert stored.account_id == acc.id
    assert stored.overall_score == assessment.overall_score
    assert stored.category_scores == assessment.category_scores
    assert stored.evidence == assessment.evidence
    assert stored.limitations == assessment.limitations

    refreshed = session.get(Account, acc.id)
    assert refreshed.latest_risk_score == assessment.overall_score
    assert refreshed.latest_action == assessment.recommended_action


def test_assess_account_refreshes_account_search_index(session):
    acc, brand = _seed_account(session)
    assessment = risk.assess_account(session, acc.id, brand_id=brand.id,
                                     provider=StubProvider(_ai_result()))
    session.flush()

    docs = session.query(SearchDocument).filter(
        SearchDocument.doc_type == 'account',
        SearchDocument.account_id == acc.id).all()
    assert len(docs) == 1
    doc = docs[0]
    assert (doc.handle or '').lower() == acc.handle_lower
    assert doc.risk_score == assessment.overall_score


def test_assess_account_scores_threat_post_beyond_ai_dossier_limit(session):
    acc, brand = _seed_account(session, handle='deals_archive',
                               display_name='Deals Archive', with_posts=False)
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    for index in range(40):
        session.add(Post(
            account_id=acc.id, platform_post_id=f'plain-{index}', post_type='reel',
            permalink=f'https://www.instagram.com/reel/plain{index}/',
            caption='A normal eyewear product review.',
            posted_at=now - dt.timedelta(minutes=index),
        ))
    threat = Post(
        account_id=acc.id, platform_post_id='threat-old', post_type='reel',
        permalink='https://www.instagram.com/reel/threat-old/',
        caption='Luminaire 100₹ frame loot. Link in my Telegram channel. Comment LINK now.',
        posted_at=now - dt.timedelta(days=30),
    )
    session.add(threat)
    session.flush()

    risk.assess_account(session, acc.id, brand_id=brand.id,
                        provider=NullAnalysisProvider())
    threat_doc = session.query(SearchDocument).filter(
        SearchDocument.post_id == threat.id).one()

    assert threat_doc.risk_score >= 85


def test_assess_account_reassessment_keeps_single_account_doc(session):
    acc, brand = _seed_account(session)
    first = risk.assess_account(session, acc.id, brand_id=brand.id,
                                provider=NullAnalysisProvider())
    second = risk.assess_account(session, acc.id, brand_id=brand.id,
                                 provider=StubProvider(_ai_result()))
    session.flush()

    assert session.query(RiskAssessment).filter(
        RiskAssessment.account_id == acc.id).count() == 2
    docs = session.query(SearchDocument).filter(
        SearchDocument.doc_type == 'account',
        SearchDocument.account_id == acc.id).all()
    assert len(docs) == 1
    assert docs[0].risk_score == second.overall_score
    assert first.id != second.id


def test_assess_account_writes_audit_log(session):
    from darkmap.models import AuditLog

    acc, brand = _seed_account(session)
    risk.assess_account(session, acc.id, brand_id=brand.id,
                        provider=StubProvider(_ai_result()))
    session.flush()

    logs = session.query(AuditLog).filter(AuditLog.action == 'risk.assess').all()
    assert len(logs) == 1
    log = logs[0]
    assert log.provider == 'stub'
    assert log.target == acc.handle
    assert log.status == 'ok'
    assert log.detail['ai_available'] is True
    assert log.detail['engine_version'] == risk.ENGINE_VERSION


def test_assess_account_unknown_account_raises(session):
    with pytest.raises(ValueError):
        risk.assess_account(session, 987654, provider=NullAnalysisProvider())

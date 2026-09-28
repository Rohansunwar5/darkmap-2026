'''Risk engine: heuristics + AI fusion into an explainable assessment.'''
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import audit, dossier as dossier_mod, intelligence
from .ai.base import AnalysisProvider, AnalysisResult
from .ai.claude import get_analysis_provider
from .ai.heuristics import CATEGORY_WEIGHTS, analyze as heuristic_analyze
from .config import get_settings
from .models import Account, Post, RiskAssessment, SearchDocument
from .normalize import reindex_account

ENGINE_VERSION = '2.3.0'
CATEGORIES = list(CATEGORY_WEIGHTS.keys())


def recommend_action(score: float, categories: Dict[str, float], confidence: float) -> str:
    hard = max(categories.get('credential_harvesting', 0),
               categories.get('scam_phishing', 0),
               categories.get('counterfeit', 0),
               categories.get('brand_impersonation', 0))
    if score >= 85 and confidence >= 0.55:
        return 'enforce'
    if score >= 70 or (hard >= 80 and confidence >= 0.5):
        return 'evidence_package'
    if score >= 45:
        return 'investigate'
    return 'monitor'


def _limitations(doc: Dict[str, Any], heur: Dict[str, Any], ai: AnalysisResult) -> List[str]:
    out: List[str] = []
    if not ai.available:
        out.append('ai_analysis_unavailable: heuristics-only assessment, lower confidence')
    if 'media_analysis_unavailable' in (heur.get('notes') or []):
        out.append('media_analysis_unavailable: logo/brand-mark detection was not performed; '
                   'logo_misuse is scored from text signals only')
    if not doc.get('brand'):
        out.append('no_brand_context: no protected brand matched this account; impersonation '
                   'and counterfeit scoring is generic')
    if not doc.get('posts'):
        out.append('no_post_data: only profile-level fields were available')
    if not any(p.get('comments') for p in doc.get('posts') or []):
        out.append('no_comment_data: comment-level abuse signals could not be evaluated')
    prov = (doc.get('provenance') or {}).get('lawful_basis')
    if prov == 'permitted_public_page':
        out.append('metadata_only_source: public page ingestion returns open-graph metadata only')
    out.append('automated_assessment: not a legal determination; human review required before '
               'enforcement')
    for item in ai.limitations or []:
        if item not in out:
            out.append(item)
    return out[:20]


def fuse(heur: Dict[str, Any], ai: AnalysisResult, ai_weight: float) -> Dict[str, Any]:
    w = ai_weight if ai.available else 0.0
    cats: Dict[str, float] = {}
    for cat in CATEGORIES:
        h = float(heur['category_scores'].get(cat, 0.0))
        a = float(ai.category_scores.get(cat, 0.0)) if ai.available else 0.0
        blended = h * (1 - w) + a * w
        # a strong, well-evidenced signal from either engine should not be diluted away
        cats[cat] = round(min(100.0, max(blended, 0.75 * max(h, a))), 2)
    overall = round(min(100.0, float(heur['overall_score']) * (1 - w) +
                        (float(ai.overall_score) if ai.available else 0.0) * w), 2)
    overall = round(max(overall, 0.8 * max(cats.values()) if cats else 0.0), 2)
    if (overall >= 85 and 'independent_indicators' in heur
            and int(heur.get('independent_indicators') or 0) < 2):
        overall = 84.0
    return {'overall_score': overall, 'category_scores': cats}


def compute_confidence(heur: Dict[str, Any], ai: AnalysisResult, doc: Dict[str, Any]) -> float:
    conf = 0.35
    if doc.get('brand'):
        conf += 0.1
    if doc.get('posts'):
        conf += 0.1
    if len(heur.get('signals') or []) >= 3:
        conf += 0.1
    if ai.available:
        conf = conf * 0.5 + (0.5 + ai.confidence * 0.5) * 0.5 + 0.1
    if doc.get('media_analysis'):
        conf += 0.05
    return round(max(0.05, min(0.97, conf)), 3)


def _is_registered_official_handle(doc: Dict[str, Any]) -> bool:
    brand = doc.get('brand') or {}
    account = doc.get('account') or {}
    handle = str(account.get('handle') or '').lower().lstrip('@')
    handles = {str(value).lower().lstrip('@') for value in (brand.get('official_handles') or [])}
    return bool(handle and handle in handles)


def _has_trusted_profile_context(doc: Dict[str, Any], heur: Dict[str, Any]) -> bool:
    """Keep AI fusion aligned with the heuristic layer's verified/reach trust guard."""
    return (_is_registered_official_handle(doc)
            or 'established_profile: vocabulary-only alert scoring suppressed'
            in (heur.get('notes') or [])
            or 'incomplete_profile: ungrounded alert scoring suppressed'
            in (heur.get('notes') or []))


def assess_account(session: Session, account_id: int, brand_id: Optional[int] = None,
                   media_analysis: Optional[List[Dict[str, Any]]] = None,
                   provider: Optional[AnalysisProvider] = None) -> RiskAssessment:
    settings = get_settings()
    doc = dossier_mod.build(session, account_id, brand_id=brand_id,
                            media_analysis=media_analysis)
    account = session.get(Account, account_id)
    intelligence.enrich_dossier(session, account, doc)
    heur = heuristic_analyze(doc)

    ai_input = dict(doc)
    ai_input['heuristic_signals'] = heur['signals']
    prov = provider or get_analysis_provider()
    ai = prov.analyze(ai_input)

    fused = fuse(heur, ai, settings.risk_ai_weight)
    trusted_profile_context = _has_trusted_profile_context(doc, heur)
    if trusted_profile_context:
        # The AI sees the same security and banking vocabulary as the heuristic layer. Do not
        # let it reintroduce a fraud label when profile context has already established that the
        # observed content has no concrete harmful flow. Profile-change monitoring remains.
        fused = {'overall_score': 0.0, 'category_scores': {category: 0.0 for category in CATEGORIES}}
    confidence = compute_confidence(heur, ai, doc)
    evidence = list(heur['signals']) + list(ai.evidence)
    evidence.sort(key=lambda e: e.get('weight', 0), reverse=True)
    evidence = evidence[:60]
    limitations = _limitations(doc, heur, ai)
    action = ai.recommended_action if (ai.available and ai.recommended_action) else None
    computed = recommend_action(fused['overall_score'], fused['category_scores'], confidence)
    if trusted_profile_context:
        action = 'monitor'
    elif action is None:
        action = computed
    else:
        order = ['monitor', 'investigate', 'evidence_package', 'enforce']
        action = order[max(order.index(action), order.index(computed))]
    if int(heur.get('independent_indicators') or 0) < 2 and action == 'enforce':
        action = computed

    summary = ai.summary or _fallback_summary(doc, fused, heur)

    assessment = RiskAssessment(
        account_id=account_id,
        brand_id=brand_id or (session.get(Account, account_id).brand_id),
        overall_score=fused['overall_score'],
        category_scores=fused['category_scores'],
        dimensions=heur.get('dimensions') or {},
        alert_families=heur.get('alert_families') or {},
        independent_indicators=heur.get('independent_indicators') or 0,
        evidence=evidence,
        confidence=confidence,
        limitations=limitations,
        recommended_action=action,
        summary=summary,
        heuristic_score=heur['overall_score'],
        ai_score=ai.overall_score if ai.available else None,
        ai_available=ai.available,
        model=ai.model or settings.analysis_model,
        engine_version=ENGINE_VERSION,
    )
    session.add(assessment)

    acc = account
    acc.latest_risk_score = assessment.overall_score
    acc.latest_action = action
    session.flush()

    intelligence_result = intelligence.finalize_assessment(session, acc, assessment, doc)
    reindex_account(session, acc)

    # Search cards represent individual evidence objects. Re-score each post using only that
    # post's caption, OCR, comments and extracted links; otherwise one suspicious profile makes
    # every harmless post from that account appear critical.
    post_by_id = {post.get('id'): post for post in doc.get('posts') or []}
    entities = doc.get('entities') or []
    post_docs = session.scalars(select(SearchDocument).where(
        SearchDocument.account_id == account_id,
        SearchDocument.doc_type == 'post')).all()
    for search_doc in post_docs:
        post = post_by_id.get(search_doc.post_id)
        if not post:
            # The account dossier intentionally caps AI input at 40 posts. Search results may
            # contain more than that, so load and score an omitted post directly instead of
            # silently assigning risk zero to valid threat evidence.
            stored_post = session.get(Post, search_doc.post_id)
            if stored_post is None:
                search_doc.risk_score = 0.0
                continue
            post = dossier_mod.post_document(stored_post)
        post_dossier = dict(doc)
        post_dossier['posts'] = [post]
        post_dossier['entities'] = [entity for entity in entities
                                    if entity.get('post_id') == search_doc.post_id]
        post_dossier['media_analysis'] = [observation for observation
                                          in (doc.get('media_analysis') or [])
                                          if observation.get('post_id') == search_doc.post_id]
        post_dossier['shared_artifacts'] = []
        post_dossier['account_changes'] = []
        post_dossier['content_only'] = True
        search_doc.risk_score = heuristic_analyze(post_dossier)['overall_score']
    session.flush()

    audit.record(session, action='risk.assess', provider=prov.name, target=acc.handle,
                 status='ok', lawful_basis=(acc.provenance or {}).get('lawful_basis'),
                 detail={'score': assessment.overall_score, 'action': action,
                         'ai_available': ai.available, 'signals': len(evidence),
                         'engine_version': ENGINE_VERSION, **intelligence_result})
    return assessment


def _fallback_summary(doc: Dict[str, Any], fused: Dict[str, Any], heur: Dict[str, Any]) -> str:
    handle = (doc.get('account') or {}).get('handle', 'account')
    top = sorted(fused['category_scores'].items(), key=lambda kv: kv[1], reverse=True)[:3]
    top = [f'{k} {v:.0f}' for k, v in top if v > 0]
    brand = (doc.get('brand') or {}).get('name')
    parts = [f'Heuristic-only assessment of @{handle}',
             f'against brand "{brand}"' if brand else 'with no matched brand context',
             f'- overall {fused["overall_score"]:.0f}/100.']
    if top:
        parts.append('Leading categories: ' + ', '.join(top) + '.')
    parts.append(f'{len(heur.get("signals") or [])} deterministic signals fired.')
    return ' '.join(parts)

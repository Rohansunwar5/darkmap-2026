// Port of REF darkmap/risk.py:108-215 (assess_account): heuristics + AI fusion into an explainable assessment.
import { record as auditRecord } from '../audit.js';
import { reindexAccount } from '../normalize.js';
import { utcnowIso } from '../time.js';
import { buildDossier, postDocument } from './dossier.js';
import { analyze } from './heuristics.js';
import { enrichDossier, finalizeAssessment } from './intelligence.js';
import { or, sorted, truthy } from './pycompat.js';
import { CATEGORIES, DEFAULT_ANALYSIS_MODEL, ENGINE_VERSION, computeConfidence, fallbackSummary, fuse,
  hasTrustedProfileContext, limitations as limitationsOf, nullAnalysis, recommendAction } from './risk-core.js';

const NULL_PROVIDER = { name: 'null', analyze: () => nullAnalysis('ai_provider_not_configured') };
const ACTION_ORDER = ['monitor', 'investigate', 'evidence_package', 'enforce'];

export function assessAccount(store, accountId, { brandId = null, mediaAnalysis = null, provider = null, aiWeight = 0.5,
  clock = Date.now } = {}) {
  const doc = buildDossier(store, accountId, { brandId, mediaAnalysis });
  const account = store.table('accounts').get(accountId);
  enrichDossier(store, account, doc, { clock });
  const heur = analyze(doc);

  const prov = provider ?? NULL_PROVIDER;
  const ai = prov.analyze({ ...doc, heuristic_signals: heur.signals });

  let fused = fuse(heur, ai, aiWeight);
  const trustedProfileContext = hasTrustedProfileContext(doc, heur);
  if (trustedProfileContext) {
    // The AI sees the same security and banking vocabulary as the heuristic layer. Do not let it reintroduce a
    // fraud label when profile context has already established that the content has no concrete harmful flow.
    fused = { overall_score: 0.0, category_scores: Object.fromEntries(CATEGORIES.map(category => [category, 0.0])) };
  }
  const confidence = computeConfidence(heur, ai, doc);
  const evidence = sorted([...heur.signals, ...ai.evidence], { key: e => e.weight ?? 0, reverse: true }).slice(0, 60);
  const limitations = limitationsOf(doc, heur, ai);
  let action = ai.available && truthy(ai.recommended_action) ? ai.recommended_action : null;
  const computed = recommendAction(fused.overall_score, fused.category_scores, confidence);
  if (trustedProfileContext) action = 'monitor';
  else if (action == null) action = computed;
  else action = ACTION_ORDER[Math.max(ACTION_ORDER.indexOf(action), ACTION_ORDER.indexOf(computed))];
  if (Math.trunc(Number(or(heur.independent_indicators, 0))) < 2 && action === 'enforce') action = computed;

  const summary = or(ai.summary, fallbackSummary(doc, fused, heur));

  const assessment = store.table('risk_assessments').insert({
    account_id: accountId,
    brand_id: or(brandId, account.brand_id),
    overall_score: fused.overall_score,
    category_scores: fused.category_scores,
    dimensions: or(heur.dimensions, {}),
    alert_families: or(heur.alert_families, {}),
    independent_indicators: or(heur.independent_indicators, 0),
    evidence,
    confidence,
    limitations,
    recommended_action: action,
    summary,
    heuristic_score: heur.overall_score,
    ai_score: ai.available ? ai.overall_score : null,
    ai_available: ai.available,
    model: or(ai.model, DEFAULT_ANALYSIS_MODEL),
    engine_version: ENGINE_VERSION,
    created_at: utcnowIso(clock),
  });

  account.latest_risk_score = assessment.overall_score;
  account.latest_action = action;

  const intelligenceResult = finalizeAssessment(store, account, assessment, doc, { clock });
  reindexAccount(store, account, { clock });

  // Search cards represent individual evidence objects. Re-score each post using only that post's caption, OCR,
  // comments and extracted links; otherwise one suspicious profile makes every harmless post appear critical.
  const postById = new Map(or(doc.posts, []).map(post => [post.id, post]));
  const entities = or(doc.entities, []);
  const postDocs = store.table('search_documents').whereEq('account_id', accountId).filter(d => d.doc_type === 'post');
  for (const searchDoc of postDocs) {
    let post = postById.get(searchDoc.post_id);
    if (!post) {
      // The account dossier caps AI input at 40 posts. Search results may contain more, so load and score an
      // omitted post directly instead of silently assigning risk zero to valid threat evidence.
      const storedPost = store.table('posts').get(searchDoc.post_id);
      if (storedPost == null) {
        searchDoc.risk_score = 0.0;
        continue;
      }
      post = postDocument(store, storedPost);
    }
    const postDossier = { ...doc, posts: [post], entities: entities.filter(e => e.post_id === searchDoc.post_id),
      media_analysis: or(doc.media_analysis, []).filter(o => o.post_id === searchDoc.post_id),
      shared_artifacts: [], account_changes: [], content_only: true };
    searchDoc.risk_score = analyze(postDossier).overall_score;
  }

  auditRecord(store, { action: 'risk.assess', provider: prov.name, target: account.handle, status: 'ok',
    lawful_basis: or(account.provenance, {}).lawful_basis ?? null,
    detail: { score: assessment.overall_score, action, ai_available: ai.available, signals: evidence.length,
      engine_version: ENGINE_VERSION, ...intelligenceResult } }, clock);
  return assessment;
}

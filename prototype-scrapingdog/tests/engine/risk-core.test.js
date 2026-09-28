import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { CATEGORIES, computeConfidence, fallbackSummary, fuse, hasTrustedProfileContext, limitations, nullAnalysis,
  recommendAction } from '../../server/engine/risk-core.js';

const NULL = nullAnalysis('paged_live_search: deterministic risk assessment');

test('fuse/confidence/limitations/trusted/action/summary equal REF on every recorded analysis', () => {
  for (const row of golden('risk-core')) {
    const fused = fuse(row.heur, NULL, 0.5);
    assert.deepEqual(fused, row.fused, row.source);
    const confidence = computeConfidence(row.heur, NULL, row.dossier);
    assert.equal(confidence, row.confidence, row.source);
    assert.deepEqual(limitations(row.dossier, row.heur, NULL), row.limitations, row.source);
    assert.equal(hasTrustedProfileContext(row.dossier, row.heur), row.trusted, row.source);
    assert.equal(recommendAction(fused.overall_score, fused.category_scores, confidence), row.action, row.source);
    assert.equal(fallbackSummary(row.dossier, fused, row.heur), row.summary, row.source);
  }
});

test('REF test_risk_engine: fuse blends only when AI is available and keeps strong single signals', () => {
  const heur = { overall_score: 40, category_scores: { scam_phishing: 40 }, independent_indicators: 2 };
  const ai = { ...NULL, available: true, overall_score: 80, category_scores: { scam_phishing: 80 } };
  assert.equal(fuse(heur, NULL, 0.5).category_scores.scam_phishing, 40);
  assert.equal(fuse(heur, ai, 0.5).category_scores.scam_phishing, 60);
  assert.equal(fuse(heur, ai, 0.5).overall_score, 60);
  assert.deepEqual(Object.keys(fuse(heur, ai, 0.5).category_scores), CATEGORIES);
});

// REF tests/test_risk_engine.py:102-170 and tests/test_advanced_alerts.py:120-131, ported one-to-one.
const available = fields => ({ ...nullAnalysis(''), available: true, ...fields });
const heurOf = (overall, cats) => ({ overall_score: overall,
  category_scores: { ...Object.fromEntries(CATEGORIES.map(c => [c, 0.0])), ...cats }, signals: [], notes: [] });

test('test_recommend_action_thresholds', () => {
  for (const [score, cats, conf, expected] of [
    [95.0, { scam_phishing: 90.0 }, 0.9, 'enforce'],
    [88.0, { scam_phishing: 90.0 }, 0.4, 'evidence_package'],
    [72.0, {}, 0.9, 'evidence_package'],
    [20.0, { credential_harvesting: 85.0 }, 0.6, 'evidence_package'],
    [20.0, { credential_harvesting: 85.0 }, 0.2, 'monitor'],
    [50.0, { counterfeit: 10.0 }, 0.6, 'investigate'],
    [44.9, {}, 0.99, 'monitor'],
  ]) assert.equal(recommendAction(score, cats, conf), expected, `${score} ${JSON.stringify(cats)} ${conf}`);
});

test('test_recommend_action_hard_category_escalates_from_any_of_four', () => {
  for (const cat of ['credential_harvesting', 'scam_phishing', 'counterfeit', 'brand_impersonation']) {
    assert.equal(recommendAction(10.0, { [cat]: 80.0 }, 0.5), 'evidence_package', cat);
  }
});

test('test_recommend_action_enforce_requires_both_score_and_confidence', () => {
  assert.equal(recommendAction(85.0, {}, 0.55), 'enforce');
  assert.equal(recommendAction(85.0, {}, 0.54), 'evidence_package');
});

test('test_fuse_ignores_ai_weight_when_ai_unavailable', () => {
  const ai = { ...nullAnalysis(''), available: false, overall_score: 99.0, category_scores: { counterfeit: 99.0 } };
  const fused = fuse(heurOf(60.0, { counterfeit: 60.0 }), ai, 0.6);
  assert.equal(fused.category_scores.counterfeit, 60.0);
  assert.equal(fused.overall_score, 60.0);
});

test('test_fuse_blends_scores_when_ai_available', () => {
  const ai = available({ overall_score: 80.0, category_scores: { scam_phishing: 80.0 }, confidence: 0.7 });
  const fused = fuse(heurOf(40.0, { scam_phishing: 40.0 }), ai, 0.5);
  assert.equal(fused.category_scores.scam_phishing, 60.0);
  assert.equal(fused.overall_score, 60.0);
});

test('test_fuse_preserves_strong_single_engine_signal', () => {
  const ai = available({ overall_score: 0.0, category_scores: { credential_harvesting: 100.0 } });
  const fused = fuse(heurOf(0.0, { credential_harvesting: 0.0 }), ai, 0.1);
  assert.equal(fused.category_scores.credential_harvesting, 75.0);   // blended would be 10, floor is 0.75 * 100
  assert.equal(fused.overall_score, 60.0);                           // lifted to at least 0.8 * top category
});

test('test_fuse_clamps_to_100_and_covers_all_categories', () => {
  const all100 = Object.fromEntries(CATEGORIES.map(c => [c, 100.0]));
  const fused = fuse(heurOf(100.0, all100), available({ overall_score: 100.0, category_scores: all100 }), 0.5);
  assert.deepEqual(new Set(Object.keys(fused.category_scores)), new Set(CATEGORIES));
  assert.equal(fused.overall_score, 100.0);
  assert.ok(Object.values(fused.category_scores).every(v => v === 100.0));
});

test('test_ai_fusion_cannot_bypass_two_indicator_critical_gate', () => {
  const heuristic = { overall_score: 84, independent_indicators: 1, category_scores: { credential_harvesting: 90 } };
  const ai = available({ overall_score: 100, category_scores: { credential_harvesting: 100 }, confidence: 0.95 });
  assert.equal(fuse(heuristic, ai, 0.65).overall_score, 84);
});

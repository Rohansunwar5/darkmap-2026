// Port of REF tests/test_risk_engine.py:174-403 (assess_account), one test per REF test, same assertions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../server/store.js';
import { ValueError } from '../../server/errors.js';
import { addSeconds, utcnowIso } from '../../server/time.js';
import { assessAccount } from '../../server/engine/risk.js';
import { CATEGORIES, ENGINE_VERSION, nullAnalysis, recommendAction } from '../../server/engine/risk-core.js';

const clock = () => Date.UTC(2026, 8, 23, 12, 0, 0);
const NOW = utcnowIso(clock);

// REF StubProvider: deterministic stand-in for the Claude provider that records every dossier it sees.
function stubProvider(result) {
  const calls = [];
  return { name: 'stub', calls, analyze(dossier) { calls.push(dossier); return result; } };
}

const aiResult = (overrides = {}) => ({ ...nullAnalysis(''), available: true, overall_score: 88.0,
  category_scores: { brand_impersonation: 90.0, credential_harvesting: 84.0, scam_phishing: 70.0 },
  evidence: [
    { source: 'ai', category: 'brand_impersonation', signal: 'logo_and_name_copy', field: 'account.display_name',
      quote: 'Luminaire Official Support', weight: 0.95, rationale: 'display name copies the protected brand' },
    { source: 'ai', category: 'credential_harvesting', signal: 'login_link', field: 'entities.url[bio]',
      quote: 'http://luminaire-verify.top/login', weight: 0.9, rationale: 'links to a credential capture page' },
  ],
  confidence: 0.8, limitations: ['model_may_miss_non_english_context'], recommended_action: 'enforce',
  summary: 'Coordinated impersonation of the protected brand with credential capture.', model: 'stub-model-1',
  raw: { ok: true }, error: null, ...overrides });

const accountRow = fields => ({ platform: 'instagram', platform_account_id: null, display_name: null, biography: null,
  external_url: null, profile_pic_url: null, is_verified: null, is_business: null, followers_count: null,
  follows_count: null, media_count: null, account_created_at: null, first_seen_at: NOW, last_seen_at: NOW,
  brand_id: null, latest_risk_score: null, latest_action: null, provenance: {}, raw: {}, ...fields });
const postRow = fields => ({ platform_post_id: null, shortcode: null, post_type: 'post', permalink: null, caption: null,
  caption_lower: null, posted_at: null, like_count: null, comment_count: null, view_count: null, share_count: null,
  language: null, provenance: {}, raw: {}, ingested_at: NOW, ...fields });

// REF _seed_account: rows inserted by hand, with no search documents yet.
function seedAccount(store, { handle = 'luminaire.support.help', displayName = 'Luminaire Official Support',
  withPosts = true } = {}) {
  const brand = store.table('brands').insert({ name: 'Luminaire', official_handles: ['luminaire'],
    official_domains: ['luminaire.com'], keywords: ['Luminaire Glow'], created_at: NOW });
  const acc = store.table('accounts').insert(accountRow({ platform_account_id: 'acc-1', handle,
    handle_lower: handle.toLowerCase(), display_name: displayName,
    biography: 'Official account. Verify your account within 24 hours or it will be disabled. '
      + 'http://luminaire-verify.top/login',
    external_url: 'http://luminaire-verify.top/login', followers_count: 120, brand_id: brand.id,
    provenance: { lawful_basis: 'permitted_public_page' } }));
  store.table('entities').insert({ account_id: acc.id, post_id: null, comment_id: null, kind: 'url',
    value: 'http://luminaire-verify.top/login', value_lower: 'http://luminaire-verify.top/login',
    domain: 'luminaire-verify.top', source_field: 'bio', created_at: NOW });
  if (withPosts) {
    const post = store.table('posts').insert(postRow({ account_id: acc.id, platform_post_id: 'p1', post_type: 'post',
      permalink: 'https://example.invalid/p/1',
      caption: 'Congratulations you are a lucky winner! Pay a small delivery fee immediately to claim your prize.',
      caption_lower: 'congratulations you are a lucky winner' }));
    store.table('media_assets').insert({ post_id: post.id, media_type: 'image', media_url: null, thumbnail_url: null,
      width: 100, height: 100, duration_seconds: null, mime_type: 'image/jpeg', byte_size: null, perceptual_hash: null,
      ocr_text: null, exif: {}, provenance: {} });
    store.table('comments').insert({ post_id: post.id, platform_comment_id: null, parent_platform_comment_id: null,
      author_handle: 'shill_one', text: 'dm us for help', text_lower: 'dm us for help', like_count: null,
      created_at: null, provenance: {} });
  }
  return { acc, brand };
}

test('test_assess_account_with_available_ai', () => {
  const store = createStore();
  const { acc, brand } = seedAccount(store);
  const provider = stubProvider(aiResult());
  const assessment = assessAccount(store, acc.id, { brandId: brand.id, provider, clock });
  assert.equal(provider.calls.length, 1);
  assert.ok('heuristic_signals' in provider.calls[0]);
  assert.equal(assessment.ai_available, true);
  assert.equal(assessment.ai_score, 88.0);
  assert.equal(assessment.model, 'stub-model-1');
  assert.equal(assessment.engine_version, ENGINE_VERSION);
  assert.equal(assessment.brand_id, brand.id);
  assert.ok(assessment.summary.startsWith('Coordinated impersonation'));
  assert.equal(assessment.recommended_action, 'enforce');
  assert.ok(assessment.confidence > 0.0 && assessment.confidence <= 0.97);
  assert.ok(assessment.overall_score >= 0.0 && assessment.overall_score <= 100.0);
  assert.deepEqual(new Set(Object.keys(assessment.category_scores)), new Set(CATEGORIES));
});

test('test_assess_account_evidence_is_explainable_and_sorted', () => {
  const store = createStore();
  const { acc, brand } = seedAccount(store);
  const { evidence } = assessAccount(store, acc.id, { brandId: brand.id, provider: stubProvider(aiResult()), clock });
  assert.ok(evidence.length > 1 && evidence.length <= 60);
  const weights = evidence.map(e => e.weight ?? 0);
  assert.deepEqual(weights, [...weights].sort((a, b) => b - a));
  const sources = new Set(evidence.map(e => e.source));
  assert.ok(sources.has('heuristic') && sources.has('ai'));
  for (const item of evidence) {
    for (const key of ['source', 'category', 'signal', 'field', 'quote', 'weight', 'rationale']) assert.ok(key in item, key);
  }
  assert.ok(evidence.some(e => e.signal === 'login_link'));
});

test('test_assess_account_action_never_downgrades_below_computed', () => {
  const store = createStore();
  const { acc, brand } = seedAccount(store);
  // AI says 'monitor' but scores hard categories very high -> computed wins
  const assessment = assessAccount(store, acc.id, { brandId: brand.id,
    provider: stubProvider(aiResult({ recommended_action: 'monitor' })), clock });
  const computed = recommendAction(assessment.overall_score, assessment.category_scores, assessment.confidence);
  const order = ['monitor', 'investigate', 'evidence_package', 'enforce'];
  assert.ok(order.indexOf(assessment.recommended_action) >= order.indexOf(computed));
  assert.ok(order.indexOf(assessment.recommended_action) >= order.indexOf('monitor'));
});

test('test_assess_account_ai_limitations_are_merged', () => {
  const store = createStore();
  const { acc, brand } = seedAccount(store);
  const { limitations } = assessAccount(store, acc.id, { brandId: brand.id, provider: stubProvider(aiResult()), clock });
  assert.ok(limitations.includes('model_may_miss_non_english_context'));
  assert.ok(!limitations.some(l => l.startsWith('ai_analysis_unavailable')));
  assert.ok(limitations.some(l => l.startsWith('automated_assessment')));
  assert.equal(limitations.length, new Set(limitations).size);
  assert.ok(limitations.length <= 20);
});

test('test_assess_account_confidence_higher_with_ai', () => {
  const store = createStore();
  const { acc, brand } = seedAccount(store);
  const withAi = assessAccount(store, acc.id, { brandId: brand.id, provider: stubProvider(aiResult()), clock });
  const withoutAi = assessAccount(store, acc.id, { brandId: brand.id, clock });
  assert.ok(withAi.confidence > withoutAi.confidence);
});

test('test_assess_account_media_analysis_removes_media_limitation', () => {
  const store = createStore();
  const { acc, brand } = seedAccount(store);
  const assessment = assessAccount(store, acc.id, { brandId: brand.id,
    mediaAnalysis: [{ brand_match_score: 0.9, note: 'brand mark detected' }], provider: stubProvider(aiResult()), clock });
  assert.ok(!assessment.limitations.some(l => l.startsWith('media_analysis_unavailable')));
  assert.ok(assessment.category_scores.logo_misuse > 0);
});

test('test_assess_account_without_ai_uses_heuristics_only', () => {
  const store = createStore();
  const { acc, brand } = seedAccount(store);
  const assessment = assessAccount(store, acc.id, { brandId: brand.id, clock });
  assert.equal(assessment.ai_available, false);
  assert.equal(assessment.ai_score, null);
  assert.ok(assessment.overall_score >= assessment.heuristic_score - 0.01);
  assert.ok(assessment.summary.startsWith('Heuristic-only assessment of @'));
  assert.ok(assessment.summary.includes('Luminaire'));
  assert.ok(assessment.limitations.some(l => l.startsWith('ai_analysis_unavailable')));
  assert.ok(assessment.limitations.includes('ai_provider_not_configured'));
  assert.ok(assessment.evidence.every(e => e.source === 'heuristic'));
});

test('test_assess_account_without_ai_flags_missing_context', () => {
  const store = createStore();
  const acc = store.table('accounts').insert(accountRow({ handle: 'rand0m_user_999', handle_lower: 'rand0m_user_999',
    display_name: 'Random User', biography: 'just here for fun', provenance: {} }));
  const assessment = assessAccount(store, acc.id, { clock });
  const joined = assessment.limitations.join(' ');
  assert.ok(joined.includes('no_brand_context'));
  assert.ok(joined.includes('no_post_data'));
  assert.ok(joined.includes('no_comment_data'));
  assert.equal(assessment.brand_id, null);
  assert.ok(assessment.summary.includes('no matched brand context'));
  assert.ok(['monitor', 'investigate', 'evidence_package', 'enforce'].includes(assessment.recommended_action));
});

test('test_assess_account_metadata_only_source_limitation', () => {
  const store = createStore();
  const { acc, brand } = seedAccount(store);
  const assessment = assessAccount(store, acc.id, { brandId: brand.id, clock });
  assert.ok(assessment.limitations.some(l => l.startsWith('metadata_only_source')));
});

test('test_assess_account_persists_assessment_and_updates_account', () => {
  const store = createStore();
  const { acc, brand } = seedAccount(store);
  const assessment = assessAccount(store, acc.id, { brandId: brand.id, provider: stubProvider(aiResult()), clock });
  const stored = store.table('risk_assessments').get(assessment.id);
  assert.ok(stored != null);
  assert.equal(stored.account_id, acc.id);
  assert.equal(stored.overall_score, assessment.overall_score);
  assert.deepEqual(stored.category_scores, assessment.category_scores);
  assert.deepEqual(stored.evidence, assessment.evidence);
  assert.deepEqual(stored.limitations, assessment.limitations);
  const refreshed = store.table('accounts').get(acc.id);
  assert.equal(refreshed.latest_risk_score, assessment.overall_score);
  assert.equal(refreshed.latest_action, assessment.recommended_action);
});

test('test_assess_account_refreshes_account_search_index', () => {
  const store = createStore();
  const { acc, brand } = seedAccount(store);
  const assessment = assessAccount(store, acc.id, { brandId: brand.id, provider: stubProvider(aiResult()), clock });
  const docs = store.table('search_documents').where(d => d.doc_type === 'account' && d.account_id === acc.id);
  assert.equal(docs.length, 1);
  assert.equal((docs[0].handle || '').toLowerCase(), acc.handle_lower);
  assert.equal(docs[0].risk_score, assessment.overall_score);
});

test('test_assess_account_scores_threat_post_beyond_ai_dossier_limit', () => {
  const store = createStore();
  const { acc, brand } = seedAccount(store, { handle: 'deals_archive', displayName: 'Deals Archive', withPosts: false });
  for (let index = 0; index < 40; index++) {
    store.table('posts').insert(postRow({ account_id: acc.id, platform_post_id: `plain-${index}`, post_type: 'reel',
      permalink: `https://www.instagram.com/reel/plain${index}/`, caption: 'A normal eyewear product review.',
      posted_at: addSeconds(NOW, -60 * index) }));
  }
  const threat = store.table('posts').insert(postRow({ account_id: acc.id, platform_post_id: 'threat-old',
    post_type: 'reel', permalink: 'https://www.instagram.com/reel/threat-old/',
    caption: 'Luminaire 100₹ frame loot. Link in my Telegram channel. Comment LINK now.',
    posted_at: addSeconds(NOW, -30 * 86400) }));
  assessAccount(store, acc.id, { brandId: brand.id, clock });
  const threatDocs = store.table('search_documents').where(d => d.post_id === threat.id);
  assert.equal(threatDocs.length, 1);
  assert.ok(threatDocs[0].risk_score >= 85, String(threatDocs[0].risk_score));
});

test('test_assess_account_reassessment_keeps_single_account_doc', () => {
  const store = createStore();
  const { acc, brand } = seedAccount(store);
  const first = assessAccount(store, acc.id, { brandId: brand.id, clock });
  const second = assessAccount(store, acc.id, { brandId: brand.id, provider: stubProvider(aiResult()), clock });
  assert.equal(store.table('risk_assessments').where(r => r.account_id === acc.id).length, 2);
  const docs = store.table('search_documents').where(d => d.doc_type === 'account' && d.account_id === acc.id);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].risk_score, second.overall_score);
  assert.notEqual(first.id, second.id);
});

test('test_assess_account_writes_audit_log', () => {
  const store = createStore();
  const { acc, brand } = seedAccount(store);
  assessAccount(store, acc.id, { brandId: brand.id, provider: stubProvider(aiResult()), clock });
  const logs = store.table('audit_logs').where(l => l.action === 'risk.assess');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].provider, 'stub');
  assert.equal(logs[0].target, acc.handle);
  assert.equal(logs[0].status, 'ok');
  assert.equal(logs[0].detail.ai_available, true);
  assert.equal(logs[0].detail.engine_version, ENGINE_VERSION);
});

test('test_assess_account_unknown_account_raises', () => {
  const store = createStore();
  assert.throws(() => assessAccount(store, 987654, { clock }), ValueError);
});

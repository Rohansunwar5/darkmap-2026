import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../server/store.js';
import { rawAccount, rawBundle, rawPost } from '../../server/raw.js';
import { ingestBundle } from '../../server/normalize.js';
import { buildDossier } from '../../server/engine/dossier.js';
import { enrichDossier, finalizeAssessment, profileChanges, sharedArtifactContext, velocityContext }
  from '../../server/engine/intelligence.js';

const fetched = { provider: 'scrapingdog_instagram', collection_mode: 'keyword', lawful_basis: 'licensed_public_data_api' };
const snippet = { ...fetched, collection_mode: 'keyword_serp_fallback' };
const clock = () => Date.UTC(2026, 8, 23, 12, 0, 0);

test('dossier caps posts at 40 (newest first, SQLite order) and comments at 12', () => {
  const store = createStore();
  const posts = Array.from({ length: 45 }, (_, i) => rawPost({ platform_post_id: `p${i}`, shortcode: `S${i}`,
    posted_at: `2026-09-${String(1 + (i % 20)).padStart(2, '0')}T00:00:00`, caption: `c${i}` }));
  const { account_id } = ingestBundle(store, rawBundle(rawAccount({ handle: 'many' }), posts, fetched), { clock });
  const doc = buildDossier(store, account_id);
  assert.equal(doc.posts.length, 40);
  assert.ok(doc.posts[0].posted_at >= doc.posts[39].posted_at);
  assert.deepEqual(Object.keys(doc), ['brand', 'account', 'provenance', 'posts', 'entities', 'media_analysis']);
});

test('shared artifacts link accounts that reuse a UPI id or URL', () => {
  const store = createStore();
  const upi = rawPost({ platform_post_id: '1', shortcode: 'A', caption: 'pay to scam.help@ybl now' });
  const a = ingestBundle(store, rawBundle(rawAccount({ handle: 'one' }), [upi], fetched), { clock });
  const b = ingestBundle(store, rawBundle(rawAccount({ handle: 'two' }), [{ ...upi, platform_post_id: '2', shortcode: 'B' }], fetched), { clock });
  const shared = sharedArtifactContext(store, a.account_id);
  assert.deepEqual(shared.map(s => [s.kind, s.value, s.account_count, s.linked_account_ids]),
    [['upi', 'scam.help@ybl', 2, [b.account_id]]]);
});

test('profile changes use fetched snapshots only (FIX-1 consequence) and velocity counts recent posts', () => {
  const store = createStore();
  const first = ingestBundle(store, rawBundle(rawAccount({ handle: 'brandx', display_name: 'brandx' }), [], snippet), { clock });
  const account = store.table('accounts').get(first.account_id);
  const assessment = store.table('risk_assessments').insert({ account_id: account.id, overall_score: 0, evidence: [] });
  finalizeAssessment(store, account, assessment, { account_changes: [], shared_artifacts: [], posts: [], account: {} }, { clock });
  assert.equal(store.table('account_snapshots').count(), 0, 'discovery-grade state is never snapshotted');
  ingestBundle(store, rawBundle(rawAccount({ handle: 'brandx', display_name: 'Brand X Official', biography: 'Real bio' }), [], fetched), { clock });
  assert.deepEqual(profileChanges(store, account, { clock }), [], 'first fetched profile has no prior snapshot');
  finalizeAssessment(store, account, assessment, { account_changes: [], shared_artifacts: [], posts: [], account: {} }, { clock });
  assert.equal(store.table('account_snapshots').count(), 1);
  account.biography = 'Changed bio';
  assert.deepEqual(profileChanges(store, account, { clock }).map(c => c.field), ['biography']);
  const velocity = velocityContext(store, account, { clock });
  assert.deepEqual(Object.keys(velocity), ['posts_last_hour', 'posts_last_24h', 'follower_delta', 'duplicate_post_count']);
});

test('enrichDossier adds account_changes, shared_artifacts and velocity in REF order', () => {
  const store = createStore();
  const { account_id } = ingestBundle(store, rawBundle(rawAccount({ handle: 'solo' }), [], fetched), { clock });
  const doc = buildDossier(store, account_id);
  enrichDossier(store, store.table('accounts').get(account_id), doc, { clock });
  assert.deepEqual(Object.keys(doc).slice(-3), ['account_changes', 'shared_artifacts', 'velocity']);
});

test('finalizeAssessment preserves weighty evidence per post and clusters accounts that share a pivot', () => {
  const store = createStore();
  const upi = rawPost({ platform_post_id: '1', shortcode: 'A', permalink: 'https://www.instagram.com/p/A/',
    caption: 'pay to scam.help@ybl now' });
  const a = ingestBundle(store, rawBundle(rawAccount({ handle: 'one' }), [upi], fetched), { clock });
  const b = ingestBundle(store, rawBundle(rawAccount({ handle: 'two' }), [{ ...upi, platform_post_id: '2', shortcode: 'B',
    permalink: 'https://www.instagram.com/p/B/' }], fetched), { clock });
  const account = store.table('accounts').get(a.account_id);
  const doc = buildDossier(store, account.id);
  enrichDossier(store, account, doc, { clock });
  const assessment = store.table('risk_assessments').insert({ account_id: account.id, brand_id: null, overall_score: 72,
    dimensions: { harm: 60 }, evidence: [{ signal: 'upi_identifier_exposed', field: 'posts[0].caption', weight: 0.58 },
      { signal: 'weak', field: 'account.handle', weight: 0.3 }] });
  const result = finalizeAssessment(store, account, assessment, doc, { clock });
  assert.equal(result.evidence_artifacts, 1);
  const [artifact] = store.table('evidence_artifacts').all();
  assert.deepEqual([artifact.post_id, artifact.source_url, artifact.kind], [doc.posts[0].id, 'https://www.instagram.com/p/A/', 'risk_signal']);
  const [campaign] = store.table('campaigns').all();
  assert.equal(result.campaign_id, campaign.public_id);
  assert.deepEqual([campaign.name, campaign.severity, campaign.status], ['Shared upi: scam.help@ybl', 72, 'open']);
  assert.deepEqual(store.table('campaign_members').all().map(m => [m.account_id, m.confidence]),
    [[a.account_id, 0.63], [b.account_id, 0.63]]);
  finalizeAssessment(store, account, assessment, doc, { clock });
  assert.equal(store.table('campaigns').count(), 1);
  assert.equal(store.table('campaign_members').count(), 2);
});

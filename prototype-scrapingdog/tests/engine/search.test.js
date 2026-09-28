// REF search.py port: golden snippets, REF tests/test_integration_controls.py:164-293, and two SQLite-order checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { createStore } from '../../server/store.js';
import { search, snippet } from '../../server/engine/search.js';

// REF inserts Account/SearchDocument rows by hand; missing columns take REF's model defaults.
const addAccount = (store, fields) => store.table('accounts').insert({ platform: 'instagram', display_name: null,
  biography: null, external_url: null, profile_pic_url: null, is_verified: null, followers_count: null,
  follows_count: null, media_count: null, latest_risk_score: null, provenance: {}, raw: {}, ...fields });
const addDoc = (store, fields) => store.table('search_documents').insert({ post_id: null, handle: null, title: null,
  body: null, body_lower: null, hashtags: [], mentions: [], domains: [], risk_score: null, posted_at: null, ...fields });

test('snippet equals REF _snippet', () => {
  const cases = golden('snippets');
  assert.ok(cases.length >= 5);
  for (const [body, term, expected] of cases) assert.equal(snippet(body, term), expected, JSON.stringify([body, term]));
});

test('test_search_treats_like_wildcards_as_literals', () => {
  const store = createStore();
  const plain = addAccount(store, { handle: 'plain', handle_lower: 'plain' });
  const sale = addAccount(store, { handle: 'sale_percent', handle_lower: 'sale_percent' });
  addDoc(store, { doc_type: 'account', account_id: plain.id, handle: 'plain', title: 'Plain', body: 'ordinary text',
    body_lower: 'ordinary text' });
  addDoc(store, { doc_type: 'account', account_id: sale.id, handle: 'sale_percent', title: 'Sale',
    body: 'save 50% today', body_lower: 'save 50% today' });
  const result = search(store, { q: '%' });
  assert.equal(result.total, 1);
  assert.equal(result.hits[0].account_id, sale.id);
});

test('test_global_search_covers_structured_entities_and_scopes', () => {
  const store = createStore();
  const acc = addAccount(store, { handle: 'signals', handle_lower: 'signals' });
  addDoc(store, { doc_type: 'post', account_id: acc.id, handle: 'signals', title: 'Unrelated caption',
    body: 'ordinary text', body_lower: 'ordinary text', hashtags: ['watchlist'], mentions: ['brand_help'],
    domains: ['suspicious.example'] });
  const hashtagResult = search(store, { q: 'watchlist', scope: 'hashtags' });
  assert.equal(hashtagResult.total, 1);
  assert.equal(hashtagResult.facets.hashtags, 1);
  assert.deepEqual(hashtagResult.hits[0].matched_fields, ['hashtags']);
  assert.equal(search(store, { q: 'watchlist', scope: 'hashtags', accountIds: [999] }).total, 0);
  const urlResult = search(store, { q: 'suspicious', scope: 'urls' });
  assert.equal(urlResult.total, 1);
  assert.ok(urlResult.hits[0].matched_fields.includes('urls'));
  assert.equal(search(store, { q: 'watchlist', scope: 'accounts' }).total, 0);
});

test('test_global_search_prioritizes_high_risk_impostor_over_official_exact_match', () => {
  const store = createStore();
  const official = addAccount(store, { handle: 'lenskart', handle_lower: 'lenskart', is_verified: true,
    latest_risk_score: 0 });
  const impostor = addAccount(store, { handle: 'lenskart.support', handle_lower: 'lenskart.support',
    latest_risk_score: 90 });
  addDoc(store, { doc_type: 'account', account_id: official.id, handle: 'lenskart', title: 'Lenskart',
    body: 'official lenskart', body_lower: 'official lenskart', risk_score: 0 });
  addDoc(store, { doc_type: 'account', account_id: impostor.id, handle: 'lenskart.support', title: 'Lenskart Support',
    body: 'lenskart help', body_lower: 'lenskart help', risk_score: 90 });
  assert.equal(search(store, { q: 'lenskart' }).hits[0].handle, 'lenskart.support');
});

test('test_global_search_prioritizes_low_follower_mentions_at_equal_risk', () => {
  const store = createStore();
  const large = addAccount(store, { handle: 'large.news', handle_lower: 'large.news', followers_count: 420_000,
    latest_risk_score: 20 });
  const small = addAccount(store, { handle: 'small.offer', handle_lower: 'small.offer', followers_count: 45,
    latest_risk_score: 20 });
  addDoc(store, { doc_type: 'account', account_id: large.id, handle: 'large.news', title: 'Large news',
    body: 'lenskart update', body_lower: 'lenskart update', risk_score: 20 });
  addDoc(store, { doc_type: 'account', account_id: small.id, handle: 'small.offer', title: 'Small offer',
    body: 'lenskart update', body_lower: 'lenskart update', risk_score: 20 });
  const result = search(store, { q: 'lenskart' });
  assert.deepEqual(result.hits.slice(0, 2).map(hit => hit.handle), ['small.offer', 'large.news']);
  assert.equal(result.hits[0].ranking_factors.low_follower_priority, 2.6);
  assert.equal(result.hits[1].ranking_factors.low_follower_priority, -0.8);
});

test('test_search_uses_profile_photo_when_reel_only_has_a_video_file', () => {
  const store = createStore();
  const account = addAccount(store, { handle: 'brand.video', handle_lower: 'brand.video',
    profile_pic_url: 'https://cdn.example/profile.jpg' });
  const post = store.table('posts').insert({ account_id: account.id, platform_post_id: 'video-1', post_type: 'reel',
    permalink: 'https://www.instagram.com/reel/VIDEO1/', caption: 'brand offer', provenance: {} });
  store.table('media_assets').insert({ post_id: post.id, media_type: 'video', media_url: 'https://cdn.example/reel.mp4',
    thumbnail_url: null });
  addDoc(store, { doc_type: 'post', account_id: account.id, post_id: post.id, handle: 'brand.video',
    title: 'Brand video', body: 'brand offer', body_lower: 'brand offer', risk_score: 10 });
  const [hit] = search(store, { q: 'brand' }).hits;
  assert.equal(hit.image_url, 'https://cdn.example/profile.jpg');
  assert.equal(hit.profile_pic_url, 'https://cdn.example/profile.jpg');
});

test('test_strong_fraud_evidence_still_outranks_follower_adjustment', () => {
  const store = createStore();
  const phish = addAccount(store, { handle: 'large.phish', handle_lower: 'large.phish', followers_count: 250_000,
    latest_risk_score: 95 });
  const mention = addAccount(store, { handle: 'small.mention', handle_lower: 'small.mention', followers_count: 12,
    latest_risk_score: 0 });
  addDoc(store, { doc_type: 'account', account_id: phish.id, handle: 'large.phish', title: 'Large phish',
    body: 'lenskart login scam', body_lower: 'lenskart login scam', risk_score: 95 });
  addDoc(store, { doc_type: 'account', account_id: mention.id, handle: 'small.mention', title: 'Small mention',
    body: 'lenskart mention', body_lower: 'lenskart mention', risk_score: 0 });
  assert.equal(search(store, { q: 'lenskart' }).hits[0].handle, 'large.phish');
});

test('account_ids order follows SQLite: account_id ascending, ties keep that order', () => {
  const store = createStore();
  const one = addAccount(store, { handle: 'one', handle_lower: 'one' });
  const two = addAccount(store, { handle: 'two', handle_lower: 'two' });
  addDoc(store, { doc_type: 'account', account_id: two.id, handle: 'x', title: 'x', body: 'x', body_lower: 'x' });
  addDoc(store, { doc_type: 'account', account_id: one.id, handle: 'y', title: 'y', body: 'y', body_lower: 'y' });
  const result = search(store, { accountIds: [two.id, one.id] });
  assert.deepEqual(result.hits.map(hit => hit.account_id), [one.id, two.id]);
});

test('non-ASCII title does not match under SQLite lower()', () => {
  const store = createStore();
  const acc = addAccount(store, { handle: 'school', handle_lower: 'school', display_name: 'ÉCOLE' });
  // The body must not contain the name: body_lower is Python-lowered, so it would match as content.
  addDoc(store, { doc_type: 'account', account_id: acc.id, handle: 'school', title: 'ÉCOLE', body: 'unrelated',
    body_lower: 'unrelated' });
  assert.equal(search(store, { q: 'école' }).total, 0);
  assert.deepEqual(search(store, { q: 'cole' }).hits.map(hit => hit.matched_fields), [['title']]);
});

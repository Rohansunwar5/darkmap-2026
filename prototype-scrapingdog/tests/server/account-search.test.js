// Ports of REF tests/test_bright_data_instagram.py (account search, keyword fallbacks, the inline Vercel job) onto
// the fake ScrapingDog client, plus REF's failure wording.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeClient, fakeClock } from '../helpers/fake-scrapingdog.js';
import { createStore } from '../../server/store.js';
import { loadConfig } from '../../server/config.js';
import { FetchFailed, NotFound } from '../../server/errors.js';
import { buildDossier } from '../../server/engine/dossier.js';
import { inlineIngest } from '../../server/account-search.js';

const recorded = name => JSON.parse(readFileSync(new URL(`../fixtures/scrapingdog/${name}.json`, import.meta.url), 'utf8')).json;

function env(payload, handler, store = createStore()) {
  const clock = fakeClock();
  return { store, client: fakeClient(handler, { clock }), config: loadConfig({ SCRAPINGDOG_API_KEY: 'k' }),
    jobPayload: { provider: 'scrapingdog_instagram', brand_id: null, analyze: true, ...payload,
      params: { max_items: 250, include_comments: true, comments_per_post: 20, profile_limit: 50, ...payload.params } },
    query: payload.handle, clock: clock.now, monotonic: clock.monotonic };
}

test('REF test_account_collection_uses_bright_data_key_and_normalizes_profile (recorded ScrapingDog profile)', async () => {
  const ctx = env({ handle: '@nike', params: { mode: 'account' } }, endpoint => {
    if (endpoint === 'profile') return { json: recorded('profile'), credits: 15 };
    if (endpoint === 'posts') return { json: recorded('posts'), credits: 15 };
    return { json: recorded('comments'), credits: 15 };
  });
  const job = await inlineIngest(ctx);
  assert.equal(job.status, 'succeeded', job.error);
  assert.deepEqual(ctx.client.calls[0], ['profile', { username: 'nike' }]);
  assert.deepEqual(ctx.client.calls[1], ['posts', { id: '13460080' }]);
  const account = ctx.store.table('accounts').get(job.result.account_id);
  const profile = recorded('profile');
  assert.deepEqual([account.handle, account.followers_count, account.biography, account.profile_pic_url, account.is_verified,
    account.external_url, account.media_count],
  ['nike', 291145856, 'Just Do It.', profile.profile_pic_url_hd, true, 'http://empli.fi/nike', 1667]);
  assert.equal(account.provenance.provider, 'scrapingdog_instagram');
  assert.equal(account.provenance.collection_mode, 'account');
  const dossier = buildDossier(ctx.store, account.id);
  assert.equal(dossier.posts.length, 12, 'the dossier gets the profile recent posts');
  assert.equal(dossier.posts.find(p => p.permalink === 'https://www.instagram.com/reel/Ddl5eH-u4le/').engagement.likes, 51946);
  assert.ok(dossier.posts.every(p => p.comments.length > 0), 'comments come from the Comments API for every post');
});

test('REF test_keyword_empty_serp_falls_back_to_exact_profile', async () => {
  const ctx = env({ handle: 'Amazon', params: { mode: 'keyword' } }, (endpoint, params) => {
    if (endpoint.startsWith('google')) return { json: { organic_results: [] }, credits: 5 };
    if (endpoint === 'profile' && params.username === 'amazon') {
      return { json: { username: 'amazon', profile_id: '1', full_name: 'Amazon', followers_count: 1000,
        profile_pic_url: 'https://cdn.example/amazon.jpg' }, credits: 15 };
    }
    if (endpoint === 'posts') {
      return { json: { total_posts: 1, posts_data: [{ id: 'post-1', shortcode: 'AMAZON1', is_video: false,
        caption: 'Amazon delivery update', display_url: 'https://cdn.example/post.jpg', owner: { username: 'amazon' } }] },
      credits: 15 };
    }
    if (endpoint === 'comments') return { json: { comments: [] }, credits: 15 };
    throw Object.assign(new NotFound('no such handle'), { credits: 15 });
  });
  const job = await inlineIngest(ctx);
  assert.equal(job.status, 'succeeded', job.error);
  const googles = ctx.client.calls.filter(([e]) => e.startsWith('google'));
  assert.equal(googles.length, 17 + 5, 'the five critical searches are retried once when empty');
  assert.equal(googles.filter(([e]) => e === 'google_advanced').length, 10);
  const probes = new Set(ctx.client.calls.filter(([e]) => e === 'profile').map(([, p]) => p.username));
  for (const name of ['amazon', 'amazon.official', 'amazon.support']) assert.ok(probes.has(name), name);
  assert.equal(job.result.account_count, 1);
  const account = ctx.store.table('accounts').get(job.result.account_id);
  assert.equal(account.handle, 'amazon');
  assert.equal(account.profile_pic_url, 'https://cdn.example/amazon.jpg');
  assert.equal(job.result.posts, 1);
});

test('REF :205-281 threat SERP keeps the author and post when post details keep failing', async () => {
  const reel = 'https://www.instagram.com/reel/DY7HQHHglVD/';
  let firstQuery = true;
  const ctx = env({ handle: 'Lenskart', params: { mode: 'keyword' } }, endpoint => {
    if (endpoint.startsWith('google')) {
      const organic = firstQuery ? [{ link: reel, source: 'Instagram · shopaholics80club',
        title: 'Lenskart 100₹ frame loot Link in my telegram channel', snippet: '@lenskart #lenskart #shopping #loot' }] : [];
      firstQuery = false;
      return { json: { organic_results: organic }, credits: 10 };
    }
    if (endpoint === 'post') throw new FetchFailed('500 from /instagram/post_details', { statusCode: 500 });
    if (endpoint === 'comments') return { json: { comments: [] }, credits: 15 };
    throw Object.assign(new NotFound('no such handle'), { credits: 15 });
  });
  const job = await inlineIngest(ctx);
  assert.equal(job.status, 'succeeded', job.error);
  assert.equal(ctx.client.calls.filter(([e]) => e === 'post').length, 3);
  assert.equal(job.result.collection_partial, true);
  assert.equal(job.result.inline_search.complete_collection, false);
  const account = ctx.store.table('accounts').find(a => a.handle === 'shopaholics80club');
  const posts = ctx.store.table('posts').where(p => p.account_id === account.id);
  assert.equal(posts.length, 1);
  assert.ok(posts[0].caption.includes('100₹ frame loot'));
  assert.ok(posts[0].permalink.endsWith('/DY7HQHHglVD/'));
  assert.equal(ctx.store.table('posts').where(p => (p.permalink ?? '').endsWith('/DY7HQHHglVD/')).length, 1);
});

test('REF test_vercel_search_returns_terminal_job_with_inline_results', async () => {
  const store = createStore();
  const brand = store.table('brands').insert({ name: 'lenskart', official_handles: [], official_domains: [], keywords: [] });
  const ctx = env({ handle: 'lenskart.help', brand_id: brand.id, params: { mode: 'account', max_items: 25,
    include_comments: false } }, endpoint => {
    if (endpoint === 'profile') {
      return { json: { username: 'lenskart.help', profile_id: 'L1', full_name: 'Lenskart Help',
        bio: 'Lenskart customer giveaway support', profile_pic_url: 'https://cdn.example/profile.jpg',
        followers_count: 1200, is_verified: true }, credits: 15 };
    }
    return { json: { total_posts: 1, posts_data: [{ id: 'post-1', shortcode: 'POST1', is_video: false,
      caption: 'Lenskart sale #lenskart — mention @lenskart', display_url: 'https://cdn.example/post.jpg', likes: 42,
      owner: { username: 'lenskart.help' } }] }, credits: 15 };
  }, store);
  ctx.query = 'lenskart';
  const job = await inlineIngest(ctx);
  assert.equal(job.status, 'succeeded', job.error);
  assert.equal(job.attempts, 1);
  assert.equal(job.result.serverless_inline, true);
  assert.equal(job.result.analysis_mode, 'heuristics_inline');
  const [assessment] = job.result.assessments;
  assert.ok(assessment.assessment_id);
  assert.ok(Object.keys(assessment.alert_families).length);
  assert.deepEqual(new Set(Object.keys(assessment.dimensions)), new Set(['deception', 'harm', 'exposure', 'coordination']));
  assert.ok('top_evidence' in assessment);
  const inline = job.result.inline_search;
  assert.equal(inline.total, 2);
  assert.equal(inline.complete_collection, true);
  assert.equal(inline.query, 'lenskart');
  assert.deepEqual([inline.facets.accounts, inline.facets.posts], [1, 1]);
  assert.ok(inline.hits.every(hit => hit.risk_score != null));
  assert.ok(inline.hits.find(hit => hit.doc_type === 'account').risk_score >= 85);
  assert.notEqual(job.payload.brand_id, null);
  const post = inline.hits.find(hit => hit.doc_type === 'post');
  assert.equal(post.instagram_url, 'https://www.instagram.com/p/POST1/');
  assert.equal(post.image_url, 'https://cdn.example/post.jpg');
  assert.equal(post.like_count, 42);
  assert.ok(post.content.includes('Lenskart sale'));
});

test('an invalid username fails the job with REF wording', async () => {
  const job = await inlineIngest(env({ handle: 'bad name!', params: { mode: 'account' } }));
  assert.equal(job.status, 'failed');
  assert.equal(job.error, 'CollectionNotPermitted: account search requires an Instagram username containing letters, numbers, dots, or underscores');
});

test('no bundles fails with REF wording', async () => {
  const job = await inlineIngest(env({ handle: 'ghost', params: { mode: 'account' } }, () => { throw new NotFound('x'); }));
  assert.equal(job.error, 'CollectionNotPermitted: provider returned no ingestible accounts');
});

test('owned and tagged modes fail as REF does without Meta credentials', async () => {
  const job = await inlineIngest(env({ provider: 'instagram_graph', handle: '', params: { mode: 'owned' } }));
  assert.equal(job.status, 'failed');
  assert.match(job.error, /^ProviderNotConfigured: /);
  const scrapingdog = await inlineIngest(env({ handle: 'brand', params: { mode: 'tagged' } }));
  assert.equal(scrapingdog.error, "CollectionNotPermitted: ScrapingDog supports account and keyword/hashtag discovery, not 'tagged'; owned and tagged modes require the authorized Meta API");
});

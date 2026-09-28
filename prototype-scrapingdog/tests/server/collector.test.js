import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { fakeClient, fakeClock } from '../helpers/fake-scrapingdog.js';
import { createStore } from '../../server/store.js';
import { loadConfig } from '../../server/config.js';
import { encodeCursor, decodeCursor } from '../../server/cursor.js';
import { FetchFailed, NotFound, SourceUnavailable } from '../../server/errors.js';
import { PagedCollector, REF_DATASETS } from '../../server/collector.js';

const config = (env = {}) => loadConfig({ SCRAPINGDOG_API_KEY: 'k', CREDIT_CAP_PER_DAY: '0', ...env });
const baseState = (clock, extra = {}) => ({ version: 1, id: 'x', expires_at: clock.now() / 1000 + 1000, query: 'Brand',
  retrieved_at: '2026-09-23T00:00:00', visible: [], page: 0,
  params: { mode: 'keyword', max_items: 250, profile_limit: 50, include_comments: true, comments_per_post: 20 }, ...extra });
const organicFor = index => ({ organic_results: [{ link: `https://www.instagram.com/reel/FOUND${index}/`,
  source: `Instagram · seller${index}`, title: `Brand loot offer ${index}` }] });
const make = (state, client, clock, env) => new PagedCollector({ store: createStore(), state, client,
  config: config(env), clock: clock.now, monotonic: clock.monotonic });
const toOurs = state => JSON.parse(JSON.stringify(state).replace(/gd_[a-z0-9]+/g, id => REF_DATASETS[id] ?? id));

test('schedule() and bundles() equal REF on every checkpoint fixture', () => {
  for (const c of golden('collector-core')) {
    const clock = fakeClock();
    const collector = make(toOurs(c.state), fakeClient(() => ({})), clock);
    collector.provenanceFor = mode => ({ provider: 'bright_data_instagram', lawful_basis: 'licensed_public_data_api',
      collection_mode: mode, query: c.state.query, source: 'Bright Data Instagram Scraper API', retrieved_at: '2026-09-23T00:00:00' });
    const before = collector.bundles();
    assert.deepEqual(before.bundles, toOurs(c.bundles), c.name);
    assert.deepEqual(before.buckets, c.buckets, c.name);
    collector.schedule();
    // generate.py evaluates profile_pending and has_work after _schedule() has queued the profile tasks.
    assert.equal(collector.profileEnrichmentPending(before.bundles), c.profile_pending, c.name);
    assert.equal(collector.hasWork(), c.has_work, c.name);
    assert.deepEqual(collector.state.inputs, toOurs(c.scheduled_state).inputs, c.name);
    assert.deepEqual(collector.state.scheduled, toOurs(c.scheduled_state).scheduled, c.name);
  }
});

test('REF: profile allowance expands with each requested page', async () => {
  const clock = fakeClock();
  const state = baseState(clock, { query: 'brand research!', query_tasks: [], inputs: [] });
  await make(state, fakeClient(() => ({})), clock).collect({ targetResults: 100 });
  assert.equal(state.profile_target, 100);
});

test('REF (sync): unfinished work survives page deadlines and every input is requested exactly once', async () => {
  const clock = fakeClock();
  let searches = 0;
  const seen = new Set();
  const client = fakeClient((endpoint, params) => {
    const identity = JSON.stringify([endpoint, params]);
    assert.ok(!seen.has(identity), `requested twice: ${identity}`);
    seen.add(identity);
    if (endpoint.startsWith('google')) return { json: organicFor(++searches), credits: 5 };
    if (endpoint === 'profile') return { json: { username: params.username, followers_count: 10, biography: 'Public profile',
      profile_pic_url: 'https://cdn.example/profile.jpg', id: `id-${params.username}`, posts: [] }, credits: 15 };
    if (endpoint === 'posts') return { json: { posts: [] }, credits: 15 };
    if (endpoint === 'comments') return { json: { comments: [{ id: `c${params.url}`, text: 'I paid but no delivery', username: 'reviewer' }] }, credits: 15 };
    return { json: { url: params.url, owner: { username: `author${params.url.split('/').at(-2)}` }, caption: 'Brand offer',
      display_url: 'https://cdn.example/cover.jpg' }, credits: 15 };
  }, { clock });
  let state = baseState(clock);
  let collector = make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '3' });
  await collector.collect({ targetResults: 10000, budgetSeconds: 48 });
  assert.ok(collector.hasWork());
  assert.deepEqual(state.errors, []);
  for (let page = 0; page < 30 && collector.hasWork(); page++) {
    state = decodeCursor(encodeCursor(state, 's'), 's', clock.now);
    collector = make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '3' });
    await collector.collect({ targetResults: 10000, budgetSeconds: 48 });
  }
  assert.ok(!collector.hasWork(), 'collection must eventually exhaust');
  assert.equal(state.queries_completed, 17);
  assert.equal(searches, 17);
  assert.equal(state.records.reel.length, 17);
  assert.equal(state.records.comment.length, 17);
  assert.ok(collector.bundles().bundles.some(b => b.posts.some(p => p.comments.length)));
  assert.deepEqual(state.errors, []);
});

test('REF: a 429 stops the page, keeps every input and blocks resumption until Retry-After passes', async () => {
  const clock = fakeClock();
  const client = fakeClient(() => { throw new FetchFailed('429 from /google', { statusCode: 429, retryAfter: '90' }); }, { clock });
  const state = baseState(clock);
  await make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '1' }).collect({ targetResults: 50 });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0][0], 'profile', 'REF turn 0 enriches the queued exact-brand profile first');
  assert.ok(state.blocked_until > clock.now() / 1000 + 85);
  assert.equal(state.query_tasks.length, 17);
  assert.equal(state.inputs[0].attempt, 0);
  await make(decodeCursor(encodeCursor(state, 's'), 's', clock.now), client, clock, { SCRAPINGDOG_CONCURRENCY: '1' })
    .collect({ targetResults: 50 });
  assert.equal(client.calls.length, 1, 'View more during Retry-After sends nothing');
});

test('REF: an inactive account stops once and keeps all work for an explicit retry', async () => {
  const clock = fakeClock();
  let active = false;
  const client = fakeClient(() => {
    if (!active) throw new SourceUnavailable('source_account_inactive', 'The connected collection account is inactive.');
    return { json: { username: 'brand', followers_count: 1, profile_pic_url: 'https://x', id: '1', posts: [] }, credits: 15 };
  }, { clock });
  const state = baseState(clock);
  assert.deepEqual(await make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '1' }).collect(), []);
  assert.equal(client.calls.length, 1);
  assert.equal(state.source_error.code, 'source_account_inactive');
  assert.equal(state.query_tasks.length, 17);
  assert.equal(state.inputs[0].attempt, 0);
  assert.deepEqual(state.errors, []);
  active = true;
  await make(decodeCursor(encodeCursor(state, 's'), 's', clock.now), client, clock, { SCRAPINGDOG_CONCURRENCY: '1' })
    .collect({ targetResults: 1 });
  assert.ok(client.calls.length >= 2);
});

test('missing profiles are dropped silently; transient failures get 3 attempts then one error', async () => {
  const clock = fakeClock();
  const client = fakeClient((endpoint, params) => {
    if (endpoint === 'profile') throw new NotFound('no such user');
    if (endpoint.startsWith('google')) return { json: { organic_results: [{ link: 'https://www.instagram.com/p/P1/', title: 't' }] }, credits: 5 };
    throw new FetchFailed('500 from /instagram/post', { statusCode: 500 });
  }, { clock });
  const state = baseState(clock, { params: { ...baseState(clock).params, include_comments: false } });
  const collector = make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '2' });
  for (let i = 0; i < 5 && collector.hasWork(); i++) await collector.collect({ targetResults: 10000 });
  assert.equal(client.calls.filter(([e]) => e === 'post').length, 3);
  assert.deepEqual(state.errors.map(e => e.stage), ['enrich']);
  assert.ok(!state.errors.some(e => e.dataset === 'profile'));
});

test('the per-search credit budget ends collection with one budget error', async () => {
  const clock = fakeClock();
  const client = fakeClient(e => ({ json: e.startsWith('google') ? { organic_results: [] } : { username: 'brand', posts: [] }, credits: e.startsWith('google') ? 5 : 15 }), { clock });
  const state = baseState(clock);
  const collector = make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '1', CREDIT_BUDGET_PER_SEARCH: '40' });
  await collector.collect({ targetResults: 10000 });
  assert.ok(state.credits_used <= 40);
  assert.deepEqual(state.errors.filter(e => e.stage === 'budget').length, 1);
  assert.ok(!collector.hasWork());
});

test('a request started before the deadline finishes and is kept (it is paid for)', async () => {
  const clock = fakeClock();
  const client = fakeClient(endpoint => {
    if (endpoint === 'profile') { clock.tick(30_000); return { json: { username: 'brand', followers_count: 5, profile_pic_url: 'https://x', id: '1', posts: [] }, credits: 15 }; }
    return { json: { organic_results: [] }, credits: 5 };
  }, { clock, stepMs: 20_000 });
  const state = baseState(clock);
  await make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '1' }).collect({ targetResults: 10000, budgetSeconds: 48 });
  assert.equal(state.records.profile.length, 1);
});

test('a missing handle still counts the credits ScrapingDog bills, and posts_count comes from the Posts API', async () => {
  const clock = fakeClock();
  let billed = 0;
  const client = fakeClient((endpoint, params) => {
    billed += endpoint.startsWith('google') ? 5 : 15;
    if (endpoint === 'profile' && params.username === 'brand') {
      return { json: { username: 'brand', profile_id: '7', followers_count: 3, profile_pic_url: 'https://x/p.jpg' }, credits: 15 };
    }
    if (endpoint === 'posts') return { json: { total_posts: 42, posts_data: [] }, credits: 15 };
    if (endpoint === 'profile') throw Object.assign(new NotFound('no such handle'), { credits: 15 });
    return { json: { organic_results: [{ link: 'https://www.instagram.com/ghost.account/' }] }, credits: 5 };
  }, { clock });
  const state = baseState(clock);
  await make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '1' }).collect({ targetResults: 10000 });
  assert.equal(state.records.profile[0].posts_count, 42);
  assert.ok(client.calls.some(([e, p]) => e === 'profile' && p.username === 'ghost.account'));
  assert.equal(state.credits_used, billed);
});

test('review Important 3: the budget stop holds while requests are in flight (concurrency 5)', async () => {
  const clock = fakeClock();
  let n = 0;
  const client = fakeClient(endpoint => {
    if (endpoint.startsWith('google')) {
      n += 1;
      return { json: { organic_results: [{ link: `https://www.instagram.com/reel/R${n}/`, source: `Instagram · seller${n}`,
        title: 'Brand loot' }] }, credits: 10 };
    }
    if (endpoint === 'profile') throw Object.assign(new NotFound('no such handle'), { credits: 15 });
    if (endpoint === 'comments') return { json: { comments: [] }, credits: 15 };
    return { json: { post: { caption: 'Brand loot' }, comments: [] }, credits: 15 };
  }, { clock, stepMs: 100 });
  const state = baseState(clock);
  const collector = make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '5', CREDIT_BUDGET_PER_SEARCH: '120' });
  await collector.collect({ targetResults: 10000 });
  assert.equal(state.errors.filter(e => e.stage === 'budget').length, 1);
  assert.deepEqual([state.inputs.length, state.query_tasks.length], [0, 0], 'nothing is re-queued after the budget stop');
  assert.ok(!collector.hasWork());
  const spent = client.calls.length;
  await collector.collect({ targetResults: 10000 });
  assert.equal(client.calls.length, spent, 'a later page buys nothing');
  assert.equal(state.errors.filter(e => e.stage === 'budget').length, 1, 'and adds no second budget error');
});

test('review Important 4: comments are requested once per shortcode, whatever URL form carried it', () => {
  const clock = fakeClock();
  const state = baseState(clock, { query_tasks: [],
    organic: [{ link: 'https://www.instagram.com/p/ABC/', source: 'Instagram · seller', title: 'Brand loot' }],
    records: { reel: [{ url: 'https://www.instagram.com/reel/ABC/', user_posted: 'seller', description: 'Brand loot' }] } });
  const collector = make(state, fakeClient(() => ({})), clock);
  collector.schedule();
  const urls = state.inputs.filter(t => t.dataset === 'comment').flatMap(t => t.inputs.map(i => i.url));
  assert.equal(urls.filter(url => url.includes('/ABC/')).length, 1, urls.join(' '));
});

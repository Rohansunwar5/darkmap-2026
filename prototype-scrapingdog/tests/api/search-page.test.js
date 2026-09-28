import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';
import { createStore } from '../../server/store.js';
import { fakeClient, fakeClock } from '../helpers/fake-scrapingdog.js';
import { hitKey } from '../../server/collector.js';

// REF test_pages_of_50...: collect() is replaced so each "invocation" sees the same 1 profile + 106 posts.
const pagedRecords = calls => opts => {
  const real = opts.makeReal();
  real.collect = async ({ targetResults }) => {
    calls.push(targetResults);
    if (!real.state.records.profile) {
      real.state.records.profile = [{ account: 'brand.research', followers: 432, full_name: 'Brand research',
        biography: 'Product reviews', posts: [] }];
      real.state.records.post = Array.from({ length: 106 }, (_, i) => ({ url: `https://www.instagram.com/p/POST${i}/`,
        user_posted: 'brand.research', post_id: String(i), description: `Brand product review ${i} #brand @brand`,
        image_url: `https://cdn.example/${i}.jpg`, likes: i,
        latest_comments: [{ id: `c${i}`, username: 'reader', text: 'Useful review' }] }));
    }
    real.state.query_tasks = [];
    real.state.inputs = [];
    real.state.queries_completed = 17;
    return real.bundles().bundles;
  };
  return real;
};

test('REF: pages of 50 preserve every row and metadata across store restarts', async () => {
  const calls = [];
  let cursor = null;
  let previous = new Set();
  const pages = [];
  for (const [page, expected] of [50, 100, 107].entries()) {
    const app = await startApp({ store: createStore(), collectorFactory: pagedRecords(calls) });
    const r = await app.request('POST', '/v1/instagram/search-page', { query: 'Brand', continuation: cursor, max_items: 250, profile_limit: 50 });
    assert.equal(r.status, 200, r.text);
    const body = r.body.result;
    pages.push(body);
    const keys = new Set(body.inline_search.hits.map(hitKey));
    assert.equal(keys.size, expected);
    assert.equal(body.inline_search.hits.length, expected);
    for (const key of previous) assert.ok(keys.has(key));
    for (const hit of body.inline_search.hits) {
      assert.equal(hit.followers_count, 432);
      if (hit.doc_type === 'post') {
        assert.ok(hit.image_url.startsWith('https://cdn.example/'));
        assert.equal(hit.comments[0].text, 'Useful review');
        assert.deepEqual(hit.hashtags, ['brand']);
      }
    }
    assert.equal(body.pagination.has_more, page < 2);
    cursor = body.pagination.continuation;
    previous = keys;
    await app.close();
  }
  assert.equal(cursor, null);
  assert.deepEqual(calls, [50, 100, 150]);
  for (const hit of pages[0].inline_search.hits) {
    assert.equal(pages[2].inline_search.hits.find(h => hitKey(h) === hitKey(hit)).risk_score, hit.risk_score);
  }
});

test('REF test_malformed_cursor_cannot_launch_network_work', async () => {
  const client = fakeClient(() => { throw new Error('network'); });
  const app = await startApp({ client });
  const r = await app.request('POST', '/v1/instagram/search-page', { query: 'Brand', continuation: 'bad' });
  assert.equal(r.status, 400);
  assert.equal(client.calls.length, 0);
  await app.close();
});

for (const [scenario, status, outcome] of [['inactive', 'failed', 'blocked'], ['errors', 'failed', 'failed'],
  ['pending', 'succeeded', 'pending'], ['empty', 'succeeded', 'empty'], ['partial_blocked', 'succeeded', 'blocked']]) {
  test(`REF test_page_outcome_matches_collection_evidence[${scenario}]`, async () => {
    const app = await startApp({ collectorFactory: opts => {
      const real = opts.makeReal();
      real.collect = async () => {
        const s = real.state;
        if (scenario === 'inactive' || scenario === 'partial_blocked') {
          s.source_error = { code: 'source_account_inactive', message: 'The collection account is inactive. Reactivate it, then retry.' };
        }
        if (scenario === 'partial_blocked') s.records.profile = [{ account: 'brand.research', followers: 10 }];
        if (scenario === 'errors' || scenario === 'empty') {
          s.query_tasks = [];
          s.inputs = [];
          s.queries_completed = scenario === 'errors' ? 0 : 17;
        }
        if (scenario === 'errors') s.errors = [{ stage: 'discovery', error: 'blank response' }];
        return real.bundles().bundles;
      };
      return real;
    } });
    const r = await app.request('POST', '/v1/instagram/search-page', { query: 'Brand' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.status, status);
    assert.equal(r.body.result.collection_outcome, outcome);
    assert.equal(r.body.result.pagination.outcome, outcome);
    assert.equal(r.body.result.inline_search.complete_collection, scenario === 'empty');
    assert.equal(Boolean(r.body.result.pagination.continuation), ['inactive', 'pending', 'partial_blocked'].includes(scenario));
    assert.equal(Boolean(r.body.error), ['inactive', 'errors', 'partial_blocked'].includes(scenario));
    if (scenario === 'partial_blocked') assert.equal(r.body.result.inline_search.hits.length, 1);
    await app.close();
  });
}

test('replaying a continuation spends nothing and returns the same response (Review Focus 4)', async () => {
  // 20 s per fake call: a 48 s page stops after two calls, so work (and a continuation) remains.
  const clock = fakeClock();
  const client = fakeClient(endpoint => ({ json: endpoint.startsWith('google') ? { organic_results: [
    { link: 'https://www.instagram.com/reel/R1/', source: 'Instagram · seller', title: 'Brand loot' }] }
    : { username: 'brand', followers_count: 3, profile_pic_url: 'https://x', id: '1', posts: [] }, credits: 5 }),
    { clock, stepMs: 20_000 });
  const app = await startApp({ client, clock: clock.now, monotonic: clock.monotonic, env: { SCRAPINGDOG_CONCURRENCY: '1' } });
  const first = await app.request('POST', '/v1/instagram/search-page', { query: 'Brand' });
  const continuation = first.body.result.pagination.continuation;
  assert.ok(continuation);
  const second = await app.request('POST', '/v1/instagram/search-page', { query: 'Brand', continuation });
  const callsAfterSecond = client.calls.length;
  const replay = await app.request('POST', '/v1/instagram/search-page', { query: 'Brand', continuation });
  assert.equal(client.calls.length, callsAfterSecond);
  assert.deepEqual(replay.body, second.body);
  await app.close();
});

test('review Important 2: an overlapping duplicate continuation waits for the first and buys nothing twice', async () => {
  const clock = fakeClock();
  const client = fakeClient(async endpoint => {
    await new Promise(resolve => setTimeout(resolve, 20));   // real latency, so the two requests overlap
    return { json: endpoint.startsWith('google') ? { organic_results: [
      { link: 'https://www.instagram.com/reel/R1/', source: 'Instagram · seller', title: 'Brand loot' }] }
      : { username: 'brand', followers_count: 3, profile_pic_url: 'https://x', id: '1', posts: [] }, credits: 5 };
  }, { clock, stepMs: 20_000 });
  const app = await startApp({ client, clock: clock.now, monotonic: clock.monotonic, env: { SCRAPINGDOG_CONCURRENCY: '1' } });
  const first = await app.request('POST', '/v1/instagram/search-page', { query: 'Brand' });
  const continuation = first.body.result.pagination.continuation;
  assert.ok(continuation);
  const before = client.calls.length;
  const [a, b] = await Promise.all([1, 2].map(() => app.request('POST', '/v1/instagram/search-page', { query: 'Brand', continuation })));
  const during = client.calls.slice(before).map(call => JSON.stringify(call));
  assert.ok(during.length > 0);
  assert.equal(new Set(during).size, during.length, `a request was sent twice: ${during.join(' ')}`);
  assert.deepEqual(a.body, b.body);
  await app.close();
});

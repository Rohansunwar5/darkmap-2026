// REF test_bright_data_instagram.py:355-409 through POST /v1/instagram/scrape, plus REF's validation details.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';
import { fakeClient } from '../helpers/fake-scrapingdog.js';
import { NotFound } from '../../server/errors.js';

const client = () => fakeClient((endpoint, params) => {
  if (endpoint.startsWith('google')) return { json: { organic_results: [] }, credits: 5 };
  if (endpoint === 'profile' && params.username === 'brand') {
    return { json: { username: 'brand', profile_id: '9', full_name: 'Brand', bio: 'Official brand',
      profile_pic_url: 'https://cdn.example/brand.jpg', followers_count: 5000 }, credits: 15 };
  }
  if (endpoint === 'posts') {
    return { json: { total_posts: 1, posts_data: [{ id: 'p1', shortcode: 'P1', is_video: false, caption: 'Brand news',
      display_url: 'https://cdn.example/p1.jpg', owner: { username: 'brand' } }] }, credits: 15 };
  }
  if (endpoint === 'comments') return { json: { comments: [] }, credits: 15 };
  throw new NotFound('no such handle');
});

test('REF test_instagram_endpoint_auto_selects_bright_data (ScrapingDog)', async () => {
  const app = await startApp({ client: client() });
  const r = await app.request('POST', '/v1/instagram/scrape', { mode: 'keyword', query: 'brand', max_items: 25,
    include_comments: false, analyze: false });
  assert.equal(r.status, 202);
  assert.equal(r.body.payload.provider, 'scrapingdog_instagram');
  assert.equal(r.body.payload.params.mode, 'keyword');
  assert.ok(r.body.payload.brand_id != null, 'a brand-like keyword infers the brand context');
  await app.close();
});

test('REF test_vercel_search_returns_terminal_job_with_inline_results (account mode through the route)', async () => {
  const app = await startApp({ client: client() });
  const r = await app.request('POST', '/v1/instagram/scrape', { mode: 'account', query: 'brand' });
  assert.equal(r.status, 202);
  assert.equal(r.body.status, 'succeeded', r.body.error);
  assert.equal(r.body.attempts, 1);
  assert.ok(r.body.result.inline_search.hits.length > 0);
  assert.equal(r.body.result.serverless_inline, true);
  const job = await app.request('GET', `/v1/ingest/jobs/${r.body.id}`);
  assert.deepEqual([job.status, job.body.status], [200, 'succeeded']);
  await app.close();
});

test('REF scrape validation details', async () => {
  const app = await startApp({ client: client() });
  const owned = await app.request('POST', '/v1/instagram/scrape', { provider: 'bright_data', mode: 'owned' });
  assert.deepEqual([owned.status, owned.body.detail], [422, 'owned and tagged modes require the authorized Meta API']);
  const meta = await app.request('POST', '/v1/instagram/scrape', { provider: 'meta', mode: 'account', query: 'x' });
  assert.deepEqual([meta.status, meta.body.detail], [503, 'Meta Instagram credentials are not configured']);
  const empty = await app.request('POST', '/v1/instagram/scrape', { mode: 'account', query: '' });
  assert.deepEqual([empty.status, empty.body.detail], [422, 'query is required for account, hashtag, and keyword modes']);
  const bad = await app.request('POST', '/v1/instagram/scrape', { mode: 'account', query: 'x', max_items: 999 });
  assert.equal(bad.status, 422);
  assert.deepEqual(bad.body.detail[0].loc, ['body', 'max_items']);
  await app.close();
});

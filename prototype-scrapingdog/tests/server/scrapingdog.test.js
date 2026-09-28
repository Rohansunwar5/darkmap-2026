import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../server/store.js';
import { loadConfig } from '../../server/config.js';
import { createClient } from '../../server/scrapingdog.js';
import { FetchFailed, NotAuthorized, QuotaExceeded, SourceUnavailable } from '../../server/errors.js';
import { usage } from '../../server/quota.js';

const config = (env = {}) => loadConfig({ SCRAPINGDOG_API_KEY: 'TEST-KEY', ...env });
const reply = (status, body, headers = {}) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
const clock = () => Date.UTC(2026, 8, 23, 12, 0, 30);

test('success returns JSON, meters credits, and audits the URL without the key', async () => {
  const store = createStore();
  const seen = [];
  const client = createClient({ config: config(), store, clock, fetchImpl: async url => { seen.push(String(url)); return reply(200, { organic_results: [] })(); } });
  const { json, credits } = await client.call('google', { query: 'site:instagram.com "A&B" #x', country: 'in' });
  assert.deepEqual(json, { organic_results: [] });
  assert.equal(credits, 5);
  assert.equal(new URL(seen[0]).searchParams.get('query'), 'site:instagram.com "A&B" #x');
  const row = store.table('audit_logs').all().at(-1);
  assert.equal(row.action, 'http.request');
  assert.doesNotMatch(row.target, /TEST-KEY|api_key/);
  assert.equal(usage(store, 'scrapingdog_instagram', clock).day, 5);
});

test('HTTP 200 with a non-JSON or error body is a failed attempt, not an empty result (Review Focus 3)', async () => {
  for (const body of ['<html>busy</html>', '', { success: false, message: 'Try again' }, { error: 'upstream' }]) {
    const store = createStore();
    const client = createClient({ config: config(), store, clock, fetchImpl: reply(200, body) });
    await assert.rejects(client.call('google', { query: 'q' }), FetchFailed, JSON.stringify(body));
    assert.equal(usage(store, 'scrapingdog_instagram', clock).day, 0, 'failed calls cost nothing');
  }
});

test('status mapping: 401/403 refuse, account errors are SourceUnavailable, 429 carries Retry-After', async () => {
  const store = createStore();
  const call = (status, body, headers) => createClient({ config: config(), store, clock, fetchImpl: reply(status, body, headers) })
    .call('google', { query: 'q' });
  await assert.rejects(call(401, 'no'), NotAuthorized);
  await assert.rejects(call(403, 'forbidden'), NotAuthorized);
  await assert.rejects(call(400, 'Customer is not active'), e => e instanceof SourceUnavailable && e.code === 'source_account_inactive');
  await assert.rejects(call(402, 'x'), e => e instanceof SourceUnavailable && e.code === 'source_credits_required');
  await assert.rejects(call(403, 'Credits exhausted'), e => e instanceof SourceUnavailable && e.code === 'source_credits_required');
  await assert.rejects(call(429, 'slow down', { 'Retry-After': '90' }), e => e instanceof FetchFailed && e.statusCode === 429 && e.retryAfter === '90');
});

test('timeouts become FetchFailed with REF wording', async () => {
  const client = createClient({ config: config(), store: createStore(), clock,
    fetchImpl: async () => { throw Object.assign(new Error('aborted'), { name: 'TimeoutError' }); } });
  await assert.rejects(client.call('google', { query: 'q' }), /The read operation timed out/);
});

test('the pool never runs more than SCRAPINGDOG_CONCURRENCY requests at once', async () => {
  let active = 0, peak = 0;
  const fetchImpl = async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; return reply(200, { organic_results: [] })(); };
  const client = createClient({ config: config({ SCRAPINGDOG_CONCURRENCY: '2' }), store: createStore(), clock, fetchImpl });
  await Promise.all(Array.from({ length: 6 }, () => client.call('google', { query: 'q' })));
  assert.equal(peak, 2);
});

test('the daily credit cap stops a call before it is sent', async () => {
  let calls = 0;
  const client = createClient({ config: config({ CREDIT_CAP_PER_DAY: '20' }), store: createStore(), clock,
    fetchImpl: async () => { calls++; return reply(200, { username: 'a' })(); } });
  await client.call('profile', { username: 'a' });
  await assert.rejects(client.call('profile', { username: 'b' }), QuotaExceeded);
  assert.equal(calls, 1);
});

// Recorded responses (CONTRACT.md §5) and ScrapingDog's documented statuses: 403 for an exhausted plan, and only
// 200/404 answers are charged.
import { readFileSync } from 'node:fs';
import { NotFound } from '../../server/errors.js';
const recorded = name => JSON.parse(readFileSync(new URL(`../fixtures/scrapingdog/${name}.json`, import.meta.url), 'utf8'));

test('a missing handle (HTTP 200, every field null) is NotFound and its 15 credits are metered', async () => {
  const store = createStore();
  const client = createClient({ config: config(), store, clock, fetchImpl: reply(200, recorded('profile-missing').json) });
  await assert.rejects(client.call('profile', { username: 'zz_no_such_handle_0923' }),
    e => e instanceof NotFound && e.credits === 15);
  assert.equal(usage(store, 'scrapingdog_instagram', clock).day, 15);
});

test('a 404 is NotFound and charged; a caption that says "not found" is still a result', async () => {
  const store = createStore();
  const missing = createClient({ config: config(), store, clock, fetchImpl: reply(404, { message: 'Not found' }) });
  await assert.rejects(missing.call('post', { url: 'https://www.instagram.com/p/X/' }), e => e instanceof NotFound && e.credits === 15);
  const post = { post: { caption: 'Refund not found? This page does not exist anymore, DM us', like_count: 3 }, comments: [] };
  const found = createClient({ config: config(), store: createStore(), clock, fetchImpl: reply(200, post) });
  assert.deepEqual((await found.call('post', { url: 'https://www.instagram.com/p/Y/' })).json, post);
});

test('the recorded bad-key 403 is NotAuthorized; a 403 about limits or credits is source_credits_required', async () => {
  const call = (status, body) => createClient({ config: config(), store: createStore(), clock, fetchImpl: reply(status, body) })
    .call('google', { query: 'q' });
  await assert.rejects(call(403, recorded('bad-key').json), NotAuthorized);
  await assert.rejects(call(403, { message: 'Request limit reached, please upgrade your plan.', success: false }),
    e => e instanceof SourceUnavailable && e.code === 'source_credits_required');
  await assert.rejects(call(429, 'Concurrent request limit reached'), e => !(e instanceof SourceUnavailable) && e.statusCode === 429);
});

test('the API key ScrapingDog echoes in pagination URLs never reaches callers', async () => {
  const body = { organic_results: [], scrapingdog_pagination: { next: 'https://api.scrapingdog.com/google?api_key=TEST-KEY&page=1' } };
  const client = createClient({ config: config(), store: createStore(), clock, fetchImpl: reply(200, body) });
  const { json } = await client.call('google', { query: 'q' });
  assert.doesNotMatch(JSON.stringify(json), /TEST-KEY/);
  const failing = createClient({ config: config(), store: createStore(), clock, fetchImpl: reply(500, 'boom api_key=TEST-KEY') });
  await assert.rejects(failing.call('google', { query: 'q' }), e => !/TEST-KEY/.test(e.message));
});

test('review Critical 1: a 200 body that quotes account-status phrases is still a result', async () => {
  for (const [endpoint, params, body] of [
    ['google', { query: 'q' }, { organic_results: [{ link: 'https://www.instagram.com/p/A/',
      title: 'Dear customer, your account is inactive. Update KYC via link in bio' }] }],
    ['post', { url: 'https://www.instagram.com/p/A/' }, { post: { caption: 'Insufficient balance? instant loan, not enough credits' },
      comments: [] }],
    ['comments', { url: 'https://www.instagram.com/p/A/' }, { comments: [{ id: '1', text: 'my account is inactive, customer is not active' }] }],
  ]) {
    const client = createClient({ config: config(), store: createStore(), clock, fetchImpl: reply(200, body) });
    assert.deepEqual((await client.call(endpoint, params)).json, body, endpoint);
  }
  const envelope = createClient({ config: config(), store: createStore(), clock,
    fetchImpl: reply(200, { success: false, message: 'Insufficient credits' }) });
  await assert.rejects(envelope.call('google', { query: 'q' }),
    e => e instanceof SourceUnavailable && e.code === 'source_credits_required', 'an envelope\'s own message still maps');
});

test('review 8 (Review Focus 3): an Instagram 200 error envelope or unknown shape is a failed attempt', async () => {
  for (const [endpoint, params] of [['profile', { username: 'a' }], ['posts', { id: '1' }],
    ['post', { url: 'https://www.instagram.com/p/A/' }], ['comments', { url: 'https://www.instagram.com/p/A/' }]]) {
    const store = createStore();
    const client = createClient({ config: config(), store, clock, fetchImpl: reply(200, { status: 'error', message: 'temporarily unavailable' }) });
    await assert.rejects(client.call(endpoint, params), e => e instanceof FetchFailed && !(e instanceof SourceUnavailable), endpoint);
    assert.equal(usage(store, 'scrapingdog_instagram', clock).day, 0, `${endpoint}: a failed call costs nothing`);
  }
});

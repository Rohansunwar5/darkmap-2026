import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';
import { parseSearchPageIn } from '../../server/schemas.js';

test('healthz reports the ScrapingDog source the dashboard expects', async () => {
  const on = await startApp();
  const health = (await on.request('GET', '/healthz')).body;
  assert.equal(health.status, 'ok');
  assert.equal(health.instagram.configured, false);
  assert.deepEqual(health.instagram_alternative, { provider: 'scrapingdog_instagram', configured: true, keyword_search_configured: true });
  await on.close();
  const off = await startApp({ env: { SCRAPINGDOG_API_KEY: '' } });
  assert.equal((await off.request('GET', '/healthz')).body.instagram_alternative.keyword_search_configured, false);
  const page = await off.request('POST', '/v1/instagram/search-page', { query: 'Brand' });
  assert.deepEqual([page.status, page.body.detail], [503, 'An Instagram keyword collection source is required']);
  await off.close();
});

test('REF test_api_key_auth_request_limit_and_secret_redaction', async () => {
  const app = await startApp({ env: { DARKMAP_API_KEY: 'letmein', DARKMAP_MAX_REQUEST_BYTES: '100' } });
  assert.deepEqual((await app.request('GET', '/v1/brands')).body, { detail: 'invalid or missing API key' });
  assert.equal((await app.request('GET', '/v1/brands', undefined, { 'x-api-key': 'letmein' })).status, 200);
  assert.equal((await app.request('GET', '/v1/brands', undefined, { authorization: 'Bearer letmein' })).status, 200);
  assert.equal((await app.request('GET', '/healthz')).status, 200);
  const big = await app.request('POST', '/v1/brands', { name: 'x'.repeat(200) }, { 'x-api-key': 'letmein' });
  assert.deepEqual([big.status, big.body.detail], [413, 'request body too large']);
  await app.close();
});

test('REF test_search_page_requests_metadata_for_all_fifty_accounts', () => {
  assert.equal(parseSearchPageIn({ query: 'Brand' }).profile_limit, 50);
});

test('REF test_alert_campaign_case_endpoints_exist, legal pages, brands, jobs, audit', async () => {
  const app = await startApp();
  for (const path of ['/v1/alerts?min_score=45&limit=200', '/v1/campaigns?limit=200', '/v1/cases?limit=200',
    '/v1/jobs?limit=100', '/v1/audit?limit=100', '/v1/brands', '/v1/accounts?limit=200&offset=0']) {
    const r = await app.request('GET', path);
    assert.equal(r.status, 200, path);
    assert.ok(Array.isArray(r.body), path);
  }
  const created = await app.request('POST', '/v1/cases', { title: 'Test investigation' });   // REF :139-145
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'open');
  const pack = await app.request('GET', `/v1/cases/${created.body.id}/evidence-package`);
  assert.equal(pack.status, 200);
  assert.equal(pack.body.format, 'darkmap-evidence-package/v1');
  const brand = await app.request('POST', '/v1/brands', { name: 'Acme', official_handles: ['@Acme'] });
  assert.deepEqual([brand.status, brand.body.official_handles], [201, ['acme']]);
  assert.equal((await app.request('POST', '/v1/brands', { name: 'Acme' })).status, 409);
  for (const path of ['/privacy', '/data-deletion']) assert.match((await app.request('GET', path)).text, /<html/i);
  await app.close();
});

test('review 11: a POST that is not application/json is refused before any work (drive-by protection)', async () => {
  const { fakeClient } = await import('../helpers/fake-scrapingdog.js');
  const client = fakeClient(() => { throw new Error('no network work may start'); });
  const app = await startApp({ client });
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
    const r = await app.request('POST', '/v1/instagram/search-page', JSON.stringify({ query: 'Brand' }), { 'content-type': type });
    assert.equal(r.status, 422, type);
    assert.deepEqual(r.body.detail[0].loc, ['body']);
  }
  assert.equal(client.calls.length, 0);
  const ok = await app.request('POST', '/v1/brands', { name: 'Json Brand' }, { 'content-type': 'application/json; charset=utf-8' });
  assert.equal(ok.status, 201);
  await app.close();
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from '../api/helpers.js';
import { createStore } from '../../server/store.js';

const live = process.env.LIVE === '1';
test('LIVE: one keyword page and one account search through real ScrapingDog', { skip: !live && 'set LIVE=1' }, async () => {
  process.loadEnvFile('.env');
  const app = await startApp({ env: { SCRAPINGDOG_API_KEY: process.env.SCRAPINGDOG_API_KEY, CREDIT_BUDGET_PER_SEARCH: '3000',
    SCRAPINGDOG_CONCURRENCY: process.env.SCRAPINGDOG_CONCURRENCY ?? '5' }, store: createStore(), client: undefined });
  const page = await app.request('POST', '/v1/instagram/search-page', { query: process.env.LIVE_QUERY ?? 'nike', profile_limit: 10 });
  assert.equal(page.status, 200, page.text);
  assert.ok(page.body.result.inline_search.hits.length > 0);
  assert.ok(page.body.result.pagination.credits_used <= 3000);
  const account = await app.request('POST', '/v1/instagram/scrape', { mode: 'account', query: process.env.LIVE_HANDLE ?? 'nike' });
  assert.equal(account.body.status, 'succeeded', account.text);
  console.log('credits used:', page.body.result.pagination.credits_used);
  await app.close();
});

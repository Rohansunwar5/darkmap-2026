import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { account, asInt, asUrl, author, bucketDiscovery, canonicalInstagramUrl, comment, discoveryQueries,
  looksLikeVideoUrl, mediaItems, post, serpFollowers, urlKind } from '../../server/discovery.js';

const REF_PROVENANCE = mode => query => ({ provider: 'bright_data_instagram', lawful_basis: 'licensed_public_data_api',
  collection_mode: mode, query, source: 'Bright Data Instagram Scraper API', retrieved_at: '2026-09-23T00:00:00' });

test('discovery helpers equal REF', () => {
  const g = golden('discovery-helpers');
  for (const [v, expected] of g.as_int) assert.equal(asInt(v), expected, JSON.stringify(v));
  for (const [v, expected] of g.serp_followers) assert.equal(serpFollowers(v), expected);
  for (const [v, expected] of g.as_url) assert.equal(asUrl(v), expected);
  for (const [v, expected] of g.looks_like_video_url) assert.equal(looksLikeVideoUrl(v), expected);
  for (const [v, expected] of g.canonical) assert.equal(canonicalInstagramUrl(v), expected, v);
  for (const [v, expected] of g.url_kind) assert.equal(urlKind(v), expected, v);
  for (const [k, expected] of g.queries) assert.deepEqual(discoveryQueries(k), expected, k);
});

test('record parsers equal REF _post/_account/_comment/_author/_media_items', () => {
  for (const c of golden('parsers')) {
    assert.deepEqual(post(c.node), c.post, c.name);
    assert.deepEqual(account(c.node, c.node._fallback ?? ''), c.account, c.name);
    assert.deepEqual(comment(c.node, c.node._parent ?? null), c.comment, c.name);
    assert.equal(author(c.node), c.author, c.name);
    assert.deepEqual(mediaItems(c.node), c.media, c.name);
  }
});

test('bucketDiscovery equals REF _bucket_discovery (buckets and SERP fallback bundles)', () => {
  for (const c of golden('bucket-discovery')) {
    const provenanceFor = mode => REF_PROVENANCE(mode)(c.case.keyword);
    const result = bucketDiscovery(c.case.organic, c.case.keyword, { limit: c.case.max_items ?? 250, provenanceFor });
    assert.deepEqual(result.buckets, c.buckets, c.name);
    assert.deepEqual(result.serpFallback, c.serp_fallback, c.name);
  }
});

test('REF test_primary_brand_discovery_runs_before_broad_threat_tail and actionable-first order', () => {
  const queries = discoveryQueries('Brand').map(([q]) => q);
  assert.equal(queries.length, 17);
  assert.ok(queries.indexOf('site:instagram.com "Brand"') < queries.findIndex(q => q.includes('"UPI"')));
  assert.ok(queries[0].includes('telegram channel'));
});

test('special characters survive encoding into the ScrapingDog query (Review Focus 2)', () => {
  const [[query]] = discoveryQueries('A&B "x" #1 100%');
  const url = new URL('https://api.scrapingdog.com/google');
  url.searchParams.set('query', query);
  assert.equal(new URL(url.href).searchParams.get('query'), query);
  assert.match(url.href, /A%26B/);
});

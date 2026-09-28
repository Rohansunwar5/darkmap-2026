const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../../public/static/overview-data.js');

const account = (handle, value, extra = {}) => ({ handle, latest_risk_score: value, ...extra });

test('chart boundaries, average and filters use scored accounts, not posts or missing scores', () => {
  const accounts = [account('a', 100), account('b', 85), account('c', 70), account('d', 45),
    account('e', 0), account('f', null), account('g', undefined)];
  const metrics = data.metrics(accounts, [{status: 'queued'}, {status: 'running'}, {status: 'succeeded'}]);
  assert.equal(metrics.total, 7);
  assert.equal(metrics.scored, 5);
  assert.equal(metrics.average, 60);
  assert.equal(metrics.high, 3);
  assert.equal(metrics.active, 2);
  assert.deepEqual(metrics.buckets, {critical: 2, high: 1, elevated: 1, low: 1, unscored: 2});
  for (const [filter, count] of Object.entries({all: 7, '70': 3, '0': 5, critical: 2, high: 1, elevated: 1, low: 1, unscored: 2})) {
    assert.equal(data.filterAccounts(accounts, filter).length, count, filter);
  }
  assert.equal(data.metrics([], []).average, null);
  assert.equal(data.metrics([account('unscored', null)], []).buckets.low, 0);
});

test('inline collection hydrates unique authors with assessment and profile evidence', () => {
  const result = {inline_search: {query: 'Brand', hits: [
    {doc_type: 'post', account_id: 1, handle: 'BrandHelp', title: 'Reel title', risk_score: 90},
    {doc_type: 'account', account_id: 1, handle: 'brandhelp', title: 'Brand Help', content: 'Collected biography', followers_count: 3},
    {doc_type: 'post', account_id: 1, handle: 'brandhelp', title: 'Another reel'},
    {doc_type: 'post', account_id: 2, handle: 'reporter', title: 'Reel, not the account name', followers_count: 50000, risk_score: 0},
  ]}, assessments: [{account_id: 1, assessment_id: 9, handle: 'brandhelp', overall_score: 75,
    recommended_action: 'review', top_evidence: [{signal: 'actual_signal', quote: 'Original quote'}]}]};
  const accounts = data.accountsFromResult(result, '2026-09-15T10:00:00Z');
  assert.equal(accounts.length, 2);
  assert.equal(accounts[0].display_name, 'Brand Help');
  assert.equal(accounts[0].biography, 'Collected biography');
  assert.equal(accounts[0].latest_risk_score, 75);
  assert.equal(accounts[0].followers_count, 3);
  assert.equal(accounts[0].latest_assessment.evidence[0].quote, 'Original quote');
  assert.equal(accounts[1].display_name, 'reporter');
  assert.equal(data.metrics(accounts, []).average, 37.5);
});

test('pagination deduplicates handles across database IDs, updates scores and retains prior searches', () => {
  let accounts = [account('BrandHelp', 95, {id: 1, snapshot: true, last_seen_at: '2026-09-15T10:00:00Z'})];
  accounts = data.mergeAccounts(accounts, [account('brandhelp', 20, {id: 52, snapshot: true, last_seen_at: '2026-09-15T10:01:00Z'}),
    account('anotherbrand', 80, {id: 1, snapshot: true, last_seen_at: '2026-09-15T10:01:00Z'})]);
  assert.equal(accounts.length, 2);
  assert.equal(data.metrics(accounts, []).high, 1);
  assert.equal(accounts.find(a => a.handle === 'brandhelp').id, 52);
  accounts = data.mergeAccounts(accounts, []);
  accounts = data.mergeAccounts(accounts, [account('brandhelp', 100, {id: 1, last_seen_at: '2026-09-15T09:00:00Z'})]);
  assert.equal(accounts.find(a => a.handle === 'brandhelp').latest_risk_score, 20);
  const restored = JSON.parse(JSON.stringify(accounts));
  assert.deepEqual(data.metrics(restored, []), data.metrics(accounts, []));
});

test('job activity retains completed batches on empty refreshes, but accepts terminal updates', () => {
  let jobs = [{id: 'search', kind: 'ingest', status: 'running', updated_at: '2026-09-15T10:00:00Z'}];
  jobs = data.mergeJobs(jobs, [{id: 'search', kind: 'ingest', status: 'succeeded', updated_at: '2026-09-15T10:01:00Z',
    payload: {handle: 'Brand'}, result: {pagination: {loaded_results: 100, has_more: true, continuation: 'DO-NOT-PERSIST'}, account_count: 40, posts: 60}}]);
  jobs = data.mergeJobs(jobs, []);
  assert.equal(jobs.length, 1);
  assert.equal(data.metrics([], jobs).active, 0);
  const summary = data.jobSummary(jobs[0]);
  assert.equal(summary.overview_summary.loaded, 100);
  assert.equal(summary.overview_summary.has_more, true);
  assert.ok(!JSON.stringify(summary).includes('DO-NOT-PERSIST'));
  assert.equal(data.jobSummary(summary).overview_summary.loaded, 100);
});


test('UTC timestamps with and without suffix sort identically across browser timezones', () => {
  assert.equal(data.timestamp('2026-09-15T10:00:00'), data.timestamp('2026-09-15T10:00:00Z'));
  assert.equal(data.timestamp('2026-09-15T15:30:00+05:30'), data.timestamp('2026-09-15T10:00:00Z'));
});

test('content mix deduplicates cumulative pages and retains richer media types', () => {
  const post = (id, type, handle = 'author') => ({doc_type: 'post', account_id: 1, handle,
    instagram_url: `https://www.instagram.com/p/${id}/?source=test`, post_type: type});
  let media = data.mergeMedia([], [post('A', 'post'), post('B', 'reel'), post('C', null)]);
  media = data.mergeMedia(media, [post('A', 'post'), {...post('B', null), account_id: 900}, post('D', 'carousel'),
    {doc_type: 'account', handle: 'author', instagram_url: 'https://www.instagram.com/author/'}]);
  assert.equal(media.length, 4);
  assert.equal(media.find(m => m.key === 'media:B').type, 'reels');
  assert.deepEqual(data.chartSummary([account('author', 0)], media, []).content,
    {accounts: 1, posts: 2, reels: 1, unknown: 1});
  media = data.mergeMedia(media, [{...post('B', 'reel'), instagram_url:'https://www.instagram.com/reel/B/'}]);
  assert.equal(media.length, 4);
  assert.deepEqual(data.mergeMedia([], [post('INVALID', 'post', 'author')].map(hit =>
    ({...hit, instagram_url: 'https://instagram.com.evil.test/p/INVALID/'}))), []);
  assert.deepEqual(data.chartSummary([], [], ['fake_customer_support']).content,
    {accounts: 0, posts: 0, reels: 0, unknown: 0});
});

test('follower ranges preserve zero, missing values and high-risk proportions independently', () => {
  const accounts = [account('a', 90, {followers_count: 0}), account('b', 0, {followers_count: 999}),
    account('c', 80, {followers_count: 1000}), account('d', 40, {followers_count: 10000}),
    account('e', 75, {followers_count: 100000}), account('f', 0, {followers_count: null}),
    account('g', null, {followers_count: undefined})];
  const {reach} = data.chartSummary(accounts, [], []);
  assert.deepEqual(reach, {under1k:{total:2,high:1}, '1k10k':{total:1,high:1},
    '10k100k':{total:1,high:0}, over100k:{total:1,high:1}, unknown:{total:2,high:0}});
  for (const [value, expected] of Object.entries(reach))
    assert.equal(data.filterChartAccounts(accounts, [], {kind:'reach',value}).length, expected.total);
  assert.equal(accounts[0].latest_risk_score, 90); // Visualizations never change assessments.
});

test('signal bars count unique assessed accounts, and chart filters open the matching authors', () => {
  const assessment = alert_families => ({alert_families});
  const accounts = [account('one', 80, {latest_assessment: assessment({payment_fraud:{active:true},scam_promotions:{active:true}})}),
    account('two', 0, {latest_assessment: assessment({payment_fraud:{active:false}})}),
    account('three', 75, {latest_assessment: assessment({scam_promotions:{active:true}})}), account('four', null)];
  const media = [{key:'media:A', handle:'one', type:'reels'}, {key:'media:B', handle:'one', type:'reels'},
    {key:'media:C', handle:'three', type:'posts'}];
  const summary = data.chartSummary(accounts, media, ['payment_fraud','scam_promotions','fake_customer_support']);
  assert.deepEqual(summary.families, {payment_fraud:1,scam_promotions:2,fake_customer_support:0});
  assert.equal(summary.assessed, 3);
  assert.deepEqual(data.filterChartAccounts(accounts, media, {kind:'content',value:'reels'}).map(a=>a.handle), ['one']);
  assert.deepEqual(data.filterChartAccounts(accounts, media, {kind:'family',value:'scam_promotions'}).map(a=>a.handle), ['one','three']);
  assert.equal(data.filterChartAccounts(accounts, media, null).length, 4);
  const restored = JSON.parse(JSON.stringify({accounts, media}));
  assert.deepEqual(data.chartSummary(restored.accounts, restored.media, Object.keys(summary.families)), summary);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const history = require('../darkmap/static/search-history.js');

test('history preserves all ranked rows, nested comments and assessments without live cursors', () => {
  const result = {query:'Brand', hits: Array.from({length:100}, (_, i) => ({
    doc_type: i % 2 ? 'post' : 'account', risk_score: i, score: 100-i,
    instagram_url: `https://www.instagram.com/p/${i}/`,
    image_url: `https://images.example/${i}.jpg`, comments: [{text:`Comment ${i}`}],
  }))};
  const entry = history.snapshot({id:'run-one', query:'Brand', startedAt:'2026-09-15T00:00:00Z', result,
    assessments:[{overall_score:95, evidence:[{quote:'Original evidence'}]}],
    collection:{duration_seconds:48}, pagination:{page:2, has_more:true, continuation:'NOT-TO-STORE'}});
  result.hits[0].comments[0].text = 'Changed after save';
  assert.equal(entry.result.hits.length, 100);
  assert.equal(entry.result.hits[0].comments[0].text, 'Comment 0');
  assert.equal(entry.result.hits[99].risk_score, 99);
  assert.equal(entry.assessments[0].evidence[0].quote, 'Original evidence');
  assert.equal(entry.pagination.continuation, undefined);
  const meta = history.summary(entry);
  assert.deepEqual([meta.total, meta.accounts, meta.posts, meta.batches, meta.hasMore], [100,50,50,2,true]);
  assert.equal(meta.result, undefined);
});

test('repeat queries retain separate run identities and empty successful results remain readable', () => {
  const one=history.snapshot({id:'first',query:'Brand',result:{hits:[]}});
  const two=history.snapshot({id:'second',query:'Brand',result:{hits:[]}});
  assert.notEqual(one.id,two.id);
  assert.equal(history.summary(one).total,0);
  assert.throws(() => history.snapshot({id:'unfinished'}));
});

test('history partitions access scopes without storing the key and reports unavailable storage', async () => {
  assert.equal(await history.scope(''), 'public');
  const a=await history.scope('test-access-a');
  assert.equal(a,await history.scope('test-access-a'));
  assert.notEqual(a,await history.scope('test-access-b'));
  assert.ok(!a.includes('test-access'));
  await assert.rejects(history.createStore(null).list('public'), /unavailable/);
});

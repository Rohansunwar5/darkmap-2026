const { test } = require('node:test');
const assert = require('node:assert/strict');
const describe = require('../../public/static/search-outcome.js');

test('inactive account is an error, not an empty success or automatic retry', () => {
  const view = describe({status:'failed', result:{collection_outcome:'blocked',
    collection_error:{message:'Reactivate the collection account.'},
    inline_search:{hits:[]}, pagination:{has_more:true}}});
  assert.equal(view.level, 'failed');
  assert.match(view.detail, /Reactivate/);
  assert.equal(view.save, false);
  assert.equal(view.resume, false);
});
test('the old zero-result success with branch errors cannot be saved as a completed search', () => {
  const view = describe({status:'succeeded', result:{inline_search:{hits:[]},
    pagination:{has_more:false,failed_branches:2}}});
  assert.equal(view.outcome,'failed');
  assert.equal(view.save,false);
});
test('pending first page continues automatically without a false success or empty history', () => {
  const view = describe({status:'succeeded', result:{collection_outcome:'pending',
    inline_search:{hits:[]}, pagination:{has_more:true,failed_branches:0}}});
  assert.equal(view.resume,true);
  assert.equal(view.save,false);
  assert.equal(view.level,'');
});
test('an account failure after results preserves exportable history and reports the problem', () => {
  const view = describe({status:'succeeded', result:{collection_outcome:'blocked',
    inline_search:{hits:[{handle:'test'}]}, collection_error:{message:'Account inactive.'}}});
  assert.equal(view.save,true);
  assert.equal(view.level,'failed');
  assert.equal(view.resume,false);
  assert.match(view.detail,/1 collected results are preserved/);
});
test('real completed empty search differs from source failure', () => {
  const view = describe({status:'succeeded',result:{collection_outcome:'empty',inline_search:{hits:[]}}});
  assert.equal(view.level,'succeeded');
  assert.equal(view.save,true);
  assert.equal(view.resume,false);
});
test('complete and partial result batches keep all rows and require explicit View more', () => {
  for (const failed_branches of [0,1]) {
    const view = describe({status:'succeeded',result:{inline_search:{hits:Array(50).fill({})},
      pagination:{new_results:50,has_more:true,failed_branches}}});
    assert.equal(view.save,true);
    assert.equal(view.resume,false);
    assert.match(view.detail,/50 results loaded/);
    assert.equal(view.level, failed_branches ? 'partial' : 'succeeded');
  }
});

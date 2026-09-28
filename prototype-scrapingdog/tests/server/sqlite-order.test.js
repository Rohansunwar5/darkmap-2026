import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { createStore } from '../../server/store.js';
import { entitiesOfAccount, postsForDossier, postsOfAccount, searchDocsForAccounts } from '../../server/sqlite-order.js';

test('store query orders reproduce SQLite', () => {
  const g = golden('sqlite-order');
  const store = createStore();
  for (const [, account_id, platform_post_id, posted] of g.posts) {
    store.table('posts').insert({ account_id, platform_post_id, posted_at: posted && posted.replace(' ', 'T').replace('.000000', '') });
  }
  for (const [, doc_type, account_id, post_id] of g.docs) store.table('search_documents').insert({ doc_type, account_id, post_id });
  for (const [account_id, post_id] of [[5, null], [4, 1], [5, 2], [5, null], [4, null], [5, 3]]) {
    store.table('entities').insert({ account_id, post_id, kind: 'url', value: 'v', value_lower: 'v' });
  }
  assert.deepEqual(postsOfAccount(store, 7).map(p => p.id), g.posts_of_account);
  assert.deepEqual(postsForDossier(store, 7, 40).map(p => p.id), g.posts_for_dossier);
  assert.deepEqual(searchDocsForAccounts(store, [3, 1, 2]).map(d => d.id), g.docs_in);
  assert.deepEqual(searchDocsForAccounts(store, [3, 1, 2]).map(d => d.id), g.docs_in_like);
  assert.deepEqual(store.table('search_documents').all().map(d => d.id), g.docs_like);
  assert.deepEqual(entitiesOfAccount(store, 5).map(e => e.id), g.entities_of_account);
});

// REF runs on SQLite; queries without ORDER BY return rows in the order SQLite's plan reads them.
// Pinned by tests/golden/sqlite_order.py:
//   posts WHERE account_id=?           -> ix_posts_account_posted: posted_at ASC (NULLs first), then id
//   ... ORDER BY posted_at DESC NULLS LAST -> backward index scan: the exact reverse
//   search_documents WHERE account_id IN (...) -> ix_search_documents_account_id: account_id, then id
//   entities WHERE account_id=?        -> ix_entities_account_id: id
const nullsFirst = (a, b) => (a == null ? (b == null ? 0 : -1) : b == null ? 1 : a < b ? -1 : a > b ? 1 : 0);

export const postsOfAccount = (store, accountId) => store.table('posts').whereEq('account_id', accountId)
  .sort((x, y) => nullsFirst(x.posted_at, y.posted_at) || x.id - y.id);
export const postsForDossier = (store, accountId, limit) => postsOfAccount(store, accountId).reverse().slice(0, limit);
export function searchDocsForAccounts(store, accountIds) {
  const docs = store.table('search_documents');
  return [...new Set(accountIds)].flatMap(id => docs.whereEq('account_id', id))
    .sort((x, y) => x.account_id - y.account_id || x.id - y.id);
}
export const entitiesOfAccount = (store, accountId) => store.table('entities').whereEq('account_id', accountId);
export const mediaOfPost = (store, postId) => store.table('media_assets').whereEq('post_id', postId);
export const commentsOfPost = (store, postId) => store.table('comments').whereEq('post_id', postId);

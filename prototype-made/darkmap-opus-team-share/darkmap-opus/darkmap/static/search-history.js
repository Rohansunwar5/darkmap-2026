/* Full, immutable result snapshots. History never initiates collection requests. */
(function (root, factory) {
  const history = factory();
  if (typeof module === 'object' && module.exports) module.exports = history;
  else root.DarkmapHistory = history;
})(globalThis, function () {
  'use strict';

  function snapshot({ id, query, displayQuery, startedAt, result, assessments, collection, pagination }) {
    if (!id || !Array.isArray(result?.hits)) throw new Error('Search results are not ready to save.');
    const { continuation, ...page } = pagination || {};
    return structuredClone({ version: 1, id, query, displayQuery: displayQuery || query,
      startedAt, savedAt: new Date().toISOString(), result, assessments: assessments || [],
      collection: collection || {}, pagination: pagination ? page : null });
  }

  function summary(entry) {
    return { id: entry.id, query: entry.query, displayQuery: entry.displayQuery,
      startedAt: entry.startedAt, savedAt: entry.savedAt, total: entry.result.hits.length,
      accounts: entry.result.hits.filter(hit => hit.doc_type === 'account').length,
      posts: entry.result.hits.filter(hit => hit.doc_type === 'post').length,
      hasMore: Boolean(entry.pagination?.has_more),
      partial: Boolean(entry.collection?.partial), batches: entry.pagination?.page || 1 };
  }

  async function scope(accessKey) {
    if (!accessKey) return 'public';
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('darkmap-history:' + accessKey));
    return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
  }

  function createStore(indexedDB = globalThis.indexedDB) {
    let connection;
    function open() {
      if (!connection) connection = new Promise((resolve, reject) => {
        if (!indexedDB) { reject(new Error('Search history storage is unavailable in this browser.')); return; }
        const request = indexedDB.open('darkmap-search-history', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('results', { keyPath: ['scope', 'id'] });
          const entries = db.createObjectStore('entries', { keyPath: ['scope', 'id'] });
          entries.createIndex('scope', 'scope');
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('Close other Darkmap tabs and reopen history.'));
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); connection = null; };
          resolve(db);
        };
      }).catch(error => { connection = null; throw error; });
      return connection;
    }
    async function transact(names, mode, work) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(names, mode);
        let value;
        transaction.oncomplete = () => resolve(value);
        transaction.onabort = () => reject(transaction.error || new Error('Search history could not be saved.'));
        transaction.onerror = () => {}; // The abort rejects; no partial metadata writes.
        try { work(transaction, result => { value = result; }); }
        catch (error) { transaction.abort(); reject(error); }
      });
    }
    return {
      save: (scope, entry) => transact(['entries', 'results'], 'readwrite', transaction => {
        transaction.objectStore('results').put({ scope, id: entry.id, snapshot: entry });
        transaction.objectStore('entries').put({ scope, ...summary(entry) });
      }),
      list: scope => transact(['entries'], 'readonly', (transaction, done) => {
        const request = transaction.objectStore('entries').index('scope').getAll(scope);
        request.onsuccess = () => done(request.result.sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
      }),
      get: (scope, id) => transact(['results'], 'readonly', (transaction, done) => {
        const request = transaction.objectStore('results').get([scope, id]);
        request.onsuccess = () => done(request.result?.snapshot || null);
      }),
      remove: (scope, id) => transact(['entries', 'results'], 'readwrite', transaction => {
        transaction.objectStore('entries').delete([scope, id]);
        transaction.objectStore('results').delete([scope, id]);
      }),
    };
  }
  return { snapshot, summary, scope, createStore };
});

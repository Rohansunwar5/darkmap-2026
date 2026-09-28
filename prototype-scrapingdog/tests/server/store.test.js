import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import * as realFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IntegrityError, createStore } from '../../server/store.js';

test('insert assigns max+1 ids, reusing the max after it is deleted (SQLite rowid)', () => {
  const store = createStore();
  const docs = store.table('search_documents');
  const a = docs.insert({ doc_type: 'account', account_id: 1, post_id: null });
  const b = docs.insert({ doc_type: 'post', account_id: 1, post_id: 5 });
  assert.deepEqual([a.id, b.id], [1, 2]);
  docs.remove(b.id);
  assert.equal(docs.insert({ doc_type: 'post', account_id: 1, post_id: 6 }).id, 2);
});

test('unique keys reject duplicates, and a null part disables the check like SQL', () => {
  const store = createStore();
  const posts = store.table('posts');
  posts.insert({ account_id: 1, platform_post_id: 'x' });
  assert.throws(() => posts.insert({ account_id: 1, platform_post_id: 'x' }), IntegrityError);
  posts.insert({ account_id: 1, platform_post_id: null });
  posts.insert({ account_id: 1, platform_post_id: null });
  assert.equal(posts.byUnique(0, 1, 'x').platform_post_id, 'x');
  const row = posts.find(p => p.platform_post_id === null);
  posts.update(row.id, { platform_post_id: 'y' });
  assert.equal(posts.byUnique(0, 1, 'y').id, row.id);
});

test('audit_logs keeps the latest 5000 rows', () => {
  const store = createStore();
  const logs = store.table('audit_logs');
  for (let i = 0; i < 5002; i++) logs.insert({ action: `a${i}` });
  assert.equal(logs.count(), 5000);
  assert.equal(logs.all()[0].action, 'a2');
});

test('flush writes atomically and load restores every table', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-'));
  const file = join(dir, 'data', 'darkmap.json');
  const store = createStore({ file });
  store.table('brands').insert({ name: 'Acme', official_handles: ['acme'] });
  store.save();
  await store.flush();
  const again = createStore({ file });
  again.load();
  assert.equal(again.table('brands').find(b => b.name === 'Acme').official_handles[0], 'acme');
  assert.equal(again.table('brands').insert({ name: 'B' }).id, 2);
});

test('rename retries on EPERM and never truncates the previous file (Review Focus 5)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-'));
  const file = join(dir, 'darkmap.json');
  writeFileSync(file, JSON.stringify({ version: 1, tables: { brands: [{ id: 1, name: 'Old' }] } }));
  let failures = 2;
  const fs = { ...realFs, renameSync(from, to) {
    if (failures-- > 0) throw Object.assign(new Error('locked'), { code: 'EPERM' });
    return realFs.renameSync(from, to);
  } };
  const store = createStore({ file, fs });
  store.load();
  store.table('brands').insert({ name: 'New' });
  store.save();
  await store.flush();
  assert.match(readFileSync(file, 'utf8'), /"New"/);

  const alwaysLocked = { ...realFs, renameSync() { throw Object.assign(new Error('locked'), { code: 'EBUSY' }); } };
  const locked = createStore({ file, fs: alwaysLocked });
  locked.load();
  locked.table('brands').insert({ name: 'Lost?' });
  locked.save();
  await assert.rejects(locked.flush(), /EBUSY|locked/);
  assert.match(readFileSync(file, 'utf8'), /"New"/);
});

test('a corrupt data file is reported, not overwritten', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-'));
  const file = join(dir, 'darkmap.json');
  writeFileSync(file, '{not json');
  assert.throws(() => createStore({ file }).load(), /corrupt/);
  assert.equal(readFileSync(file, 'utf8'), '{not json');
  assert.ok(existsSync(file));
});

test('a save that failed does not block later saves (Review Focus 5)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-'));
  const file = join(dir, 'darkmap.json');
  let locked = true;
  const fs = { ...realFs, renameSync(from, to) {
    if (locked) throw Object.assign(new Error('locked'), { code: 'EBUSY' });
    return realFs.renameSync(from, to);
  } };
  const store = createStore({ file, fs });
  store.table('brands').insert({ name: 'First' });
  store.save();
  await assert.rejects(store.flush(), /locked/);
  locked = false;
  store.table('brands').insert({ name: 'Second' });
  store.save();
  await store.flush();
  assert.match(readFileSync(file, 'utf8'), /"First".*"Second"/s);
});

test('review Important 5: equality lookups use indexes that follow insert, update, remove and load', async () => {
  const store = createStore();
  const posts = store.table('posts');
  const a = posts.insert({ account_id: 1, platform_post_id: 'a' });
  const b = posts.insert({ account_id: 2, platform_post_id: 'b' });
  const c = posts.insert({ account_id: 1, platform_post_id: 'c' });
  assert.deepEqual(posts.whereEq('account_id', 1).map(p => p.id), [a.id, c.id]);
  posts.update(b.id, { account_id: 1 });
  assert.deepEqual(posts.whereEq('account_id', 1).map(p => p.id), [a.id, b.id, c.id], 'id order, not index insertion order');
  posts.remove(a.id);
  assert.deepEqual(posts.whereEq('account_id', 1).map(p => p.id), [b.id, c.id]);
  assert.deepEqual(posts.whereEq('account_id', 2), []);
  assert.deepEqual(posts.whereEq('platform_post_id', 'c').map(p => p.id), [c.id], 'unindexed fields still answer');
  const d = posts.insert({ account_id: 3, platform_post_id: 'd' });
  posts.remove(d.id);
  assert.equal(posts.insert({ account_id: 3, platform_post_id: 'e' }).id, d.id, 'max+1 after deleting the max');
  const dir = mkdtempSync(join(tmpdir(), 'dm-'));
  const file = join(dir, 'darkmap.json');
  const saved = createStore({ file });
  saved.table('comments').insert({ post_id: 9, text: 'x' });
  saved.save();
  await saved.flush();
  const loaded = createStore({ file });
  loaded.load();
  assert.equal(loaded.table('comments').whereEq('post_id', 9).length, 1);
  assert.equal(loaded.table('comments').insert({ post_id: 9 }).id, 2);
});

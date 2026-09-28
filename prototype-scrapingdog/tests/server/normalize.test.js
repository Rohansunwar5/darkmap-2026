import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../server/store.js';
import { rawAccount, rawBundle, rawComment, rawMedia, rawPost } from '../../server/raw.js';
import { ingestBundle } from '../../server/normalize.js';

const fetched = { provider: 'scrapingdog_instagram', collection_mode: 'keyword', lawful_basis: 'licensed_public_data_api' };
const snippet = { ...fetched, collection_mode: 'keyword_serp_fallback' };
const account = (fields = {}) => rawAccount({ handle: 'luminaire.support', display_name: 'Luminaire Support',
  biography: 'Official help desk #luminaire', followers_count: 120, ...fields });
const post = (fields = {}) => rawPost({ platform_post_id: '901', shortcode: 'ABC', post_type: 'reel',
  permalink: 'https://www.instagram.com/reel/ABC/', caption: 'Claim now t.me/lootdeal #loot', ...fields });

test('REF test_ingest_bundle_is_idempotent: re-ingesting the same bundle keeps one of everything', () => {
  const store = createStore();
  const bundle = rawBundle(account(), [post({ media: [rawMedia({ media_type: 'image', media_url: 'https://cdn/x.jpg' })],
    comments: [rawComment({ platform_comment_id: 'c1', author_handle: 'v', text: 'scammed me' })] })], fetched);
  const first = ingestBundle(store, bundle);
  const second = ingestBundle(store, structuredClone(bundle));
  assert.equal(first.account_id, second.account_id);
  assert.deepEqual(second, { posts: 1, media: 1, comments: 1, account_id: first.account_id });
  assert.equal(store.table('posts').count(), 1);
  assert.equal(store.table('media_assets').count(), 1);
  assert.equal(store.table('comments').count(), 1);
  assert.equal(store.table('search_documents').count(), 2);
});

test('REF test_missing_verification_metadata_remains_unknown', () => {
  const store = createStore();
  const { account_id } = ingestBundle(store, rawBundle(account({ is_verified: null }), [], fetched));
  assert.equal(store.table('accounts').get(account_id).is_verified, null);
});

test('FIX-1: a search snippet never overwrites a fetched profile (REF would)', () => {
  const store = createStore();
  const { account_id } = ingestBundle(store, rawBundle(account(), [], fetched));
  ingestBundle(store, rawBundle(account({ display_name: 'luminaire.support', biography: 'Instagram · snippet text',
    followers_count: null, external_url: 'https://luminaire-help.xyz' }), [], snippet));
  const row = store.table('accounts').get(account_id);
  assert.equal(row.display_name, 'Luminaire Support');
  assert.equal(row.biography, 'Official help desk #luminaire');
  assert.equal(row.external_url, 'https://luminaire-help.xyz');   // null fields may still be filled
  assert.equal(row.provenance.collection_mode, 'keyword');
});

test('FIX-2: re-import keeps entities of posts absent from the new bundle (REF deletes them)', () => {
  const store = createStore();
  const { account_id } = ingestBundle(store, rawBundle(account(), [post()], fetched));
  ingestBundle(store, rawBundle(account(), [post({ platform_post_id: '902', shortcode: 'DEF',
    permalink: 'https://www.instagram.com/reel/DEF/', caption: 'new post' })], fetched));
  const values = store.table('entities').where(e => e.account_id === account_id).map(e => e.value);
  assert.ok(values.includes('t.me/lootdeal'), values.join(','));
  const doc = store.table('search_documents').find(d => d.post_id === 1);
  assert.deepEqual(doc.hashtags, ['loot']);
});

test('FIX-3: one post is one row across snippet and fetched records, and a snippet never overwrites it', () => {
  const store = createStore();
  const url = 'https://www.instagram.com/reel/ABC/';
  ingestBundle(store, rawBundle(account(), [post({ platform_post_id: url, caption: 'snippet caption', like_count: null })], snippet));
  ingestBundle(store, rawBundle(account(), [post({ like_count: 77 })], fetched));
  assert.equal(store.table('posts').count(), 1);
  const row = store.table('posts').all()[0];
  assert.equal(row.platform_post_id, '901');
  assert.equal(row.like_count, 77);
  ingestBundle(store, rawBundle(account(), [post({ platform_post_id: url, caption: 'snippet again', like_count: null })], snippet));
  assert.equal(store.table('posts').all()[0].caption, 'Claim now t.me/lootdeal #loot');
});

test('FIX-3: a post with no derivable key is skipped instead of stored with a null key', () => {
  const store = createStore();
  const result = ingestBundle(store, rawBundle(account(), [rawPost({ caption: 'orphan' })], fetched));
  assert.equal(result.posts, 0);
  assert.equal(store.table('posts').count(), 0);
});

test('FIX-3: one post twice in a bundle (/p/ and /reel/ URL, same id) updates one row, as REF does', () => {
  const store = createStore();
  const result = ingestBundle(store, rawBundle(account(), [
    post({ post_type: 'post', permalink: 'https://www.instagram.com/p/ABC/', caption: 'from the profile' }),
    post({ like_count: 77 })], fetched));
  assert.equal(result.posts, 1, 'the two records are one post (collapsed before ingest)');
  assert.equal(store.table('posts').count(), 1);
  assert.equal(store.table('posts').all()[0].like_count, 77);
});

test('review Important 4: one post twice in a bundle stores its entities once and keeps the richer fields', () => {
  const store = createStore();
  const caption = 'Claim now t.me/lootdeal #loot @helper';
  ingestBundle(store, rawBundle(account(), [
    post({ post_type: 'post', permalink: 'https://www.instagram.com/p/ABC/', caption, view_count: 5000 }),
    post({ caption, like_count: 77 })], fetched));
  const [row] = store.table('posts').all();
  assert.deepEqual([store.table('posts').count(), row.like_count, row.view_count, row.post_type], [1, 77, 5000, 'reel']);
  const kinds = store.table('entities').where(e => e.post_id === row.id).map(e => e.kind).sort();
  assert.deepEqual(kinds, ['hashtag', 'mention', 'url']);
});

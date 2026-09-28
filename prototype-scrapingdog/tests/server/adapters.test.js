import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commentsToNodes, googleToOrganic, postToNode, profileToNode } from '../../server/adapters.js';
import { ValueError } from '../../server/errors.js';

const recorded = name => JSON.parse(readFileSync(new URL(`../fixtures/scrapingdog/${name}.json`, import.meta.url))).json;

test('blank or invalid Google replies are failures, not empty searches (REF test_empty_gateway_response...)', () => {
  for (const body of [null, {}, { body: '' }, { error: 'upstream failure' }, 'text']) {
    assert.throws(() => googleToOrganic(body), ValueError, JSON.stringify(body));
  }
  assert.deepEqual(googleToOrganic({ organic_results: [] }), []);
});

test('recorded Google reply maps to REF organic items', () => {
  const organic = googleToOrganic(recorded('google-standard'));
  assert.ok(organic.length > 0);
  for (const item of organic) {
    assert.ok(Object.keys(item).every(k => ['link', 'title', 'description', 'snippet', 'source', 'image'].includes(k)));
    assert.match(item.link, /^https?:\/\//);
  }
});

test('recorded profile, post and comments map every spec §7.3 key', () => {
  const profile = profileToNode(recorded('profile'));
  for (const key of ['account', 'id', 'full_name', 'biography', 'profile_image_link', 'followers', 'posts']) {
    assert.ok(key in profile, `profile.${key}`);
  }
  assert.equal(typeof profile.account, 'string');
  const node = postToNode(recorded('post'), 'https://www.instagram.com/p/FROM-PROBE/');
  for (const key of ['url', 'shortcode', 'description', 'likes', 'num_comments', 'user_posted']) assert.ok(key in node, `post.${key}`);
  const comments = commentsToNodes(recorded('comments'), 'https://www.instagram.com/p/FROM-PROBE/');
  assert.ok(comments.length > 0);
  for (const c of comments) for (const key of ['post_url', 'comment_id', 'comment_user', 'comment']) assert.ok(key in c, `comment.${key}`);
});

// Exact values, written by hand from tests/fixtures/scrapingdog/CONTRACT.md and the recordings.
import { postsToNodes, postsTotal } from '../../server/adapters.js';

test('Google: advance_search keeps the author in source; the snippet maps to description once', () => {
  const [first] = googleToOrganic(recorded('google-advanced'));
  assert.deepEqual(first, { link: 'https://www.instagram.com/nike/', title: 'Nike (@nike) · Beaverton, OR',
    description: recorded('google-advanced').organic_results[0].snippet, source: 'Instagram\u00a0·\u00a0nike' });
  const [standard] = googleToOrganic(recorded('google-standard'));
  assert.deepEqual(Object.keys(standard), ['link', 'title', 'description']);
});

test('profile node carries CONTRACT §3 values and embedded posts classify clips as reels', () => {
  const profile = profileToNode(recorded('profile'));
  const raw = recorded('profile');
  assert.deepEqual([profile.account, profile.id, profile.full_name, profile.biography, profile.external_url,
    profile.profile_image_link, profile.is_verified, profile.followers, profile.following],
  ['nike', '13460080', 'Nike', 'Just Do It.', 'http://empli.fi/nike', raw.profile_pic_url_hd, true, 291145856, 266]);
  assert.equal(profile.posts.length, 12);
  const [clip, carousel] = profile.posts;
  assert.deepEqual([clip.url, clip.post_id, clip.shortcode, clip.content_type, clip.user_posted, clip.likes],
    ['https://www.instagram.com/reel/Ddl5eH-u4le/', '3991849403537918302', 'Ddl5eH-u4le', 'Reel', 'nike', null]);
  assert.deepEqual([carousel.url, carousel.content_type], ['https://www.instagram.com/p/DdcI8NLmY21/', 'Carousel']);
  assert.ok(!('id' in clip), 'post nodes use post_id so REF _account never reads a post id as the account id');
});

test('Posts API nodes carry engagement, and total_posts is the posts count', () => {
  const [first] = postsToNodes(recorded('posts'));
  assert.deepEqual([first.url, first.likes, first.num_comments, first.views, first.user_posted, first.date_posted],
    ['https://www.instagram.com/reel/Ddl5eH-u4le/', 51946, 736, 319636, 'nike', 1790085604]);
  assert.equal(postsToNodes(recorded('posts')).length, 12);
  assert.equal(postsTotal(recorded('posts')), 1667);
});

test('Post Details: author from the description (account.username is "reel"), reel type from ScrapingDog URL', () => {
  const url = 'https://www.instagram.com/p/Ddl5eH-u4le/';
  const node = postToNode(recorded('post'), url);
  assert.deepEqual([node.url, node.post_id, node.shortcode, node.content_type, node.likes, node.num_comments,
    node.user_posted, node.owner.id, node.date_posted],
  [url, '3991849403537918302', 'Ddl5eH-u4le', 'Reel', 51946, 736, 'nike', '13460080', '2026-09-22T14:00:04.000Z']);
  assert.equal(node.latest_comments.length, 3);
  assert.equal(node.latest_comments[0].comment_user, 'perkasaaudiangga');
  assert.equal(postToNode(recorded('reel'), 'https://www.instagram.com/reel/DUTalcSCbgP/').user_posted, 'nike');
  const nameless = postToNode({ post: { caption: 'x' }, account: { username: 'reel' }, comments: [] }, url);
  assert.equal(nameless.user_posted, null);
});

test('comments map to REF comment nodes; replies nest under their parent', () => {
  const url = 'https://www.instagram.com/p/Ddl5eH-u4le/';
  const [first] = commentsToNodes(recorded('comments'), url);
  assert.deepEqual(first, { post_url: url, comment_id: '17948240022295713', comment_user: 'perkasaaudiangga',
    comment: '😍❤️', likes_number: 0, comment_date: '2026-09-23T11:15:34.000Z', replies: [] });
  const threaded = commentsToNodes({ comments: [
    { id: 'a', text: 'q', user: { username: 'u1' }, parent_comment_id: null },
    { id: 'b', text: 'r', user: { username: 'u2' }, parent_comment_id: 'a' }] }, url);
  assert.deepEqual(threaded.map(c => [c.comment_id, c.replies.map(r => r.comment_id)]), [['a', ['b']]]);
});

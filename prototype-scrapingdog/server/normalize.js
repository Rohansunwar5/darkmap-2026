// Port of REF darkmap/normalize.py with the approved data fixes (spec §8).
import { record as auditRecord } from './audit.js';
import { domainOf, extract } from './engine/extract.js';
import { dedupe, or, pyLstrip, pySlice, sorted, truthy } from './engine/pycompat.js';
import { ValueError } from './errors.js';
import { commentsOfPost, entitiesOfAccount, mediaOfPost, postsOfAccount } from './sqlite-order.js';
import { utcnowIso } from './time.js';

const ACCOUNT_FIELDS = ['platform_account_id', 'display_name', 'biography', 'external_url', 'profile_pic_url',
  'is_verified', 'is_business', 'followers_count', 'follows_count', 'media_count', 'account_created_at'];
const ACCOUNT_DEFAULTS = { platform: 'instagram', platform_account_id: null, display_name: null, biography: null,
  external_url: null, profile_pic_url: null, is_verified: null, is_business: null, followers_count: null,
  follows_count: null, media_count: null, account_created_at: null, brand_id: null, latest_risk_score: null,
  latest_action: null, provenance: {}, raw: {} };
const POST_DEFAULTS = { shortcode: null, post_type: 'post', permalink: null, caption: null, caption_lower: null,
  posted_at: null, like_count: null, comment_count: null, view_count: null, share_count: null, language: null,
  provenance: {}, raw: {} };
const lower = value => (typeof value === 'string' ? value.toLowerCase() : null);
const isUrl = value => typeof value === 'string' && /^https?:\/\//.test(value);

export const isDiscoveryGrade = provenance => or(provenance, {}).collection_mode === 'keyword_serp_fallback';

export function upsertAccount(store, bundle, { clock = Date.now } = {}) {
  const ra = bundle.account;
  const handle = pyLstrip(or(ra.handle, ''), '@');
  if (!handle) throw new ValueError('bundle has no account handle');
  const accounts = store.table('accounts');
  const now = utcnowIso(clock);
  let acc = accounts.byUnique(0, ra.platform, handle.toLowerCase());
  const existed = acc != null;
  if (!acc) acc = accounts.insert({ ...ACCOUNT_DEFAULTS, platform: ra.platform, handle,
    handle_lower: handle.toLowerCase(), first_seen_at: now, last_seen_at: now });
  // FIX-1: a discovery-grade bundle may only fill fields that are still null on an already-fetched account.
  const protect = existed && isDiscoveryGrade(bundle.provenance) && !isDiscoveryGrade(acc.provenance);
  for (const field of ACCOUNT_FIELDS) {
    const value = ra[field];
    if (value != null && (!protect || acc[field] == null)) acc[field] = value;
  }
  acc.last_seen_at = now;
  if (!protect) {
    acc.provenance = or(bundle.provenance, {});
    acc.raw = or(ra.raw, {});
  }
  return acc;
}

function storeEntities(store, { account_id, post_id, comment_id, text, source_field, now }) {
  const found = extract(text);
  for (const [kind, values] of Object.entries(found)) {
    for (const value of values) {
      store.table('entities').insert({ account_id, post_id, comment_id, kind, value: pySlice(value, 0, 600),
        value_lower: pySlice(value.toLowerCase(), 0, 600), domain: kind === 'url' ? domainOf(value) : null,
        source_field, created_at: now });
    }
  }
}

// FIX-3: identify a post by shortcode first, then by REF's key (platform_post_id or shortcode or permalink).
const refKey = rp => or(rp.platform_post_id, rp.shortcode, rp.permalink);
function findPost(store, accountId, rp) {
  const posts = store.table('posts');
  if (truthy(rp.shortcode)) {
    const byCode = posts.whereEq('account_id', accountId).find(p => p.shortcode === rp.shortcode);
    if (byCode) return byCode;
  }
  const pid = refKey(rp);
  return truthy(pid) ? posts.byUnique(0, accountId, pid) : null;
}

// FIX-3, one post per shortcode within a bundle too: REF's _bundles keys posts by permalink, so /p/ABC/ and /reel/ABC/
// both arrive. Merge them before ingesting, so their entities are stored once: later non-empty fields win (as REF
// merges accounts), a specific post_type beats 'post', a real id beats a URL, and media and comments are united.
const emptyValue = value => value == null || value === ''
  || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
const commentKey = c => (truthy(c.platform_comment_id) ? `id:${c.platform_comment_id}` : JSON.stringify([c.author_handle, c.text]));
function collapsePosts(posts) {
  const byKey = new Map();
  const out = [];
  for (const rp of posts) {
    const key = or(rp.shortcode, refKey(rp));
    const merged = truthy(key) ? byKey.get(key) : null;
    if (!merged) {
      const copy = { ...rp, media: [...rp.media], comments: [...rp.comments] };
      if (truthy(key)) byKey.set(key, copy);
      out.push(copy);
      continue;
    }
    for (const [field, value] of Object.entries(rp)) {
      if (field === 'media' || field === 'comments' || emptyValue(value)) continue;
      if (field === 'post_type' && value === 'post') continue;
      if (field === 'platform_post_id' && isUrl(value) && truthy(merged.platform_post_id)) continue;
      merged[field] = value;
    }
    const mediaKeys = new Set(merged.media.map(m => m.media_url ?? m.thumbnail_url));
    for (const m of rp.media) if (!mediaKeys.has(m.media_url ?? m.thumbnail_url)) merged.media.push(m);
    const commentKeys = new Set(merged.comments.map(commentKey));
    for (const c of rp.comments) if (!commentKeys.has(commentKey(c))) merged.comments.push(c);
  }
  return out;
}

export function ingestBundle(store, bundle, { brand = null, clock = Date.now } = {}) {
  const now = utcnowIso(clock);
  const acc = upsertAccount(store, bundle, { clock });
  if (brand != null && acc.brand_id == null) acc.brand_id = brand.id;
  const sparse = isDiscoveryGrade(bundle.provenance);
  const bundlePosts = collapsePosts(bundle.posts);
  const matches = bundlePosts.map(rp => findPost(store, acc.id, rp));
  // FIX-3b: fetched posts are protected from discovery-grade bundles, exactly like FIX-1 protects accounts.
  const isProtected = post => post != null && sparse && !isDiscoveryGrade(post.provenance);
  // FIX-2: delete only profile-level entities and those of posts this bundle rewrites.
  const rewritten = new Set(matches.filter(p => p && !isProtected(p)).map(p => p.id));
  store.table('entities').removeEq('account_id', acc.id, e => e.post_id == null || rewritten.has(e.post_id));
  storeEntities(store, { account_id: acc.id, post_id: null, comment_id: null,
    text: [acc.biography, acc.display_name].filter(truthy).join(' '), source_field: 'bio', now });
  if (truthy(acc.external_url)) {
    store.table('entities').insert({ account_id: acc.id, post_id: null, comment_id: null, kind: 'url',
      value: pySlice(acc.external_url, 0, 600), value_lower: pySlice(acc.external_url.toLowerCase(), 0, 600),
      domain: domainOf(acc.external_url), source_field: 'external_url', created_at: now });
  }
  const counts = { posts: 0, media: 0, comments: 0 };
  bundlePosts.forEach(rp => {
    // Look up again, as REF selects per post: an earlier record in this bundle may already have created the row.
    let post = findPost(store, acc.id, rp);
    const pid = refKey(rp);
    if (post == null && !truthy(pid)) return;                       // FIX-3: no derivable key
    if (isProtected(post)) { counts.posts += 1; return; }            // FIX-3b
    const posts = store.table('posts');
    if (post == null) post = posts.insert({ ...POST_DEFAULTS, account_id: acc.id, platform_post_id: pid });
    else if (truthy(rp.platform_post_id) && !isUrl(rp.platform_post_id) && post.platform_post_id !== rp.platform_post_id) {
      posts.update(post.id, { platform_post_id: rp.platform_post_id });   // FIX-3: fetched id replaces a URL key
    }
    posts.update(post.id, { shortcode: rp.shortcode, post_type: or(rp.post_type, 'post').toLowerCase(),
      permalink: rp.permalink, caption: rp.caption, caption_lower: lower(rp.caption), posted_at: rp.posted_at,
      like_count: rp.like_count, comment_count: rp.comment_count, view_count: rp.view_count,
      share_count: rp.share_count, language: rp.language, provenance: or(bundle.provenance, {}),
      raw: or(rp.raw, {}), ingested_at: now });
    counts.posts += 1;
    store.table('media_assets').removeEq('post_id', post.id);
    for (const rm of rp.media) {
      const observations = { ...or(rm.exif, {}) };
      for (const k of ['transcript', 'qr_payloads', 'brand_match_score', 'synthetic_media_score']) {
        const value = rm[k];
        if (!(value == null || value === '' || (Array.isArray(value) && value.length === 0))) observations[k] = value;
      }
      store.table('media_assets').insert({ post_id: post.id, media_type: rm.media_type, media_url: rm.media_url,
        thumbnail_url: rm.thumbnail_url, width: rm.width, height: rm.height, duration_seconds: rm.duration_seconds,
        mime_type: rm.mime_type, byte_size: rm.byte_size, perceptual_hash: rm.perceptual_hash,
        ocr_text: rm.ocr_text, exif: observations, provenance: or(bundle.provenance, {}) });
      counts.media += 1;
    }
    store.table('comments').removeEq('post_id', post.id);
    for (const rc of rp.comments) {
      const comment = store.table('comments').insert({ post_id: post.id, platform_comment_id: rc.platform_comment_id,
        parent_platform_comment_id: rc.parent_platform_comment_id, author_handle: rc.author_handle, text: rc.text,
        text_lower: lower(rc.text), like_count: rc.like_count, created_at: rc.created_at,
        provenance: or(bundle.provenance, {}) });
      counts.comments += 1;
      storeEntities(store, { account_id: acc.id, post_id: post.id, comment_id: comment.id, text: or(rc.text, ''),
        source_field: 'comment', now });
    }
    storeEntities(store, { account_id: acc.id, post_id: post.id, comment_id: null,
      text: [rp.caption, ...rp.media.map(m => m.ocr_text)].filter(truthy).join(' '), source_field: 'caption', now });
  });
  reindexAccount(store, acc, { clock });
  const provenance = or(bundle.provenance, {});
  auditRecord(store, { action: 'ingest.normalize', provider: provenance.provider ?? null, target: acc.handle,
    status: 'ok', lawful_basis: provenance.lawful_basis ?? null, detail: { ...counts } }, clock);
  return { ...counts, account_id: acc.id };
}

export function reindexAccount(store, acc, { clock = Date.now } = {}) {
  const now = utcnowIso(clock);
  const ents = entitiesOfAccount(store, acc.id);
  const vals = (kind, postId = null) => sorted(dedupe(ents
    .filter(e => e.kind === kind && (postId == null || e.post_id === postId)).map(e => e.value_lower)));
  const docs = store.table('search_documents');
  docs.removeEq('account_id', acc.id);
  const body = [acc.display_name, acc.biography, acc.external_url].filter(truthy).join(' \n ');
  docs.insert({ doc_type: 'account', account_id: acc.id, post_id: null, handle: acc.handle,
    title: or(acc.display_name, acc.handle), body, body_lower: (body || '').toLowerCase(),
    hashtags: vals('hashtag'), mentions: vals('mention'),
    domains: sorted(dedupe(ents.filter(e => e.kind === 'url' && truthy(e.domain)).map(e => e.domain))),
    risk_score: acc.latest_risk_score, posted_at: acc.last_seen_at, updated_at: now });
  for (const post of postsOfAccount(store, acc.id)) {
    const ocr = mediaOfPost(store, post.id).map(m => or(m.ocr_text, '')).join(' ');
    const commentText = commentsOfPost(store, post.id).map(c => or(c.text, '')).join(' \n ');
    const postBody = [post.caption, ocr, commentText].filter(truthy).join(' \n ');
    docs.insert({ doc_type: 'post', account_id: acc.id, post_id: post.id, handle: acc.handle,
      title: `${acc.handle} ${post.post_type}`, body: postBody, body_lower: (postBody || '').toLowerCase(),
      hashtags: vals('hashtag', post.id), mentions: vals('mention', post.id),
      domains: sorted(dedupe(ents.filter(e => e.kind === 'url' && e.post_id === post.id && truthy(e.domain))
        .map(e => e.domain))),
      risk_score: acc.latest_risk_score, posted_at: post.posted_at, updated_at: now });
  }
}

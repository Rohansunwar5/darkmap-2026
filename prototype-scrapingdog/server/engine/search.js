// Port of REF darkmap/search.py over the store, reproducing the SQLite semantics REF's query relies on: LIKE is a
// literal, ASCII-only case-insensitive substring test; lower() folds A-Z only; JSON columns are the json.dumps text
// SQLAlchemy stores (ensure_ascii); rows without ORDER BY come back in SQLite's index order (sqlite-order.js).
import { searchDocsForAccounts } from '../sqlite-order.js';
import { or, pyFind, pyLen, pyLstrip, pyRound, pySlice, pyStr, pyStrip, pySum, sorted, truthy } from './pycompat.js';

const MIN_TIMESTAMP = '0001-01-01T00:00:00';   // stands in for datetime.min; isoformat strings compare as datetimes
const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.webm'];

const asciiLower = s => s.replace(/[A-Z]/g, c => c.toLowerCase());
const like = (haystack, term) => haystack != null && asciiLower(String(haystack)).includes(asciiLower(term));
// Python json.dumps(list): ', ' separators and ensure_ascii escapes (everything outside space..'~').
const jsonString = s => JSON.stringify(s).replace(/[\u007f-￿]/g,
  ch => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
const jsonText = list => (list == null ? null
  : `[${list.map(v => (typeof v === 'string' ? jsonString(v) : JSON.stringify(v))).join(', ')}]`);
const nullsFirst = (a, b) => (a == null ? (b == null ? 0 : -1) : b == null ? 1 : a < b ? -1 : a > b ? 1 : 0);

export function snippet(body, term, width = 180) {
  if (!truthy(body)) return null;
  if (!truthy(term)) return pySlice(body, 0, width);
  const idx = pyFind(body.toLowerCase(), term.toLowerCase());
  if (idx < 0) return pySlice(body, 0, width);
  const start = Math.max(0, idx - Math.floor(width / 3));
  return (start ? '...' : '') + pySlice(body, start, start + width) + (start + width < pyLen(body) ? '...' : '');
}

const EMPTY_FACETS = { accounts: 0, posts: 0, hashtags: 0, mentions: 0, urls: 0 };

export function search(store, { q = null, docType = null, scope = 'all', accountIds = null, handle = null,
  hashtag = null, domain = null, mention = null, minRisk = null, since = null, until = null, limit = 25,
  offset = 0 } = {}) {
  if (accountIds != null && !accountIds.length) {
    return { query: q, scope, total: 0, total_all: 0, facets: { ...EMPTY_FACETS }, hits: [] };
  }
  const nq = truthy(q) ? pyLstrip(pyStrip(q.toLowerCase()), '#@') : '';
  let rows = accountIds != null ? searchDocsForAccounts(store, accountIds) : store.table('search_documents').all();
  if (truthy(docType)) rows = rows.filter(d => d.doc_type === docType);
  if (truthy(handle)) {
    const wanted = pyLstrip(handle.toLowerCase(), '@');
    rows = rows.filter(d => d.handle != null && asciiLower(d.handle) === wanted);
  }
  if (minRisk != null) rows = rows.filter(d => d.risk_score != null && d.risk_score >= minRisk);
  if (truthy(since)) rows = rows.filter(d => d.posted_at != null && d.posted_at >= since);
  if (truthy(until)) rows = rows.filter(d => d.posted_at != null && d.posted_at <= until);
  if (nq) {
    rows = rows.filter(d => like(d.body_lower, nq) || like(d.handle, nq) || like(d.title, nq)
      || like(jsonText(d.hashtags), nq) || like(jsonText(d.mentions), nq) || like(jsonText(d.domains), nq));
  }
  rows = rows.slice(0, 2000);

  const accountOf = r => (r.account_id == null ? null : store.table('accounts').get(r.account_id));
  const has = (list, needle) => {
    const n = pyLstrip(needle.toLowerCase(), '#@');
    return or(list, []).some(v => n === pyLstrip(pyStr(v).toLowerCase(), '#@'));
  };
  const contains = (list, needle) => {
    const n = pyLstrip(needle.toLowerCase(), '#@');
    return or(list, []).some(v => pyLstrip(pyStr(v).toLowerCase(), '#@').includes(n));
  };
  function matchedFields(r) {
    if (!nq) {
      const fields = [r.doc_type];
      if (truthy(r.hashtags)) fields.push('hashtags');
      if (truthy(r.mentions)) fields.push('mentions');
      if (truthy(r.domains)) fields.push('urls');
      return fields;
    }
    const fields = [];
    if (or(r.handle, '').toLowerCase().includes(nq)) fields.push('account');
    if (or(r.title, '').toLowerCase().includes(nq)) fields.push('title');
    if (or(r.body_lower, '').includes(nq)) fields.push('content');
    if (contains(r.hashtags, nq)) fields.push('hashtags');
    if (contains(r.mentions, nq)) fields.push('mentions');
    if (contains(r.domains, nq)) fields.push('urls');
    return fields;
  }

  if (truthy(hashtag)) rows = rows.filter(r => has(r.hashtags, hashtag));
  if (truthy(mention)) rows = rows.filter(r => has(r.mentions, mention));
  if (truthy(domain)) {
    const d = domain.toLowerCase();
    rows = rows.filter(r => or(r.domains, []).some(x => {
      const value = pyStr(x).toLowerCase();
      return d === value || value.endsWith(`.${d}`);
    }));
  }

  let rowsWithFields = rows.map(r => [r, matchedFields(r)]);
  if (nq) rowsWithFields = rowsWithFields.filter(([, fields]) => fields.length);

  const facets = {
    accounts: rowsWithFields.filter(([r]) => r.doc_type === 'account').length,
    posts: rowsWithFields.filter(([r]) => r.doc_type === 'post').length,
    hashtags: rowsWithFields.filter(([, fields]) => fields.includes('hashtags')).length,
    mentions: rowsWithFields.filter(([, fields]) => fields.includes('mentions')).length,
    urls: rowsWithFields.filter(([, fields]) => fields.includes('urls')).length,
  };
  const totalAll = rowsWithFields.length;
  if (scope === 'accounts') rowsWithFields = rowsWithFields.filter(([r]) => r.doc_type === 'account');
  else if (scope === 'posts') rowsWithFields = rowsWithFields.filter(([r]) => r.doc_type === 'post');
  else if (['hashtags', 'mentions', 'urls'].includes(scope)) {
    rowsWithFields = rowsWithFields.filter(([, fields]) => fields.includes(scope));
  }

  // Fraud evidence remains the main factor. Among similarly relevant/scored results, smaller accounts rise because
  // throwaway impersonators usually have limited reach; established and verified mention pages receive a downward
  // investigation-priority adjustment without being allowed to hide strong fraud evidence.
  function rankFactors(r) {
    const factors = { risk: Number(or(r.risk_score, 0)) / 10.0, query_relevance: 0.0, content_relevance: 0.0,
      low_follower_priority: 0.0, verified_discount: 0.0, document_type: r.doc_type === 'account' ? 0.2 : 0.0 };
    if (nq) {
      const handleLower = or(r.handle, '').toLowerCase();
      if (handleLower === nq) factors.query_relevance = 3.0;
      else if (handleLower.startsWith(nq)) factors.query_relevance = 2.2;
      else if (handleLower.includes(nq)) factors.query_relevance = 1.5;
      if (truthy(r.body_lower)) factors.content_relevance = Math.min(1.0, (r.body_lower.split(nq).length - 1) * 0.25);
    }
    const account = accountOf(r);
    if (account && truthy(account.is_verified)) factors.verified_discount = -0.9;
    const followers = account ? account.followers_count : null;
    if (Number.isInteger(followers)) {
      if (followers < 100) factors.low_follower_priority = 2.6;
      else if (followers < 1_000) factors.low_follower_priority = 2.2;
      else if (followers < 10_000) factors.low_follower_priority = 1.5;
      else if (followers < 100_000) factors.low_follower_priority = 0.5;
      else if (followers < 1_000_000) factors.low_follower_priority = -0.8;
      else factors.low_follower_priority = -1.3;
    }
    return factors;
  }
  const rank = r => pySum(Object.values(rankFactors(r)));

  rowsWithFields = sorted(rowsWithFields, { key: ([r]) => [rank(r), or(r.posted_at, MIN_TIMESTAMP)], reverse: true });
  const total = rowsWithFields.length;
  const page = rowsWithFields.slice(offset, offset + limit);

  // REF preloads media (by id) and comments (by created_at, id; NULLs first) for every row; only page rows use them.
  const pagePostIds = new Set(page.map(([r]) => r.post_id).filter(id => id != null));
  const mediaByPost = new Map();
  for (const item of store.table('media_assets').all()) {
    if (pagePostIds.has(item.post_id)) mediaByPost.set(item.post_id, [...(mediaByPost.get(item.post_id) ?? []), item]);
  }
  const commentsByPost = new Map();
  const pageComments = store.table('comments').all().filter(c => pagePostIds.has(c.post_id))
    .sort((a, b) => nullsFirst(a.created_at, b.created_at) || a.id - b.id);
  for (const item of pageComments) commentsByPost.set(item.post_id, [...(commentsByPost.get(item.post_id) ?? []), item]);

  const hits = page.map(([r, fields]) => {
    const account = accountOf(r);
    const post = r.post_id != null ? store.table('posts').get(r.post_id) : null;
    const allMedia = r.post_id != null ? mediaByPost.get(r.post_id) ?? [] : [];
    const comments = r.post_id != null ? commentsByPost.get(r.post_id) ?? [] : [];
    const instagramUrl = post ? post.permalink : (truthy(r.handle) ? `https://www.instagram.com/${r.handle}/` : null);
    const profilePicUrl = account ? account.profile_pic_url ?? null : null;
    const thumbnails = allMedia.filter(item => truthy(item.thumbnail_url)).map(item => item.thumbnail_url);
    const stillImages = allMedia.filter(item => truthy(item.media_url)
      && or(item.media_type, '').toLowerCase() === 'image'
      && !VIDEO_EXTENSIONS.some(ext => item.media_url.toLowerCase().split('?')[0].endsWith(ext)))
      .map(item => item.media_url);
    const factors = rankFactors(r);
    return {
      doc_type: r.doc_type, account_id: r.account_id, post_id: r.post_id,
      handle: r.handle, title: r.title, snippet: snippet(r.body, nq),
      instagram_url: instagramUrl, image_url: or([...thumbnails, ...stillImages][0] ?? null, profilePicUrl),
      profile_pic_url: profilePicUrl,
      outbound_url: account && !post ? account.external_url ?? null : null,
      post_type: post ? post.post_type : null,
      is_verified: account ? account.is_verified ?? null : null,
      followers_count: account ? account.followers_count ?? null : null,
      follows_count: account ? account.follows_count ?? null : null,
      media_count: account ? account.media_count ?? null : null,
      like_count: post ? post.like_count ?? null : null,
      comment_count: post ? post.comment_count ?? null : null,
      view_count: post ? post.view_count ?? null : null,
      share_count: post ? post.share_count ?? null : null,
      language: post ? post.language ?? null : null,
      hashtags: or(r.hashtags, []), mentions: or(r.mentions, []),
      domains: or(r.domains, []), matched_fields: fields,
      content: r.body,
      media: allMedia.map(item => ({ type: item.media_type, url: item.media_url, thumbnail_url: item.thumbnail_url,
        width: item.width, height: item.height, duration_seconds: item.duration_seconds, mime_type: item.mime_type,
        ocr_text: item.ocr_text })),
      comments: comments.map(item => ({ author: item.author_handle, text: item.text, like_count: item.like_count,
        created_at: item.created_at, parent_id: item.parent_platform_comment_id })),
      provenance: account ? or(post ? post.provenance : account.provenance, {}) : {},
      risk_score: r.risk_score, posted_at: r.posted_at,
      score: pyRound(pySum(Object.values(factors)), 3),
      ranking_factors: Object.fromEntries(Object.entries(factors).map(([key, value]) => [key, pyRound(value, 3)])),
    };
  });
  return { query: q, scope, total, total_all: totalAll, facets, hits };
}

// Port of REF darkmap/providers/bright_data_instagram.py:27-231 and 451-722: discovery queries, URL helpers,
// SERP bucketing and the record parsers. Names follow REF in camelCase; outputs keep REF's shapes.
import { B, S, dedupe, findall, or, pyCasefold, pyLstrip, pyRstrip, pySlice, pyStr, pyStrip, truthy } from './engine/pycompat.js';
import { urlsplit, urlunsplit } from './engine/urlsplit.js';
import { ValueError } from './errors.js';
import { rawAccount, rawBundle, rawComment, rawMedia, rawPost } from './raw.js';
import { LAWFUL_BASIS, PROVIDER } from './scrapingdog.js';
import { parseTs } from './time.js';

export const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/u;
export const MENTION_RE = /(?<![A-Za-z0-9._])@([A-Za-z0-9._]{1,30})/gu;
export const SOURCE_HANDLE_RE = new RegExp(`instagram${S}*[·|:\\-]${S}*@?([A-Za-z0-9._]{1,30})`, 'iu');
export const SUPPORTED_MODES = new Set(['account', 'keyword', 'hashtag_recent', 'hashtag_top']);
export const RESERVED_PROFILE_PATHS = new Set(['about', 'accounts', 'api', 'developer', 'direct', 'directory',
  'emails', 'explore', 'legal', 'privacy', 'reels', 'stories', 'web']);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const pathParts = url => urlsplit(url).path.split('/').filter(Boolean);

// A threat-first SERP plan for one protected-brand keyword (REF :45-84). Queries most likely to expose actionable
// abuse come first so a partial collection contains fraud evidence instead of only ordinary brand mentions.
export function discoveryQueries(keyword) {
  return [
    [`site:instagram.com/reel/ "${keyword}" "telegram channel"`, 'in'],
    [`site:instagram.com/reel/ "${keyword}" "loot"`, 'in'],
    [`site:instagram.com/reel/ "${keyword}" "free cash"`, 'in'],
    [`site:instagram.com/p/ "${keyword}" "telegram"`, 'in'],
    [`site:instagram.com/reel/ "${keyword}" "link in bio"`, 'in'],
    [`site:instagram.com "${keyword}" ("giveaway" OR "discount" OR "scam")`, 'in'],
    [`site:instagram.com ("${keyword}_support" OR "${keyword}.support" OR "${keyword} customer care")`, 'in'],
    [`site:instagram.com "${keyword}"`, 'in'],
    [`site:instagram.com "${keyword}" ("support" OR "customer care" OR "helpdesk") `
      + '("phone" OR "contact" OR "whatsapp" OR "refund")', 'in'],
    [`site:instagram.com "${keyword}" ("UPI" OR "payment" OR "delivery fee" OR "claim")`, 'in'],
    [`site:instagram.com "${keyword}" ("account blocked" OR "KYC" OR "OTP" OR "login" OR "password reset")`, 'in'],
    [`site:instagram.com "${keyword}" ("replica" OR "first copy" OR "factory price")`, 'in'],
    [`site:instagram.com "${keyword}" ("job" OR "internship" OR "HR" OR "registration fee")`, 'in'],
    [`site:instagram.com "${keyword}" ("APK" OR "install for refund" OR "investment" OR "trading signals")`, 'in'],
    [`site:instagram.com/p/ "${keyword}"`, 'in'],
    [`site:instagram.com/reel/ "${keyword}"`, 'in'],
    [`site:instagram.com "${keyword}"`, 'us'],
  ];
}

export function first(node, ...names) {
  for (const name of names) {
    const value = Object.hasOwn(node, name) ? node[name] : null;
    if (value != null && value !== '') return value;
  }
  return null;
}

// Python float(text) for the literals REF's counters can hold (underscores between digits allowed).
const FLOAT_RE = /^[+-]?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:e[+-]?\d(?:_?\d)*)?$/i;
const pyFloat = text => (FLOAT_RE.test(text) ? Number(text.replaceAll('_', '')) : null);

const ABBREVIATED_RE = new RegExp(`^([0-9]+(?:\\.[0-9]+)?)${S}*([kmb])(?:${S}+(?:followers?|following|posts?))?$`, 'iu');
const SCALAR_RE = new RegExp(`^([0-9]+(?:\\.[0-9]+)?)${S}*(?:followers?|following|posts?)?$`, 'iu');
const MULTIPLIER = { k: 1_000, m: 1_000_000, b: 1_000_000_000 };
// ponytail: 'inf' makes REF's int(float()) raise OverflowError; here it reads as unknown (null).
export function asInt(value) {
  if (value == null || value === '') return null;
  // Dataset revisions sometimes wrap public counters as {"count": ...} instead of returning a scalar.
  if (isObject(value)) return asInt(first(value, 'count', 'value', 'total'));
  const text = pyStrip(pyStr(value)).replaceAll(',', '');
  const abbreviated = ABBREVIATED_RE.exec(text);
  if (abbreviated) return Math.trunc(Number(abbreviated[1]) * MULTIPLIER[abbreviated[2].toLowerCase()]);
  const scalar = SCALAR_RE.exec(text);
  const number = pyFloat(scalar ? scalar[1] : text);
  return number == null || !Number.isFinite(number) ? null : Math.trunc(number);
}

const FOLLOWERS_TEXT_RE = new RegExp(`${B}([0-9][0-9,.]*${S}*[kmb]?)${S}+followers?${B}`, 'iu');
// Read a public follower counter from full or light search-result shapes.
export function serpFollowers(item) {
  const direct = asInt(first(item, 'followers', 'followers_count', 'follower_count', 'followed_by_count'));
  if (direct != null) return direct;
  const text = ['title', 'description', 'snippet', 'source'].map(key => pyStr(or(item[key] ?? null, ''))).join(' ');
  const match = FOLLOWERS_TEXT_RE.exec(text);
  return match ? asInt(match[1]) : null;
}

// The first usable URL from scalar, object, or list shapes.
export function asUrl(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = asUrl(item);
      if (truthy(normalized)) return normalized;
    }
    return null;
  }
  if (isObject(value)) return asUrl(first(value, 'url', 'link', 'href'));
  if (typeof value === 'string') return pyStrip(value) || null;
  return null;
}

const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.webm'];
export function looksLikeVideoUrl(value) {
  if (!truthy(value)) return false;
  let path;
  try {
    path = pyCasefold(urlsplit(value).path);
  } catch (error) {
    if (!(error instanceof ValueError)) throw error;
    path = pyCasefold(pyStr(value));
  }
  return VIDEO_EXTENSIONS.some(ext => path.endsWith(ext));
}

export function canonicalInstagramUrl(value) {
  let parsed;
  try {
    parsed = urlsplit(value);
  } catch (error) {
    if (error instanceof ValueError) return null;
    throw error;
  }
  if (parsed.scheme !== 'https' || !['instagram.com', 'www.instagram.com'].includes((parsed.hostname ?? '').toLowerCase())) {
    return null;
  }
  const parts = parsed.path.split('/').filter(Boolean);
  if (!parts.length) return null;
  return urlunsplit(['https', 'www.instagram.com', `/${parts.join('/')}/`, '', '']);
}

export function urlKind(url) {
  const parts = pathParts(url);
  if (!parts.length) return null;
  const head = parts[0].toLowerCase();
  if (head === 'p' && parts.length >= 2) return 'post';
  if ((head === 'reel' || head === 'reels') && parts.length >= 2) return 'reel';
  if (parts.length >= 3 && USERNAME_RE.test(parts[0]) && ['p', 'reel', 'reels'].includes(parts[1].toLowerCase())) {
    return parts[1].toLowerCase() === 'p' ? 'post' : 'reel';
  }
  if (parts.length === 1 && !RESERVED_PROFILE_PATHS.has(head)) return 'profile';
  return null;
}

export function provenance(mode, query, retrievedAt) {
  return { provider: PROVIDER, lawful_basis: LAWFUL_BASIS, collection_mode: mode, query,
    source: 'ScrapingDog Instagram API', retrieved_at: retrievedAt };
}

// REF _bucket_discovery (:451-557): normalize discovered URLs and build the search-snippet fallback bundles.
export function bucketDiscovery(organic, clean, { limit, provenanceFor }) {
  const buckets = { profile: [], probe_profile: [], post: [], reel: [] };
  const seen = new Set();
  const fallbackByHandle = new Map();
  let compactRaw;   // REF assigns this only when it creates a bundle; later posts reuse the latest value
  for (const item of organic) {
    const url = canonicalInstagramUrl(pyStr(or(item.link ?? null, '')));
    const kind = url ? urlKind(url) : null;
    if (url && kind && !seen.has(url)) {
      buckets[kind].push(url);
      seen.add(url);
    }
    // Google's light SERP output may wrap profile links in /goto URLs; the title still carries the @username.
    const text = ['title', 'description', 'snippet'].map(key => pyStr(or(item[key] ?? null, ''))).join(' ');
    const mentionedHandles = findall(MENTION_RE, text).map(value => pyRstrip(value, '.'));
    let authorHandle = null;
    const sourceHandle = SOURCE_HANDLE_RE.exec(pyStr(or(item.source ?? null, '')));
    if (sourceHandle) authorHandle = pyRstrip(sourceHandle[1], '.');
    if (url && (kind === 'post' || kind === 'reel')) {
      const parts = pathParts(url);
      if (parts.length >= 3 && USERNAME_RE.test(parts[0]) && ['p', 'reel', 'reels'].includes(parts[1].toLowerCase())) {
        authorHandle = parts[0];
      }
    }
    // Caption mentions identify subjects or destinations, not the author.
    const handles = authorHandle ? [authorHandle] : (kind === 'post' || kind === 'reel' ? [] : [...mentionedHandles]);
    if (url && kind === 'profile') {
      const parts = pathParts(url);
      if (parts.length && USERNAME_RE.test(parts[0])) handles.unshift(parts[0]);
    }
    for (const candidate of dedupe(handles)) {
      const username = pyRstrip(candidate, '.');
      if (!username) continue;
      const profileUrl = `https://www.instagram.com/${username}/`;
      if (!seen.has(profileUrl)) {
        buckets.profile.push(profileUrl);
        seen.add(profileUrl);
      }
      let bundle = fallbackByHandle.get(pyCasefold(username));
      if (bundle == null) {
        const searchImage = asUrl(first(item, 'image', 'thumbnail', 'thumbnail_url', 'image_url'));
        compactRaw = Object.fromEntries(Object.entries(item).filter(([key]) => !['image', 'image_base64', 'icon'].includes(key)));
        bundle = rawBundle(rawAccount({ handle: username, display_name: username,
          biography: kind === 'profile' ? pySlice(text, 0, 1200) : null,
          profile_pic_url: kind === 'profile' ? searchImage : null,
          followers_count: serpFollowers(item), raw: { serp_result: compactRaw } }), [],
        provenanceFor('keyword_serp_fallback'));
        fallbackByHandle.set(pyCasefold(username), bundle);
      }
      if (url && (kind === 'post' || kind === 'reel')) {
        const parts = pathParts(url);
        const shortcode = parts.length >= 3 && parts[0] === username ? parts[2] : parts[1];
        if (!bundle.posts.some(post => post.permalink === url)) {
          const image = asUrl(item.image ?? null);
          const media = image && (image.startsWith('https://') || image.startsWith('data:image/'))
            ? [rawMedia({ media_type: 'image', thumbnail_url: image })] : [];
          bundle.posts.push(rawPost({ platform_post_id: url, shortcode, post_type: kind, permalink: url,
            caption: pySlice(text, 0, 2200), media, raw: { serp_result: compactRaw } }));
        }
      }
    }
  }
  // A single brand-like keyword is also a plausible exact username; probe common brand-abuse handle patterns.
  const exactUsername = pyLstrip(clean, '@').toLowerCase();
  if (USERNAME_RE.test(exactUsername)) {
    const u = exactUsername;
    const variants = [u, `${u}.official`, `${u}_official`, `${u}.support`, `${u}_support`, `${u}.help`, `${u}_help`,
      `${u}.customercare`, `${u}_customercare`, `${u}.care`, `${u}care`, `${u}.giveaway`, `${u}.shop`, `${u}.store`,
      `${u}.outlet`, `${u}.deals`, `${u}_deals`, `${u}.offers`, `${u}_offers`, `${u}.loot`, `${u}.telegram`,
      `${u}.claim`, `${u}.rewards`, `${u}.refund`, `${u}.helpdesk`, `${u}.jobs`, `${u}.hr`, `${u}.invest`,
      `${u}.trading`];
    for (const username of variants) {
      if (!USERNAME_RE.test(username)) continue;
      const profileUrl = `https://www.instagram.com/${username}/`;
      if (!buckets.probe_profile.includes(profileUrl)) buckets.probe_profile.push(profileUrl);
    }
    const exactUrl = `https://www.instagram.com/${u}/`;
    const at = buckets.probe_profile.indexOf(exactUrl);
    if (at >= 0) buckets.probe_profile.splice(at, 1);
    buckets.probe_profile.unshift(exactUrl);
  }
  return { buckets, serpFallback: [...fallbackByHandle.values()].slice(0, limit) };
}

// ---------- record parsers (REF :559-722) ----------

function observations(item) {
  let qr = or(first(item, 'qr_payloads', 'qr_codes', 'decoded_qr_codes'), []);
  if (typeof qr === 'string') qr = [qr];
  qr = Array.isArray(qr)
    ? qr.map(value => (isObject(value) ? pyStr(or(value.data ?? null, value.url ?? null, value)) : pyStr(value)))
    : [];
  return {
    ocr_text: first(item, 'ocr_text', 'image_text', 'text_in_image'),
    transcript: first(item, 'transcript', 'video_transcript', 'audio_transcript'),
    qr_payloads: qr,
    perceptual_hash: first(item, 'perceptual_hash', 'phash', 'image_hash'),
    brand_match_score: first(item, 'brand_match_score', 'logo_match_score'),
    synthetic_media_score: first(item, 'synthetic_media_score', 'deepfake_score'),
  };
}

export function mediaItems(node) {
  const rawMediaOf = (mediaType, mediaUrl = null, thumbnailUrl = null, item = null) => {
    const data = observations(or(item, node));
    return rawMedia({ media_type: mediaType, media_url: mediaUrl, thumbnail_url: thumbnailUrl,
      perceptual_hash: data.perceptual_hash, ocr_text: data.ocr_text, transcript: data.transcript,
      qr_payloads: data.qr_payloads, brand_match_score: data.brand_match_score,
      synthetic_media_score: data.synthetic_media_score });
  };
  const result = [];
  for (const value of or(node.photos ?? null, [])) {
    if (typeof value === 'string') {
      result.push(rawMediaOf(looksLikeVideoUrl(value) ? 'video' : 'image', value));
    } else if (isObject(value)) {
      const url = asUrl(value);
      result.push(rawMediaOf(looksLikeVideoUrl(url) ? 'video' : 'image', url,
        asUrl(first(value, 'thumbnail_url', 'thumbnail', 'display_url', 'preview_url')), value));
    }
  }
  for (const value of or(node.videos ?? null, [])) {
    if (typeof value === 'string') {
      result.push(rawMediaOf('video', value));
    } else if (isObject(value)) {
      result.push(rawMediaOf('video', asUrl(first(value, 'url', 'video_url')),
        asUrl(first(value, 'thumbnail_url', 'thumbnail', 'image_url', 'display_url', 'preview_url', 'cover_url')), value));
    }
  }
  let image = asUrl(first(node, 'thumbnail_url', 'thumbnail', 'display_url', 'image_url', 'video_thumbnail', 'cover_url',
    'preview_url'));
  let video = asUrl(first(node, 'video_url', 'video'));
  // Some reel exports place the MP4 in image_url. Never send that value to an <img>.
  if (looksLikeVideoUrl(image)) {
    video = or(video, image);
    image = null;
  }
  if (truthy(image) && !result.some(item => item.media_url === image)) result.push(rawMediaOf('image', image));
  if (truthy(video) && !result.some(item => item.media_url === video)) result.push(rawMediaOf('video', video, image));
  return result;
}

export function comment(node, parentId = null) {
  const commentId = first(node, 'comment_id', 'id', 'pk');
  return rawComment({
    platform_comment_id: commentId != null ? pyStr(commentId) : null,
    parent_platform_comment_id: parentId,
    author_handle: pyLstrip(pyStr(or(first(node, 'comment_user', 'username', 'user'), '')), '@') || null,
    text: first(node, 'comment', 'text'),
    like_count: asInt(first(node, 'likes_number', 'like_count', 'likes')),
    created_at: parseTs(first(node, 'comment_date', 'created_at', 'timestamp')),
  });
}

export function post(node, comments = null) {
  const url = canonicalInstagramUrl(pyStr(or(first(node, 'url', 'post_url', 'permalink'), '')));
  const contentType = pyStr(or(first(node, 'content_type', 'media_type', 'type'), '')).toLowerCase();
  const kind = (url && urlKind(url) === 'reel') || contentType.includes('reel') ? 'reel'
    : (contentType.includes('carousel') ? 'carousel' : 'post');
  let caption = first(node, 'description', 'caption', 'text');
  const hashtags = or(node.hashtags ?? null, node.post_hashtags ?? null, []);
  if (truthy(caption) && truthy(hashtags)) {
    const folded = pyCasefold(pyStr(caption));
    const tokens = [...hashtags].map(tag => pyLstrip(pyStr(tag), '#'))
      .filter(tag => tag && !folded.includes(pyCasefold(`#${tag}`))).map(tag => `#${tag}`);
    if (tokens.length) caption = `${pyStr(caption)}\n${tokens.join(' ')}`;
  }
  const postId = first(node, 'post_id', 'id', 'pk', 'content_id');
  let shortcode = first(node, 'shortcode', 'code');
  if (!truthy(shortcode) && url) {
    const parts = pathParts(url);
    shortcode = parts.length > 1 && ['p', 'reel', 'reels'].includes(parts[0]) ? parts[1] : null;
  }
  const embeddedComments = [];
  const rawComments = first(node, 'latest_comments', 'comments_data', 'comments');
  if (Array.isArray(rawComments)) for (const item of rawComments) if (isObject(item)) embeddedComments.push(comment(item));
  return rawPost({
    platform_post_id: postId != null ? pyStr(postId) : shortcode,
    shortcode: shortcode != null ? pyStr(shortcode) : null,
    post_type: kind,
    permalink: url,
    caption: caption != null ? pyStr(caption) : null,
    posted_at: parseTs(first(node, 'date_posted', 'datetime', 'timestamp', 'taken_at')),
    like_count: asInt(first(node, 'likes', 'like_count', 'like_count_and_view_count_disabled')),
    comment_count: asInt(first(node, 'num_comments', 'comments', 'comment_count')),
    view_count: asInt(first(node, 'views', 'video_view_count', 'video_play_count', 'plays')),
    media: mediaItems(node),
    comments: comments != null ? comments : embeddedComments,
    raw: node,
  });
}

export function account(node, fallback = '') {
  const candidates = [node];
  for (const key of ['user', 'owner', 'author', 'profile', 'account_data', 'user_data']) {
    if (isObject(node[key])) candidates.push(node[key]);
  }
  const pick = (...names) => {
    for (const candidate of candidates) {
      const value = first(candidate, ...names);
      if (value != null && value !== '') return value;
    }
    return null;
  };
  let rawHandle = pick('account', 'username', 'user_name', 'handle');
  if (rawHandle !== null && typeof rawHandle === 'object') rawHandle = null;
  const handle = pyLstrip(pyStr(or(rawHandle, fallback)), '@');
  const accountId = pick('id', 'fbid', 'pk', 'partner_id');
  return rawAccount({
    handle,
    platform_account_id: accountId != null ? pyStr(accountId) : null,
    display_name: pick('full_name', 'profile_name', 'display_name', 'name'),
    biography: pick('biography', 'bio'),
    external_url: asUrl(pick('external_url', 'website')),
    profile_pic_url: asUrl(pick('profile_image_link', 'profile_pic_url', 'profile_image', 'profile_pic_url_hd',
      'profile_picture_url', 'profile_picture', 'profile_image_url', 'user_profile_pic_url', 'user_profile_pic',
      'author_profile_pic', 'author_profile_picture', 'owner_profile_pic_url', 'owner_profile_picture_url',
      'avatar_url', 'avatar', 'profile_pic')),
    is_verified: pick('is_verified', 'verified'),
    is_business: pick('is_business_account', 'is_professional_account'),
    followers_count: asInt(pick('followers', 'followers_count', 'follower_count', 'followed_by_count', 'edge_followed_by',
      'edge_followed_by_count', 'subscriber_count')),
    follows_count: asInt(pick('following', 'follows_count', 'following_count', 'edge_follow')),
    media_count: asInt(pick('posts_count', 'media_count', 'post_count', 'edge_owner_to_timeline_media')),
    raw: Object.fromEntries(Object.entries(node).filter(([key]) => key !== 'posts')),
  });
}

export function author(node) {
  return pyStrip(pyLstrip(pyStr(or(first(node, 'user_posted', 'username', 'owner_username', 'account', 'post_user'), '')), '@'));
}

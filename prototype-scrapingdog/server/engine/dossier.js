// Port of REF darkmap/dossier.py: build the analysis dossier for an account from the normalized store.
import { ValueError } from '../errors.js';
import { commentsOfPost, entitiesOfAccount, mediaOfPost, postsForDossier } from '../sqlite-order.js';
import { or, truthy } from './pycompat.js';

const MAX_POSTS = 40;
const MAX_COMMENTS = 12;

// Serialize one stored post for deterministic content-level analysis. Timestamps are already isoformat strings.
export function postDocument(store, post) {
  return {
    id: post.id,
    platform_post_id: post.platform_post_id,
    post_type: post.post_type,
    permalink: post.permalink,
    caption: post.caption,
    posted_at: or(post.posted_at, null),
    engagement: { likes: post.like_count, comments: post.comment_count, views: post.view_count,
      shares: post.share_count },
    media: mediaOfPost(store, post.id).map(media => ({ media_type: media.media_type, mime_type: media.mime_type,
      width: media.width, height: media.height, duration_seconds: media.duration_seconds,
      perceptual_hash: media.perceptual_hash, ocr_text: media.ocr_text, media_url: media.media_url,
      thumbnail_url: media.thumbnail_url, analysis: or(media.exif, {}) })),
    comments: commentsOfPost(store, post.id).slice(0, MAX_COMMENTS).map(comment => ({
      author_handle: comment.author_handle, text: comment.text, platform_comment_id: comment.platform_comment_id,
      parent_platform_comment_id: comment.parent_platform_comment_id, like_count: comment.like_count,
      created_at: or(comment.created_at, null) })),
  };
}

function brandFor(store, acc, brandId) {
  const brands = store.table('brands');
  if (truthy(brandId)) return brands.get(brandId);
  if (truthy(acc.brand_id)) return brands.get(acc.brand_id);
  // best-effort: first brand whose name appears in handle/bio
  const haystack = [acc.handle_lower, or(acc.biography, '').toLowerCase(), or(acc.display_name, '').toLowerCase()]
    .filter(truthy).join(' ');
  for (const brand of brands.all()) {
    const tokens = [brand.name, ...or(brand.keywords, [])];
    if (tokens.some(t => truthy(t) && haystack.includes(t.toLowerCase()))) return brand;
  }
  return null;
}

export function buildDossier(store, accountId, { brandId = null, mediaAnalysis = null } = {}) {
  const acc = store.table('accounts').get(accountId);
  if (acc == null) throw new ValueError(`account ${accountId} not found`);
  const brand = brandFor(store, acc, brandId);

  const postDocs = [];
  const storedMediaAnalysis = [];
  for (const p of postsForDossier(store, acc.id, MAX_POSTS)) {
    postDocs.push(postDocument(store, p));
    for (const m of mediaOfPost(store, p.id)) {
      const observation = { ...or(m.exif, {}) };
      if (truthy(m.ocr_text)) observation.ocr_text = m.ocr_text;
      if (truthy(m.perceptual_hash)) observation.perceptual_hash = m.perceptual_hash;
      if (truthy(observation)) {
        Object.assign(observation, { post_id: p.id, media_id: m.id, media_url: m.media_url,
          thumbnail_url: m.thumbnail_url });
        storedMediaAnalysis.push(observation);
      }
    }
  }

  const entities = entitiesOfAccount(store, acc.id).slice(0, 500).map(e => ({ kind: e.kind, value: e.value,
    domain: e.domain, source_field: e.source_field, post_id: e.post_id, comment_id: e.comment_id }));

  return {
    brand: brand ? { name: brand.name, official_handles: or(brand.official_handles, []),
      official_domains: or(brand.official_domains, []), keywords: or(brand.keywords, []) } : null,
    account: {
      id: acc.id,
      platform: acc.platform,
      handle: acc.handle,
      display_name: acc.display_name,
      biography: acc.biography,
      external_url: acc.external_url,
      is_verified: acc.is_verified,
      is_business: acc.is_business,
      followers_count: acc.followers_count,
      follows_count: acc.follows_count,
      media_count: acc.media_count,
      account_created_at: or(acc.account_created_at, null),
      first_seen_at: or(acc.first_seen_at, null),
    },
    provenance: or(acc.provenance, {}),
    posts: postDocs,
    entities,
    media_analysis: [...or(mediaAnalysis, []), ...storedMediaAnalysis],
  };
}

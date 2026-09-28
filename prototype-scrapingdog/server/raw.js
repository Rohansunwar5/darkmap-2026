// REF darkmap/providers/base.py dataclasses as plain objects: same fields, defaults and order.
export const rawMedia = (fields = {}) => ({ media_type: null, media_url: null, thumbnail_url: null, width: null,
  height: null, duration_seconds: null, mime_type: null, byte_size: null, perceptual_hash: null, ocr_text: null,
  transcript: null, qr_payloads: [], brand_match_score: null, synthetic_media_score: null, exif: {}, ...fields });
export const rawComment = (fields = {}) => ({ platform_comment_id: null, parent_platform_comment_id: null,
  author_handle: null, text: null, like_count: null, created_at: null, ...fields });
export const rawPost = (fields = {}) => ({ platform_post_id: null, shortcode: null, post_type: 'post', permalink: null,
  caption: null, posted_at: null, like_count: null, comment_count: null, view_count: null, share_count: null,
  language: null, media: [], comments: [], raw: {}, ...fields });
export const rawAccount = (fields = {}) => ({ handle: fields.handle, platform: 'instagram', platform_account_id: null,
  display_name: null, biography: null, external_url: null, profile_pic_url: null, is_verified: null, is_business: null,
  followers_count: null, follows_count: null, media_count: null, account_created_at: null, raw: {}, ...fields });
export const rawBundle = (account, posts = [], provenance = {}) => ({ account, posts, provenance });

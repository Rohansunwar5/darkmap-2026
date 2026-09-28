// ScrapingDog JSON -> REF (Bright Data-shaped) record nodes, so REF's parsers run unchanged (spec §7.3).
// Every path comes from tests/fixtures/scrapingdog/CONTRACT.md. Unmapped fields are dropped, including
// scrapingdog_pagination, which echoes the API key.
import { ValueError } from './errors.js';

const IG = 'https://www.instagram.com';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const objectOr = value => (isObject(value) ? value : {});
// First value that is neither null nor '' (what REF's _first would accept).
const val = (...values) => {
  for (const value of values) if (value != null && value !== '') return value;
  return null;
};
const postUrl = (shortcode, reel) => (shortcode ? `${IG}/${reel ? 'reel' : 'p'}/${shortcode}/` : null);
function shortcodeOf(url) {
  const parts = String(url ?? '').replace(/[?#].*$/, '').split('/').filter(Boolean).slice(2);   // after scheme and host
  if (parts.length >= 2 && ['p', 'reel', 'reels', 'tv'].includes(parts[0])) return parts[1];
  if (parts.length >= 3 && ['p', 'reel', 'reels', 'tv'].includes(parts[1])) return parts[2];
  return null;
}
const isReelUrl = url => /^https:\/\/www\.instagram\.com\/(?:[^/]+\/)?reels?\//.test(String(url ?? ''));

// CONTRACT §2: organic_results[]; the snippet is REF's `description` (mapping it to `snippet` as well would repeat it
// in REF's title+description+snippet text). advance_search adds the author as `source`: "Instagram · nike".
export function googleToOrganic(json) {
  const list = isObject(json) ? json.organic_results : null;
  if (!Array.isArray(list)) throw new ValueError('Collection search returned an empty or invalid response');
  return list.filter(isObject).map(item => Object.fromEntries(Object.entries({ link: val(item.link), title: val(item.title),
    description: val(item.snippet), source: val(item.source) }).filter(([, value]) => value != null)));
}

// CONTRACT §3 owner_to_timeline_media.media[]: likes, comments and views are null here; clips are reels.
const embeddedPostNode = m => {
  const reel = m.product_type === 'clips';
  return { url: postUrl(val(m.shortcode), reel) ?? val(m.url), post_id: val(m.id), shortcode: val(m.shortcode),
    content_type: reel ? 'Reel' : val(m.type), description: val(m.caption),
    hashtags: Array.isArray(m.hashtags) ? m.hashtags : [], date_posted: val(m.taken_at_iso, m.timestamp),
    likes: val(m.likes), num_comments: val(m.comment), views: val(m.video_view_count),
    thumbnail: val(m.display_url, m.thumbnail), video_url: val(m.video_url), user_posted: val(objectOr(m.owner).username) };
};

export function profileToNode(json) {
  const p = objectOr(json);
  const links = Array.isArray(p.bio_links) ? p.bio_links.filter(isObject) : [];
  const external = links.find(link => link.link_type === 'external') ?? links[0] ?? {};
  const timeline = objectOr(p.owner_to_timeline_media);
  return {
    account: val(p.username), id: val(p.profile_id), full_name: val(p.full_name), biography: val(p.bio),
    external_url: val(external.url), profile_image_link: val(p.profile_pic_url_hd, p.profile_pic_url),
    is_verified: val(p.is_verified), is_business_account: val(p.is_business_account, p.is_professional_account),
    followers: val(p.followers_count), following: val(p.following_count), posts_count: val(timeline.count),
    posts: Array.isArray(timeline.media) ? timeline.media.filter(isObject).map(embeddedPostNode) : [],
  };
}

// CONTRACT §4 Posts API posts_data[]: engagement is present; there is no URL, so it is built from the shortcode.
const apiPostNode = p => ({ url: postUrl(val(p.shortcode), p.is_video === true), post_id: val(p.id),
  shortcode: val(p.shortcode), content_type: p.is_video === true ? 'Video' : 'Image', description: val(p.caption),
  date_posted: val(p.timestamp), likes: val(p.likes), num_comments: val(p.comment), views: val(p.video_view_count),
  thumbnail: val(p.display_url, p.thumbnail), video_url: val(p.video_url), user_posted: val(objectOr(p.owner).username) });
export const postsToNodes = json => (Array.isArray(objectOr(json).posts_data)
  ? json.posts_data.filter(isObject).map(apiPostNode) : []);
export const postsTotal = json => val(objectOr(json).total_posts);

const commentNode = c => ({ comment_id: c.id != null ? String(c.id) : null, comment_user: val(objectOr(c.user).username),
  comment: val(c.text), likes_number: val(c.like_count), comment_date: val(c.created_at_iso, c.created_at) });

// Post Details' account.username is "reel" and profileUrl is wrong (CONTRACT §4). The handle is in the description,
// "52K likes, 736 comments - nike on September 22, 2026: …"; account.username is used only when it is not a path word.
const AUTHOR_RE = /(?:^|- )([A-Za-z0-9._]{1,30}) on /;
function authorOf(post, account) {
  const match = AUTHOR_RE.exec(String(post.description ?? '').split(': ')[0]);
  if (match) return match[1];
  const username = val(account.username);
  return username != null && !['reel', 'reels', 'p', 'tv'].includes(String(username).toLowerCase()) ? username : null;
}

// `url` is the input the collector asked for, so the record's permalink matches what was scheduled; ScrapingDog's
// own post.url (a /reel/ form for videos) only decides the type and the shortcode.
export function postToNode(json, url) {
  const d = objectOr(json);
  const post = objectOr(d.post);
  const account = objectOr(d.account);
  const author = authorOf(post, account);
  return {
    url: val(url, post.url), post_id: val(post.mediaId), shortcode: shortcodeOf(post.url) ?? shortcodeOf(url),
    content_type: isReelUrl(post.url) ? 'Reel' : null, description: val(post.caption),
    date_posted: val(post.taken_at_iso, post.taken_at), likes: val(post.like_count), num_comments: val(post.comment_count),
    thumbnail: val(post.display_url, post.image),
    latest_comments: Array.isArray(d.comments) ? d.comments.filter(isObject).map(commentNode) : [],
    user_posted: author, profile_name: /^(.+?) on Instagram: /.exec(String(post.title ?? ''))?.[1] ?? null,
    profile_image_link: val(account.profilePic), owner: { id: val(account.userId), username: author },
  };
}

// CONTRACT §4 comments are flat with parent_comment_id; REF's comment records nest replies under their parent.
export function commentsToNodes(json, postUrl) {
  const list = Array.isArray(objectOr(json).comments) ? json.comments.filter(isObject) : [];
  const ids = new Set(list.filter(c => c.id != null).map(c => String(c.id)));
  const isReply = c => c.parent_comment_id != null && ids.has(String(c.parent_comment_id));
  return list.filter(c => !isReply(c)).map(c => ({ post_url: postUrl, ...commentNode(c),
    replies: list.filter(r => isReply(r) && String(r.parent_comment_id) === String(c.id)).map(commentNode) }));
}

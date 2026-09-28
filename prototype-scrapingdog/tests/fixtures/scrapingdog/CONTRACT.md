# ScrapingDog contract (step 0, spec §15)

Recorded 2026-09-23 by `npm run probe` (brand `nike`), free plan. Every fact below comes from the JSON files in this
directory. The API key is redacted from all of them (`grep` for the key exits 1). The account fixtures also have
`email` and `username` scrubbed.

Transport: `GET https://api.scrapingdog.com<path>?api_key=…&<params>`. Every successful response is JSON with
`content-type: application/json`. No rate-limit headers are sent (see `headers` in any fixture).

## 1. Endpoints

| Key in `costs.js` | Path | Param | Status seen | Credits | Latency seen |
|---|---|---|---|---|---|
| `google` | `/google` | `query`, `results`, `country`, `language`, `page` | 200 | 5 | 1.4–2.0 s |
| `google_advanced` | `/google` | the same, plus `advance_search=true` | 200 | 10 | 5.4 s |
| `profile` | `/instagram/profile` | `username` | 200 | 15 | 4.6 s (missing handle: 0.9 s) |
| `posts` | `/instagram/posts` | `id` (the profile's `profile_id`) | 200 | 15 | 2.1 s |
| `post` | `/instagram/post_details` | `url` (`/p/` and `/reel/` URLs both work) | 200 | 15 | 4.3 s |
| `comments` | `/instagram/comments` | `url` | 200 | 15 | 1.7 s |

Credits: `/account` reported `requestUsed` 22 before the probe and 137 after, so the probe spent 115. That is
exactly the Google calls (5 + 10 + 5 + 5 = 25) plus six Instagram calls at 15 each (90): profile, profile-missing,
posts, post_details (post), post_details (reel) and comments. So:
- a **missing profile is charged** (it's a 200, see §5);
- the 403 bad-key call was **not** charged;
- the four wrong paths tried first (`/instagram/post`, `…/postdetails`, `…/post-details`, and `/instagram/post`
  with `shortcode`) were **not** charged. They returned the ScrapingDog website HTML with status 200.

Account (from `/account`): `pack: "free"`, `pack_type: "monthly"`, `requestLimit: 200`, `concurrency_limit: 5`.
**63 credits remain** after the probe. That covers two profile enrichments, not a live search, so Tasks 19–20 need a
paid plan or a new month's credits. The `/account` body also echoes the API key (`apiKey`, redacted here).

## 2. Google

Organic results are in `organic_results[]`. Standard returned 10 items; `advance_search` returned 8 for the same
query.

| REF organic field | Standard item | `advance_search` item |
|---|---|---|
| `link` | `link` | `link` |
| `title` | `title` (e.g. `Nike (@nike) · Beaverton, OR - Instagram`) | `title` (without the ` - Instagram` suffix) |
| `snippet` / `description` | `snippet` | `snippet` |
| `source` (author) | absent (`displayed_link` is `https://www.instagram.com › nike`) | `source`: `Instagram · nike` |
| follower text | absent from all 10 items | `displayed_link`: `29.1Cr+ followers`, `76.3L+ followers`, `82.4K+ followers` (Indian units, because `country=in`) |
| `image` (thumbnail) | absent (only `favicon`) | absent per item; top-level `inline_videos[]` has `{title, source, date, thumbnail, platform, duration, position}` with base64 `thumbnail` |

Other item keys: `favicon`, `rank`, `page_rank`; advanced adds `highlighted_keywords` and `redirect_link`.

**Result: `advance_search` adds the author (`source`), and follower text that standard results don't have, so
`USE_ADVANCED_FOR_CRITICAL = true` (spec §6).** REF's `_serp_followers` regex doesn't match `29.1Cr+ followers`
(the `Cr+` sits between the number and `followers`). A verbatim port therefore reads no follower count from this
text, so enrichment supplies followers.

Queries with `&`, quotes and `#` round-trip intact (`google-special.json`, `search_information.query_displayed`).

**Key echo:** `scrapingdog_pagination.next` and `scrapingdog_pagination.page_no.*` are ScrapingDog URLs that contain
`api_key=<key>`. The adapters must drop them, and the client must redact the key from any response text it logs or
stores.

## 3. Profile (`/instagram/profile?username=`)

| Spec §7.3 profile key | JSON path in response | `nike` sample |
|---|---|---|
| `account` / `username` | `username` | `nike` |
| `id` | `profile_id` (string) | `13460080` |
| `full_name` | `full_name` | `Nike` |
| `biography` | `bio` | `Just Do It.` |
| `external_url` | `bio_links[0].url` (the first `link_type: "external"` entry; `lynx_url` is the l.instagram.com wrapper) | `http://empli.fi/nike` |
| `profile_image_link` | `profile_pic_url_hd`, falling back to `profile_pic_url` | CDN URL |
| `is_verified` | `is_verified` | `true` |
| `is_business_account` | `is_business_account` | `null`; so are `is_professional_account` and every `*category*` field |
| `followers` | `followers_count` (integer) | 291145856 |
| `following` | `following_count` | 266 |
| `posts_count` | `owner_to_timeline_media.count` is `null`. The Posts API's `total_posts` has it (1667) | — |
| `is_private` | `is_private` | `false` |

**Recent posts are embedded** at `owner_to_timeline_media.media[]` (12 items). Each item has `{id, shortcode, type
(Video|Carousel|Image), product_type (clips|carousel_container|feed), url, caption, hashtags, display_url, images,
owner{id, username}, is_video, video_url, thumbnail, timestamp, taken_at_iso}`. But **`likes`, `comment` and
`video_view_count` are `null` in all 12**. The Posts API returns them in 12 of 12 (§4). REF reads per-post
engagement for the exposure dimension (heuristics.py:781-787) and the dashboard shows it (app.js:917-919), so
`PROFILE_HAS_RECENT_POSTS = false`: each profile enrichment also calls the Posts API. See the ruling in the ledger.

## 4. Posts, Post Details, Comments

### Posts (`/instagram/posts?id=<profile_id>`)

`{total_posts, posts_data[], next_page_token{has_next_page, token}}`, with 12 posts per request. Each post:
`{id, shortcode, display_url, owner{id, username}, is_video, has_audio, video_url, caption, comment, likes,
location, coauthor_producers, pinned_for_users, video_view_count, thumbnail, timestamp}`.

| Spec §7.3 post-node key | Posts path | Post Details path (`/instagram/post_details?url=`) |
|---|---|---|
| `url` | built from `shortcode`: `https://www.instagram.com/p/<shortcode>/` | `post.url`. ScrapingDog rewrites a video's `/p/` URL to `/reel/` |
| `post_id` | `id` | `post.mediaId` |
| `shortcode` | `shortcode` | `post.shortcode` is **null**; use the last path segment of `post.url` |
| `content_type` | `is_video` (Video / Image) | no type field; the `/reel/` URL is the only signal |
| `description` (caption) | `caption` | `post.caption` |
| `hashtags` | absent | absent |
| `date_posted` | `timestamp` (epoch seconds) | `post.taken_at_iso` (also `post.taken_at`, epoch seconds) |
| `likes` | `likes` | `post.like_count` |
| `num_comments` | `comment` | `post.comment_count` |
| `views` | `video_view_count` | **absent** |
| `photos` / `thumbnail` | `display_url`, `thumbnail` | `post.display_url`, `post.image` |
| `videos` | `video_url` (`null` in the sample) | absent |
| `latest_comments` | absent | `comments[]` (3 for the post, 14 for the reel), plus `comments_page_info` |
| `user_posted` | `owner.username` | see below |

**Post Details author.** `account.username` is wrong: it's `"reel"` for both the post and the reel, and
`account.profileUrl` is `https://www.instagram.com/reel/`. `account.userId` is correct (`13460080`). The handle is in
`post.description`, `"52K likes, 736 comments - nike on September 22, 2026: …"`, which matches
`- ([A-Za-z0-9._]+) on `. `post.title` (`"Nike on Instagram: …"`) has the full name, not the handle. The comments
endpoint's `account.username` is correct (`nike`).

### Comments (`/instagram/comments?url=`)

`{post{url, shortcode, caption, mediaId, like_count, comment_count, media_type, taken_at, …}, account{username,
userId, profileUrl, profilePic, is_verified}, comments[], comments_count, next_page_token{has_next_page, token}}`.
One request returned **3 comments** (`comments_count: 3`) for a post with 736, and `has_next_page: true`. The
page-token parameter name was not probed; REF makes one comment request per post, so it isn't needed.

| Spec §7.3 comment-node key | JSON path |
|---|---|
| `post_url` | the requested URL (`post.url` is the canonical `/reel/` form) |
| `comment_id` | `id` |
| `comment_user` | `user.username` (also `user.id`, `user.full_name`, `user.profile_pic_url`, `user.is_verified`) |
| `comment` | `text` |
| `likes_number` | `like_count` |
| `comment_date` | `created_at_iso` (also `created_at`, epoch seconds) |
| `replies` | the list is flat, with `parent_comment_id` and `reply_count`. Every sample value is `null` (no replies seen) |

Post Details' embedded `comments[]` items have the same fields, minus `reply_count`.

## 5. Errors

| Case | Status | Body | Client mapping |
|---|---|---|---|
| Missing handle (`profile-missing.json`) | **200** | all 28 profile keys present and `null`, including `username` and `profile_id` | NotFound (drop silently); it's charged 15 credits |
| Bad key (`bad-key.json`) | **403** | `{"message":"Unauthorized request, please make sure your API key is valid.","success":false}` | NotAuthorized |
| Unknown path (`post.try0`–`try3`) | **200** | the ScrapingDog website HTML (`<!DOCTYPE html>…`), `content-type` text/html | FetchFailed (non-JSON); not charged |

No 429 or 5xx was seen. Those mappings follow spec §6 unchanged.

## Gate (spec §15), 2026-09-23: PASS

- (a) Profile gives followers (`followers_count`), bio (`bio`), verified status (`is_verified`), avatar
  (`profile_pic_url_hd`), an id (`profile_id`) and recent posts (`owner_to_timeline_media.media`). **Holds.**
- (b) Post Details accepts both a post URL and a reel URL (`url`) and gives caption (`post.caption`), author (handle
  from `post.description`; `account.userId`), counts (`post.like_count`, `post.comment_count`) and media
  (`post.display_url`). **Holds**, with the author derivation above. Views are not provided.
- (c) Comments gives commenter (`user.username`), text (`text`), likes (`like_count`) and timestamp
  (`created_at_iso`). **Holds.**
- (d) Google gives organic link, title and snippet (`organic_results[].link/title/snippet`). **Holds.**

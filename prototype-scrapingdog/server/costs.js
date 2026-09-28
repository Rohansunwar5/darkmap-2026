// ScrapingDog endpoints and credit costs, as recorded in tests/fixtures/scrapingdog/CONTRACT.md (step 0).
export const ENDPOINTS = {
  google: { path: '/google', credits: 5 },
  google_advanced: { path: '/google', credits: 10, params: { advance_search: 'true' } },
  profile: { path: '/instagram/profile', param: 'username', credits: 15 },
  posts: { path: '/instagram/posts', param: 'id', credits: 15 },
  post: { path: '/instagram/post_details', param: 'url', credits: 15 },
  comments: { path: '/instagram/comments', param: 'url', credits: 15 },
};
// CONTRACT.md §2: advance_search adds the author (`source`) and follower text that standard results lack.
export const USE_ADVANCED_FOR_CRITICAL = true;
// CONTRACT.md §3: the profile embeds 12 recent posts, but their likes, comments and views are all null, so the
// Posts API is still called for REF's engagement fields.
export const PROFILE_HAS_RECENT_POSTS = false;

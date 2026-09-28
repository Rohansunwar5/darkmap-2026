/**
 * DarkMap brand-protection discovery prototype.
 *
 * Serves dashboard.html and one endpoint:  GET /api/scan?q=<anything>
 *
 * It performs a REAL live scan only: it renders Instagram and
 * Facebook discovery URLs through Decodo's Web Scraping API, parses handles out
 * of the responses, scores them, and reports per-source diagnostics.
 *
 * There is NO demo or synthetic data. Without a token it refuses to start.
 *
 * This doubles as the go/no-go test in DARKMAP_BRAND_PROTECTION_ARCHITECTURE.md
 * section 6.1.4: does logged-out Instagram hashtag/search access actually work?
 * Every source reports `wall: true` when it hits a login wall, which is the
 * single answer the whole social pipeline depends on.
 *
 * ponytail: Node stdlib only. No express, no cheerio, no package.json.
 *   node >= 18 (needs global fetch).  Run:  node server.js
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const DECODO_TOKEN = process.env.DECODO_TOKEN || '';
const DECODO_API = 'https://scraper-api.decodo.com/v2/scrape';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 60000);

// MEASURED: a hashtag page lands in 12-40s, but a POST page took 62.0s. With a
// 60s timeout we were aborting post fetches ~2s before they would have landed,
// which is why stage 2 converted only 2 of 6. Post pages get their own, longer
// budget.
const POST_TIMEOUT_MS = Number(process.env.POST_TIMEOUT_MS || 150000);

// Decodo allows 10 concurrent requests. Stage 1 and stage 2 run sequentially,
// so each may use most of that budget. Stage 1 fires IG_TAGS + FB_TAGS at once.
const DECODO_MAX_CONCURRENCY = 10;
const IG_TAGS = Number(process.env.IG_TAGS || 3);
const FB_TAGS = Number(process.env.FB_TAGS || 2);
const POST_CONCURRENCY = Number(process.env.POST_CONCURRENCY || 8);

// Fetch every post discovered by default. Stage 2 is the slow half, but it is
// also where the only trustworthy author/caption pairing comes from, so recall
// here is worth the wall clock.
const MAX_POSTS = Number(process.env.MAX_POSTS || 25);

// One retry recovers a transient empty body or timeout. Two did not measurably
// help in the hashtag tests, so one it is.
const POST_RETRIES = Number(process.env.POST_RETRIES || 1);

// ---------------------------------------------------------------------------
// 1. QUERY EXPANSION  —  the product IP, same role the 6 Telegram dorks play.
//    One query in, the full candidate surface out. Pure, so test.js can check it.
// ---------------------------------------------------------------------------

const PIRACY_LEXICON = [
  'full movie', 'fullmovie', 'download', 'watch free', 'watch online', 'free online',
  'link in bio', 'dm for link', 'dm for', 'telegram link', 'google drive', 'gdrive',
  '1080p', '720p', '4k', 'hd print', 'web-dl', 'webrip', 'hdcam', 'camrip',
  'dual audio', 'leaked', 'leak', 'mirror', 'streaming link', 'direct link'
];

const IMPERSONATION_LEXICON = [
  'official', 'support', 'help', 'care', 'service', 'refund', 'giveaway',
  'winner', 'claim', 'verify', 'update', 'team'
];

/** Normalise a query into a hashtag-safe slug: "The Obsession!" -> "theobsession" */
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Build the hashtag + phrase + handle candidate space for any query. */
function expandQuery(q) {
  const base = slug(q);
  const year = new Date().getFullYear();
  if (!base) return { hashtags: [], phrases: [], handles: [] };

  // MEASURED 2026-09-21, "resident evil", yield per tag on Instagram:
  //   #residentevil          901 KB  12 posts   <- exists
  //   #residentevilmovie     869 KB  12 posts   <- exists
  //   #residentevilfullmovie   0 B    0 posts   <- DOES NOT EXIST
  //   #residentevildownload    0 B    0 posts   <- DOES NOT EXIST
  //   #residentevilleaked      0 B    0 posts   <- DOES NOT EXIST
  //   #residentevilhd          0 B    0 posts   <- DOES NOT EXIST
  //   #residentevil2026        0 B    0 posts   <- DOES NOT EXIST
  //
  // An earlier version put the piracy-specific tags first on the theory that
  // they would be higher precision. They are empty, and putting them first
  // dropped this query from 20 hits to 0 because only the first few are
  // fetched. The theory was wrong for a simple reason: a pirate wants to BE
  // FOUND, so they ride the high-volume tag and put the piracy wording in the
  // caption. Niche tags nobody browses would defeat their whole purpose.
  //
  // So: discovery uses the tags that actually have posts; the harm lexicon in
  // scoreFinding() does the separating. Do not reorder this without re-running
  // `node --env-file=.env tagyield.js "<query>"`.
  const hashtags = [
    base,               // always yields, highest volume
    base + 'movie',     // yields for film titles
    base + 'fullmovie', // long shot, usually empty, kept as a cheap extra try
    base + year,
    base + 'hd',
    base + 'download',
    base + 'leaked'
  ];

  const phrases = [
    `${q} full movie`,
    `${q} download`,
    `${q} leaked`,
    `${q} watch online free`
  ];

  // Handle patterns are the impersonation surface, and the only place we invent
  // identifiers rather than discover them. Kept small on purpose: see the
  // architecture doc on why a 200-pattern sweep is a phase-2 cost decision.
  const handles = [
    base, base + '_official', base + '.official', base + 'official',
    base + '_hd', base + '_movie', base + 'movies', base + '_support'
  ];

  return { hashtags: dedupe(hashtags), phrases, handles: dedupe(handles) };
}

function dedupe(a) { return Array.from(new Set(a)); }

// ---------------------------------------------------------------------------
// 2. SOURCE DEFINITIONS  —  which URLs get rendered, and how each is labelled.
//    `mode` drives the freshness label the UI shows. Index-backed sources are
//    marked as such so a stale source is never presented as live.
// ---------------------------------------------------------------------------

function buildSources(q) {
  const { hashtags, phrases } = expandQuery(q);
  const enc = encodeURIComponent;

  // MEASURED 2026-09-21 against Decodo, logged out. Do not change a URL shape
  // without re-running probe.js - three of these were wrong on first guess:
  //   instagram.com/explore/tags/<tag>/     -> 200, ~930 KB   WORKS
  //   facebook.com/hashtag/<tag>            -> 200, ~709 KB   WORKS
  //   facebook.com/<page>                   -> 200, ~1.3 MB   WORKS (enrichment)
  //   instagram.com/web/search/topsearch/   -> 401            needs auth, dropped
  //   facebook.com/search/pages?q=          -> 404            needs auth, dropped
  return [
    {
      id: 'ig-tags', name: 'Instagram hashtags', platform: 'Instagram',
      mode: 'Live on search', note: `${Math.min(hashtags.length, IG_TAGS)} tags`,
      urls: hashtags.slice(0, IG_TAGS).map(t => `https://www.instagram.com/explore/tags/${enc(t)}/`),
      parse: parseInstagram
    },
    {
      id: 'fb-tags', name: 'Facebook hashtags', platform: 'Facebook',
      mode: 'Live on search', note: `${Math.min(hashtags.length, FB_TAGS)} tags`,
      urls: hashtags.slice(0, FB_TAGS).map(t => `https://www.facebook.com/hashtag/${enc(t)}`),
      parse: parseFacebook
    }
  ];
}

// Surfaces that require an authenticated session. Kept here, not deleted, so the
// next person does not rediscover them: both were measured as hard failures.
const AUTH_WALLED = [
  { url: 'instagram.com/web/search/topsearch/', status: 401, note: 'Instagram keyword search' },
  { url: 'facebook.com/search/pages?q=',        status: 404, note: 'Facebook page search' }
];

// ---------------------------------------------------------------------------
// 3. FETCH  —  Decodo renders the page; we never run a browser locally.
//    Matches the call shape already in Iac/decodo-scraper/lambda_function.py.
// ---------------------------------------------------------------------------

async function renderUrl(url, timeoutMs) {
  const t0 = Date.now();
  const res = await fetch(DECODO_API, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + DECODO_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url, headless: 'html', geo: 'India' }),
    signal: AbortSignal.timeout(timeoutMs || TIMEOUT_MS)
  });

  const ms = Date.now() - t0;
  if (!res.ok) throw new Error(`decodo ${res.status} after ${ms}ms`);

  const json = await res.json();
  // Decodo nests the rendered body; shape has moved before, so probe defensively.
  const html =
    json?.results?.[0]?.content ??
    json?.results?.[0]?.body ??
    json?.content ??
    (typeof json === 'string' ? json : '');

  const upstream = json?.results?.[0]?.status_code ?? null;
  return { html: String(html || ''), ms, bytes: Buffer.byteLength(String(html || '')), upstream };
}

/**
 * The single most important signal in this prototype. If these markers appear,
 * logged-out discovery is dead and the architecture needs an unblocker instead.
 */
function detectLoginWall(html, upstreamStatus) {
  const h = html.toLowerCase();
  const markers = [
    'accounts/login', 'loginform', 'log into instagram', 'log in to continue',
    'you must log in', 'please log in'
  ];
  const hit = markers.filter(m => h.includes(m));
  const tooSmall = html.length < 20000;

  // MEASURED: a working Instagram hashtag page (929 KB, 11 handles parsed) still
  // contains "accounts/login" in its page chrome. The marker alone is a false
  // positive. A real wall is a marker on a SMALL body, or an auth status code.
  const wall = (hit.length > 0 && tooSmall) || upstreamStatus === 401 || upstreamStatus === 403;
  return { wall, markers: hit, tooSmall, bytes: html.length, upstreamStatus: upstreamStatus || null };
}

// ---------------------------------------------------------------------------
// 4. PARSERS  —  pull handles + captions out of rendered HTML. Pure functions.
//    Instagram ships most content as embedded JSON; Facebook as escaped markup.
//    Both change often, so each parser tries a structured route then a regex
//    fallback, and reports which one fired.
// ---------------------------------------------------------------------------

const IG_RESERVED = new Set([
  'explore', 'accounts', 'p', 'reel', 'reels', 'stories', 'about', 'developer',
  'legal', 'directory', 'privacy', 'terms', 'api', 'graphql', 'web', 'static',
  'ajax', 'emails', 'challenge', 'oauth', 'session', 'your_activity'
]);

function parseInstagram(html) {
  // STAGE 1. A hashtag page carries post shortcodes reliably, but MEASURED: it
  // contains zero owner->username blocks, so author and caption cannot be paired
  // here at any level of parser effort. Take the post IDs and move to stage 2.
  const codes = new Set();

  for (const m of html.match(/"(?:shortcode|code)"\s*:\s*"([A-Za-z0-9_-]{8,20})"/g) || []) {
    const c = m.match(/"([A-Za-z0-9_-]{8,20})"\s*$/);
    if (c) codes.add(c[1]);
  }
  for (const m of html.match(/\/(?:p|reel)\/([A-Za-z0-9_-]{8,20})\//g) || []) {
    codes.add(m.split('/')[2]);
  }

  // Locale strings and asset hashes sneak through; real shortcodes are 11 chars
  // of mixed case, never a bare lowercase word.
  const shortcodes = [...codes].filter(c => /[A-Z0-9_-]/.test(c) && !/^[a-z_]+$/.test(c));

  return { shortcodes, items: [], route: shortcodes.length ? 'shortcodes' : 'none' };
}

const FB_RESERVED = new Set([
  'pages', 'groups', 'events', 'watch', 'marketplace', 'search', 'login',
  'profile.php', 'help', 'policies', 'privacy', 'legal', 'business', 'ads',
  'hashtag', 'photo', 'photos', 'video', 'videos', 'recover', 'reg', 'story.php',
  'l.php', 'sharer', 'sharer.php', 'dialog', 'plugins', 'connect', 'tr',
  'settings', 'notifications', 'messages', 'bookmarks', 'friends', 'gaming',
  'about', 'careers', 'terms', 'cookies', 'support', 'lite', 'mobile', 'home.php'
]);


/**
 * MEASURED: a live Facebook hashtag page leaks UUIDs (7de24843-2b58-...) and
 * personal profiles (paplu.dutta.31) into href matches. Neither is a page a
 * brand-protection analyst would act on, so both are rejected here.
 */
function plausibleFacebookPage(name) {
  if (!name || name.length < 5) return false;
  if (FB_RESERVED.has(name.toLowerCase())) return false;
  if (!/[A-Za-z]/.test(name)) return false;
  if (/\.php$/i.test(name)) return false;
  // UUID, e.g. 7de24843-2b58-4730-855b-927d89eacb6b
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) return false;
  // personal profile, e.g. paplu.dutta.31 / binoy.sharma.370
  if (/^[a-z]+\.[a-z]+(\.\d+)?$/i.test(name)) return false;
  // hex blobs and asset ids
  if (/^[0-9a-f]{16,}$/i.test(name)) return false;
  return true;
}

function parseFacebook(html) {
  const found = new Map();
  let route = 'none';

  const hrefs = html.match(/facebook\.com\/([A-Za-z0-9.\-]{4,60})(?:\/|"|\?)/g) || [];
  if (hrefs.length) route = 'href';
  for (const m of hrefs) {
    const u = m.match(/facebook\.com\/([A-Za-z0-9.\-]{4,60})/);
    const name = u && u[1];
    if (name && plausibleFacebookPage(name)) {
      addHandle(found, name, 'Facebook', 'facebook.com/' + name);
    }
  }

  const texts = (html.match(/"text"\s*:\s*"((?:[^"\\]|\\.){10,400})"/g) || [])
    .map(m => unescapeJson(m.replace(/^"text"\s*:\s*"/, '').replace(/"$/, '')))
    .slice(0, 40);

  const list = Array.from(found.values());
  list.forEach((f, i) => { f.caption = texts[i] || ''; });
  return { items: list, route, captions: texts.length };
}

function addHandle(map, name, platform, url) {
  const key = (platform || 'Instagram') + ':' + name.toLowerCase();
  if (map.has(key)) return;
  map.set(key, {
    handle: platform === 'Facebook' ? name : '@' + name,
    platform: platform || 'Instagram',
    url: url || ('instagram.com/' + name),
    caption: '',
    followers: null
  });
}

function unescapeJson(s) {
  try { return JSON.parse('"' + s.replace(/"/g, '\\"') + '"'); }
  catch (_) { return s.replace(/\\n/g, ' ').replace(/\\"/g, '"'); }
}

// ---------------------------------------------------------------------------
// 4b. STAGE 2  -  one post page gives author + caption + likes, PAIRED.
//     MEASURED on /p/DVBFRnaiFv4/: og:title is literally
//       'WANDERVAMP on Instagram: "caption text"'
//     and og:description carries '44K likes, 214 comments - wandervamp on <date>'.
//     This is what makes scoring trustworthy; the hashtag page alone cannot.
// ---------------------------------------------------------------------------

function decodeEntities(s) {
  return String(s || '')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Parse one Instagram post page into a finding-shaped object. */
function parsePostPage(html, shortcode) {
  const grab = (re) => { const m = html.match(re); return m ? m[1] : null; };

  const ogTitle = grab(/<meta property="og:title" content="([^"]{0,400})"/);
  const ogDesc  = grab(/<meta property="og:description" content="([^"]{0,800})"/);

  // og:title = '<Author> on Instagram: "<caption>"'
  let author = ogTitle ? (ogTitle.match(/^(.*?)\s+on Instagram/) || [])[1] : null;
  let caption = ogTitle
    ? (ogTitle.match(/on Instagram:\s*&quot;([\s\S]*)&quot;/) ||
       ogTitle.match(/on Instagram:\s*"([\s\S]*)"/) || [])[1]
    : null;

  // og:description = '44K likes, 214 comments - wandervamp on February 21, 2026: "..."'
  const handle = ogDesc ? (ogDesc.match(/-\s*([A-Za-z0-9._]{2,30})\s+on\s/) || [])[1] : null;
  if (!caption && ogDesc) {
    caption = (ogDesc.match(/:\s*&quot;([\s\S]*?)&quot;/) || [])[1] || null;
  }

  const likesRaw = ogDesc ? (ogDesc.match(/([\d.,]+[KMB]?)\s+likes/i) || [])[1] : null;
  const likes = grab(/"(?:edge_media_preview_like|like_count)"[\s\S]{0,60}?"?count"?\s*:\s*(\d+)/)
             || (likesRaw ? String(expandCount(likesRaw)) : null);

  const username = (handle || author || '').toString().trim();
  if (!username) return null;

  return {
    handle: '@' + username.replace(/^@/, '').replace(/\s+/g, ''),
    displayName: author || null,
    platform: 'Instagram',
    url: 'https://www.instagram.com/p/' + shortcode + '/',
    profileUrl: 'https://www.instagram.com/' + username.replace(/^@/, '').replace(/\s+/g, '') + '/',
    caption: decodeEntities(caption || ogDesc || ''),
    followers: null,
    likes: likes ? Number(likes) : null,
    shortcode
  };
}

/** "44K" -> 44000, "1.2M" -> 1200000 */
function expandCount(s) {
  const m = String(s).replace(/,/g, '').match(/^([\d.]+)([KMB])?$/i);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1;
  return Math.round(parseFloat(m[1]) * mult);
}

/**
 * Fetch post pages. Stage 2 is the slow half and the only place author and
 * caption arrive paired, so it is worth the wall clock.
 *
 * Returns { items, stats } so the UI can show real conversion instead of
 * silently dropping posts that failed.
 */
async function fetchPosts(shortcodes) {
  const out = [];
  const queue = shortcodes.slice(0, MAX_POSTS);
  const stats = { attempted: queue.length, ok: 0, timeout: 0, empty: 0, failed: 0, retried: 0 };
  let cursor = 0;

  async function attempt(code) {
    const page = await renderUrl('https://www.instagram.com/p/' + code + '/', POST_TIMEOUT_MS);
    if (page.upstream && page.upstream >= 400) return { skip: 'http' + page.upstream };
    if (!page.bytes) return { skip: 'empty' };
    const parsed = parsePostPage(page.html, code);
    return parsed ? { item: parsed } : { skip: 'unparsed' };
  }

  async function worker() {
    while (cursor < queue.length) {
      const code = queue[cursor++];
      let last = null;
      for (let tryN = 0; tryN <= POST_RETRIES; tryN++) {
        if (tryN > 0) stats.retried++;
        try {
          const r = await attempt(code);
          if (r.item) { out.push(r.item); stats.ok++; last = null; break; }
          last = r.skip;
        } catch (e) {
          last = /timed?\s*out|abort/i.test(String(e.message)) ? 'timeout' : 'failed';
        }
      }
      if (last === 'timeout') stats.timeout++;
      else if (last === 'empty') stats.empty++;
      else if (last) stats.failed++;
    }
  }

  const lanes = Math.max(1, Math.min(POST_CONCURRENCY, DECODO_MAX_CONCURRENCY, queue.length));
  await Promise.all(Array.from({ length: lanes }, worker));
  return { items: out, stats };
}

// ---------------------------------------------------------------------------
// 5. SCORING  —  five named components, fixed weights. The deterministic parts
//    are computed here; an LLM would contribute only to harmLikelihood and
//    matchStrength in production. Pure, so it is unit-checkable.
// ---------------------------------------------------------------------------

const WEIGHTS = { match: 0.30, harm: 0.30, impact: 0.20, repeat: 0.15, evidence: 0.05 };

/** Cheap edit distance, capped — we only care about "close or not". */
function editDistance(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function matchStrength(handle, caption, query) {
  // MEASURED BUG (2026-09-21): this used to score the HANDLE and add only +10
  // for a caption match, so @taleofemotionss posting "...Jawan..." scored 10.
  // A real pirate is @moviehub_hd with a perfect caption match, so the heaviest
  // weight sat on the signal least likely to fire. Now: take the STRONGER of
  // the two. "Does this item concern the protected title?" is answered by the
  // handle OR the content, whichever says so more clearly.
  const q = slug(query);
  if (!q) return 0;

  const h = slug(handle);
  let byHandle = 0;
  if (h === q) byHandle = 100;
  else if (h.includes(q)) byHandle = 88;
  else {
    const d = editDistance(h, q);
    byHandle = Math.max(0, 100 - (d / Math.max(q.length, 1)) * 100);
  }

  const cap = String(caption || '').toLowerCase();
  const qLower = String(query).toLowerCase().trim();
  let byCaption = 0;
  if (cap) {
    if (cap.includes('#' + q)) byCaption = 90;          // hashtagged the title
    else if (cap.includes(qLower)) byCaption = 82;      // named the title
    else {
      // every word of a multi-word title present, in any order
      const words = qLower.split(/\s+/).filter(w => w.length > 2);
      if (words.length > 1 && words.every(w => cap.includes(w))) byCaption = 70;
    }
  }

  return Math.round(Math.max(0, Math.min(100, Math.max(byHandle, byCaption))));
}

function harmLikelihood(text) {
  const t = (text || '').toLowerCase();
  if (!t) return 0;
  let hits = 0;
  const matched = [];
  for (const w of PIRACY_LEXICON) if (t.includes(w)) { hits++; matched.push(w); }
  for (const w of IMPERSONATION_LEXICON) if (t.includes(w)) { hits += 0.5; matched.push(w); }
  return { score: Math.round(Math.min(100, hits * 22)), matched: matched.slice(0, 6) };
}

function impactScore(n) {
  // n is followers where we have them, otherwise like count from the post page.
  if (!n) return 40;                               // unknown, middling, never zero
  return Math.round(Math.min(100, Math.log10(n + 1) / 6 * 100));
}

function scoreFinding(f, query, seenBefore) {
  const text = [f.handle, f.caption].filter(Boolean).join(' ');
  const harm = harmLikelihood(text);
  const parts = {
    match:    matchStrength(f.handle.replace(/^@/, ''), f.caption, query),
    harm:     harm.score,
    impact:   impactScore(f.followers || f.likes),
    // Unknown is not low. A brand-new account is an ABSENCE of network
    // evidence, not evidence of innocence, and the first sighting of a
    // pirate is exactly when flagging matters most. Same convention as
    // impactScore: unknown sits mid-scale, never near zero.
    repeat:   seenBefore ? 95 : 40,
    evidence: f.evidence ? 100 : 60
  };
  const total = Math.round(
    parts.match * WEIGHTS.match + parts.harm * WEIGHTS.harm +
    parts.impact * WEIGHTS.impact + parts.repeat * WEIGHTS.repeat +
    parts.evidence * WEIGHTS.evidence
  );
  return { parts, total, matched: harm.matched };
}

function severity(score) {
  return score >= 85 ? 'crit' : score >= 70 ? 'high' : score >= 45 ? 'med' : 'low';
}

// ---------------------------------------------------------------------------
// 6. RESULT SHAPE
// ---------------------------------------------------------------------------

function finalize(f, s, seen, repeat) {
  return {
    id: crypto.createHash('sha1').update(f.platform + f.handle).digest('hex').slice(0, 10),
    handle: f.handle,
    platform: f.platform,
    source: f.source,
    url: f.url,
    profileUrl: f.profileUrl || null,
    displayName: f.displayName || null,
    likes: f.likes || null,
    unenriched: !!f.unenriched,
    snippet: f.caption,
    followers: f.followers,
    score: s.total,
    sev: severity(s.total),
    breakdown: [
      ['Title match',      s.parts.match,    WEIGHTS.match],
      ['Harm likelihood',  s.parts.harm,     WEIGHTS.harm],
      ['Reach',            s.parts.impact,   WEIGHTS.impact],
      ['Repeat / network', s.parts.repeat,   WEIGHTS.repeat],
      ['Evidence quality', s.parts.evidence, WEIGHTS.evidence]
    ],
    matched: s.matched,
    seen: seen,
    fresh: !/d ago/.test(seen),
    repeat: !!repeat,
    evidence: {
      captured: new Date().toISOString().replace('T', ' ').slice(0, 19),
      sha: crypto.createHash('sha256').update(f.url + f.caption).digest('hex').slice(0, 8) + '…' +
           crypto.createHash('sha256').update(f.url).digest('hex').slice(-4),
      method: f.platform === 'Facebook' ? 'decodo:fb-search@v1' : 'decodo:ig-hashtag@v1'
    }
  };
}

// ---------------------------------------------------------------------------
// 7. THE SCAN
// ---------------------------------------------------------------------------

async function liveScan(q) {
  const sources = buildSources(q);
  const diagnostics = [];
  const all = [];
  let shortcodes = [];

  // ---- STAGE 1: discovery. Hashtag pages -> post IDs (Instagram) or page names (Facebook)
  await Promise.all(sources.map(async (src) => {
    const t0 = Date.now();
    let items = [], codes = [], route = 'none', wall = false, markers = [], bytes = 0, error = null;
    let emptyPages = 0;

    try {
      const pages = await Promise.all(src.urls.map(u =>
        renderUrl(u, TIMEOUT_MS).catch(e => ({ error: String(e.message) }))));
      for (const p of pages) {
        if (p.error) { error = p.error; continue; }
        bytes += p.bytes;
        const probe = detectLoginWall(p.html, p.upstream);
        if (probe.wall) { wall = true; markers = markers.concat(probe.markers); }
        if (p.upstream && p.upstream >= 400) error = 'upstream ' + p.upstream;
        if (p.bytes === 0) { emptyPages++; continue; }   // tag does not exist
        const parsed = src.parse(p.html);
        route = parsed.route !== 'none' ? parsed.route : route;
        if (parsed.shortcodes) codes = codes.concat(parsed.shortcodes);
        if (parsed.items) items = items.concat(parsed.items);
      }
    } catch (e) {
      error = String(e.message);
    }

    shortcodes = shortcodes.concat(codes);

    diagnostics.push({
      id: src.id, name: src.name, mode: src.mode, note: src.note, stage: 1,
      ms: Date.now() - t0, bytes, route, wall, markers: dedupe(markers).slice(0, 3),
      emptyPages, urlsTried: src.urls.length,
      error, hits: codes.length || items.length
    });

    // Facebook: no post-page equivalent, so these stay unenriched and are
    // scored on the page name alone. Flagged so the UI can say so.
    for (const it of items.slice(0, 25)) {
      it.source = src.id;
      it.evidence = true;
      it.unenriched = true;
      const s = scoreFinding(it, q, false);
      all.push(finalize(it, s, 'just now', false));
    }
  }));

  // ---- STAGE 2: enrichment. Post pages give author+caption+likes, PAIRED.
  shortcodes = dedupe(shortcodes);
  const t2 = Date.now();
  const { items: posts, stats: postStats } = await fetchPosts(shortcodes);
  diagnostics.push({
    id: 'ig-posts', name: 'Instagram post pages', mode: 'Live on search', stage: 2,
    note: postStats.ok + ' of ' + postStats.attempted + ' enriched' + (postStats.timeout ? ', ' + postStats.timeout + ' timed out' : '') + (postStats.empty ? ', ' + postStats.empty + ' empty' : '') + (postStats.failed ? ', ' + postStats.failed + ' failed' : ''),
    ms: Date.now() - t2, bytes: 0, route: 'og-meta', wall: false, markers: [],
    error: null, hits: posts.length, stats: postStats
  });

  for (const p of posts) {
    p.source = 'ig-posts';
    p.evidence = true;
    const s = scoreFinding(p, q, false);
    all.push(finalize(p, s, 'just now', false));
  }

  // dedupe by platform+handle, keep the highest score
  const best = new Map();
  for (const f of all) {
    const k = f.platform + ':' + f.handle.toLowerCase();
    if (!best.has(k) || best.get(k).score < f.score) best.set(k, f);
  }

  return {
    mode: 'live',
    query: q,
    findings: Array.from(best.values()).sort((a, b) => b.score - a.score),
    sources: diagnostics.sort((a, b) => (a.stage - b.stage) || (a.ms - b.ms)),
    expansion: expandQuery(q),
    discovered: shortcodes.length,
    postStats,
    verdict: verdictFor(diagnostics.filter(d => d.stage === 1))
  };
}

/** The go/no-go answer for architecture doc section 6.1.4. */
function verdictFor(diags) {
  const walled  = diags.filter(d => d.wall);
  const gotData = diags.filter(d => d.hits > 0);
  if (gotData.length) {
    return {
      pass: true,
      text: `Logged-out discovery works. ${gotData.length}/${diags.length} sources returned handles` +
            (walled.length ? `, ${walled.length} hit an auth wall.` : '.')
    };
  }
  if (walled.length) {
    return { pass: false, text: 'Every source hit an auth wall. Logged-out discovery does not work; budget for an unblocker.' };
  }
  return { pass: null, text: 'Inconclusive. No wall detected but no handles parsed. Inspect the raw response with probe.js.' };
}


// ---------------------------------------------------------------------------
// 8. SERVER
// ---------------------------------------------------------------------------

if (require.main === module) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/api/scan') {
      const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
      res.setHeader('Content-Type', 'application/json');
      if (!q) { res.writeHead(400).end(JSON.stringify({ error: 'q is required' })); return; }
      if (!DECODO_TOKEN) {
        res.writeHead(503).end(JSON.stringify({
          error: 'DECODO_TOKEN is not set. This prototype only performs real scans; there is no demo data. Run: node --env-file=.env server.js'
        }));
        return;
      }
      try {
        const out = await liveScan(q);
        res.writeHead(200).end(JSON.stringify(out));
      } catch (e) {
        res.writeHead(500).end(JSON.stringify({ error: String(e.message) }));
      }
      return;
    }

    if (url.pathname === '/' || url.pathname === '/dashboard.html') {
      fs.readFile(path.join(__dirname, 'dashboard.html'), (err, buf) => {
        if (err) { res.writeHead(500).end('dashboard.html not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(buf);
      });
      return;
    }

    res.writeHead(404).end('not found');
  });

  if (!DECODO_TOKEN) {
    console.error('\n  DECODO_TOKEN is not set.');
    console.error('  This prototype performs real scans only - there is no demo data.');
    console.error('  Run:  node --env-file=.env server.js\n');
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`\n  DarkMap discovery prototype  ->  http://localhost:${PORT}`);
    console.log('  mode: LIVE. Every result is fetched from Instagram/Facebook at request time.');
    console.log('  a full two-stage scan takes 60-90s; stage 2 fetches one page per post.\n');
  });
}

module.exports = {
  liveScan, buildSources, renderUrl,
  parsePostPage, fetchPosts, expandCount, decodeEntities, plausibleFacebookPage,
  slug, expandQuery, editDistance, matchStrength, harmLikelihood, impactScore,
  scoreFinding, severity, parseInstagram, parseFacebook, detectLoginWall,
  finalize, verdictFor, WEIGHTS
};

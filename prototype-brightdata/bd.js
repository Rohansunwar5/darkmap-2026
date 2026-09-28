/**
 * Bright Data live-scraping probe, and a head-to-head against Decodo.
 *
 *   node --env-file=.env bd.js capabilities   # what can it actually take as input?
 *   node --env-file=.env bd.js compare        # same target, both vendors, timed
 *   node --env-file=.env bd.js discover jawan # can it turn a keyword into accounts?
 *
 * The question this answers: Bright Data markets "real-time" scrapers for
 * Instagram and Facebook. Is that true, and can it do DISCOVERY (keyword in,
 * accounts out) or only ENRICHMENT (URL in, structured data out)?
 *
 * ponytail: stdlib only, no package.json. Node >= 20.6 for --env-file.
 */
'use strict';

const BD_TOKEN = process.env.BRIGHTDATA_TOKEN || '';
const DECODO_TOKEN = process.env.DECODO_TOKEN || '';
const BD_SCRAPE = 'https://api.brightdata.com/datasets/v3/scrape';
const BD_TRIGGER = 'https://api.brightdata.com/datasets/v3/trigger';
const DECODO_API = 'https://scraper-api.decodo.com/v2/scrape';
const TIMEOUT = Number(process.env.TIMEOUT_MS || 120000);

// Dataset ids. gd_l1vikfch901nx3by4 is confirmed from the Bright Data UI
// (Instagram - Profiles - collect by URL). The others are the commonly
// published ids and are verified by this script rather than trusted.
const DATASETS = {
  ig_profiles: 'gd_l1vikfch901nx3by4',
  ig_posts:    'gd_lk5ns7kz21pck8jpis',
  ig_reels:    'gd_lyclm20il4r5helnj',
  ig_comments: 'gd_ltppn085pokosxh13',
  fb_posts:    'gd_lyclm1571iy3mv57zw',
  fb_profiles: 'gd_lkaxegm826bjpoo9m5'
};

function ms(t0) { return ((Date.now() - t0) / 1000).toFixed(1) + 's'; }
function pad(s, n) { return String(s).padEnd(n); }

// ---------------------------------------------------------------------------
// Bright Data: synchronous /scrape  (the "Real-time" mode in their UI)
// ---------------------------------------------------------------------------
async function bdScrape(datasetId, input, extraQs) {
  const qs = new URLSearchParams(Object.assign(
    { dataset_id: datasetId, notify: 'false', include_errors: 'true' }, extraQs || {}
  ));
  const t0 = Date.now();
  const res = await fetch(BD_SCRAPE + '?' + qs, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + BD_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(TIMEOUT)
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch (_) { body = text; }
  return { http: res.status, elapsed: Date.now() - t0, body, raw: text };
}

// Async trigger, for the modes /scrape refuses
async function bdTrigger(datasetId, input, extraQs) {
  const qs = new URLSearchParams(Object.assign(
    { dataset_id: datasetId, include_errors: 'true' }, extraQs || {}
  ));
  const t0 = Date.now();
  const res = await fetch(BD_TRIGGER + '?' + qs, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + BD_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(TIMEOUT)
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch (_) { body = text; }
  return { http: res.status, elapsed: Date.now() - t0, body, raw: text };
}

async function bdSnapshot(id) {
  const res = await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${id}?format=json`, {
    headers: { 'Authorization': 'Bearer ' + BD_TOKEN },
    signal: AbortSignal.timeout(TIMEOUT)
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch (_) { body = text; }
  return { http: res.status, body };
}

// ---------------------------------------------------------------------------
// Decodo: render any URL, we parse
// ---------------------------------------------------------------------------
async function decodo(url) {
  const t0 = Date.now();
  const res = await fetch(DECODO_API, {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + DECODO_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, headless: 'html', geo: 'India' }),
    signal: AbortSignal.timeout(TIMEOUT)
  });
  const j = await res.json();
  const html = String(j?.results?.[0]?.content ?? '');
  return { http: res.status, upstream: j?.results?.[0]?.status_code ?? null,
           elapsed: Date.now() - t0, bytes: html.length, html };
}

function summarise(body) {
  if (Array.isArray(body)) {
    const first = body[0] || {};
    const keys = Object.keys(first).slice(0, 8).join(',');
    const err = first.error || first.warning || null;
    return { n: body.length, keys, err };
  }
  if (body && typeof body === 'object') {
    return { n: 0, keys: Object.keys(body).slice(0, 8).join(','),
             err: body.error || body.message || null };
  }
  return { n: 0, keys: '', err: String(body).slice(0, 120) };
}

// ---------------------------------------------------------------------------
// 1. CAPABILITIES  -  what inputs does it actually accept?
// ---------------------------------------------------------------------------
async function capabilities() {
  console.log('\n=== Bright Data: what does it accept? ===\n');
  console.log('  ' + pad('probe', 38) + pad('http', 6) + pad('time', 8) + pad('rows', 6) + 'notes');
  console.log('  ' + '-'.repeat(96));

  const probes = [
    ['IG profile by URL',        DATASETS.ig_profiles, [{ url: 'https://www.instagram.com/nasa/' }], null],
    ['IG profile by user_name',  DATASETS.ig_profiles, [{ user_name: 'nasa' }], { type: 'discover_new', discover_by: 'user_name' }],
    ['IG post by URL',           DATASETS.ig_posts,    [{ url: 'https://www.instagram.com/p/DVBFRnaiFv4/' }], null],
    ['IG posts discover:hashtag',DATASETS.ig_posts,    [{ hashtag: 'jawan', num_of_posts: 5 }], { type: 'discover_new', discover_by: 'hashtag' }],
    ['IG posts discover:keyword',DATASETS.ig_posts,    [{ keyword: 'jawan full movie' }], { type: 'discover_new', discover_by: 'keyword' }],
    ['IG posts discover:url',    DATASETS.ig_posts,    [{ url: 'https://www.instagram.com/nasa/', num_of_posts: 3 }], { type: 'discover_new', discover_by: 'url' }],
    ['FB post by URL',           DATASETS.fb_posts,    [{ url: 'https://www.facebook.com/nasa' }], null]
  ];

  for (const [label, ds, input, qs] of probes) {
    try {
      const r = await bdScrape(ds, input, qs);
      const s = summarise(r.body);
      console.log('  ' + pad(label, 38) + pad(r.http, 6) + pad((r.elapsed/1000).toFixed(1) + 's', 8) +
                  pad(s.n, 6) + (s.err ? 'ERR ' + String(s.err).slice(0, 60) : 'keys: ' + s.keys));
    } catch (e) {
      console.log('  ' + pad(label, 38) + pad('-', 6) + pad('-', 8) + pad('-', 6) + 'EXC ' + e.message.slice(0, 60));
    }
  }
}

// ---------------------------------------------------------------------------
// 2. DISCOVER  -  can a keyword become accounts, without us parsing anything?
// ---------------------------------------------------------------------------
async function discover(q) {
  console.log('\n=== Can Bright Data turn "' + q + '" into accounts? ===\n');

  const attempts = [
    ['posts / discover_by=hashtag', DATASETS.ig_posts, [{ hashtag: q.replace(/\s+/g, ''), num_of_posts: 10 }], { type: 'discover_new', discover_by: 'hashtag' }],
    ['posts / discover_by=keyword', DATASETS.ig_posts, [{ keyword: q, num_of_posts: 10 }], { type: 'discover_new', discover_by: 'keyword' }],
    ['posts / discover_by=search',  DATASETS.ig_posts, [{ search: q }], { type: 'discover_new', discover_by: 'search' }]
  ];

  for (const [label, ds, input, qs] of attempts) {
    try {
      const r = await bdTrigger(ds, input, qs);
      const s = summarise(r.body);
      console.log('  ' + pad(label, 32) + 'http=' + r.http + '  ' + (r.body?.snapshot_id
        ? 'snapshot_id=' + r.body.snapshot_id + '  (async job accepted)'
        : (s.err ? 'ERR ' + String(s.err).slice(0, 90) : JSON.stringify(r.body).slice(0, 90))));
      if (r.body?.snapshot_id) {
        console.log('      polling snapshot for up to 60s...');
        for (let i = 0; i < 12; i++) {
          await new Promise(r2 => setTimeout(r2, 5000));
          const snap = await bdSnapshot(r.body.snapshot_id);
          if (Array.isArray(snap.body)) {
            console.log('      -> ' + snap.body.length + ' rows. sample: ' +
              JSON.stringify(snap.body[0] || {}).slice(0, 160));
            break;
          }
          if (snap.body?.status && snap.body.status !== 'running') {
            console.log('      -> status=' + snap.body.status + ' ' + JSON.stringify(snap.body).slice(0, 120));
            break;
          }
        }
      }
    } catch (e) {
      console.log('  ' + pad(label, 32) + 'EXC ' + e.message.slice(0, 80));
    }
  }
}

// ---------------------------------------------------------------------------
// 3. COMPARE  -  same target, both vendors
// ---------------------------------------------------------------------------
async function compare() {
  const profileUrl = 'https://www.instagram.com/nasa/';
  const tagUrl = 'https://www.instagram.com/explore/tags/jawan/';

  console.log('\n=== Head to head ===\n');

  console.log('A. ENRICHMENT  -  read one known profile: ' + profileUrl + '\n');
  try {
    const r = await bdScrape(DATASETS.ig_profiles, [{ url: profileUrl }]);
    const row = Array.isArray(r.body) ? r.body[0] : null;
    console.log('  Bright Data : http=' + r.http + '  ' + (r.elapsed / 1000).toFixed(1) + 's  ' +
      (row ? 'STRUCTURED, ' + Object.keys(row).length + ' fields' : 'no row') );
    if (row) {
      console.log('                followers=' + (row.followers ?? row.edge_followed_by ?? '?') +
                  '  verified=' + (row.is_verified ?? '?') +
                  '  posts=' + (row.posts_count ?? '?'));
      console.log('                fields: ' + Object.keys(row).slice(0, 14).join(', '));
    }
  } catch (e) { console.log('  Bright Data : EXC ' + e.message); }

  try {
    const d = await decodo(profileUrl);
    const followers = (d.html.match(/"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/) || [])[1]
      || (d.html.match(/([\d.,KMB]+)\s+Followers/i) || [])[1] || '?';
    console.log('  Decodo      : http=' + d.http + '  ' + (d.elapsed / 1000).toFixed(1) + 's  ' +
      'RAW HTML, ' + Math.round(d.bytes / 1024) + ' KB, we parse it');
    console.log('                followers extracted by our regex: ' + followers);
  } catch (e) { console.log('  Decodo      : EXC ' + e.message); }

  console.log('\nB. DISCOVERY  -  fetch a hashtag page: ' + tagUrl + '\n');
  try {
    const r = await bdScrape(DATASETS.ig_posts, [{ url: tagUrl }]);
    const s = summarise(r.body);
    console.log('  Bright Data : http=' + r.http + '  ' + (r.elapsed / 1000).toFixed(1) + 's  rows=' + s.n +
      (s.err ? '  ERR ' + String(s.err).slice(0, 70) : ''));
  } catch (e) { console.log('  Bright Data : EXC ' + e.message); }

  try {
    const d = await decodo(tagUrl);
    const codes = [...new Set((d.html.match(/"(?:shortcode|code)"\s*:\s*"([A-Za-z0-9_-]{8,20})"/g) || [])
      .map(m => m.match(/"([A-Za-z0-9_-]{8,20})"\s*$/)[1]))];
    console.log('  Decodo      : http=' + d.http + '  ' + (d.elapsed / 1000).toFixed(1) + 's  ' +
      Math.round(d.bytes / 1024) + ' KB  ->  ' + codes.length + ' post URLs extracted');
  } catch (e) { console.log('  Decodo      : EXC ' + e.message); }
}

// ---------------------------------------------------------------------------

const cmd = process.argv[2] || 'capabilities';
if (!BD_TOKEN) { console.error('BRIGHTDATA_TOKEN not set. Use: node --env-file=.env bd.js'); process.exit(1); }

(async () => {
  if (cmd === 'capabilities') await capabilities();
  else if (cmd === 'compare') await compare();
  else if (cmd === 'discover') await discover(process.argv[3] || 'jawan');
  else console.log('usage: bd.js [capabilities|compare|discover <query>]');
  console.log('');
})().catch(e => { console.error('failed:', e.message); process.exit(1); });

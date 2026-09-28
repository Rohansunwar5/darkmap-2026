// If Decodo can read ONE post page and get author + caption PAIRED, then the
// scoring bug is fixable without buying a structured extractor.
'use strict';
const T = process.env.DECODO_TOKEN;

(async () => {
  const url = process.argv[2] || 'https://www.instagram.com/p/DVBFRnaiFv4/';
  const t0 = Date.now();
  const r = await fetch('https://scraper-api.decodo.com/v2/scrape', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + T, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, headless: 'html', geo: 'India' }),
    signal: AbortSignal.timeout(90000)
  });
  const j = await r.json();
  const c = String(j?.results?.[0]?.content ?? '');
  console.log('\n  ' + url);
  console.log('  ' + ((Date.now() - t0) / 1000).toFixed(1) + 's  ' +
              Math.round(c.length / 1024) + ' KB  upstream=' + (j?.results?.[0]?.status_code ?? '-'));

  const grab = (re) => { const m = c.match(re); return m ? m[1] : null; };

  // og: meta tags are the reliable route - Instagram renders them for link previews
  const ogTitle = grab(/<meta property="og:title" content="([^"]{0,300})"/);
  const ogDesc  = grab(/<meta property="og:description" content="([^"]{0,600})"/);
  const ogImage = grab(/<meta property="og:image" content="([^"]{0,400})"/);

  // JSON route
  const userJson = grab(/"owner"[\s\S]{0,200}?"username"\s*:\s*"([A-Za-z0-9._]{2,30})"/)
                || grab(/"username"\s*:\s*"([A-Za-z0-9._]{2,30})"/);
  const likes    = grab(/"edge_media_preview_like"[\s\S]{0,60}?"count"\s*:\s*(\d+)/)
                || grab(/"like_count"\s*:\s*(\d+)/);

  // og:title on a post is literally: 'Author on Instagram: "the caption"'
  const authorFromOg = ogTitle ? (ogTitle.match(/^(.*?)\s+on Instagram/) || [])[1] : null;
  const capFromOg    = ogTitle ? (ogTitle.match(/on Instagram:\s*&quot;([\s\S]*)&quot;/) ||
                                  ogTitle.match(/on Instagram:\s*"([\s\S]*)"/) || [])[1] : null;

  console.log('    og:title     : ' + (ogTitle ? JSON.stringify(ogTitle.slice(0, 200)) : 'NOT FOUND'));
  console.log('    og:desc      : ' + (ogDesc ? JSON.stringify(ogDesc.slice(0, 160)) : 'NOT FOUND'));
  console.log('    og:image     : ' + (ogImage ? 'present' : 'NOT FOUND'));
  console.log('    author (og)  : ' + (authorFromOg || 'NOT FOUND'));
  console.log('    caption (og) : ' + (capFromOg ? JSON.stringify(capFromOg.slice(0, 160)) : 'NOT FOUND'));
  console.log('    author (json): ' + (userJson || 'NOT FOUND'));
  console.log('    likes        : ' + (likes || 'NOT FOUND'));

  const paired = (authorFromOg || userJson) && (capFromOg || ogDesc);
  console.log('\n    PAIRED author+caption from one post page? ' +
              (paired ? 'YES - scoring is fixable with Decodo alone'
                      : 'NO - would need a structured extractor'));
})().catch(e => console.log('  ERR ' + e.message));

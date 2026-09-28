/**
 * Which hashtags actually return posts?
 *
 *   node --env-file=.env tagyield.js "resident evil"
 *
 * Built after a regression: reordering the expansion to put niche piracy tags
 * first dropped "resident evil" from 20 hits to 0. This measures yield per tag
 * so tag selection is driven by data instead of by a plausible-sounding theory.
 */
'use strict';
const s = require('./server');

const T = process.env.DECODO_TOKEN;

async function render(url) {
  const t0 = Date.now();
  const r = await fetch('https://scraper-api.decodo.com/v2/scrape', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + T, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, headless: 'html', geo: 'India' }),
    signal: AbortSignal.timeout(90000)
  });
  const j = await r.json();
  const html = String(j?.results?.[0]?.content ?? '');
  return { html, ms: Date.now() - t0, bytes: html.length, upstream: j?.results?.[0]?.status_code ?? null };
}

(async () => {
  const q = process.argv[2] || 'resident evil';
  const tags = s.expandQuery(q).hashtags;
  console.log('\n  tag yield for "' + q + '"\n');
  console.log('  ' + 'tag'.padEnd(28) + 'time'.padStart(7) + 'bytes'.padStart(11) + 'posts'.padStart(7) + '  upstream');
  console.log('  ' + '-'.repeat(66));

  for (const tag of tags) {
    try {
      const p = await render('https://www.instagram.com/explore/tags/' + encodeURIComponent(tag) + '/');
      const codes = s.parseInstagram(p.html).shortcodes;
      console.log('  #' + tag.padEnd(27) +
                  ((p.ms / 1000).toFixed(1) + 's').padStart(7) +
                  String(p.bytes).padStart(11) +
                  String(codes.length).padStart(7) +
                  '  ' + p.upstream);
    } catch (e) {
      console.log('  #' + tag.padEnd(27) + '    ERR ' + e.message.slice(0, 40));
    }
  }
  console.log('');
})().catch(e => console.error('failed:', e.message));

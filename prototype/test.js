/**
 * Self-check for the pure logic in server.js. No network, no framework.
 *   node test.js
 *
 * ponytail: one runnable check over the parts that can silently go wrong -
 * query expansion, the parsers, the login-wall detector and the scoring math.
 * Everything else is I/O and is verified by running a real scan.
 */
'use strict';

const s = require('./server');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
}
function eq(name, a, b) { ok(name, a === b, JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }

console.log('\nquery expansion');
eq('slug strips punctuation', s.slug('The Obsession!'), 'theobsession');
eq('slug handles unicode-free digits', s.slug('Kalki 2898 AD'), 'kalki2898ad');
ok('expansion is query-driven', s.expandQuery('Obsession').hashtags.includes('obsessionfullmovie'));
ok('expansion dedupes', new Set(s.expandQuery('Obsession').hashtags).size === s.expandQuery('Obsession').hashtags.length);
eq('empty query yields nothing', s.expandQuery('').hashtags.length, 0);
ok('different queries differ', s.expandQuery('Jawan').hashtags[0] !== s.expandQuery('Obsession').hashtags[0]);

console.log('\ninstagram stage 1: hashtag page -> post ids');
const igJson = '{"shortcode":"DVBFRnaiFv4","x":1}{"code":"CuF4s0MNqNr"}';
ok('extracts shortcodes from json', s.parseInstagram(igJson).shortcodes.includes('DVBFRnaiFv4'));
eq('reports the route it used', s.parseInstagram(igJson).route, 'shortcodes');
ok('extracts shortcodes from /p/ hrefs', s.parseInstagram('<a href="/p/DYAKYzCKQLJ/">x</a>').shortcodes.includes('DYAKYzCKQLJ'));
ok('extracts shortcodes from /reel/ hrefs', s.parseInstagram('<a href="/reel/DXhA9Ink3LJ/">x</a>').shortcodes.includes('DXhA9Ink3LJ'));
ok('drops locale junk like en_US', !s.parseInstagram('<a href="/p/en_US/">x</a>').shortcodes.includes('en_US'));
eq('empty html yields nothing', s.parseInstagram('').shortcodes.length, 0);

console.log('\ninstagram stage 2: post page -> author + caption PAIRED');
const postHtml =
  '<meta property="og:title" content="WANDERVAMP on Instagram: &quot;Zuzu Tere Ko Uncle Bola. #Jawan&quot;">' +
  '<meta property="og:description" content="44K likes, 214 comments - wandervamp on February 21, 2026: &quot;Zuzu Tere Ko Uncle Bola. #Jawan&quot;. ">';
const post = s.parsePostPage(postHtml, 'DVBFRnaiFv4');
ok('returns a finding', !!post);
eq('handle comes from og:description', post.handle, '@wandervamp');
eq('display name comes from og:title', post.displayName, 'WANDERVAMP');
ok('caption is paired to that author', post.caption.indexOf('Zuzu Tere Ko Uncle Bola') === 0, post.caption);
ok('caption entities decoded', post.caption.indexOf('&quot;') === -1);
eq('post url built from shortcode', post.url, 'https://www.instagram.com/p/DVBFRnaiFv4/');
eq('profile url built from handle', post.profileUrl, 'https://www.instagram.com/wandervamp/');
eq('likes parsed from 44K likes', post.likes, 44000);
eq('page with no og tags yields nothing', s.parsePostPage('<html></html>', 'X'), null);

console.log('\ncount expansion');
eq('44K', s.expandCount('44K'), 44000);
eq('1.2M', s.expandCount('1.2M'), 1200000);
eq('1,234 with comma', s.expandCount('1,234'), 1234);
eq('garbage yields null', s.expandCount('lots'), null);

console.log('\nfacebook parser');
const fb = 'href="https://facebook.com/ObsessionFullMovieHD/" href="https://facebook.com/groups/"';
ok('parses page handle', s.parseFacebook(fb).items.some(i => i.handle === 'ObsessionFullMovieHD'));
ok('drops reserved paths', !s.parseFacebook(fb).items.some(i => i.handle === 'groups'));

console.log('\nlogin-wall detector  (the 6.1.4 signal)');
ok('flags a login wall', s.detectLoginWall('<div>Please log in to continue</div>').wall === true);
ok('flags accounts/login', s.detectLoginWall('<a href="/accounts/login/?next=">x</a>').wall === true);
ok('does not flag a real page', s.detectLoginWall('x'.repeat(50000)).wall === false);
ok('flags a suspiciously small body', s.detectLoginWall('<html></html>').tooSmall === true);

console.log('\nscoring');
eq('exact handle match scores 100', s.matchStrength('obsession', '', 'Obsession'), 100);
ok('substring match scores high', s.matchStrength('obsession_hd_movie', '', 'Obsession') >= 80);
ok('unrelated handle scores low', s.matchStrength('cakerecipes', '', 'Obsession') < 40);
ok('piracy lexicon raises harm', s.harmLikelihood('full movie download link in bio').score > 50);
eq('empty text has no harm signal', s.harmLikelihood('').score || 0, 0);
ok('harm reports what matched', s.harmLikelihood('watch free 1080p').matched.length > 0);
ok('unknown reach is middling, never zero', s.impactScore(null) === 40);
ok('likes drive reach when followers absent', s.scoreFinding({handle:'@x',caption:'full movie download',likes:44000}, 'x', false).parts.impact > 40);
ok('more followers means more reach', s.impactScore(100000) > s.impactScore(100));

console.log('\nmatchStrength: caption counts as much as handle');
eq('caption hashtag of the title scores high', s.matchStrength('moviehub_hd', 'Jawan full movie #jawan', 'Jawan'), 90);
ok('caption naming the title scores high', s.matchStrength('moviehub_hd', 'watch Jawan online free', 'Jawan') >= 80);
ok('unrelated handle no longer zeroes a caption match', s.matchStrength('taleofemotionss', 'Happy day Jawan synopsis', 'Jawan') >= 80);
eq('exact handle still wins', s.matchStrength('jawan', '', 'Jawan'), 100);
ok('no title anywhere stays low', s.matchStrength('cakerecipes', 'chocolate sponge', 'Jawan') < 40);
ok('multi-word title matched out of order', s.matchStrength('x_hd', 'AD 2898 Kalki print', 'Kalki 2898 AD') >= 70);

console.log('\nfacebook junk filter');
ok('rejects a UUID', !s.plausibleFacebookPage('7de24843-2b58-4730-855b-927d89eacb6b'));
ok('rejects a personal profile', !s.plausibleFacebookPage('paplu.dutta.31'));
ok('rejects another personal profile', !s.plausibleFacebookPage('binoy.sharma.370'));
ok('rejects a hex blob', !s.plausibleFacebookPage('a1b2c3d4e5f60718'));
ok('keeps a real page name', s.plausibleFacebookPage('ObsessionFullMovieHD'));
ok('keeps a fan page name', s.plausibleFacebookPage('teamsrkpune'));

console.log('\nhashtag priority');
eq('highest-yield tag first (measured)', s.expandQuery('Jawan').hashtags[0], 'jawan');
eq('second-yield tag second (measured)', s.expandQuery('Jawan').hashtags[1], 'jawanmovie');
ok('empty-yield tags kept but demoted', s.expandQuery('Jawan').hashtags.indexOf('jawanleaked') > 2);

console.log('\nend to end: a pirate outscores a fan');
const pirate = s.scoreFinding({handle:'@moviehub_hd', caption:'Jawan full movie 1080p download link in bio', likes:4200}, 'Jawan', false);
const fan    = s.scoreFinding({handle:'@wandervamp', caption:'Zuzu Tere Ko Uncle Bola #Jawan #Srk', likes:44000}, 'Jawan', false);
ok('pirate scores high', pirate.total >= 70, 'got ' + pirate.total);
ok('pirate beats fan despite fewer likes', pirate.total > fan.total, pirate.total + ' vs ' + fan.total);

console.log('\nweights and severity');
const wsum = Object.values(s.WEIGHTS).reduce((a, b) => a + b, 0);
ok('weights sum to 1.0', Math.abs(wsum - 1) < 1e-9, 'sum=' + wsum);
eq('85 is critical', s.severity(85), 'crit');
eq('70 is high', s.severity(70), 'high');
eq('45 is medium', s.severity(45), 'med');
eq('44 is low', s.severity(44), 'low');

const scored = s.scoreFinding(
  { handle: '@obsession_hd_movie', caption: 'full movie download 1080p link in bio', followers: 12000 },
  'Obsession', false
);
ok('a clear piracy account scores high', scored.total >= 70, 'got ' + scored.total);
ok('breakdown has five components', Object.keys(scored.parts).length === 5);

const benign = s.scoreFinding(
  { handle: '@obsessionfanclub', caption: 'trailer cuts and cast interviews', followers: 900 },
  'Obsession', false
);
ok('a benign fan account scores lower', benign.total < scored.total, benign.total + ' vs ' + scored.total);

console.log('\nverdict');
eq('wall with no data fails', s.verdictFor([{ id: 'ig-tags', wall: true, hits: 0 }]).pass, false);
eq('handles returned passes', s.verdictFor([{ id: 'ig-tags', wall: false, hits: 7 }]).pass, true);
eq('silence is inconclusive', s.verdictFor([{ id: 'ig-tags', wall: false, hits: 0 }]).pass, null);

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);

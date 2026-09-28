// Step 0 (spec §15): one real call per ScrapingDog endpoint; saves redacted responses to
// tests/fixtures/scrapingdog/. Spends about 100 credits. Run: npm run probe -- --brand=nike
// Endpoint overrides if the defaults 404: --profile=/path:param --posts=/path:param
//   --post=/path:param --comments=/path:param   (copy them from the ScrapingDog dashboard docs)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { redactSecret, stripApiKey } from '../server/redact.js';

try { process.loadEnvFile('.env'); } catch { /* .env is optional when the key is exported */ }
const KEY = process.env.SCRAPINGDOG_API_KEY;
if (!KEY) { console.error('SCRAPINGDOG_API_KEY is not set in .env'); process.exit(1); }
const BASE = 'https://api.scrapingdog.com';
const OUT = join('tests', 'fixtures', 'scrapingdog');
const argv = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [name, ...rest] = arg.replace(/^--/, '').split('=');
  return [name, rest.join('=')];
}));
const BRAND = argv.brand || 'nike';
const MISSING = 'zz_no_such_handle_0923';
const summary = [];
mkdirSync(OUT, { recursive: true });

function shape(value, depth = 0) {
  if (Array.isArray(value)) return value.length ? [shape(value[0], depth + 1)] : [];
  if (value && typeof value === 'object') {
    return depth > 3 ? '{…}' : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, depth + 1)]));
  }
  return value === null ? 'null' : typeof value;
}

async function call(name, path, params, apiKey = KEY) {
  const url = new URL(path, BASE);
  url.searchParams.set('api_key', apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const started = Date.now();
  let status = 0, text = '', headers = {};
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    status = response.status;
    headers = Object.fromEntries(response.headers);
    text = await response.text();
  } catch (error) { text = `FETCH ERROR: ${error.message}`; }
  text = redactSecret(text, KEY);
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON: keep text */ }
  const record = { request: { path, params, url: redactSecret(stripApiKey(url.href), KEY) },
    status, ms: Date.now() - started, headers, json, text: json === null ? text.slice(0, 4000) : undefined };
  writeFileSync(join(OUT, `${name}.json`), redactSecret(JSON.stringify(record, null, 2), KEY));
  summary.push({ name, path, params: Object.keys(params), status, ms: record.ms });
  console.log(`${status} ${record.ms}ms ${name} ${path}`);
  return record;
}

const ok = record => record.status >= 200 && record.status < 300 && record.json !== null;
const override = key => (argv[key] ? [argv[key].split(':')] : []);

function firstValue(value, keys) {
  if (!value || typeof value !== 'object') return null;
  for (const key of keys) if (value[key] != null && typeof value[key] !== 'object') return value[key];
  for (const child of Object.values(value)) {
    const found = firstValue(child, keys);
    if (found != null) return found;
  }
  return null;
}

const instagramLinks = (value, kind) => [...new Set(
  (JSON.stringify(value ?? {}).match(new RegExp(`https://www\\.instagram\\.com/(?:[A-Za-z0-9._]+/)?${kind}/[A-Za-z0-9_-]+/?`, 'g')) || []))];

async function firstOk(name, candidates, valueFor) {
  for (const [index, [path, param]] of candidates.entries()) {
    const record = await call(`${name}.try${index}`, path, { [param]: valueFor(param) });
    if (ok(record)) {   // save under the canonical name without calling (and paying) again
      writeFileSync(join(OUT, `${name}.json`), redactSecret(JSON.stringify(record, null, 2), KEY));
      return { path, param, record };
    }
  }
  return null;
}

await call('account-before', '/account', {});
const google = { query: `site:instagram.com "${BRAND}"`, results: 10, country: 'in', language: 'en', page: 0 };
const standard = await call('google-standard', '/google', google);
await call('google-advanced', '/google', { ...google, advance_search: 'true' });
const reels = await call('google-reels', '/google', { ...google, query: `site:instagram.com/reel/ "${BRAND}"` });
await call('google-special', '/google', { ...google, query: `site:instagram.com "${BRAND}" "A&B" #tag` });

const profile = await firstOk('profile',
  [...override('profile'), ['/instagram/profile', 'username'], ['/instagram', 'username']], () => BRAND);
if (profile) {
  await call('profile-missing', profile.path, { [profile.param]: MISSING });
  await call('bad-key', profile.path, { [profile.param]: BRAND }, 'invalid-key-for-probe');
}
const profileId = profile && firstValue(profile.record.json, ['id', 'user_id', 'pk', 'profile_id', 'fbid']);
const posts = profileId ? await firstOk('posts',
  [...override('posts'), ['/instagram/posts', 'id'], ['/instagram/posts', 'user_id'], ['/instagram/posts', 'username']],
  param => (param === 'username' ? BRAND : profileId)) : null;

const postUrl = instagramLinks([standard.json, profile?.record.json, posts?.record.json], 'p')[0];
const reelUrl = instagramLinks([reels.json, standard.json, profile?.record.json, posts?.record.json], 'reel')[0];
const shortcode = url => url.replace(/\/$/, '').split('/').pop();
const postCandidates = [...override('post'), ['/instagram/post', 'url'], ['/instagram/post', 'shortcode'],
  ['/instagram/postdetails', 'url'], ['/instagram/post-details', 'url'], ['/instagram/post_details', 'url']];
const post = postUrl ? await firstOk('post', postCandidates, p => (p === 'shortcode' ? shortcode(postUrl) : postUrl)) : null;
if (post && reelUrl) {
  await call('reel', post.path, { [post.param]: post.param === 'shortcode' ? shortcode(reelUrl) : reelUrl });
}
const commentCandidates = [...override('comments'), ['/instagram/comments', 'url'], ['/instagram/comments', 'shortcode'],
  ['/instagram/comments', 'post_id'], ['/instagram/post/comments', 'url']];
const postId = post && firstValue(post.record.json, ['id', 'post_id', 'pk', 'media_id']);
if (postUrl) {
  await firstOk('comments', commentCandidates,
    p => (p === 'shortcode' ? shortcode(postUrl) : p === 'post_id' ? postId : postUrl));
}
await call('account-after', '/account', {});

writeFileSync(join(OUT, 'probe-summary.json'), JSON.stringify({
  brand: BRAND, postUrl, reelUrl, profileEndpoint: profile && { path: profile.path, param: profile.param },
  postsEndpoint: posts && { path: posts.path, param: posts.param },
  postEndpoint: post && { path: post.path, param: post.param },
  calls: summary, shapes: { google: shape(standard.json), profile: shape(profile?.record.json),
    post: shape(post?.record.json) },
}, null, 2));
console.log('Saved', summary.length, 'responses to', OUT);

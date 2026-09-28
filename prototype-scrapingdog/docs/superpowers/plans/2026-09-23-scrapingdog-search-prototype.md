# ScrapingDog Search Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Vite app that serves REF's Instagram brand-protection dashboard unchanged and answers its
`/v1` API from a Node port of REF's pipeline, with ScrapingDog in place of Bright Data.

**Architecture:**
- **Front end.** Vite serves `index.html` and `public/static/`, which are REF's files, byte-identical.
- **API.** Vite hosts the API through a plugin (`server/vite-plugin.js`). `server/api.js` reproduces REF `api.py`.
- **Pipeline.** A synchronous ScrapingDog client feeds ports of REF's paged collector, normalizer and scoring
  engine. Data persists to a JSON file.
- **Proof of parity.** REF's own Python code generates golden outputs, and the port must match them exactly.

**Tech Stack:**
- Node 22.12: ES modules, built-in `fetch`, `node:test`, `node:zlib`, `node:crypto`.
- Vite 7, the only npm dependency.
- The Python 3.12 standard library, used only for golden generation and SQLite ordering checks.

**Spec:** `prototype-scrapingdog/docs/superpowers/specs/2026-09-23-scrapingdog-search-prototype-design.md`. Read it
before starting; `§` numbers below refer to it.

**Spec clarification (decided while planning):** §7.4 says that with concurrency 1 the page alternates "starting
with discovery". REF's loop actually starts with enrichment. At turn 0 it triggers the already-queued exact-brand
profile, and only runs its first discovery query at turn 2 (`instagram_pages.py:404-409`). REF's rate-limit test
depends on this. The sync port therefore alternates **starting with an enrichment request when one is queued**.

## Global Constraints

**Paths and runtime**
- **Project root** is `c:\darkmap 2026\prototype-scrapingdog\`, written `./` below.
- **REF** is `c:\darkmap 2026\prototype-made\darkmap-opus-team-share\darkmap-opus\`; the env var `DARKMAP_REF`
  overrides it. `REF path:line` cites REF source.
- **Runtime:** Node ≥ 22.12 (installed: 22.12.0).
- **Dependencies:** `vite@^7` as a devDependency, and nothing else, ever.
- **Module format:**
  - Root `package.json` has **no** `"type"` field. That keeps REF's classic scripts in `public/static/` as
    CommonJS, so REF's `.cjs` tests can `require()` them.
  - `server/`, `scripts/` and `tests/` each contain a `package.json` of exactly `{"type": "module"}`.
  - The Vite config is `vite.config.mjs`.
- **Windows:** npm scripts run under `cmd.exe`. Quote globs with escaped double quotes, and don't use `&`, `rm -rf`
  or single quotes in npm scripts. Shell steps below are Git Bash commands run from `./`.

**Dashboard and secrets**
- **Dashboard files are frozen.** `index.html` and `public/static/**` stay byte-identical to REF
  `darkmap/static/`. Never edit them.
- **The ScrapingDog key lives only in `./.env`** (gitignored). It must never appear in source, fixtures, test
  output, logs, audit rows or build output. Audit `target` URLs are stored without `api_key`.

**Configuration defaults** (spec §11): `SCRAPINGDOG_CONCURRENCY=5`, `SCRAPINGDOG_TIMEOUT_MS=45000`,
`CREDIT_BUDGET_PER_SEARCH=15000`, `CREDIT_CAP_PER_DAY=100000`, `CREDIT_CAP_PER_MINUTE=0`,
`COMMENTS_SCOPE=all_collected_posts`, `DARKMAP_MAX_REQUEST_BYTES=2000000`, `DATA_FILE=data/darkmap.json`,
`PORT=5173`.

**REF constants that must not change**
- **Discovery:** 17 queries, and `queries_total: 17`.
- **Paging:** a 48 s network budget per page, with no new request started after budget − 12 s. Page size is 50.
- **Continuation:** version 1, 6 h expiry, `MAX_TOKEN_BYTES = 1_800_000`, `MAX_STATE_BYTES = 24_000_000`.
- **Scoring metadata:** engine version `'2.3.0'`; assessment `model: 'claude-opus-5'`.
- **Inline scrape** budget: 145 s.

**Tests and version control**
- **Tests** use `node:test` and `node:assert/strict` only. `npm test` must pass with no network and no key. Live
  tests run only under `LIVE=1`.
- **Version control:** this workspace is not a git repository. Don't `git init` or commit unless the user asks. Each
  task ends with a test-run checkpoint instead of a commit.

**Python → JS translation rules** (these apply to every "port" step; the helpers come from Task 3):
1. **Truthiness.** Python treats `''`, `0`, `None`, `[]` and `{}` as false in `x or y`, `if x:` and `not x`. Use
   `truthy(x)` or `or(x, y)`. Never use raw JS `||` or `if (x)` on a value that can be an array or object.
2. **`None`.** `dict.get(k)` on a missing key is `undefined` in JS; compare with `== null`.
3. **Strings are code-point sequences.**
   - `len(s)` → `pyLen(s)`
   - `s[a:b]` → `pySlice(s, a, b)`
   - `s.find(t)` → `pyFind(s, t)`
4. **Whitespace and case.**
   - `strip`, `lstrip`, `rstrip` and `split()` use Python's whitespace set: use `pyStrip`, `pyLstrip`, `pyRstrip`
     and `pySplit`.
   - `lower()` → `toLowerCase()`
   - `casefold()` → `pyCasefold()`
5. **Regex.**
   - Python's `\w \W \d \s \b` are Unicode-aware. Use the pycompat constants `W NW D S B`, and `PY_SPACE_CHARS`
     inside character classes.
   - Python `.` excludes only `\n`, so write `[^\n]`.
   - Python `$` (without MULTILINE) becomes `(?=\n?$)`.
   - `re.IGNORECASE` becomes the `iu` flags. Always include `u`.
   - `re.findall` → `findall()`; `re.sub` → `.replace(regex_with_g, …)`.
6. **Ordering.**
   - Dicts keep insertion order: use plain objects for fixed string keys and `Map` otherwise.
   - `Counter` → `counter()`; `dict.fromkeys` → `dedupe()`.
   - `sorted(…, key, reverse)` → `sorted()`: stable, code-point order, and ties keep input order even with
     `reverse`.
7. **Numbers.**
   - `round(x, n)` → `pyRound`
   - `f'{x:.nf}'` → `pyFixed`
   - `str()` or f-string interpolation of lists, dicts or floats → `pyStr`/`pyRepr`
8. **Time.**
   - REF's `utcnow()` is naive UTC. Timestamps are stored as naive ISO strings with exact microseconds, via
     `server/time.js`.
   - Omit the fraction when microseconds are 0, as Python's `isoformat()` does.
9. **Errors.** Python exceptions become JS classes from `server/errors.js` with the same names, caught exactly where
   REF catches them.

## Review Focus

1. **Non-ASCII captions and bios.** Hindi, emoji, NBSP, zero-width characters and full-width digits must produce the
   same scores, entities, snippets and quotes as REF. Pinned by `tests/fixtures/texts.json` and
   `tests/fixtures/dossiers/unicode-*.json` (Tasks 5, 6, 12).
2. **Keywords containing `&`, quotes, `#`, `%`, spaces or emoji.** The Google query sent to ScrapingDog must be the
   exact REF discovery string, URL-encoded once, and must not be cut at `&`. Pinned in Task 14, "special characters
   survive encoding".
3. **ScrapingDog returns HTTP 200 with a non-JSON body or an error JSON.** That must count as a failed attempt:
   retried, then recorded in `errors`. It must never read as "zero results". Pinned in Tasks 13 and 14.
4. **The same continuation is posted twice**, for example when the browser retries after a dropped response. The
   second call must return the first call's response and buy nothing. Pinned in Task 18, "replaying a continuation
   spends nothing".
5. **Windows file locks while saving `data/darkmap.json`.** An antivirus or indexer can hold the file, causing
   `EPERM`/`EBUSY` on rename. Saving must retry and must never lose or truncate the store. Pinned in Task 8, "rename
   retries on EPERM".

---

## File map

| File | Responsibility |
|---|---|
| `package.json`, `vite.config.mjs`, `.gitignore`, `.env.example` | project, dev server, config template |
| `index.html`, `public/static/**` | REF dashboard, byte-identical (never edited) |
| `server/errors.js` | Python-named exception classes |
| `server/time.js` | naive-UTC timestamps with exact microseconds |
| `server/redact.js` | strip/redact the API key from URLs and text |
| `server/config.js` | typed settings from env |
| `server/costs.js` | ScrapingDog endpoints + credits (filled from step 0) |
| `server/engine/pycompat.js` | Python-compatible primitives |
| `server/engine/sequence-matcher.js` | port of `difflib.SequenceMatcher` |
| `server/engine/extract.js` | port of REF `extract.py` |
| `server/engine/heuristics.js` | port of REF `ai/heuristics.py` |
| `server/engine/risk-core.js` | pure parts of REF `risk.py` |
| `server/store.js` | in-memory tables, unique keys, JSON persistence |
| `server/sqlite-order.js` | REF's SQLite row orders for queries without `ORDER BY` |
| `server/raw.js` | REF `providers/base.py` raw containers |
| `server/normalize.js` | port of REF `normalize.py` + the 3 fixes |
| `server/engine/dossier.js`, `server/engine/intelligence.js` | ports of REF `dossier.py`, `intelligence.py` |
| `server/engine/risk.js` | port of REF `risk.assess_account` |
| `server/engine/search.js` | port of REF `search.py` |
| `server/audit.js`, `server/quota.js` | REF audit rows; credit-denominated quota |
| `server/scrapingdog.js` | HTTP client: pool, retries, error mapping, credit meter |
| `server/adapters.js` | ScrapingDog JSON → REF record nodes |
| `server/discovery.js` | ports of REF discovery helpers and record parsers |
| `server/cursor.js` | port of REF `search_cursor.py` |
| `server/collector.js` | sync port of REF `PagedInstagramCollector` |
| `server/account-search.js` | sync port of REF `_account_search` + inline ingest |
| `server/http.js`, `server/schemas.js`, `server/api.js`, `server/vite-plugin.js` | request plumbing, validation, routes, Vite mount |
| `scripts/probe-scrapingdog.js`, `scripts/scan.js` | step-0 recorder; CLI scan |
| `tests/golden/generate.py`, `tests/golden/sqlite_order.py` | REF-derived golden outputs |
| `tests/helpers/*.js` | REF paths, fake ScrapingDog client, fake clock |
| `tests/**/*.test.js`, `tests/dashboard/*.cjs` | test suites |

---

### Task 1: Project scaffold and byte-identical REF dashboard

**Files:**
- Create: `package.json`, `vite.config.mjs`, `.gitignore`, `.env.example`
- Create: `server/package.json`, `scripts/package.json`, `tests/package.json`
- Create: `tests/helpers/ref.js`, `tests/dashboard/identity.test.js`
- Copy unchanged: REF `darkmap/static/index.html` → `index.html`, and every other file under REF `darkmap/static/`
  → `public/static/` (same relative paths)
- Copy with only the `require` path rewritten: REF `tests/test_overview_data.cjs`, `tests/test_search_history.cjs`
  and `tests/test_search_outcome.cjs` → `tests/dashboard/`

**Interfaces:**
- Produces `tests/helpers/ref.js`, exporting:
  - `PROJECT_ROOT: string` (absolute path of `./`)
  - `REF_ROOT: string` (absolute REF path)
  - `refPath(...parts): string`

- [ ] **Step 1: Create folders and module-type markers**

```bash
cd "/c/darkmap 2026/prototype-scrapingdog"
mkdir -p server/engine scripts tests/helpers tests/dashboard tests/engine tests/server tests/api tests/fixtures public
printf '{\n  "type": "module"\n}\n' > server/package.json
cp server/package.json scripts/package.json
cp server/package.json tests/package.json
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "darkmap-scrapingdog-prototype",
  "private": true,
  "version": "0.1.0",
  "description": "REF Darkmap search flow over ScrapingDog (local prototype)",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "node --test \"tests/**/*.test.js\" \"tests/**/*.cjs\"",
    "scan": "node scripts/scan.js",
    "probe": "node scripts/probe-scrapingdog.js"
  }
}
```

- [ ] **Step 3: Install Vite and check the version**

Run: `npm install --save-dev vite@^7`, then `npx vite --version`.
Expected: `vite/7.` followed by the minor and patch version. `package.json` now has
`"devDependencies": { "vite": "^7.x.y" }`.

- [ ] **Step 4: Write `vite.config.mjs`, `.gitignore` and `.env.example`**

`vite.config.mjs`. The API plugin is added in Task 18:

```js
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.PORT || 5173);
  return {
    server: { port, strictPort: true },
    preview: { port, strictPort: true },
  };
});
```

`.gitignore`:

```
node_modules/
dist/
data/
.env
.env.*
!.env.example
```

`.env.example`, copied from spec §11:

```
SCRAPINGDOG_API_KEY=
SCRAPINGDOG_CONCURRENCY=5
SCRAPINGDOG_TIMEOUT_MS=45000
CREDIT_BUDGET_PER_SEARCH=15000
CREDIT_CAP_PER_DAY=100000
CREDIT_CAP_PER_MINUTE=0
COMMENTS_SCOPE=all_collected_posts
DARKMAP_API_KEY=
DARKMAP_MAX_REQUEST_BYTES=2000000
DARKMAP_SEARCH_CURSOR_SECRET=
DATA_FILE=data/darkmap.json
PORT=5173
```

- [ ] **Step 5: Write the failing identity test**

`tests/helpers/ref.js`:

```js
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REF_ROOT = process.env.DARKMAP_REF
  ? resolve(process.env.DARKMAP_REF)
  : resolve(PROJECT_ROOT, '..', 'prototype-made', 'darkmap-opus-team-share', 'darkmap-opus');
export const refPath = (...parts) => join(REF_ROOT, ...parts);
```

`tests/dashboard/identity.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PROJECT_ROOT, refPath } from '../helpers/ref.js';

const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const walk = dir => readdirSync(dir).flatMap(name => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});

test('index.html is byte-identical to REF', () => {
  assert.equal(sha(join(PROJECT_ROOT, 'index.html')), sha(refPath('darkmap', 'static', 'index.html')));
});

test('public/static matches REF darkmap/static file for file', () => {
  const refDir = refPath('darkmap', 'static');
  const ours = join(PROJECT_ROOT, 'public', 'static');
  const expected = walk(refDir).map(f => relative(refDir, f)).filter(f => f !== 'index.html').sort();
  assert.deepEqual(walk(ours).map(f => relative(ours, f)).sort(), expected);
  for (const file of expected) assert.equal(sha(join(ours, file)), sha(join(refDir, file)), file);
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL, with `ENOENT` for `index.html` or `public/static`.

- [ ] **Step 7: Copy the REF dashboard and its Node tests**

```bash
REF="../prototype-made/darkmap-opus-team-share/darkmap-opus"
cp "$REF/darkmap/static/index.html" index.html
mkdir -p public/static
cp -r "$REF/darkmap/static/." public/static/
rm public/static/index.html
for name in test_overview_data test_search_history test_search_outcome; do
  sed 's#\.\./darkmap/static/#../../public/static/#g' "$REF/tests/$name.cjs" > "tests/dashboard/$name.cjs"
done
grep -n "require(" tests/dashboard/*.cjs
```

Expected from the last command: every `require` of a dashboard helper points at `../../public/static/...`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, with 2 identity tests and 17 dashboard tests, `fail 0`.

- [ ] **Step 9: Smoke-test the dev server**

```bash
npx vite --port 5199 --strictPort > /tmp/vite.log 2>&1 &
VITE_PID=$!; sleep 4
curl -s http://localhost:5199/ | grep -c "Darkmap · Instagram Brand Protection"
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" "http://localhost:5199/static/app.js?v=x"
wc -c < public/static/app.js
kill $VITE_PID
```

Expected:
- the first `grep -c` prints `1`
- the second line is `200` followed by the same byte count that `wc -c` prints for `app.js`

---

### Task 2: ScrapingDog contract probe (step 0, spec §15). A GATE follows this task

**Files:**
- Create: `server/redact.js`, `tests/server/redact.test.js`
- Create: `scripts/probe-scrapingdog.js`
- Create: `.env` from `.env.example`, with `SCRAPINGDOG_API_KEY` set to the key the user shared. Never print it.
- Generated by the probe: `tests/fixtures/scrapingdog/*.json`
- Create after the probe: `tests/fixtures/scrapingdog/CONTRACT.md`, `server/costs.js`

**Interfaces:**
- Produces `server/redact.js`:
  - `stripApiKey(url: string): string` removes the `api_key` query parameter
  - `redactSecret(text: string, secret: string): string` replaces every occurrence of the secret with `[REDACTED]`
- Produces `server/costs.js`:
  - `ENDPOINTS: {google, google_advanced, profile, posts, post, comments}`, where each entry is
    `{path, param?, credits, params?}`
  - `USE_ADVANCED_FOR_CRITICAL: boolean`
  - `PROFILE_HAS_RECENT_POSTS: boolean`

- [ ] **Step 1: Write the failing redaction test**

`tests/server/redact.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactSecret, stripApiKey } from '../../server/redact.js';

test('stripApiKey removes only api_key', () => {
  assert.equal(stripApiKey('https://api.scrapingdog.com/google?api_key=S3CRET&query=a%26b&page=0'),
    'https://api.scrapingdog.com/google?query=a%26b&page=0');
});

test('redactSecret replaces every occurrence and ignores an empty secret', () => {
  assert.equal(redactSecret('k=S3CRET;again S3CRET', 'S3CRET'), 'k=[REDACTED];again [REDACTED]');
  assert.equal(redactSecret('unchanged', ''), 'unchanged');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/server/redact.test.js`
Expected: FAIL, `Cannot find module '../../server/redact.js'`.

- [ ] **Step 3: Implement `server/redact.js`**

```js
// Keep the ScrapingDog key out of logs, audit rows and recorded fixtures.
export function stripApiKey(url) {
  const parsed = new URL(url);
  parsed.searchParams.delete('api_key');
  return parsed.toString();
}

export function redactSecret(text, secret) {
  if (!secret) return String(text);
  return String(text).split(secret).join('[REDACTED]');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/server/redact.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `scripts/probe-scrapingdog.js`**

```js
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
```

- [ ] **Step 6: Create `.env` and run the probe (spends about 100 credits)**

```bash
cp .env.example .env
# Put the key the user shared after SCRAPINGDOG_API_KEY= in .env, using an editor. Never echo it.
npm run probe
grep -rl "$(sed -n 's/^SCRAPINGDOG_API_KEY=//p' .env)" tests/fixtures/scrapingdog/ ; echo "exit=$?"
```

Expected:
- One status line per call.
- `google-standard`, `profile`, `post` and `comments` are all 2xx. If any of `profile`, `post` or `comments` stays
  non-2xx after its candidates, go to Step 8 with the override flags.
- The final `grep` finds no file and prints `exit=1`, meaning the key isn't in any fixture.

- [ ] **Step 7: Record the contract**

Write `tests/fixtures/scrapingdog/CONTRACT.md` from the recorded JSON, with these sections, each filled with what was
observed:
1. **Endpoints.** Per endpoint: path, parameter name, status and credits. Credits come from the `account-after` minus
   `account-before` counters if `/account` returned usage; otherwise use ScrapingDog's dashboard figures for each API.
2. **Google.** The JSON key that holds organic results, and per-item keys for link, title, snippet, source/author and
   thumbnail, for both standard and `advance_search`. Record whether `advance_search` gives author or thumbnail
   fields that standard doesn't.
3. **Profile.** The JSON path of each spec §7.3 profile key: followers, following, posts count, biography, full name,
   external URL, verified, business, avatar and id. Record whether recent posts are embedded, and where.
4. **Posts / Post Details / Comments.** The JSON path of each spec §7.3 post-node and comment-node key. For
   comments, the number returned per request and any pagination field.
5. **Errors.** Status and body for `profile-missing`, `bad-key`, and any 4xx/5xx seen.

Then write `server/costs.js` using those observed values (every path, param and credit number comes from
CONTRACT.md):

```js
// ScrapingDog endpoints and credit costs, as recorded in tests/fixtures/scrapingdog/CONTRACT.md (step 0).
export const ENDPOINTS = {
  google: { path: '/google', credits: 5 },
  google_advanced: { path: '/google', credits: 10, params: { advance_search: 'true' } },
  profile: { path: '/instagram/profile', param: 'username', credits: 15 },
  posts: { path: '/instagram/posts', param: 'id', credits: 15 },
  post: { path: '/instagram/post', param: 'url', credits: 15 },
  comments: { path: '/instagram/comments', param: 'url', credits: 15 },
};
// true only if CONTRACT.md §2 shows advance_search adds author (source) or thumbnail fields.
export const USE_ADVANCED_FOR_CRITICAL = false;
// true if the profile response already embeds recent posts (CONTRACT.md §3); then the Posts API is not called.
export const PROFILE_HAS_RECENT_POSTS = false;
```

Replace each literal above with the observed value. The literals shown are the expected values from ScrapingDog's
public pages and the probe's first candidates.

- [ ] **Step 8: GATE, then stop and report to the user if any of these is false**

Spec §15 conditions:
- (a) The profile response gives followers, bio, verified status, avatar, and an id or recent posts.
- (b) Post Details accepts a post or reel URL or shortcode and gives caption, author, counts and media.
- (c) Comments gives commenter, text, likes and timestamp.
- (d) Google gives organic link, title and snippet.

If an endpoint wasn't found, ask the user to open that API's card in the ScrapingDog dashboard and paste its
endpoint path and parameter name. Then re-run with, for example, `npm run probe -- --post=/instagram/xyz:url`.
Continue past this step only when (a) to (d) hold and are written into CONTRACT.md.

---

### Task 3: Python-compatibility helpers, error classes, and the golden generator

**Files:**
- Create: `server/errors.js`, `server/engine/pycompat.js`
- Create: `tests/golden/generate.py`, `tests/helpers/golden.js`, `tests/fixtures/pycompat-cases.json`
- Test: `tests/engine/pycompat.test.js`
- Generated: `tests/golden/*.json`. Re-run the generator whenever a fixture changes.

**Interfaces:**
- Produces `server/engine/pycompat.js`:
  - Constants: `PY_SPACE_CHARS`, `W`, `NW`, `D`, `S`, `B` (regex source strings)
  - Truthiness: `truthy(v)`, `or(...values)`
  - Strings: `codePoints(s)`, `pyLen(s)`, `pySlice(s, start, end)`, `pyFind(s, sub)`, `pyStrip(s, chars?)`,
    `pyLstrip(s, chars?)`, `pyRstrip(s, chars?)`, `pySplit(s)`, `pyCasefold(s)`
  - Numbers: `pyRound(x, n)`, `pyFixed(x, n)`, `pyRepr(v)`, `pyStr(v)`
  - Ordering: `cmpCodePoints(a, b)`, `cmpPy(a, b)`, `sorted(items, {key, reverse})`
  - Collections and regex: `findall(re, text)`, `dedupe(items)`, `pyDedupe(items)` (drops falsy items, as REF
    `_dedupe` does), `counter(items) → Map`
- Produces `server/errors.js`, with these classes:
  - `ValueError`, `ProviderError`, `ProviderNotConfigured`, `CollectionNotPermitted`
  - `FetchFailed(message, {statusCode, retryAfter})`
  - `SourceUnavailable(code, message, {statusCode})`, which extends FetchFailed
  - `NotAuthorized`, `NotFound`
  - `QuotaExceeded(scope, window, retryAfter)`
  - `InvalidSearchCursor` (extends ValueError)
  - `HttpError(status, detail)`
- Produces `tests/helpers/golden.js`: `golden(name)`, which returns the parsed `tests/golden/<name>.json`.
- Produces `tests/golden/generate.py`: writes every golden file that later tasks read. A section whose fixture file
  doesn't exist yet is written empty.

- [ ] **Step 1: Write the fixture cases and the failing test**

`tests/fixtures/pycompat-cases.json`:

```json
{
  "round": [[0.125, 2], [0.375, 2], [0.625, 2], [0.875, 2], [2.675, 2], [62.625, 2], [84.0, 2], [0.5, 0],
            [1.5, 0], [2.5, 0], [99.995, 2], [12.345, 2], [0.1, 3], [0.2449, 3], [1e-7, 3], [-0.125, 2],
            [0.85, 3], [0.6375, 3], [59.999999999999996, 2], [100.0, 2]],
  "fixed": [[0.125, 2], [0.7250000000000001, 2], [2.675, 2], [0.845, 2], [1, 2], [0.9999, 2], [62.5, 0],
            [63.5, 0], [0.72, 2], [-0.001, 2]],
  "repr": ["it's", "say \"hi\"", "both ' and \"", "tab\tnew\nline\r", "back\\slash", "emoji 😀", "zero​width",
           "nbsp ", "\u001f", "hindi नमस्ते", " sep", ["a", "b"], [], {},
           {"field": "display_name", "before": null, "after": "x", "n": 3}, 1234, true, false, null, 0.5,
           1e-05, 0.0001, 123456.789],
  "sorted": [["b", "a", "B", "😀", "￿", "é", "e", "", "ab", "a"]],
  "strip": ["  x  ", " x ", "﻿x", "\u001fx\u001f", " x　", "​x"],
  "split": ["a  b\tc d\u001fe﻿f​g", "   ", ""],
  "lower": ["İSTANBUL", "ΣΑΣ", "Straße", "ǅ", "ABC"],
  "casefold": ["Straße", "ΣΑΣ", "ﬁle", "LONG ſ"],
  "len": ["😀x", "é", "नमस्ते", ""],
  "slice": [["😀😀😀x", 0, 2], ["abc", 1, 99], ["héllo", 0, 3]]
}
```

`tests/helpers/golden.js`:

```js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_ROOT } from './ref.js';

export const golden = name => JSON.parse(readFileSync(join(PROJECT_ROOT, 'tests', 'golden', `${name}.json`), 'utf8'));
```

`tests/engine/pycompat.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { counter, dedupe, findall, or, pyCasefold, pyDedupe, pyFind, pyFixed, pyLen, pyLstrip, pyRepr,
  pyRound, pySlice, pySplit, pyStr, pyStrip, sorted, truthy } from '../../server/engine/pycompat.js';

const g = golden('pycompat');

test('pyRound matches Python round()', () => {
  for (const [x, n, expected] of g.round) assert.equal(pyRound(x, n), expected, `round(${x}, ${n})`);
});
test('pyFixed matches Python format spec', () => {
  for (const [x, n, expected] of g.fixed) assert.equal(pyFixed(x, n), expected, `f'{${x}:.${n}f}'`);
});
test('pyRepr matches Python repr()', () => {
  for (const [value, expected] of g.repr) assert.equal(pyRepr(value), expected);
});
test('sorted matches Python sorted() on strings', () => {
  for (const [input, expected] of g.sorted) assert.deepEqual(sorted(input), expected);
});
test('strip, split, lower, casefold, len and slice match Python', () => {
  for (const [s, expected] of g.strip) assert.equal(pyStrip(s), expected, JSON.stringify(s));
  for (const [s, expected] of g.split) assert.deepEqual(pySplit(s), expected, JSON.stringify(s));
  for (const [s, expected] of g.lower) assert.equal(s.toLowerCase(), expected);
  for (const [s, expected] of g.casefold) assert.equal(pyCasefold(s), expected);
  for (const [s, expected] of g.len) assert.equal(pyLen(s), expected);
  for (const [s, a, b, expected] of g.slice) assert.equal(pySlice(s, a, b), expected);
});
test('truthiness, or, dedupe, counter, findall, pyFind, pyStr', () => {
  for (const v of [null, undefined, false, 0, '', [], {}, new Map()]) assert.equal(truthy(v), false);
  for (const v of [1, 'x', [0], { a: 1 }, true]) assert.equal(truthy(v), true);
  assert.deepEqual(or([], null, 'x'), 'x');
  assert.deepEqual(or([], {}), {});
  assert.deepEqual(dedupe(['a', 'b', 'a']), ['a', 'b']);
  assert.deepEqual(pyDedupe(['', 'a', null, 'a']), ['a']);
  assert.deepEqual([...counter(['x', 'y', 'x'])], [['x', 2], ['y', 1]]);
  assert.deepEqual(findall(/@(\w+)/g, '@a b @c'), ['a', 'c']);
  assert.deepEqual(findall(/\d+/g, 'a1b22'), ['1', '22']);
  assert.equal(pyFind('😀ab', 'b'), 2);
  assert.equal(pyLstrip('@@x', '@'), 'x');
  assert.equal(pyStr(['a']), "['a']");
});
```

`g.pow085`, Python's `0.85 ** i` for i = 0-5, isn't asserted against JS `**`. Task 6 copies Python's values into
a table, so V8's `Math.pow` rounding can never matter.

- [ ] **Step 2: Write the golden generator**

`tests/golden/generate.py`:

```python
"""Record REF (Python) outputs that the JavaScript port must reproduce exactly (spec §13.3).

Run from the project root:  python tests/golden/generate.py
Standard library only. Loads REF files by path and stubs the third-party modules they import.
"""
import copy
import dataclasses
import datetime as dt
import difflib
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import types

if os.environ.get('PYTHONHASHSEED') != '0':      # make set iteration reproducible
    raise SystemExit(subprocess.call([sys.executable, *sys.argv],
                                     env={**os.environ, 'PYTHONHASHSEED': '0'}))

ROOT = pathlib.Path(__file__).resolve().parents[2]
REF = pathlib.Path(os.environ.get('DARKMAP_REF') or
                   ROOT.parent / 'prototype-made' / 'darkmap-opus-team-share' / 'darkmap-opus')
FIX = ROOT / 'tests' / 'fixtures'
OUT = ROOT / 'tests' / 'golden'
FIXED_RETRIEVED_AT = '2026-09-23T00:00:00'


class _Stub:
    """Stands in for SQLAlchemy/FastAPI/httpx objects that the helpers below never call."""
    def __init__(self, *args, **kwargs): pass
    def __call__(self, *args, **kwargs): return _Stub()
    def __getattr__(self, name): return _Stub()


class _Error(Exception):
    def __init__(self, *args, **kwargs):
        super().__init__(*args)
        self.status_code = kwargs.get('status_code')
        self.retry_after = kwargs.get('retry_after')


def _module(name, package=False, **attributes):
    module = types.ModuleType(name)
    if package:
        module.__path__ = []
    module.__dict__.update(attributes)
    sys.modules[name] = module
    return module


def _load(name, relative):
    spec = importlib.util.spec_from_file_location(name, REF / relative)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


for name in ('darkmap', 'darkmap.ai', 'darkmap.providers'):
    _module(name, package=True)
_module('httpx', Client=_Stub, Response=_Stub, HTTPError=_Error, ReadTimeout=_Error)
_module('sqlalchemy', select=_Stub(), Text=_Stub(), cast=_Stub(), func=_Stub(), or_=_Stub())
_module('sqlalchemy.orm', Session=_Stub)
_module('fastapi', package=True)
_module('fastapi.testclient', TestClient=_Stub)
for name in ('darkmap.audit', 'darkmap.dossier', 'darkmap.intelligence', 'darkmap.cache'):
    _module(name, record=lambda *a, **k: None)
_module('darkmap.ai.claude', get_analysis_provider=lambda: None)
_module('darkmap.config', get_settings=lambda: types.SimpleNamespace(
    risk_ai_weight=0.5, analysis_model='claude-opus-5', bright_data_api_key='k',
    bright_data_serp_zone='z', bright_data_api_base='https://api.brightdata.com',
    bright_data_max_wait_seconds=90))
_module('darkmap.models', utcnow=lambda: dt.datetime(2026, 9, 23), **{n: _Stub for n in (
    'Account', 'Brand', 'Comment', 'Entity', 'MediaAsset', 'Post', 'RiskAssessment',
    'SearchDocument', 'QuotaCounter')})
_module('darkmap.normalize', ingest_bundle=_Stub(), reindex_account=_Stub())
_module('darkmap.quota', QuotaExceeded=_Error, consume=lambda *a, **k: None)
_module('darkmap.http', FetchFailed=_Error, SourceUnavailable=_Error, ManagedClient=_Stub,
        NotAuthorized=_Error)

extract = _load('darkmap.extract', 'darkmap/extract.py')
heuristics = _load('darkmap.ai.heuristics', 'darkmap/ai/heuristics.py')
base = _load('darkmap.ai.base', 'darkmap/ai/base.py')
_load('darkmap.providers.base', 'darkmap/providers/base.py')
export_file = _load('darkmap.providers.export_file', 'darkmap/providers/export_file.py')
risk = _load('darkmap.risk', 'darkmap/risk.py')
search = _load('darkmap.search', 'darkmap/search.py')
bright = _load('darkmap.providers.bright_data_instagram', 'darkmap/providers/bright_data_instagram.py')
pages = _load('darkmap.providers.instagram_pages', 'darkmap/providers/instagram_pages.py')

RECORDS = {'analyze': [], 'extract': [], 'domain_of': [], 'handle_similarity': []}
SOURCE = ['']


def _recording(kind, function):
    def wrapper(*args):
        result = function(*args)
        RECORDS[kind].append({'source': SOURCE[0], 'args': copy.deepcopy(list(args)),
                              'result': copy.deepcopy(result)})
        return result
    return wrapper


heuristics.analyze = _recording('analyze', heuristics.analyze)
heuristics.handle_similarity = _recording('handle_similarity', heuristics.handle_similarity)
extract.extract = _recording('extract', extract.extract)
extract.domain_of = _recording('domain_of', extract.domain_of)


def _plain(value):
    """Dataclasses and datetimes -> JSON-ready values (datetimes as Python isoformat())."""
    if dataclasses.is_dataclass(value):
        return {f.name: _plain(getattr(value, f.name)) for f in dataclasses.fields(value)}
    if isinstance(value, dt.datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    return value


def _json(name, default):
    path = FIX / name
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else default


def _write(name, value):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(_plain(value), ensure_ascii=False, indent=1) + '\n',
                            encoding='utf-8')


def _harvest(test_file):
    """Run REF's argument-free test functions; the wrappers above record every helper call."""
    module = _load('ref_' + pathlib.Path(test_file).stem, test_file)
    for name in sorted(vars(module)):
        function = getattr(module, name)
        if name.startswith('test_') and callable(function) and function.__code__.co_argcount == 0:
            SOURCE[0] = f'{test_file}::{name}'
            function()


def _provider(params=None):
    provider = bright.BrightDataInstagramProvider(None, params or {'mode': 'keyword', 'max_items': 250})
    provider._provenance = lambda mode, query: {
        'provider': provider.name, 'lawful_basis': provider.lawful_basis, 'collection_mode': mode,
        'query': query, 'source': 'Bright Data Instagram Scraper API', 'retrieved_at': FIXED_RETRIEVED_AT}
    return provider


def main():
    for test_file in ('tests/test_heuristics.py', 'tests/test_advanced_alerts.py',
                      'tests/test_extract_normalize.py'):
        _harvest(test_file)
    for path in sorted((FIX / 'dossiers').glob('*.json')):
        SOURCE[0] = f'fixtures/dossiers/{path.name}'
        heuristics.analyze(json.loads(path.read_text(encoding='utf-8')))
    for text in _json('texts.json', []):
        SOURCE[0] = 'fixtures/texts.json'
        extract.extract(text)
    for url in _json('urls.json', []):
        SOURCE[0] = 'fixtures/urls.json'
        extract.domain_of(url)
    for handle, names in _json('similarity-calls.json', []):
        SOURCE[0] = 'fixtures/similarity-calls.json'
        heuristics.handle_similarity(handle, names)

    cases = _json('pycompat-cases.json', {})
    _write('pycompat.json', {
        'round': [[x, n, round(x, n)] for x, n in cases.get('round', [])],
        'fixed': [[x, n, f'{x:.{n}f}'] for x, n in cases.get('fixed', [])],
        'repr': [[v, repr(v)] for v in cases.get('repr', [])],
        'sorted': [[v, sorted(v)] for v in cases.get('sorted', [])],
        'strip': [[s, s.strip()] for s in cases.get('strip', [])],
        'split': [[s, s.split()] for s in cases.get('split', [])],
        'lower': [[s, s.lower()] for s in cases.get('lower', [])],
        'casefold': [[s, s.casefold()] for s in cases.get('casefold', [])],
        'len': [[s, len(s)] for s in cases.get('len', [])],
        'slice': [[s, a, b, s[a:b]] for s, a, b in cases.get('slice', [])],
        'pow085': [0.85 ** i for i in range(6)],
    })
    _write('sequence-matcher.json', [
        [a, b, difflib.SequenceMatcher(None, a, b).ratio(),
         [list(m) for m in difflib.SequenceMatcher(None, a, b).get_matching_blocks()]]
        for a, b in _json('similarity-pairs.json', [])])
    _write('extract.json', RECORDS['extract'])
    _write('domain-of.json', RECORDS['domain_of'])
    _write('handle-similarity.json', RECORDS['handle_similarity'])
    _write('heuristics.json', RECORDS['analyze'])

    null = base.NullAnalysisProvider('paged_live_search: deterministic risk assessment').analyze({})
    rows = []
    for record in RECORDS['analyze']:
        dossier, heur = record['args'][0], record['result']
        fused = risk.fuse(heur, null, 0.5)
        confidence = risk.compute_confidence(heur, null, dossier)
        rows.append({'source': record['source'], 'dossier': dossier, 'heur': heur, 'fused': fused,
                     'confidence': confidence, 'limitations': risk._limitations(dossier, heur, null),
                     'trusted': risk._has_trusted_profile_context(dossier, heur),
                     'action': risk.recommend_action(fused['overall_score'],
                                                     fused['category_scores'], confidence),
                     'summary': risk._fallback_summary(dossier, fused, heur)})
    _write('risk-core.json', rows)
    _write('snippets.json', [[body, term, search._snippet(body, term)]
                             for body, term in _json('snippets.json', [])])
    _write('parse-ts.json', [[value, export_file.parse_ts(value)]
                             for value in _json('timestamps.json', [])])

    helpers = _json('discovery-helpers.json', {})
    _write('discovery-helpers.json', {
        'as_int': [[v, bright._as_int(v)] for v in helpers.get('as_int', [])],
        'serp_followers': [[v, bright._serp_followers(v)] for v in helpers.get('serp_followers', [])],
        'as_url': [[v, bright._as_url(v)] for v in helpers.get('as_url', [])],
        'looks_like_video_url': [[v, bright._looks_like_video_url(v)] for v in helpers.get('video', [])],
        'canonical': [[v, bright._canonical_instagram_url(v)] for v in helpers.get('urls', [])],
        'url_kind': [[v, bright._url_kind(v)] for v in helpers.get('canonical_urls', [])],
        'queries': [[k, bright._discovery_queries(k)] for k in helpers.get('keywords', [])],
    })
    parsers = []
    for path in sorted((FIX / 'nodes').glob('*.json')):
        node = json.loads(path.read_text(encoding='utf-8'))
        P = bright.BrightDataInstagramProvider
        parsers.append({'name': path.name, 'node': node, 'post': P._post(node),
                        'account': P._account(node, node.get('_fallback', '')),
                        'comment': P._comment(node, node.get('_parent')), 'author': P._author(node),
                        'media': P._media_items(node)})
    _write('parsers.json', parsers)
    buckets = []
    for path in sorted((FIX / 'organic').glob('*.json')):
        case = json.loads(path.read_text(encoding='utf-8'))
        provider = _provider({'mode': 'keyword', 'max_items': case.get('max_items', 250)})
        result = provider._bucket_discovery(case['organic'], case['keyword'])
        buckets.append({'name': path.name, 'case': case, 'buckets': result,
                        'serp_fallback': provider._serp_fallback})
    _write('bucket-discovery.json', buckets)
    core = []
    for path in sorted((FIX / 'checkpoints').glob('*.json')):
        state = json.loads(path.read_text(encoding='utf-8'))
        collector = pages.PagedInstagramCollector(None, copy.deepcopy(state))
        collector._provenance = _provider()._provenance
        bundles_before, buckets_before = collector._bundles()
        collector._schedule()
        core.append({'name': path.name, 'state': state, 'bundles': bundles_before,
                     'buckets': buckets_before, 'scheduled_state': collector.state,
                     'profile_pending': collector._profile_enrichment_pending(bundles_before),
                     'has_work': collector.has_work()})
    _write('collector-core.json', core)
    _write('hit-key.json', [[hit, pages.hit_key(hit)] for hit in _json('hits.json', [])])
    print({name: len(value) for name, value in RECORDS.items()})


if __name__ == '__main__':
    main()
```

- [ ] **Step 3: Generate the goldens**

Run: `python tests/golden/generate.py`
Expected:
- It prints a dict of non-zero counts, for example `{'analyze': 40…, 'extract': …, 'domain_of': …,
  'handle_similarity': …}`.
- `tests/golden/pycompat.json` exists. So do the other golden files; some are empty lists until later tasks add
  their fixtures.
- If an import error names a REF module, add its stub to the `_module(...)` block. Don't modify REF files.

- [ ] **Step 4: Run the test to verify it fails**

Run: `node --test tests/engine/pycompat.test.js`
Expected: FAIL, `Cannot find module '../../server/engine/pycompat.js'`.

- [ ] **Step 5: Implement `server/engine/pycompat.js`**

```js
// Python-compatible primitives for the REF port; each mirrors CPython 3.12 on the inputs REF sees.
// ponytail: pyRepr prints integral numbers without ".0" (JS cannot tell 1 from 1.0). REF only reprs
// floats inside media_analysis dicts, which ScrapingDog never supplies. Upgrade: pass explicit float tags.
// ponytail: under IGNORECASE, Python's [a-z] also matches 'İ' and 'ı'; JS 'iu' does not. Turkish
// dotted/dotless I in handles is the only affected input.

export const PY_SPACE_CHARS =
  '\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
export const W = '[\\p{L}\\p{N}_]';
export const NW = '[^\\p{L}\\p{N}_]';
export const D = '\\p{Nd}';
export const S = `[${PY_SPACE_CHARS}]`;
export const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;

export function truthy(value) {
  if (value == null || value === false || value === 0 || value === '' || Number.isNaN(value)) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Map || value instanceof Set) return value.size > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export function or(...values) {
  for (let i = 0; i < values.length - 1; i++) if (truthy(values[i])) return values[i];
  return values[values.length - 1];
}

export const codePoints = s => Array.from(s ?? '');
export const pyLen = s => codePoints(s).length;
export const pySlice = (s, start = 0, end = undefined) => codePoints(s).slice(start, end).join('');
export function pyFind(s, sub) {
  const index = s.indexOf(sub);
  return index < 0 ? -1 : codePoints(s.slice(0, index)).length;
}

const LEADING = new RegExp(`^[${PY_SPACE_CHARS}]+`, 'u');
const TRAILING = new RegExp(`[${PY_SPACE_CHARS}]+$`, 'u');
const RUNS = new RegExp(`[${PY_SPACE_CHARS}]+`, 'u');
function stripChars(s, chars, fromStart, fromEnd) {
  const drop = new Set(codePoints(chars));
  const cps = codePoints(s);
  let start = 0;
  let end = cps.length;
  if (fromStart) while (start < end && drop.has(cps[start])) start++;
  if (fromEnd) while (end > start && drop.has(cps[end - 1])) end--;
  return cps.slice(start, end).join('');
}
export const pyLstrip = (s, chars) => (chars == null ? s.replace(LEADING, '') : stripChars(s, chars, true, false));
export const pyRstrip = (s, chars) => (chars == null ? s.replace(TRAILING, '') : stripChars(s, chars, false, true));
export const pyStrip = (s, chars) => (chars == null ? pyRstrip(pyLstrip(s)) : stripChars(s, chars, true, true));
export const pySplit = s => s.split(RUNS).filter(part => part !== '');
export const pyCasefold = s => s.toLowerCase().replaceAll('ß', 'ss').replaceAll('ς', 'σ')
  .replaceAll('ﬁ', 'fi').replaceAll('ﬂ', 'fl').replaceAll('ſ', 's');

// Exact decimal expansion of a finite, non-negative double below 1e21 (toFixed is exact per ECMA-262).
const exactDecimal = abs => abs.toFixed(100).replace(/\.?0+$/, '');
function roundHalfEven(decimal, ndigits) {
  const [intPart, frac = ''] = decimal.split('.');
  let kept = BigInt(intPart + frac.padEnd(ndigits, '0').slice(0, ndigits));
  const rest = frac.slice(ndigits);
  if (rest !== '') {
    const tailNonZero = /[1-9]/.test(rest.slice(1));
    if (rest[0] > '5' || (rest[0] === '5' && (tailNonZero || kept % 2n === 1n))) kept += 1n;
  }
  const digits = kept.toString().padStart(ndigits + 1, '0');
  return ndigits ? `${digits.slice(0, digits.length - ndigits)}.${digits.slice(digits.length - ndigits)}` : digits;
}
export function pyRound(x, ndigits = 0) {
  if (!Number.isFinite(x) || x === 0) return x;
  const rounded = Number(roundHalfEven(exactDecimal(Math.abs(x)), ndigits));
  return x < 0 ? -rounded : rounded;
}
export function pyFixed(x, ndigits) {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  const text = roundHalfEven(exactDecimal(Math.abs(x)), ndigits);
  return x < 0 || Object.is(x, -0) ? `-${text}` : text;
}

const NON_PRINTABLE = /^[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]$/u;
function reprStr(s) {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === quote || ch === '\\') out += `\\${ch}`;
    else if (ch === '\t') out += '\\t';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch !== ' ' && NON_PRINTABLE.test(ch)) {
      const hex = cp.toString(16);
      out += cp < 0x100 ? `\\x${hex.padStart(2, '0')}` : cp < 0x10000 ? `\\u${hex.padStart(4, '0')}`
        : `\\U${hex.padStart(8, '0')}`;
    } else out += ch;
  }
  return out + quote;
}
function reprNumber(x) {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return String(x);
  const abs = Math.abs(x);
  if (abs >= 1e16 || abs < 1e-4) {
    const [mantissa, exponent] = x.toExponential().split('e');
    const e = Number(exponent);
    return `${mantissa}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`;
  }
  return String(x);
}
export function pyRepr(value) {
  if (value == null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'number') return reprNumber(value);
  if (typeof value === 'string') return reprStr(value);
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(', ')}]`;
  const entries = value instanceof Map ? [...value] : Object.entries(value);
  return `{${entries.map(([k, v]) => `${pyRepr(k)}: ${pyRepr(v)}`).join(', ')}}`;
}
export const pyStr = value => (typeof value === 'string' ? value : pyRepr(value));

export function cmpCodePoints(a, b) {
  const x = codePoints(a);
  const y = codePoints(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = x[i].codePointAt(0) - y[i].codePointAt(0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}
export function cmpPy(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return cmpCodePoints(a, b);
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const d = cmpPy(a[i], b[i]);
      if (d !== 0) return d;
    }
    return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
  }
  throw new TypeError(`'<' not supported between ${typeof a} and ${typeof b}`);
}
export function sorted(items, { key = item => item, reverse = false } = {}) {
  return [...items]
    .map((item, index) => ({ item, index, k: key(item) }))
    .sort((p, q) => {
      const d = cmpPy(p.k, q.k);
      return d !== 0 ? (reverse ? -d : d) : p.index - q.index;
    })
    .map(entry => entry.item);
}

export function findall(regex, text) {
  if (!regex.global) throw new Error('findall needs a regex with the g flag');
  const out = [];
  for (const match of String(text).matchAll(regex)) {
    if (match.length === 1) out.push(match[0]);
    else if (match.length === 2) out.push(match[1] ?? '');
    else out.push(match.slice(1).map(group => group ?? ''));
  }
  return out;
}
export const dedupe = items => [...new Set(items)];
export const pyDedupe = items => dedupe([...items].filter(item => truthy(item)));
export function counter(items) {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}
```

- [ ] **Step 6: Implement `server/errors.js`**

```js
// Python-named exceptions so ported code raises and catches exactly where REF does.
import { pyFixed } from './engine/pycompat.js';

export class ValueError extends Error {
  constructor(message) { super(message); this.name = new.target.name; }
}
export class ProviderError extends Error {
  constructor(message) { super(message); this.name = new.target.name; }
}
export class ProviderNotConfigured extends ProviderError {}
export class CollectionNotPermitted extends ProviderError {}
export class FetchFailed extends Error {
  constructor(message, { statusCode = null, retryAfter = null } = {}) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}
export class SourceUnavailable extends FetchFailed {
  constructor(code, message, { statusCode = null } = {}) {
    super(message, { statusCode });
    this.code = code;
  }
}
export class NotAuthorized extends Error {
  constructor(message) { super(message); this.name = new.target.name; }
}
export class NotFound extends Error {
  constructor(message) { super(message); this.name = new.target.name; }
}
export class QuotaExceeded extends Error {
  constructor(scope, window, retryAfter) {
    super(`quota exhausted for ${scope} (${window}); retry in ${pyFixed(retryAfter, 0)}s`);
    this.name = new.target.name;
    this.scope = scope;
    this.window = window;
    this.retryAfter = retryAfter;
  }
}
export class InvalidSearchCursor extends ValueError {}
export class HttpError extends Error {
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : JSON.stringify(detail));
    this.name = new.target.name;
    this.status = status;
    this.detail = detail;
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/engine/pycompat.test.js`
Expected: PASS. For any failure, fix `pycompat.js`. Don't edit the goldens.

---

### Task 4: `difflib.SequenceMatcher` port

**Files:**
- Create: `server/engine/sequence-matcher.js`, `tests/fixtures/similarity-pairs.json`
- Test: `tests/engine/sequence-matcher.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `class SequenceMatcher { constructor(a: string, b: string); ratio(): number;
  getMatchingBlocks(): [i, j, k][]; findLongestMatch(alo, ahi, blo, bhi): [i, j, k] }`. Sequences are code-point
  arrays and `isjunk` is always `None`, as in REF heuristics.py:226.

- [ ] **Step 1: Write the fixture and the failing test**

`tests/fixtures/similarity-pairs.json`:

```json
[["luminairesupporthq", "luminaire"], ["totallyunrelated", "luminaire"], ["abab", "baba"], ["aaaa", "aa"],
 ["", ""], ["", "abc"], ["abc", ""], ["sbi", "sbi"], ["thesbiofficial", "sbi"], ["hdfcbankcare", "hdfc"],
 ["paytmcashback", "paytm"], ["xyzzy", "zyx"], ["😀a", "a😀"], ["nike", "nlke"], ["ab", "ba"],
 ["abcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcx",
  "abcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcy"]]
```

The last pair is ≥ 200 characters, so it exercises the `autojunk` popular-element rule.

`tests/engine/sequence-matcher.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { SequenceMatcher } from '../../server/engine/sequence-matcher.js';

test('ratio and matching blocks equal difflib for every fixture pair', () => {
  const cases = golden('sequence-matcher');
  assert.ok(cases.length >= 16);
  for (const [a, b, ratio, blocks] of cases) {
    const matcher = new SequenceMatcher(a, b);
    assert.deepEqual(matcher.getMatchingBlocks(), blocks, `${a} vs ${b}`);
    assert.equal(matcher.ratio(), ratio, `${a} vs ${b}`);
  }
});
```

- [ ] **Step 2: Regenerate the goldens and verify the test fails**

Run: `python tests/golden/generate.py`, then `node --test tests/engine/sequence-matcher.test.js`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implement `server/engine/sequence-matcher.js`**

```js
// Port of CPython difflib.SequenceMatcher with isjunk=None: ratio() and what it depends on.
export class SequenceMatcher {
  constructor(a, b, { autojunk = true } = {}) {
    this.a = Array.from(a);
    this.b = Array.from(b);
    this.matchingBlocks = null;
    const b2j = new Map();
    this.b.forEach((elt, i) => {
      if (!b2j.has(elt)) b2j.set(elt, []);
      b2j.get(elt).push(i);
    });
    // Popular elements of long sequences are removed from b2j (they are not junk: extension still sees them).
    const n = this.b.length;
    if (autojunk && n >= 200) {
      const ntest = Math.floor(n / 100) + 1;
      for (const [elt, indices] of [...b2j]) if (indices.length > ntest) b2j.delete(elt);
    }
    this.b2j = b2j;
  }

  findLongestMatch(alo, ahi, blo, bhi) {
    const { a, b, b2j } = this;
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map();
    for (let i = alo; i < ahi; i++) {
      const newj2len = new Map();
      for (const j of b2j.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        newj2len.set(j, k);
        if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
      }
      j2len = newj2len;
    }
    // With isjunk=None the junk set is empty, so only the non-junk extension loops can run.
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) { besti--; bestj--; bestsize++; }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) bestsize++;
    return [besti, bestj, bestsize];
  }

  getMatchingBlocks() {
    if (this.matchingBlocks) return this.matchingBlocks;
    const la = this.a.length;
    const lb = this.b.length;
    const queue = [[0, la, 0, lb]];
    const blocks = [];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = queue.pop();
      const [i, j, k] = this.findLongestMatch(alo, ahi, blo, bhi);
      if (k) {
        blocks.push([i, j, k]);
        if (alo < i && blo < j) queue.push([alo, i, blo, j]);
        if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
      }
    }
    blocks.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
    let [i1, j1, k1] = [0, 0, 0];
    const nonAdjacent = [];
    for (const [i2, j2, k2] of blocks) {
      if (i1 + k1 === i2 && j1 + k1 === j2) k1 += k2;
      else {
        if (k1) nonAdjacent.push([i1, j1, k1]);
        [i1, j1, k1] = [i2, j2, k2];
      }
    }
    if (k1) nonAdjacent.push([i1, j1, k1]);
    nonAdjacent.push([la, lb, 0]);
    this.matchingBlocks = nonAdjacent;
    return nonAdjacent;
  }

  ratio() {
    const matches = this.getMatchingBlocks().reduce((sum, block) => sum + block[2], 0);
    const length = this.a.length + this.b.length;
    return length ? (2.0 * matches) / length : 1.0;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/engine/sequence-matcher.test.js`
Expected: PASS.

---

### Task 5: `extract.py` port

**Files:**
- Create: `server/engine/extract.js`, `tests/fixtures/texts.json`, `tests/fixtures/urls.json`
- Test: `tests/engine/extract.test.js`

**Interfaces:**
- Consumes: `pycompat.js` (Task 3), `errors.js` `ValueError` (Task 3).
- Produces:
  - `domainOf(url: string): string`
  - `extract(text: string): {hashtag, mention, url, email, payment, upi, crypto_wallet, phone, download, telegram}`,
    each an array of strings with keys in this order

- [ ] **Step 1: Write the fixtures (Review Focus 1) and the failing test**

`tests/fixtures/texts.json`:

```json
[
  "हिंदी ऑफर! Luminaire loot deal पर जाएं https://luminaire-offer.xyz/claim?x=1. UPI: pay.me@ybl फोन: +91 98765 43210",
  "😀 FREE CASH 😀 join t.me/lootchannel_01 or Telegram: @scamchannel now!!",
  "nbsp www.example-shop.store and​zero-width https://bit.ly/abc)",
  "Full-width phone １２３４５６７８９０ and ETH 0x52908400098527886E0F7030069857D2E4169EE7 and BTC 1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
  "Email me: Ünïcode.Name@exämple.com or SUPPORT@Brand.COM, cashapp $bigwin99, paypal.me/brand-help",
  "Download https://files.example.com/app.APK?ref=ig and www.mirror.net/setup.exe.",
  "Line\rbreak www.a.com second http://b.net",
  "#Brand #brand_2026 #ÉTÉ @Brand.Official @brand. @x",
  "HTTPS://EXAMPLE.COM/PATH, email: a@b, phone 1234567, tron TRX9ZJEfZ7Lc5xX6vKm8tQzG4wYhXk3p2a"
]
```

`tests/fixtures/urls.json`:

```json
["http://[::1]:80/", "http://[bad/", "http://[127.0.0.1]/", "user@host.com:8080", "http://exämple.com/x",
 "www.EXAMPLE.com", "", "mailto:x@y.com", "http://example.com#frag", "https://a.com\\@b.com", " \thttp://tab.com",
 "t.me/channel", "ftp://files.example.org/x", "//double.slash.com/p", "http://example.com:99999/"]
```

`tests/engine/extract.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { domainOf, extract } from '../../server/engine/extract.js';

test('extract equals REF for every recorded call', () => {
  const calls = golden('extract');
  assert.ok(calls.length >= 12);
  for (const { source, args, result } of calls) assert.deepEqual(extract(...args), result, source);
});

test('domainOf equals REF for every recorded call', () => {
  const calls = golden('domain-of');
  assert.ok(calls.length >= 15);
  for (const { source, args, result } of calls) assert.equal(domainOf(...args), result, `${source}: ${args[0]}`);
});
```

- [ ] **Step 2: Regenerate the goldens and verify the test fails**

Run: `python tests/golden/generate.py`, then `node --test tests/engine/extract.test.js`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implement `server/engine/extract.js`**

This is a line-for-line port of REF `darkmap/extract.py`.

```js
// Port of REF darkmap/extract.py. Regexes translated per Global Constraints rule 5.
import { isIP } from 'node:net';
import { ValueError } from '../errors.js';
import { B, D, PY_SPACE_CHARS, findall, pyDedupe, pyLen, pyRstrip, pyStrip } from './pycompat.js';

const NOT_URL = `[^${PY_SPACE_CHARS}<>"')]`;
const WCLASS = '\\p{L}\\p{N}_';
const HASHTAG_RE = /(?<![A-Za-z0-9_])#([A-Za-z0-9_À-ɏ]{1,60})/gu;
const MENTION_RE = /(?<![A-Za-z0-9_])@([A-Za-z0-9_.]{1,40})/gu;
const URL_RE = new RegExp(`${B}((?:https?://|www\\.)${NOT_URL}+)`, 'giu');
const BARE_DOMAIN_RE = new RegExp(`${B}((?:t\\.me|telegram\\.me|telegram\\.dog)/[a-z0-9_+.-]+|`
  + '[a-z0-9-]+(?:\\.[a-z0-9-]+)+\\.(?:com|net|org|shop|store|top|xyz|ru|cn|info|live|link|click|icu|online|site|vip))'
  + B, 'giu');
const EMAIL_RE = new RegExp(`${B}[${WCLASS}.+-]+@[${WCLASS}-]+\\.[${WCLASS}.-]+${B}`, 'gu');
const PHONE_RE = new RegExp(`(?<!${D})(?:\\+?${D}[\\p{Nd}${PY_SPACE_CHARS}().-]{7,18}${D})(?!${D})`, 'gu');
const UPI_RE = new RegExp(`(?<![${WCLASS}.+-])([a-z0-9][a-z0-9._-]{1,80}@(?:upi|ybl|ibl|axl|okaxis|okhdfcbank|`
  + `okicici|oksbi|paytm|apl|ptyes|freecharge|airtel|fbl|indus|kotak))(?![${WCLASS}.-])`, 'giu');
const BTC_RE = new RegExp(`${B}(?:bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})${B}`, 'gu');
const ETH_RE = new RegExp(`${B}0x[a-fA-F0-9]{40}${B}`, 'gu');
const TRON_RE = new RegExp(`${B}T[1-9A-HJ-NP-Za-km-z]{33}${B}`, 'gu');
const PAYMENT_RE = new RegExp(`${B}(?:cashapp|cash app|\\$[a-z0-9]{3,20}|venmo|zelle|paypal\\.me/[${WCLASS}-]+|`
  + 'western union|bitcoin|btc address|usdt|crypto wallet|gift cards?|upi(?: id)?|gpay|google pay|phonepe|'
  + `paytm|bank transfer|wire transfer)${B}`, 'giu');
const DOWNLOAD_RE = new RegExp(`${B}(?:https?://|www\\.)${NOT_URL}+\\.(?:apk|xapk|exe|msi|dmg|pkg|zip|rar)`
  + `(?:\\?${NOT_URL}+)?`, 'giu');
const TELEGRAM_HANDLE_RE = new RegExp(`(?<![${WCLASS}])(?:telegram|tg)[${PY_SPACE_CHARS}]*[:=-]?`
  + `[${PY_SPACE_CHARS}]*@([a-z0-9_]{5,32})`, 'giu');

// Python 3.12 urllib.parse.urlsplit(url).netloc, including its ValueError cases.
function checkBracketedNetloc(netloc) {
  const hostAndPort = netloc.slice(netloc.lastIndexOf('@') + 1);
  const open = hostAndPort.indexOf('[');
  if (open < 0) return;
  if (open > 0) throw new ValueError('Invalid IPv6 URL');
  const bracketed = hostAndPort.slice(open + 1);
  const close = bracketed.indexOf(']');
  const hostname = close < 0 ? bracketed : bracketed.slice(0, close);
  const port = close < 0 ? '' : bracketed.slice(close + 1);
  if (port && !port.startsWith(':')) throw new ValueError('Invalid IPv6 URL');
  if (hostname.startsWith('v')) {
    if (!/^v[a-fA-F0-9]+\..+$/su.test(hostname)) throw new ValueError('IPvFuture address is invalid');
  } else if (isIP(hostname) !== 6) {
    throw new ValueError(isIP(hostname) === 4 ? 'An IPv4 address cannot be in brackets' : 'invalid IP');
  }
}
function checkNetloc(netloc) {
  if (!netloc || /^[\x00-\x7f]*$/.test(netloc)) return;
  const n = netloc.replaceAll('@', '').replaceAll(':', '').replaceAll('#', '').replaceAll('?', '');
  const normalized = n.normalize('NFKC');
  if (n === normalized) return;
  for (const c of '/?#@:') if (normalized.includes(c)) throw new ValueError(`netloc '${netloc}' contains invalid characters under NFKC normalization`);
}
function urlsplitNetloc(url) {
  let rest = url.replace(/^[\x00-\x20]+/, '').replace(/[\t\r\n]/g, '');
  const colon = rest.indexOf(':');
  if (colon > 0 && /^[A-Za-z]/.test(rest) && /^[A-Za-z0-9+.-]+$/.test(rest.slice(0, colon))) rest = rest.slice(colon + 1);
  if (!rest.startsWith('//')) return '';
  const tail = rest.slice(2);
  const cut = tail.search(/[/?#]/);
  const netloc = cut < 0 ? tail : tail.slice(0, cut);
  if (netloc.includes('[') !== netloc.includes(']')) throw new ValueError('Invalid IPv6 URL');
  if (netloc.includes('[')) checkBracketedNetloc(netloc);
  checkNetloc(netloc);
  return netloc;
}

export function domainOf(url) {
  if (!url) return '';
  const candidate = url.includes('://') ? url : `http://${url}`;
  let host;
  try {
    host = urlsplitNetloc(candidate).toLowerCase();
  } catch (error) {
    if (error instanceof ValueError) return '';
    throw error;
  }
  host = host.split('@').at(-1).split(':')[0];
  return host.startsWith('www.') ? host.slice(4) : host;
}

export function extract(text) {
  text = text || '';
  const urls = findall(URL_RE, text).map(u => pyRstrip(u, '.,);:!?'));
  const known = new Set(urls.map(domainOf));
  for (const bare of findall(BARE_DOMAIN_RE, text)) {
    if (!known.has(domainOf(bare))) { urls.push(bare); known.add(domainOf(bare)); }
  }
  const crypto = [...findall(BTC_RE, text), ...findall(ETH_RE, text), ...findall(TRON_RE, text)];
  const phoneText = text.replace(TRON_RE, ' ').replace(ETH_RE, ' ').replace(BTC_RE, ' ');
  const phones = [];
  for (const value of findall(PHONE_RE, phoneText)) {
    const normalized = value.replace(/[^\p{Nd}+]/gu, '');
    const digits = normalized.replace(/[^\p{Nd}]/gu, '');
    if (pyLen(digits) >= 8 && pyLen(digits) <= 15) phones.push(normalized);
  }
  return {
    hashtag: pyDedupe(findall(HASHTAG_RE, text).map(h => h.toLowerCase())),
    mention: pyDedupe(findall(MENTION_RE, text).map(m => pyStrip(m.toLowerCase(), '.'))),
    url: pyDedupe(urls),
    email: pyDedupe(findall(EMAIL_RE, text).map(e => e.toLowerCase())),
    payment: pyDedupe(findall(PAYMENT_RE, text).map(p => p.toLowerCase())),
    upi: pyDedupe(findall(UPI_RE, text).map(v => v.toLowerCase())),
    crypto_wallet: pyDedupe(crypto),
    phone: pyDedupe(phones),
    download: pyDedupe(findall(DOWNLOAD_RE, text).map(v => pyRstrip(v, '.,);:!?'))),
    telegram: pyDedupe(findall(TELEGRAM_HANDLE_RE, text).map(v => v.toLowerCase())),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/engine/extract.test.js`
Expected: PASS. A mismatch message names the failing text's source; fix the regex translation, not the golden.
Python's `re` semantics are the reference: `\b` is Unicode-aware, and IGNORECASE ranges behave as in rule 5.

---

### Task 6: `ai/heuristics.py` port

**Files:**
- Create: `server/engine/heuristics.js`
- Create: `tests/fixtures/dossiers/` with `unicode-hindi-scam.json`, `emoji-giveaway.json`,
  `verified-established.json`, `content-only-reel.json`, `media-analysis-qr.json`, `account-changes.json`,
  `shared-artifacts.json`
- Create: `tests/fixtures/similarity-calls.json`
- Test: `tests/engine/heuristics.test.js`

**Interfaces:**
- Consumes: `pycompat.js`; `SequenceMatcher` (Task 4); `domainOf` (Task 5).
- Produces:
  - `analyze(dossier) → {overall_score, category_scores, dimensions, alert_families, independent_indicators,
    signals, notes}`, with keys in this order
  - `handleSimilarity(handle, brandNames) → number`
  - Constants `CATEGORY_WEIGHTS`, `ALERT_FAMILIES` (object of arrays), `DIMENSION_CATEGORIES`, `DIRECT_HARM_SIGNALS`
    (Set)

- [ ] **Step 1: Write the fixture dossiers**

Each file is a dossier in REF's shape (dossier.py:91-116, intelligence.py:119-122), with keys `brand`, `account`,
`posts[{caption, media[], comments[], engagement}]`, `entities[]`, `media_analysis[]`, `provenance`,
`shared_artifacts[]`, `account_changes[]`, `velocity{}` and `content_only`. The one shown in full is
`unicode-hindi-scam.json`:

```json
{
  "brand": {"name": "Luminaire", "official_handles": ["luminaire"], "official_domains": ["luminaire.com"],
            "keywords": ["luminaire", "aurora series"]},
  "account": {"handle": "luminaire.offers_hindi", "display_name": "Luminaire ऑफर 😀", "biography":
              "सिर्फ़ आज! Luminaire loot deal — telegram channel से जुड़ें, UPI pay.me@ybl",
              "external_url": "https://t.me/lumiloot", "followers_count": 312, "follows_count": 5,
              "media_count": 9, "is_verified": false},
  "provenance": {"collection_mode": "keyword", "lawful_basis": "licensed_public_data_api"},
  "posts": [{"caption": "Luminaire पर 90% off 🔥 link in bio, comment LINK for free cash ₹500 cashback",
             "media": [{"media_type": "image"}],
             "comments": [{"author_handle": "victim_1", "text": "I paid already but never received 😡"}],
             "engagement": {"likes": 40, "comments": 3, "views": null, "shares": null}}],
  "entities": [{"kind": "url", "value": "https://t.me/lumiloot", "domain": "t.me", "source_field": "external_url"},
               {"kind": "upi", "value": "pay.me@ybl", "domain": null, "source_field": "bio"}],
  "media_analysis": [], "shared_artifacts": [], "account_changes": [],
  "velocity": {"posts_last_hour": 0, "posts_last_24h": 1, "follower_delta": null, "duplicate_post_count": 0}
}
```

Write the other six the same way, each aimed at the branch its name says:
- **`emoji-giveaway.json`:** emoji-heavy giveaway caption and a `wa.me` link.
- **`verified-established.json`:** `is_verified: true`, 250 000 followers, banking/KYC vocabulary only (the
  established-profile gate).
- **`content-only-reel.json`:** `"content_only": true`, one reel with a Telegram lure (the account-field filter).
- **`media-analysis-qr.json`:** `media_analysis` with `brand_match_score: 0.7`, `qr_payloads:
  ["https://pay.example/upi/claim"]`, OCR text asking for an OTP, and `synthetic_media_score: 0.8` with an
  investment transcript. Use only non-integral floats here (see the `pyRepr` note in Task 3).
- **`account-changes.json`:** `account_changes` holding `display_name` and `biography` change dicts
  `{field, before, after, observed_at}`.
- **`shared-artifacts.json:`** `shared_artifacts` holding a `upi` artifact with `account_count: 3` and a `url`
  artifact with `account_count: 2`, plus `velocity` with `posts_last_hour: 9`, `duplicate_post_count: 3` and
  `follower_delta: 6000`.

`tests/fixtures/similarity-calls.json`:

```json
[["luminaire.support.hq", ["Luminaire"]], ["LUMINAIRE", ["luminaire", "aurora series"]], ["", ["Luminaire"]],
 ["sbi_help", ["sbi"]], ["😀luminaire", ["Luminaire"]], ["aurora.series.store", ["Luminaire", "aurora series"]]]
```

- [ ] **Step 2: Write the failing test**

`tests/engine/heuristics.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { analyze, handleSimilarity } from '../../server/engine/heuristics.js';

test('analyze equals REF for every harvested and fixture dossier', () => {
  const calls = golden('heuristics');
  assert.ok(calls.length >= 40, `only ${calls.length} recorded analyses`);
  for (const { source, args, result } of calls) assert.deepEqual(analyze(structuredClone(args[0])), result, source);
});

test('handleSimilarity equals REF for every recorded call', () => {
  for (const { source, args, result } of golden('handle-similarity')) {
    assert.equal(handleSimilarity(...args), result, `${source}: ${JSON.stringify(args)}`);
  }
});
```

- [ ] **Step 3: Regenerate the goldens and verify the test fails**

Run: `python tests/golden/generate.py`, then `node --test tests/engine/heuristics.test.js`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 4: Implement `server/engine/heuristics.js` as a line-for-line port of REF `darkmap/ai/heuristics.py`
  (lines 1-827)**

**Naming.** Keep REF's order and names, in camelCase:
- `_norm` → `norm`, `_sig` → `sig`, `_find_terms` → `findTerms`
- `_deal_lure_hits` → `dealLureHits`, `_official_domain` → `officialDomain`
- `handle_similarity` → `handleSimilarity`, `analyze` → `analyze`

Every key that lands in the output stays snake_case, exactly as REF writes it.

**Constants.** Copy all term lists and tables (REF :14-173) verbatim, as JS arrays and objects in the same order:
- `ROLE_TOKENS` … `RESELLER_TERMS`
- `SHORTENERS`, `MESSAGING_DOMAINS`, `RISKY_TLDS`, `FILE_SHARING_DOMAINS` as `Set`s
- `CATEGORY_WEIGHTS` and `DIMENSION_CATEGORIES`, the latter as an object of arrays in REF order
- `ALERT_FAMILIES` as an object of arrays
- `DIRECT_HARM_SIGNALS` as a `Set`

Keep `ESTABLISHED_FOLLOWER_THRESHOLD = 100_000` and `VERIFIED_ESTABLISHED_FOLLOWER_THRESHOLD = 10_000`. Add
`const POW_085 = [...]`, copying the six numbers from `tests/golden/pycompat.json` `pow085`. The aggregate loop
(REF :731-732) reads `POW_085[idx]` instead of `0.85 ** idx`.

**Translation points.** Each is keyed to REF lines, and each gets the rule shown:
1. `_norm` (:176-177): `(or(text, '')).toLowerCase().replace(/[^a-z0-9]+/g, '')`.
2. `_sig` (:180-184):
   - `quote: pySlice(or(quote, ''), 0, 240)`
   - `weight: pyRound(Math.min(1, Math.max(0, weight)), 3)`
   - Build the object with keys in order `source, category, signal, field, quote, weight, rationale`.
3. `_find_terms` (:187-198):
   - `low = or(text, '').toLowerCase()`
   - `spaced = pyStrip(low.replace(/[^a-z0-9]+/g, ' '))`
   - Per term, `normalizedTerm = pyStrip(term.toLowerCase().replace(/[^a-z0-9]+/g, ' '))`, and keep it when
     `low.includes(term.toLowerCase()) || (normalizedTerm && spaced.includes(normalizedTerm))`.
4. `_deal_lure_hits` (:201-211). Use regexes with the `u` flag, with `\b` → `B`, `\s` → `S` and `\d` → `D`. Python's
   `.` becomes `[^\n]`:
   - `amount = '(?:₹|rs\\.?|inr)' + S + '*[' + '\\p{Nd}' + ',]+(?:\\.' + D + '+)?'`
   - the combined pattern is `(?:${amount}[^\n]{0,36}${benefit}|${benefit}[^\n]{0,36}${amount})`
   - end with `dedupe(hits)`
5. `handle_similarity` (:219-230):
   - `new SequenceMatcher(h, n).ratio()`
   - `if (h.includes(n)) ratio = Math.max(ratio, h !== n ? 0.85 : 1.0)`
6. Brand context (:235-240):
   - `brand = or(dossier.brand, {})`
   - `brandNames` is `[brand.name]` when truthy, plus `or(brand.keywords, [])`, filtered by truthy
   - `officialHandles = new Set(or(brand.official_handles, []).map(h => pyLstrip(h.toLowerCase(), '@')))`
   - `officialDomains = new Set(or(brand.official_domains, []).map(d => d.toLowerCase()))`
7. `identity_text`, `disclosed_unofficial` (:242-251): use `or(...)` for every `or` in REF.
8. Rationale f-strings:
   - `{sim:.2f}` and `{name_sim:.2f}` → `pyFixed(sim, 2)`
   - `{role_hits}`, `{lookalike_hits}`, `{promo_handle_hits}` and `{hits[:4]}` → `pyRepr(list)`
   - `f'.{tld} …'` becomes plain interpolation
9. `noisy_handle_pattern` (:307): `/[0-9]{3,}$/.test(handle)`. Count `_` and `.` with
   `handle.split('_').length - 1` and `handle.split('.').length - 1`.
10. `non_ascii_handle` (:310): `codePoints(handle).some(ch => ch.codePointAt(0) > 127)`.
11. `profile_details_missing` (:323-332): `or(dossier.provenance, {}).collection_mode === 'keyword_serp_fallback'`;
    keep the `is None` checks as `== null` and `not bio.strip()` as `!pyStrip(bio)`.
12. `is_established` (:333-338): `Number.isInteger(followers)` stands in for `isinstance(followers, int)`.
13. URL loop (:363-397):
    - `dom = or(ent.domain, domainOf(value))`
    - `tld` is the text after the last `.`, as `dom.rsplit('.', 1)[-1]` gives
    - `dom.split('.')[0]`
    - The credential regex is `/(login|verify|secure|appeal|recover|account|wallet|billing)/iu` tested on
      `dom + value`.
    - The download regex is `/\.(?:apk|xapk|exe|msi|dmg|pkg|zip|rar)(?:\?|(?=\n?$))/iu`, because Python `$` → rule 5.
14. `entity_kinds = counter(entities.map(e => e.kind ?? null))`. Missing kinds read as `(entityKinds.get(k) ?? 0)`.
15. Corpora (:423-430): build an array of `[field, text]` pairs in REF order, with `f'posts[{i}]...'` fields.
    Include OCR only when `truthy(m.ocr_text)`.
16. `scan()` (:432-438): `Math.min(1.0, base + 0.1 * (hits.length - 1))` with rationale
    `` `${rationale}: ${pyRepr(hits.slice(0, 4))}` ``.
17. Composite loop (:483-560):
    - `compact = norm(low)`
    - `brandHits = normalizedBrands.filter(v => compact.includes(v))`
    - `dealHits = dedupe([...dealLureHits(low), ...findTerms(low, [...GIVEAWAY_TERMS, ...PAYMENT_TERMS])])`
    - `field.endsWith('.text')`
    - The `entity_kinds[...]` truthiness reads use rule 14.
18. Media section (:580-641):
    - `Number(or(m.brand_match_score, 0))`
    - `qrPayloads = or(m.qr_payloads, truthy(m.qr_payload) ? [m.qr_payload] : [])`
    - `pyStr(payload)` for each of `qrPayloads.slice(0, 5)`
    - The payload regexes use the `iu` flags.
    - Each `str(m)[:200]` / `[:240]` becomes `pySlice(pyRepr(m), 0, 200)` / `pySlice(pyRepr(m), 0, 240)`.
    - `has_media` is `posts.some(p => truthy(or(p.media, [])))`.
19. Coordinated section (:644-685):
    - `captions` keeps `pyStrip(or(p.caption, '')).toLowerCase()` only for posts where `truthy(p.caption)`
    - `dupes` comes from `counter(captions)`, filtered by `n >= 3 && pyLen(c) > 25`
    - `commenters` is a counter of `author_handle.toLowerCase()`
    - `ring` is the entries with `n >= 3`, in first-seen order
    - `', '.join(x[:5])` becomes `x.slice(0, 5).join(', ')`
    - Shared-artifact weights use `Math.min(0.95, 0.58 + 0.08 * Math.min(count, 4))`
20. `account_changes` (:687-696): the quote is `pyRepr(important.slice(0, 4))`.
21. Velocity (:698-712):
    - `Math.trunc(Number(or(velocity.posts_last_hour, 0)))`
    - `Number.isInteger(followerDelta) && followerDelta >= 5000`
    - quotes via `pyStr(...)`
22. `content_only` filter (:716-718): `(signal.field ?? '').startsWith('account.')`.
23. Aggregate (:721-733):
    - `grouped` is a `Map` in first-seen category order
    - `weights = sorted(ws, {reverse: true})`
    - `combined *= (1 - w * POW_085[idx])` for `idx < 6`
    - `pyRound(Math.min(100, (1 - combined) * 100), 2)`
24. Gates (:735-770):
    - The `for cat in category_scores` loops iterate object keys in insertion order.
    - Round the disclosed-unofficial scaling with `pyRound(x * 0.3, 2)` and `pyRound(x * 0.5, 2)`.
25. Overall and dimensions (:772-794):
    - `top = sorted(weighted, {reverse: true})`
    - `overall = top[0] + top.slice(1, 4).reduce((s, v) => s + v * 0.18, 0)`
    - `engagementValues` keeps `typeof v === 'number' && v >= 0` from `Object.values(or(post.engagement, {}))`
    - `exposureMetric = Math.max(...engagementValues, Number(or(followers, 0)))`
    - `12.5 * Math.max(0, Math.log10(exposureMetric + 1))`
    - Dimension values are `sorted(categories.map(c => categoryScores[c] ?? 0), {reverse: true})`.
26. Families and indicators (:797-822):
    - `independent` counts distinct `category + '\u0000' + signal` strings for signals with
      `Number(or(s.weight, 0)) >= 0.5`
    - family `signals: sorted(dedupe(familySignals.map(s => s.signal))).slice(0, 12)`
    - `critical` requires `familyScore >= 80` and at least 2 distinct signals with `(s.weight ?? 0) >= 0.5`
    - `alert_family` and `dimension` are the first matching key in object order, else `null`

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/engine/heuristics.test.js`
Expected: PASS for all recorded analyses. A mismatch prints the `source` (REF test or fixture file); diff that one
case with the golden entry and fix the port. The goldens are the contract.

---

### Task 7: Pure risk functions (`risk.py` fuse, confidence, action, limitations, summary)

**Files:**
- Create: `server/engine/risk-core.js`
- Test: `tests/engine/risk-core.test.js`

**Interfaces:**
- Consumes: `CATEGORY_WEIGHTS` (Task 6); `pycompat.js`.
- Produces:
  - Constants: `ENGINE_VERSION = '2.3.0'`, `CATEGORIES: string[]`, `DEFAULT_ANALYSIS_MODEL = 'claude-opus-5'`
  - `nullAnalysis(reason) → AnalysisResult`, where AnalysisResult is `{available, overall_score, category_scores,
    evidence, confidence, limitations, recommended_action, summary, model, raw, error}`
  - `recommendAction(score, categories, confidence)`
  - `limitations(doc, heur, ai)`
  - `fuse(heur, ai, aiWeight)`
  - `computeConfidence(heur, ai, doc)`
  - `isRegisteredOfficialHandle(doc)`
  - `hasTrustedProfileContext(doc, heur)`
  - `fallbackSummary(doc, fused, heur)`

- [ ] **Step 1: Write the failing test**

`tests/engine/risk-core.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { CATEGORIES, computeConfidence, fallbackSummary, fuse, hasTrustedProfileContext, limitations, nullAnalysis,
  recommendAction } from '../../server/engine/risk-core.js';

const NULL = nullAnalysis('paged_live_search: deterministic risk assessment');

test('fuse/confidence/limitations/trusted/action/summary equal REF on every recorded analysis', () => {
  for (const row of golden('risk-core')) {
    const fused = fuse(row.heur, NULL, 0.5);
    assert.deepEqual(fused, row.fused, row.source);
    const confidence = computeConfidence(row.heur, NULL, row.dossier);
    assert.equal(confidence, row.confidence, row.source);
    assert.deepEqual(limitations(row.dossier, row.heur, NULL), row.limitations, row.source);
    assert.equal(hasTrustedProfileContext(row.dossier, row.heur), row.trusted, row.source);
    assert.equal(recommendAction(fused.overall_score, fused.category_scores, confidence), row.action, row.source);
    assert.equal(fallbackSummary(row.dossier, fused, row.heur), row.summary, row.source);
  }
});

test('REF test_risk_engine: fuse blends only when AI is available and keeps strong single signals', () => {
  const heur = { overall_score: 40, category_scores: { scam_phishing: 40 }, independent_indicators: 2 };
  const ai = { ...NULL, available: true, overall_score: 80, category_scores: { scam_phishing: 80 } };
  assert.equal(fuse(heur, NULL, 0.5).category_scores.scam_phishing, 40);
  assert.equal(fuse(heur, ai, 0.5).category_scores.scam_phishing, 60);
  assert.equal(fuse(heur, ai, 0.5).overall_score, 60);
  assert.deepEqual(Object.keys(fuse(heur, ai, 0.5).category_scores), CATEGORIES);
});
```

- [ ] **Step 2: Port the remaining REF pure risk tests into the same file**

Port these into `risk-core.test.js`, each as one `test(...)` with the same inputs and expected values:
- REF `tests/test_risk_engine.py:102-170`:
  - `test_recommend_action_thresholds`: each parametrize row becomes one assertion
  - `test_recommend_action_hard_category_escalates_from_any_of_four`
  - `test_recommend_action_enforce_requires_both_score_and_confidence`
  - `test_fuse_ignores_ai_weight_when_ai_unavailable`
  - `test_fuse_blends_scores_when_ai_available`
  - `test_fuse_preserves_strong_single_engine_signal`
  - `test_fuse_clamps_to_100_and_covers_all_categories`
- REF `tests/test_advanced_alerts.py:120-131`, `test_ai_fusion_cannot_bypass_two_indicator_critical_gate`

Build AI results with `{...nullAnalysis(''), available: true, ...}` wherever REF uses `AnalysisResult(available=True,
...)`.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test tests/engine/risk-core.test.js`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 4: Implement `server/engine/risk-core.js`**

```js
// Pure parts of REF darkmap/risk.py (lines 15-105 and 218-229).
import { CATEGORY_WEIGHTS } from './heuristics.js';
import { or, pyFixed, pyLstrip, pyRound, pyStr, sorted, truthy } from './pycompat.js';

export const ENGINE_VERSION = '2.3.0';
export const CATEGORIES = Object.keys(CATEGORY_WEIGHTS);
export const DEFAULT_ANALYSIS_MODEL = 'claude-opus-5';

export function nullAnalysis(reason = 'ai_provider_not_configured') {
  return { available: false, overall_score: 0.0, category_scores: {}, evidence: [], confidence: 0.0,
    limitations: [reason], recommended_action: null, summary: '', model: null, raw: {}, error: reason };
}

export function recommendAction(score, categories, confidence) {
  const hard = Math.max(categories.credential_harvesting ?? 0, categories.scam_phishing ?? 0,
    categories.counterfeit ?? 0, categories.brand_impersonation ?? 0);
  if (score >= 85 && confidence >= 0.55) return 'enforce';
  if (score >= 70 || (hard >= 80 && confidence >= 0.5)) return 'evidence_package';
  if (score >= 45) return 'investigate';
  return 'monitor';
}

export function limitations(doc, heur, ai) {
  const out = [];
  if (!ai.available) out.push('ai_analysis_unavailable: heuristics-only assessment, lower confidence');
  if (or(heur.notes, []).includes('media_analysis_unavailable')) {
    out.push('media_analysis_unavailable: logo/brand-mark detection was not performed; '
      + 'logo_misuse is scored from text signals only');
  }
  if (!truthy(doc.brand)) {
    out.push('no_brand_context: no protected brand matched this account; impersonation '
      + 'and counterfeit scoring is generic');
  }
  if (!truthy(doc.posts)) out.push('no_post_data: only profile-level fields were available');
  if (!or(doc.posts, []).some(p => truthy(p.comments))) {
    out.push('no_comment_data: comment-level abuse signals could not be evaluated');
  }
  if (or(doc.provenance, {}).lawful_basis === 'permitted_public_page') {
    out.push('metadata_only_source: public page ingestion returns open-graph metadata only');
  }
  out.push('automated_assessment: not a legal determination; human review required before enforcement');
  for (const item of or(ai.limitations, [])) if (!out.includes(item)) out.push(item);
  return out.slice(0, 20);
}

export function fuse(heur, ai, aiWeight) {
  const w = ai.available ? aiWeight : 0.0;
  const cats = {};
  for (const cat of CATEGORIES) {
    const h = Number(heur.category_scores[cat] ?? 0.0);
    const a = ai.available ? Number(ai.category_scores[cat] ?? 0.0) : 0.0;
    const blended = h * (1 - w) + a * w;
    cats[cat] = pyRound(Math.min(100.0, Math.max(blended, 0.75 * Math.max(h, a))), 2);
  }
  let overall = pyRound(Math.min(100.0, Number(heur.overall_score) * (1 - w)
    + (ai.available ? Number(ai.overall_score) : 0.0) * w), 2);
  const values = Object.values(cats);
  overall = pyRound(Math.max(overall, values.length ? 0.8 * Math.max(...values) : 0.0), 2);
  if (overall >= 85 && 'independent_indicators' in heur && Math.trunc(Number(or(heur.independent_indicators, 0))) < 2) {
    overall = 84.0;
  }
  return { overall_score: overall, category_scores: cats };
}

export function computeConfidence(heur, ai, doc) {
  let conf = 0.35;
  if (truthy(doc.brand)) conf += 0.1;
  if (truthy(doc.posts)) conf += 0.1;
  if (or(heur.signals, []).length >= 3) conf += 0.1;
  if (ai.available) conf = conf * 0.5 + (0.5 + ai.confidence * 0.5) * 0.5 + 0.1;
  if (truthy(doc.media_analysis)) conf += 0.05;
  return pyRound(Math.max(0.05, Math.min(0.97, conf)), 3);
}

export function isRegisteredOfficialHandle(doc) {
  const brand = or(doc.brand, {});
  const account = or(doc.account, {});
  const handle = pyLstrip(pyStr(or(account.handle, '')).toLowerCase(), '@');
  const handles = new Set(or(brand.official_handles, []).map(v => pyLstrip(pyStr(v).toLowerCase(), '@')));
  return Boolean(handle && handles.has(handle));
}

export function hasTrustedProfileContext(doc, heur) {
  const notes = or(heur.notes, []);
  return isRegisteredOfficialHandle(doc)
    || notes.includes('established_profile: vocabulary-only alert scoring suppressed')
    || notes.includes('incomplete_profile: ungrounded alert scoring suppressed');
}

export function fallbackSummary(doc, fused, heur) {
  const account = or(doc.account, {});
  const handle = Object.hasOwn(account, 'handle') ? account.handle : 'account';
  const top = sorted(Object.entries(fused.category_scores), { key: kv => kv[1], reverse: true }).slice(0, 3)
    .filter(([, v]) => v > 0).map(([k, v]) => `${k} ${pyFixed(v, 0)}`);
  const brand = or(doc.brand, {}).name;
  const parts = [`Heuristic-only assessment of @${pyStr(handle)}`,
    truthy(brand) ? `against brand "${brand}"` : 'with no matched brand context',
    `- overall ${pyFixed(fused.overall_score, 0)}/100.`];
  if (top.length) parts.push(`Leading categories: ${top.join(', ')}.`);
  parts.push(`${or(heur.signals, []).length} deterministic signals fired.`);
  return parts.join(' ');
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/engine/risk-core.test.js`
Expected: PASS.

---

### Task 8: Timestamps, the store, REF's SQLite row orders, and audit rows

**Files:**
- Create: `server/time.js`, `server/store.js`, `server/sqlite-order.js`, `server/audit.js`
- Create: `tests/fixtures/timestamps.json`, `tests/golden/sqlite_order.py`
- Test: `tests/server/time.test.js`, `tests/server/store.test.js`, `tests/server/sqlite-order.test.js`

**Interfaces:**
- Consumes: `pycompat.js`, `errors.js` (Task 3).
- Produces `server/time.js`:
  - `utcnowIso(clock = Date.now): string`
  - `isoFromMicros(micros: bigint): string`
  - `toMicros(iso): bigint`
  - `addSeconds(iso, seconds): string`
  - `parseTs(value): string | null`, a port of REF `export_file.parse_ts` that returns the naive isoformat string
- Produces `server/store.js`:
  - `createStore({file, fs, debounceMs})`, returning `{table(name), save(), flush(): Promise, load()}`
  - `Table` methods:
    - `insert(values) → row`, `get(id)`, `update(id, patch) → row`, `remove(id)`, `removeWhere(pred)`
    - `all()`, `where(pred)`, `find(pred)`, `byUnique(indexNo, ...keyParts) → row | null`, `count()`
  - `newId() → 32-hex string`
  - `IntegrityError`
  - Rows are plain mutable objects: callers may assign non-key fields directly, and must use `update()` for unique-key
    columns.
- Produces `server/sqlite-order.js`: `postsOfAccount`, `postsForDossier(store, accountId, limit)`,
  `searchDocsForAccounts`, `entitiesOfAccount`, `mediaOfPost`, `commentsOfPost`.
- Produces `server/audit.js`: `record(store, {action, provider, target, status, lawful_basis, duration_ms, actor,
  detail}) → row`, a port of REF audit.py:9-18 in which `target` is truncated to 400 code points.

- [ ] **Step 1: Write the timestamp fixtures and the failing time test**

`tests/fixtures/timestamps.json`:

```json
["2026-09-20T10:15:30.000Z", "2026-09-20T10:15:30+05:30", "2026-09-20 10:15:30", "2026-09-20", 1758363330,
 1758363330.5, 1758363330.1234567, "1758363330", "", null, "Sep 20, 2026", "2026-09-20T10:15:30.123456789Z",
 "20260920", "2026-09-20T10:15", "2026-9-20", "2026-09-20T10:15:30-0800", "2026-09-20x10:15:30", 0]
```

`tests/server/time.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { addSeconds, isoFromMicros, parseTs, toMicros, utcnowIso } from '../../server/time.js';

test('parseTs equals REF export_file.parse_ts', () => {
  for (const [value, expected] of golden('parse-ts')) assert.equal(parseTs(value), expected, JSON.stringify(value));
});
test('isoformat omits a zero fraction and keeps microseconds', () => {
  assert.equal(isoFromMicros(1758363330000000n), '2025-09-20T10:15:30');
  assert.equal(isoFromMicros(1758363330000001n), '2025-09-20T10:15:30.000001');
  assert.equal(toMicros('2025-09-20T10:15:30.5'), 1758363330500000n);
  assert.equal(addSeconds('2025-09-20T10:15:30', -3600), '2025-09-20T09:15:30');
  assert.match(utcnowIso(() => 1758363330123), /^2025-09-20T10:15:30\.123000$/);
});
```

- [ ] **Step 2: Regenerate the goldens and verify the test fails**

Run: `python tests/golden/generate.py`, then `node --test tests/server/time.test.js`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implement `server/time.js`**

```js
// Naive-UTC timestamps exactly as REF writes them (Python isoformat, microseconds, no zone).
import { ValueError } from './errors.js';
import { pyRound } from './engine/pycompat.js';

const pad = (n, width = 2) => String(n).padStart(width, '0');
function civil(ms) {
  const d = new Date(Number(ms));
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T`
    + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
export function isoFromMicros(micros) {
  const seconds = micros >= 0n ? micros / 1000000n : (micros - 999999n) / 1000000n;
  const fraction = micros - seconds * 1000000n;
  const base = civil(seconds * 1000n);
  return fraction ? `${base}.${String(fraction).padStart(6, '0')}` : base;
}
export const utcnowIso = (clock = Date.now) => isoFromMicros(BigInt(clock()) * 1000n);
function utcMillis(y, mo, d, h = 0, mi = 0, s = 0) {
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  date.setUTCHours(h, mi, s, 0);
  return date.getTime();
}
export function toMicros(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/.exec(iso);
  if (!m) throw new ValueError(`not a naive isoformat timestamp: ${iso}`);
  return BigInt(utcMillis(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6])) * 1000n + BigInt((m[7] ?? '').padEnd(6, '0'));
}
export const addSeconds = (iso, seconds) => isoFromMicros(toMicros(iso) + BigInt(Math.round(seconds * 1e6)));

// ---- parse_ts (REF providers/export_file.py:18-37) ----
function valid(y, mo, d, h, mi, s) {
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return false;
  const probe = new Date(utcMillis(y, mo, d));
  return probe.getUTCDate() === d && probe.getUTCMonth() === mo - 1;
}
function build(y, mo, d, h, mi, s, fracDigits, offsetMinutes) {
  if (!valid(y, mo, d, h, mi, s)) return null;
  const micros = BigInt(utcMillis(y, mo, d, h, mi, s)) * 1000n
    + BigInt((fracDigits ?? '').slice(0, 6).padEnd(6, '0'))
    - BigInt(offsetMinutes ?? 0) * 60000000n;
  return isoFromMicros(micros);
}
const OFFSET = '([+-])(\\d{2})(?::?(\\d{2}))?';
// Python 3.12 datetime.fromisoformat subset used by Instagram data: extended and basic dates, any single-character
// separator, hours[:minutes[:seconds[.fraction]]], and an optional +HH[:MM] offset ('Z' was already replaced).
const ISO_EXT = new RegExp(`^(\\d{4})-(\\d{2})-(\\d{2})(?:[\\s\\S](\\d{2})(?::(\\d{2})(?::(\\d{2})(?:[.,](\\d+))?)?)?(?:${OFFSET})?)?$`, 'u');
const ISO_BASIC = /^(\d{4})(\d{2})(\d{2})$/;
// strptime fallbacks (REF :24-30): '%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d'.
const STRP_TZ = /^(\d{4})-(1[0-2]|0[1-9]|[1-9])-(3[01]|[12]\d|0[1-9]|[1-9]| [1-9])T(2[0-3]|[01]\d|\d):([0-5]\d|\d):(6[01]|[0-5]\d|\d)([+-])(\d\d):?([0-5]\d)$/;
const STRP_SPACE = /^(\d{4})-(1[0-2]|0[1-9]|[1-9])-(3[01]|[12]\d|0[1-9]|[1-9]| [1-9]) (2[0-3]|[01]\d|\d):([0-5]\d|\d):(6[01]|[0-5]\d|\d)$/;
const STRP_DATE = /^(\d{4})-(1[0-2]|0[1-9]|[1-9])-(3[01]|[12]\d|0[1-9]|[1-9]| [1-9])$/;

export function parseTs(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' || typeof value === 'boolean') {
    const t = Number(value);
    const seconds = Math.floor(t);
    let micros = BigInt(pyRound((t - seconds) * 1e6, 0));
    return isoFromMicros(BigInt(seconds) * 1000000n + micros);
  }
  const text = String(value).replaceAll('Z', '+00:00');
  let m = ISO_EXT.exec(text);
  if (m) {
    const offset = m[8] ? (m[8] === '-' ? -1 : 1) * (Number(m[9]) * 60 + Number(m[10] ?? 0)) : 0;
    const out = build(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), m[7], offset);
    if (out) return out;
  }
  if ((m = ISO_BASIC.exec(text))) { const out = build(+m[1], +m[2], +m[3], 0, 0, 0); if (out) return out; }
  if ((m = STRP_TZ.exec(text))) {
    const offset = (m[7] === '-' ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9]));
    const out = build(+m[1], +m[2], +m[3].trim(), +m[4], +m[5], Math.min(+m[6], 59), null, offset);
    if (out) return out;
  }
  if ((m = STRP_SPACE.exec(text))) { const out = build(+m[1], +m[2], +m[3].trim(), +m[4], +m[5], Math.min(+m[6], 59)); if (out) return out; }
  if ((m = STRP_DATE.exec(text))) { const out = build(+m[1], +m[2], +m[3].trim(), 0, 0, 0); if (out) return out; }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/server/time.test.js`
Expected: PASS. If a timestamp shape differs, adjust the matching regex until the golden matches. Python is the
reference.

- [ ] **Step 5: Write the SQLite-order check and its golden**

`tests/golden/sqlite_order.py`:

```python
"""Pin the row order REF's SQLite queries return when they have no ORDER BY (spec §10)."""
import json
import pathlib
import sqlite3

OUT = pathlib.Path(__file__).resolve().parent / 'sqlite-order.json'
db = sqlite3.connect(':memory:')
db.executescript('''
CREATE TABLE posts (id INTEGER NOT NULL, account_id INTEGER NOT NULL, platform_post_id VARCHAR(160),
  posted_at DATETIME, PRIMARY KEY (id), CONSTRAINT uq_post_account_platform_id UNIQUE (account_id, platform_post_id));
CREATE INDEX ix_posts_posted_at ON posts (posted_at);
CREATE INDEX ix_posts_account_posted ON posts (account_id, posted_at);
CREATE TABLE search_documents (id INTEGER NOT NULL, doc_type VARCHAR(20) NOT NULL, account_id INTEGER,
  post_id INTEGER, handle VARCHAR(200), title VARCHAR(400), body TEXT, body_lower TEXT, hashtags JSON,
  mentions JSON, domains JSON, risk_score FLOAT, posted_at DATETIME, updated_at DATETIME, PRIMARY KEY (id),
  CONSTRAINT uq_search_doc UNIQUE (doc_type, account_id, post_id));
CREATE INDEX ix_search_documents_doc_type ON search_documents (doc_type);
CREATE INDEX ix_search_documents_account_id ON search_documents (account_id);
CREATE INDEX ix_search_documents_handle ON search_documents (handle);
CREATE INDEX ix_search_documents_risk_score ON search_documents (risk_score);
CREATE INDEX ix_search_documents_posted_at ON search_documents (posted_at);
CREATE TABLE entities (id INTEGER NOT NULL, account_id INTEGER, post_id INTEGER, comment_id INTEGER,
  kind VARCHAR(30) NOT NULL, value VARCHAR(600) NOT NULL, value_lower VARCHAR(600) NOT NULL,
  domain VARCHAR(300), source_field VARCHAR(40), created_at DATETIME, PRIMARY KEY (id));
CREATE INDEX ix_entities_account_id ON entities (account_id);
CREATE INDEX ix_entities_post_id ON entities (post_id);
CREATE INDEX ix_entities_kind ON entities (kind);
CREATE INDEX ix_entities_value_lower ON entities (value_lower);
CREATE INDEX ix_entities_domain ON entities (domain);
''')
posts = [(1, 7, 'a', '2026-09-20 10:00:00.000000'), (2, 7, 'b', None), (3, 7, 'c', '2026-09-20 10:00:00.000000'),
         (4, 7, 'd', '2026-09-19 09:00:00.000000'), (5, 8, 'e', None), (6, 7, 'f', None),
         (7, 7, 'g', '2026-09-21 08:00:00.000000')]
db.executemany('INSERT INTO posts (id, account_id, platform_post_id, posted_at) VALUES (?, ?, ?, ?)', posts)
docs = [(1, 'account', 3, None), (2, 'post', 1, 10), (3, 'account', 1, None), (4, 'post', 3, 11),
        (5, 'post', 2, 12), (6, 'account', 2, None), (7, 'post', 1, 13)]
db.executemany("INSERT INTO search_documents (id, doc_type, account_id, post_id, body_lower, handle) "
               "VALUES (?, ?, ?, ?, 'brand', 'h')", docs)
db.executemany("INSERT INTO entities (id, account_id, post_id, kind, value, value_lower) VALUES (?, ?, ?, 'url', 'v', 'v')",
               [(1, 5, None), (2, 4, 1), (3, 5, 2), (4, 5, None), (5, 4, None), (6, 5, 3)])
q = lambda sql, args=(): [row[0] for row in db.execute(sql, args)]
OUT.write_text(json.dumps({
    'posts': posts, 'docs': docs,
    'posts_of_account': q('SELECT posts.id FROM posts WHERE posts.account_id = ?', (7,)),
    'posts_for_dossier': q('SELECT posts.id FROM posts WHERE posts.account_id = ? '
                           'ORDER BY posts.posted_at DESC NULLS LAST LIMIT ? OFFSET ?', (7, 40, 0)),
    'docs_in': q('SELECT search_documents.id FROM search_documents WHERE search_documents.account_id '
                 'IN (?, ?, ?) LIMIT ? OFFSET ?', (3, 1, 2, 2000, 0)),
    'docs_in_like': q("SELECT search_documents.id FROM search_documents WHERE search_documents.account_id "
                      "IN (?, ?, ?) AND (search_documents.body_lower LIKE ? ESCAPE '\\' OR "
                      "lower(search_documents.handle) LIKE ? ESCAPE '\\') LIMIT ? OFFSET ?",
                      (3, 1, 2, '%brand%', '%brand%', 2000, 0)),
    'docs_like': q("SELECT search_documents.id FROM search_documents WHERE (search_documents.body_lower "
                   "LIKE ? ESCAPE '\\') LIMIT ? OFFSET ?", ('%brand%', 2000, 0)),
    'entities_of_account': q('SELECT entities.id FROM entities WHERE entities.account_id = ? LIMIT ? OFFSET ?',
                             (5, 500, 0)),
    'sqlite_version': sqlite3.sqlite_version,
}, indent=1))
print(OUT.read_text())
```

Run: `python tests/golden/sqlite_order.py`
Expected: it prints JSON. Record the observed orders in a comment at the top of `sqlite-order.js`. The expected
result is:
- `posts_of_account`: posted_at ascending with NULLs first, then id: `[2, 6, 4, 1, 3, 7]`
- `posts_for_dossier`: the exact reverse, `[7, 3, 1, 4, 6, 2]`
- `docs_in` and `docs_in_like`: account_id ascending, then id: `[2, 3, 7, 5, 6, 1, 4]`
- `docs_like`: `[1, 2, 3, 4, 5, 6, 7]`
- `entities_of_account`: `[1, 3, 4, 6]`

If SQLite prints anything different, the printed order is the contract.

- [ ] **Step 6: Write the failing store and SQLite-order tests**

`tests/server/store.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import * as realFs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IntegrityError, createStore } from '../../server/store.js';

test('insert assigns max+1 ids, reusing the max after it is deleted (SQLite rowid)', () => {
  const store = createStore();
  const docs = store.table('search_documents');
  const a = docs.insert({ doc_type: 'account', account_id: 1, post_id: null });
  const b = docs.insert({ doc_type: 'post', account_id: 1, post_id: 5 });
  assert.deepEqual([a.id, b.id], [1, 2]);
  docs.remove(b.id);
  assert.equal(docs.insert({ doc_type: 'post', account_id: 1, post_id: 6 }).id, 2);
});

test('unique keys reject duplicates, and a null part disables the check like SQL', () => {
  const store = createStore();
  const posts = store.table('posts');
  posts.insert({ account_id: 1, platform_post_id: 'x' });
  assert.throws(() => posts.insert({ account_id: 1, platform_post_id: 'x' }), IntegrityError);
  posts.insert({ account_id: 1, platform_post_id: null });
  posts.insert({ account_id: 1, platform_post_id: null });
  assert.equal(posts.byUnique(0, 1, 'x').platform_post_id, 'x');
  const row = posts.find(p => p.platform_post_id === null);
  posts.update(row.id, { platform_post_id: 'y' });
  assert.equal(posts.byUnique(0, 1, 'y').id, row.id);
});

test('audit_logs keeps the latest 5000 rows', () => {
  const store = createStore();
  const logs = store.table('audit_logs');
  for (let i = 0; i < 5002; i++) logs.insert({ action: `a${i}` });
  assert.equal(logs.count(), 5000);
  assert.equal(logs.all()[0].action, 'a2');
});

test('flush writes atomically and load restores every table', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-'));
  const file = join(dir, 'data', 'darkmap.json');
  const store = createStore({ file });
  store.table('brands').insert({ name: 'Acme', official_handles: ['acme'] });
  store.save();
  await store.flush();
  const again = createStore({ file });
  again.load();
  assert.equal(again.table('brands').find(b => b.name === 'Acme').official_handles[0], 'acme');
  assert.equal(again.table('brands').insert({ name: 'B' }).id, 2);
});

test('rename retries on EPERM and never truncates the previous file (Review Focus 5)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-'));
  const file = join(dir, 'darkmap.json');
  writeFileSync(file, JSON.stringify({ version: 1, tables: { brands: [{ id: 1, name: 'Old' }] } }));
  let failures = 2;
  const fs = { ...realFs, renameSync(from, to) {
    if (failures-- > 0) throw Object.assign(new Error('locked'), { code: 'EPERM' });
    return realFs.renameSync(from, to);
  } };
  const store = createStore({ file, fs });
  store.load();
  store.table('brands').insert({ name: 'New' });
  store.save();
  await store.flush();
  assert.match(readFileSync(file, 'utf8'), /"New"/);

  const alwaysLocked = { ...realFs, renameSync() { throw Object.assign(new Error('locked'), { code: 'EBUSY' }); } };
  const locked = createStore({ file, fs: alwaysLocked });
  locked.load();
  locked.table('brands').insert({ name: 'Lost?' });
  locked.save();
  await assert.rejects(locked.flush(), /EBUSY|locked/);
  assert.match(readFileSync(file, 'utf8'), /"New"/);
});

test('a corrupt data file is reported, not overwritten', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-'));
  const file = join(dir, 'darkmap.json');
  writeFileSync(file, '{not json');
  assert.throws(() => createStore({ file }).load(), /corrupt/);
  assert.equal(readFileSync(file, 'utf8'), '{not json');
  assert.ok(existsSync(file));
});
```

`tests/server/sqlite-order.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { createStore } from '../../server/store.js';
import { entitiesOfAccount, postsForDossier, postsOfAccount, searchDocsForAccounts } from '../../server/sqlite-order.js';

test('store query orders reproduce SQLite', () => {
  const g = golden('sqlite-order');
  const store = createStore();
  for (const [, account_id, platform_post_id, posted] of g.posts) {
    store.table('posts').insert({ account_id, platform_post_id, posted_at: posted && posted.replace(' ', 'T').replace('.000000', '') });
  }
  for (const [, doc_type, account_id, post_id] of g.docs) store.table('search_documents').insert({ doc_type, account_id, post_id });
  for (const [account_id, post_id] of [[5, null], [4, 1], [5, 2], [5, null], [4, null], [5, 3]]) {
    store.table('entities').insert({ account_id, post_id, kind: 'url', value: 'v', value_lower: 'v' });
  }
  assert.deepEqual(postsOfAccount(store, 7).map(p => p.id), g.posts_of_account);
  assert.deepEqual(postsForDossier(store, 7, 40).map(p => p.id), g.posts_for_dossier);
  assert.deepEqual(searchDocsForAccounts(store, [3, 1, 2]).map(d => d.id), g.docs_in);
  assert.deepEqual(searchDocsForAccounts(store, [3, 1, 2]).map(d => d.id), g.docs_in_like);
  assert.deepEqual(store.table('search_documents').all().map(d => d.id), g.docs_like);
  assert.deepEqual(entitiesOfAccount(store, 5).map(e => e.id), g.entities_of_account);
});
```

Run: `node --test tests/server/store.test.js tests/server/sqlite-order.test.js`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 7: Implement `server/store.js`**

```js
// In-memory tables mirroring REF models.py, saved atomically to one JSON file (spec §10).
import * as nodeFs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';

export const newId = () => randomBytes(16).toString('hex');
export class IntegrityError extends Error {}
const key = (...parts) => (parts.some(part => part == null) ? null : parts.map(String).join('\u0000'));

// Unique constraints of REF models.py; a key with a null part is not enforced (SQL NULL semantics).
export const SCHEMA = {
  brands: { unique: [r => key(r.name)] },
  accounts: { unique: [r => key(r.platform, r.handle_lower)] },
  posts: { unique: [r => key(r.account_id, r.platform_post_id)] },
  media_assets: {}, comments: {}, entities: {},
  search_documents: { unique: [r => key(r.doc_type, r.account_id, r.post_id)] },
  risk_assessments: {}, account_snapshots: {}, evidence_artifacts: {},
  campaigns: { unique: [r => key(r.public_id), r => key(r.cluster_key)] },
  campaign_members: { unique: [r => key(r.campaign_id, r.account_id)] },
  investigation_cases: { unique: [r => key(r.public_id)] },
  case_evidence: { unique: [r => key(r.case_id, r.artifact_id)] },
  jobs: { unique: [r => key(r.public_id)] },
  audit_logs: { cap: 5000 },
  quota_counters: { unique: [r => key(r.scope, r.window)] },
};

class Table {
  constructor(name, spec) {
    this.name = name;
    this.spec = spec;
    this.rows = new Map();
    this.indexes = (spec.unique ?? []).map(() => new Map());
  }
  #keys(row) { return (this.spec.unique ?? []).map(fn => fn(row)); }
  #assertUnique(row, selfId) {
    this.#keys(row).forEach((value, i) => {
      if (value != null && this.indexes[i].has(value) && this.indexes[i].get(value) !== selfId) {
        throw new IntegrityError(`UNIQUE constraint failed: ${this.name}`);
      }
    });
  }
  #index(row) { this.#keys(row).forEach((value, i) => { if (value != null) this.indexes[i].set(value, row.id); }); }
  #unindex(row) { this.#keys(row).forEach((value, i) => { if (value != null) this.indexes[i].delete(value); }); }
  #maxId() { let max = 0; for (const id of this.rows.keys()) if (id > max) max = id; return max; }
  insert(values) {
    const row = { ...values, id: this.#maxId() + 1 };
    this.#assertUnique(row, null);
    this.rows.set(row.id, row);
    this.#index(row);
    if (this.spec.cap && this.rows.size > this.spec.cap) this.remove(this.rows.keys().next().value);
    return row;
  }
  get(id) { return this.rows.get(Number(id)) ?? null; }
  update(id, patch) {
    const row = this.get(id);
    if (!row) return null;
    this.#assertUnique({ ...row, ...patch }, row.id);
    this.#unindex(row);
    Object.assign(row, patch);
    this.#index(row);
    return row;
  }
  remove(id) {
    const row = this.get(id);
    if (!row) return;
    this.#unindex(row);
    this.rows.delete(row.id);
  }
  removeWhere(predicate) { for (const row of [...this.rows.values()]) if (predicate(row)) this.remove(row.id); }
  all() { return [...this.rows.values()].sort((a, b) => a.id - b.id); }
  where(predicate) { return this.all().filter(predicate); }
  find(predicate) { return this.all().find(predicate) ?? null; }
  byUnique(indexNo, ...parts) {
    const id = this.indexes[indexNo]?.get(key(...parts));
    return id == null ? null : this.get(id);
  }
  count() { return this.rows.size; }
  load(rows) { this.rows.clear(); this.indexes.forEach(index => index.clear()); for (const row of rows) { this.rows.set(row.id, row); this.#index(row); } }
}

export function createStore({ file = null, fs = nodeFs, debounceMs = 250 } = {}) {
  const tables = new Map(Object.entries(SCHEMA).map(([name, spec]) => [name, new Table(name, spec)]));
  let timer = null;
  let pending = Promise.resolve();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function write() {
    if (!file) return;
    const body = JSON.stringify({ version: 1, tables: Object.fromEntries([...tables].map(([n, t]) => [n, t.all()])) });
    fs.mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, body);
    for (let attempt = 1; ; attempt++) {
      try { fs.renameSync(temp, file); return; }
      catch (error) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 5) {
          try { fs.unlinkSync(temp); } catch { /* leave nothing behind */ }
          throw error;
        }
        await sleep(50 * attempt);   // antivirus/indexer briefly holds the file on Windows
      }
    }
  }
  return {
    table(name) {
      const table = tables.get(name);
      if (!table) throw new Error(`unknown table ${name}`);
      return table;
    },
    save() {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; pending = pending.then(write); pending.catch(() => {}); }, debounceMs);
    },
    flush() {
      if (timer) { clearTimeout(timer); timer = null; pending = pending.then(write); }
      return pending;
    },
    load() {
      if (!file || !fs.existsSync(file)) return;
      let data;
      try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch { throw new Error(`data file is corrupt: ${file}. Move it aside to start with an empty store.`); }
      for (const [name, rows] of Object.entries(data.tables ?? {})) tables.get(name)?.load(rows);
    },
  };
}
```

- [ ] **Step 8: Implement `server/sqlite-order.js` and `server/audit.js`**

`server/sqlite-order.js`. Update its header comment with the orders SQLite printed in Step 5:

```js
// REF runs on SQLite; queries without ORDER BY return rows in the order SQLite's plan reads them.
// Pinned by tests/golden/sqlite_order.py:
//   posts WHERE account_id=?           -> ix_posts_account_posted: posted_at ASC (NULLs first), then id
//   ... ORDER BY posted_at DESC NULLS LAST -> backward index scan: the exact reverse
//   search_documents WHERE account_id IN (...) -> ix_search_documents_account_id: account_id, then id
//   entities WHERE account_id=?        -> ix_entities_account_id: id
const nullsFirst = (a, b) => (a == null ? (b == null ? 0 : -1) : b == null ? 1 : a < b ? -1 : a > b ? 1 : 0);

export const postsOfAccount = (store, accountId) => store.table('posts').where(p => p.account_id === accountId)
  .sort((x, y) => nullsFirst(x.posted_at, y.posted_at) || x.id - y.id);
export const postsForDossier = (store, accountId, limit) => postsOfAccount(store, accountId).reverse().slice(0, limit);
export function searchDocsForAccounts(store, accountIds) {
  const wanted = new Set(accountIds);
  return store.table('search_documents').where(d => wanted.has(d.account_id))
    .sort((x, y) => x.account_id - y.account_id || x.id - y.id);
}
export const entitiesOfAccount = (store, accountId) => store.table('entities').where(e => e.account_id === accountId);
export const mediaOfPost = (store, postId) => store.table('media_assets').where(m => m.post_id === postId);
export const commentsOfPost = (store, postId) => store.table('comments').where(c => c.post_id === postId);
```

If Step 5 printed a different order for any query, change that helper so the test in Step 6 passes.

`server/audit.js`:

```js
// REF darkmap/audit.py: append-only audit rows.
import { pySlice } from './engine/pycompat.js';
import { utcnowIso } from './time.js';

export function record(store, { action, provider = null, target = null, status = null, lawful_basis = null,
  duration_ms = null, actor = 'system', detail = null } = {}, clock = Date.now) {
  return store.table('audit_logs').insert({ at: utcnowIso(clock), actor, action, provider,
    target: pySlice(target || '', 0, 400), status, lawful_basis, duration_ms, detail: detail || {} });
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `node --test tests/server/store.test.js tests/server/sqlite-order.test.js tests/server/time.test.js`
Expected: PASS.

---

### Task 9: Raw containers and `normalize.py` with the three approved fixes

**Files:**
- Create: `server/raw.js`, `server/normalize.js`
- Test: `tests/server/normalize.test.js`

**Interfaces:**
- Consumes: store and `sqlite-order.js` (Task 8), `audit.record` (Task 8), `extract.js` (Task 5), `pycompat.js`,
  `time.js`.
- Produces `server/raw.js`: `rawMedia(f)`, `rawComment(f)`, `rawPost(f)`, `rawAccount(f)`,
  `rawBundle(account, posts, provenance)`. These are plain objects with REF `providers/base.py` fields, defaults and
  field order.
- Produces `server/normalize.js`:
  - `isDiscoveryGrade(provenance) → boolean`
  - `upsertAccount(store, bundle, {clock}) → account row`
  - `ingestBundle(store, bundle, {brand, clock}) → {posts, media, comments, account_id}`
  - `reindexAccount(store, account, {clock})`

- [ ] **Step 1: Write the failing tests**

`tests/server/normalize.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../server/store.js';
import { rawAccount, rawBundle, rawComment, rawMedia, rawPost } from '../../server/raw.js';
import { ingestBundle } from '../../server/normalize.js';

const fetched = { provider: 'scrapingdog_instagram', collection_mode: 'keyword', lawful_basis: 'licensed_public_data_api' };
const snippet = { ...fetched, collection_mode: 'keyword_serp_fallback' };
const account = (fields = {}) => rawAccount({ handle: 'luminaire.support', display_name: 'Luminaire Support',
  biography: 'Official help desk #luminaire', followers_count: 120, ...fields });
const post = (fields = {}) => rawPost({ platform_post_id: '901', shortcode: 'ABC', post_type: 'reel',
  permalink: 'https://www.instagram.com/reel/ABC/', caption: 'Claim now t.me/lootdeal #loot', ...fields });

test('REF test_ingest_bundle_is_idempotent: re-ingesting the same bundle keeps one of everything', () => {
  const store = createStore();
  const bundle = rawBundle(account(), [post({ media: [rawMedia({ media_type: 'image', media_url: 'https://cdn/x.jpg' })],
    comments: [rawComment({ platform_comment_id: 'c1', author_handle: 'v', text: 'scammed me' })] })], fetched);
  const first = ingestBundle(store, bundle);
  const second = ingestBundle(store, structuredClone(bundle));
  assert.equal(first.account_id, second.account_id);
  assert.deepEqual(second, { posts: 1, media: 1, comments: 1, account_id: first.account_id });
  assert.equal(store.table('posts').count(), 1);
  assert.equal(store.table('media_assets').count(), 1);
  assert.equal(store.table('comments').count(), 1);
  assert.equal(store.table('search_documents').count(), 2);
});

test('REF test_missing_verification_metadata_remains_unknown', () => {
  const store = createStore();
  const { account_id } = ingestBundle(store, rawBundle(account({ is_verified: null }), [], fetched));
  assert.equal(store.table('accounts').get(account_id).is_verified, null);
});

test('FIX-1: a search snippet never overwrites a fetched profile (REF would)', () => {
  const store = createStore();
  const { account_id } = ingestBundle(store, rawBundle(account(), [], fetched));
  ingestBundle(store, rawBundle(account({ display_name: 'luminaire.support', biography: 'Instagram · snippet text',
    followers_count: null, external_url: 'https://luminaire-help.xyz' }), [], snippet));
  const row = store.table('accounts').get(account_id);
  assert.equal(row.display_name, 'Luminaire Support');
  assert.equal(row.biography, 'Official help desk #luminaire');
  assert.equal(row.external_url, 'https://luminaire-help.xyz');   // null fields may still be filled
  assert.equal(row.provenance.collection_mode, 'keyword');
});

test('FIX-2: re-import keeps entities of posts absent from the new bundle (REF deletes them)', () => {
  const store = createStore();
  const { account_id } = ingestBundle(store, rawBundle(account(), [post()], fetched));
  ingestBundle(store, rawBundle(account(), [post({ platform_post_id: '902', shortcode: 'DEF',
    permalink: 'https://www.instagram.com/reel/DEF/', caption: 'new post' })], fetched));
  const values = store.table('entities').where(e => e.account_id === account_id).map(e => e.value);
  assert.ok(values.includes('t.me/lootdeal'), values.join(','));
  const doc = store.table('search_documents').find(d => d.post_id === 1);
  assert.deepEqual(doc.hashtags, ['loot']);
});

test('FIX-3: one post is one row across snippet and fetched records, and a snippet never overwrites it', () => {
  const store = createStore();
  const url = 'https://www.instagram.com/reel/ABC/';
  ingestBundle(store, rawBundle(account(), [post({ platform_post_id: url, caption: 'snippet caption', like_count: null })], snippet));
  ingestBundle(store, rawBundle(account(), [post({ like_count: 77 })], fetched));
  assert.equal(store.table('posts').count(), 1);
  const row = store.table('posts').all()[0];
  assert.equal(row.platform_post_id, '901');
  assert.equal(row.like_count, 77);
  ingestBundle(store, rawBundle(account(), [post({ platform_post_id: url, caption: 'snippet again', like_count: null })], snippet));
  assert.equal(store.table('posts').all()[0].caption, 'Claim now t.me/lootdeal #loot');
});

test('FIX-3: a post with no derivable key is skipped instead of stored with a null key', () => {
  const store = createStore();
  const result = ingestBundle(store, rawBundle(account(), [rawPost({ caption: 'orphan' })], fetched));
  assert.equal(result.posts, 0);
  assert.equal(store.table('posts').count(), 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/server/normalize.test.js`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implement `server/raw.js`**

```js
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
```

- [ ] **Step 4: Implement `server/normalize.js`**

This is a port of REF `darkmap/normalize.py` 1-168. The fixes are marked in the code:
- `FIX-1` (spec §8.1)
- `FIX-2` (spec §8.2)
- `FIX-3` (spec §8.3)
- `FIX-3b`, the consequence of FIX-3 found while planning. With one row per post, a later search snippet would
  overwrite a fetched post, so snippets never overwrite fetched posts either. This is the same rule as FIX-1, applied
  to posts.

```js
// Port of REF darkmap/normalize.py with the approved data fixes (spec §8).
import { record as auditRecord } from './audit.js';
import { domainOf, extract } from './engine/extract.js';
import { dedupe, or, pyLstrip, pySlice, sorted, truthy } from './engine/pycompat.js';
import { ValueError } from './errors.js';
import { commentsOfPost, entitiesOfAccount, mediaOfPost, postsOfAccount } from './sqlite-order.js';
import { utcnowIso } from './time.js';

const ACCOUNT_FIELDS = ['platform_account_id', 'display_name', 'biography', 'external_url', 'profile_pic_url',
  'is_verified', 'is_business', 'followers_count', 'follows_count', 'media_count', 'account_created_at'];
const ACCOUNT_DEFAULTS = { platform: 'instagram', platform_account_id: null, display_name: null, biography: null,
  external_url: null, profile_pic_url: null, is_verified: null, is_business: null, followers_count: null,
  follows_count: null, media_count: null, account_created_at: null, brand_id: null, latest_risk_score: null,
  latest_action: null, provenance: {}, raw: {} };
const POST_DEFAULTS = { shortcode: null, post_type: 'post', permalink: null, caption: null, caption_lower: null,
  posted_at: null, like_count: null, comment_count: null, view_count: null, share_count: null, language: null,
  provenance: {}, raw: {} };
const lower = value => (typeof value === 'string' ? value.toLowerCase() : null);
const isUrl = value => typeof value === 'string' && /^https?:\/\//.test(value);

export const isDiscoveryGrade = provenance => or(provenance, {}).collection_mode === 'keyword_serp_fallback';

export function upsertAccount(store, bundle, { clock = Date.now } = {}) {
  const ra = bundle.account;
  const handle = pyLstrip(or(ra.handle, ''), '@');
  if (!handle) throw new ValueError('bundle has no account handle');
  const accounts = store.table('accounts');
  const now = utcnowIso(clock);
  let acc = accounts.byUnique(0, ra.platform, handle.toLowerCase());
  const existed = acc != null;
  if (!acc) acc = accounts.insert({ ...ACCOUNT_DEFAULTS, platform: ra.platform, handle,
    handle_lower: handle.toLowerCase(), first_seen_at: now, last_seen_at: now });
  // FIX-1: a discovery-grade bundle may only fill fields that are still null on an already-fetched account.
  const protect = existed && isDiscoveryGrade(bundle.provenance) && !isDiscoveryGrade(acc.provenance);
  for (const field of ACCOUNT_FIELDS) {
    const value = ra[field];
    if (value != null && (!protect || acc[field] == null)) acc[field] = value;
  }
  acc.last_seen_at = now;
  if (!protect) {
    acc.provenance = or(bundle.provenance, {});
    acc.raw = or(ra.raw, {});
  }
  return acc;
}

function storeEntities(store, { account_id, post_id, comment_id, text, source_field, now }) {
  const found = extract(text);
  for (const [kind, values] of Object.entries(found)) {
    for (const value of values) {
      store.table('entities').insert({ account_id, post_id, comment_id, kind, value: pySlice(value, 0, 600),
        value_lower: pySlice(value.toLowerCase(), 0, 600), domain: kind === 'url' ? domainOf(value) : null,
        source_field, created_at: now });
    }
  }
}

// FIX-3: identify a post by shortcode first, then by REF's key (platform_post_id or shortcode or permalink).
const refKey = rp => or(rp.platform_post_id, rp.shortcode, rp.permalink);
function findPost(store, accountId, rp) {
  const posts = store.table('posts');
  if (truthy(rp.shortcode)) {
    const byCode = posts.find(p => p.account_id === accountId && p.shortcode === rp.shortcode);
    if (byCode) return byCode;
  }
  const pid = refKey(rp);
  return truthy(pid) ? posts.byUnique(0, accountId, pid) : null;
}

export function ingestBundle(store, bundle, { brand = null, clock = Date.now } = {}) {
  const now = utcnowIso(clock);
  const acc = upsertAccount(store, bundle, { clock });
  if (brand != null && acc.brand_id == null) acc.brand_id = brand.id;
  const sparse = isDiscoveryGrade(bundle.provenance);
  const matches = bundle.posts.map(rp => findPost(store, acc.id, rp));
  // FIX-3b: fetched posts are protected from discovery-grade bundles, exactly like FIX-1 protects accounts.
  const isProtected = post => post != null && sparse && !isDiscoveryGrade(post.provenance);
  // FIX-2: delete only profile-level entities and those of posts this bundle rewrites.
  const rewritten = new Set(matches.filter(p => p && !isProtected(p)).map(p => p.id));
  store.table('entities').removeWhere(e => e.account_id === acc.id && (e.post_id == null || rewritten.has(e.post_id)));
  storeEntities(store, { account_id: acc.id, post_id: null, comment_id: null,
    text: [acc.biography, acc.display_name].filter(truthy).join(' '), source_field: 'bio', now });
  if (truthy(acc.external_url)) {
    store.table('entities').insert({ account_id: acc.id, post_id: null, comment_id: null, kind: 'url',
      value: pySlice(acc.external_url, 0, 600), value_lower: pySlice(acc.external_url.toLowerCase(), 0, 600),
      domain: domainOf(acc.external_url), source_field: 'external_url', created_at: now });
  }
  const counts = { posts: 0, media: 0, comments: 0 };
  bundle.posts.forEach((rp, index) => {
    let post = matches[index];
    const pid = refKey(rp);
    if (post == null && !truthy(pid)) return;                       // FIX-3: no derivable key
    if (isProtected(post)) { counts.posts += 1; return; }            // FIX-3b
    const posts = store.table('posts');
    if (post == null) post = posts.insert({ ...POST_DEFAULTS, account_id: acc.id, platform_post_id: pid });
    else if (truthy(rp.platform_post_id) && !isUrl(rp.platform_post_id) && post.platform_post_id !== rp.platform_post_id) {
      posts.update(post.id, { platform_post_id: rp.platform_post_id });   // FIX-3: fetched id replaces a URL key
    }
    Object.assign(post, { shortcode: rp.shortcode, post_type: or(rp.post_type, 'post').toLowerCase(),
      permalink: rp.permalink, caption: rp.caption, caption_lower: lower(rp.caption), posted_at: rp.posted_at,
      like_count: rp.like_count, comment_count: rp.comment_count, view_count: rp.view_count,
      share_count: rp.share_count, language: rp.language, provenance: or(bundle.provenance, {}),
      raw: or(rp.raw, {}), ingested_at: now });
    counts.posts += 1;
    store.table('media_assets').removeWhere(m => m.post_id === post.id);
    for (const rm of rp.media) {
      const observations = { ...or(rm.exif, {}) };
      for (const k of ['transcript', 'qr_payloads', 'brand_match_score', 'synthetic_media_score']) {
        const value = rm[k];
        if (!(value == null || value === '' || (Array.isArray(value) && value.length === 0))) observations[k] = value;
      }
      store.table('media_assets').insert({ post_id: post.id, media_type: rm.media_type, media_url: rm.media_url,
        thumbnail_url: rm.thumbnail_url, width: rm.width, height: rm.height, duration_seconds: rm.duration_seconds,
        mime_type: rm.mime_type, byte_size: rm.byte_size, perceptual_hash: rm.perceptual_hash,
        ocr_text: rm.ocr_text, exif: observations, provenance: or(bundle.provenance, {}) });
      counts.media += 1;
    }
    store.table('comments').removeWhere(c => c.post_id === post.id);
    for (const rc of rp.comments) {
      const comment = store.table('comments').insert({ post_id: post.id, platform_comment_id: rc.platform_comment_id,
        parent_platform_comment_id: rc.parent_platform_comment_id, author_handle: rc.author_handle, text: rc.text,
        text_lower: lower(rc.text), like_count: rc.like_count, created_at: rc.created_at,
        provenance: or(bundle.provenance, {}) });
      counts.comments += 1;
      storeEntities(store, { account_id: acc.id, post_id: post.id, comment_id: comment.id, text: or(rc.text, ''),
        source_field: 'comment', now });
    }
    storeEntities(store, { account_id: acc.id, post_id: post.id, comment_id: null,
      text: [rp.caption, ...rp.media.map(m => m.ocr_text)].filter(truthy).join(' '), source_field: 'caption', now });
  });
  reindexAccount(store, acc, { clock });
  const provenance = or(bundle.provenance, {});
  auditRecord(store, { action: 'ingest.normalize', provider: provenance.provider ?? null, target: acc.handle,
    status: 'ok', lawful_basis: provenance.lawful_basis ?? null, detail: { ...counts } }, clock);
  return { ...counts, account_id: acc.id };
}

export function reindexAccount(store, acc, { clock = Date.now } = {}) {
  const now = utcnowIso(clock);
  const ents = entitiesOfAccount(store, acc.id);
  const vals = (kind, postId = null) => sorted(dedupe(ents
    .filter(e => e.kind === kind && (postId == null || e.post_id === postId)).map(e => e.value_lower)));
  const docs = store.table('search_documents');
  docs.removeWhere(d => d.account_id === acc.id);
  const body = [acc.display_name, acc.biography, acc.external_url].filter(truthy).join(' \n ');
  docs.insert({ doc_type: 'account', account_id: acc.id, post_id: null, handle: acc.handle,
    title: or(acc.display_name, acc.handle), body, body_lower: (body || '').toLowerCase(),
    hashtags: vals('hashtag'), mentions: vals('mention'),
    domains: sorted(dedupe(ents.filter(e => e.kind === 'url' && truthy(e.domain)).map(e => e.domain))),
    risk_score: acc.latest_risk_score, posted_at: acc.last_seen_at, updated_at: now });
  for (const post of postsOfAccount(store, acc.id)) {
    const ocr = mediaOfPost(store, post.id).map(m => or(m.ocr_text, '')).join(' ');
    const commentText = commentsOfPost(store, post.id).map(c => or(c.text, '')).join(' \n ');
    const postBody = [post.caption, ocr, commentText].filter(truthy).join(' \n ');
    docs.insert({ doc_type: 'post', account_id: acc.id, post_id: post.id, handle: acc.handle,
      title: `${acc.handle} ${post.post_type}`, body: postBody, body_lower: (postBody || '').toLowerCase(),
      hashtags: vals('hashtag', post.id), mentions: vals('mention', post.id),
      domains: sorted(dedupe(ents.filter(e => e.kind === 'url' && e.post_id === post.id && truthy(e.domain))
        .map(e => e.domain))),
      risk_score: acc.latest_risk_score, posted_at: post.posted_at, updated_at: now });
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/server/normalize.test.js`
Expected: PASS (6 tests).

---

### Task 10: `dossier.py` and `intelligence.py` ports

**Files:**
- Create: `server/engine/dossier.js`, `server/engine/intelligence.js`
- Test: `tests/engine/intelligence.test.js`

**Interfaces:**
- Consumes: store, `sqlite-order.js`, `normalize.isDiscoveryGrade`, `time.js`, `pycompat.js`, and
  `newId` (Task 8).
- Produces `server/engine/dossier.js`:
  - `postDocument(store, post) → object`, a port of REF dossier.py:13-38 with `MAX_COMMENTS = 12`
  - `buildDossier(store, accountId, {brandId, mediaAnalysis}) → dossier`, a port of :56-116 with `MAX_POSTS = 40`
    via `postsForDossier` and entities `.slice(0, 500)`
- Produces `server/engine/intelligence.js`:
  - `PIVOT_KINDS`, `PROFILE_FIELDS`
  - `canonicalJson(v)`, `hashValue(v)`
  - `profileState(account)`, `profileChanges(store, account, {clock})`, `sharedArtifactContext(store, accountId)`
  - `velocityContext(store, account, {clock})`, `enrichDossier(store, account, dossier, {clock})`
  - `finalizeAssessment(store, account, assessment, dossier, {clock}) → {snapshot_id, evidence_artifacts,
    campaign_id}`

- [ ] **Step 1: Write the failing tests**

`tests/engine/intelligence.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../server/store.js';
import { rawAccount, rawBundle, rawPost } from '../../server/raw.js';
import { ingestBundle } from '../../server/normalize.js';
import { buildDossier } from '../../server/engine/dossier.js';
import { enrichDossier, finalizeAssessment, profileChanges, sharedArtifactContext, velocityContext }
  from '../../server/engine/intelligence.js';

const fetched = { provider: 'scrapingdog_instagram', collection_mode: 'keyword', lawful_basis: 'licensed_public_data_api' };
const snippet = { ...fetched, collection_mode: 'keyword_serp_fallback' };
const clock = () => Date.UTC(2026, 8, 23, 12, 0, 0);

test('dossier caps posts at 40 (newest first, SQLite order) and comments at 12', () => {
  const store = createStore();
  const posts = Array.from({ length: 45 }, (_, i) => rawPost({ platform_post_id: `p${i}`, shortcode: `S${i}`,
    posted_at: `2026-09-${String(1 + (i % 20)).padStart(2, '0')}T00:00:00`, caption: `c${i}` }));
  const { account_id } = ingestBundle(store, rawBundle(rawAccount({ handle: 'many' }), posts, fetched), { clock });
  const doc = buildDossier(store, account_id);
  assert.equal(doc.posts.length, 40);
  assert.ok(doc.posts[0].posted_at >= doc.posts[39].posted_at);
  assert.deepEqual(Object.keys(doc), ['brand', 'account', 'provenance', 'posts', 'entities', 'media_analysis']);
});

test('shared artifacts link accounts that reuse a UPI id or URL', () => {
  const store = createStore();
  const upi = rawPost({ platform_post_id: '1', shortcode: 'A', caption: 'pay to scam.help@ybl now' });
  const a = ingestBundle(store, rawBundle(rawAccount({ handle: 'one' }), [upi], fetched), { clock });
  const b = ingestBundle(store, rawBundle(rawAccount({ handle: 'two' }), [{ ...upi, platform_post_id: '2', shortcode: 'B' }], fetched), { clock });
  const shared = sharedArtifactContext(store, a.account_id);
  assert.deepEqual(shared.map(s => [s.kind, s.value, s.account_count, s.linked_account_ids]),
    [['upi', 'scam.help@ybl', 2, [b.account_id]]]);
});

test('profile changes use fetched snapshots only (FIX-1 consequence) and velocity counts recent posts', () => {
  const store = createStore();
  const first = ingestBundle(store, rawBundle(rawAccount({ handle: 'brandx', display_name: 'brandx' }), [], snippet), { clock });
  const account = store.table('accounts').get(first.account_id);
  const assessment = store.table('risk_assessments').insert({ account_id: account.id, overall_score: 0, evidence: [] });
  finalizeAssessment(store, account, assessment, { account_changes: [], shared_artifacts: [], posts: [], account: {} }, { clock });
  assert.equal(store.table('account_snapshots').count(), 0, 'discovery-grade state is never snapshotted');
  ingestBundle(store, rawBundle(rawAccount({ handle: 'brandx', display_name: 'Brand X Official', biography: 'Real bio' }), [], fetched), { clock });
  assert.deepEqual(profileChanges(store, account, { clock }), [], 'first fetched profile has no prior snapshot');
  finalizeAssessment(store, account, assessment, { account_changes: [], shared_artifacts: [], posts: [], account: {} }, { clock });
  assert.equal(store.table('account_snapshots').count(), 1);
  account.biography = 'Changed bio';
  assert.deepEqual(profileChanges(store, account, { clock }).map(c => c.field), ['biography']);
  const velocity = velocityContext(store, account, { clock });
  assert.deepEqual(Object.keys(velocity), ['posts_last_hour', 'posts_last_24h', 'follower_delta', 'duplicate_post_count']);
});

test('enrichDossier adds account_changes, shared_artifacts and velocity in REF order', () => {
  const store = createStore();
  const { account_id } = ingestBundle(store, rawBundle(rawAccount({ handle: 'solo' }), [], fetched), { clock });
  const doc = buildDossier(store, account_id);
  enrichDossier(store, store.table('accounts').get(account_id), doc, { clock });
  assert.deepEqual(Object.keys(doc).slice(-3), ['account_changes', 'shared_artifacts', 'velocity']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/engine/intelligence.test.js`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implement `server/engine/dossier.js`**

This is a port of REF `darkmap/dossier.py`:
- `postDocument` (:13-38): output keys in REF order. `engagement` is `{likes, comments, views, shares}` from the post
  row. `media` is the rows from `mediaOfPost` in REF key order, with `analysis: or(m.exif, {})`. `comments` is
  `commentsOfPost(...).slice(0, 12)`, with `created_at` passed through (it's already an isoformat string or null).
- `brandFor` (:41-53):
  - By id when given, then `acc.brand_id`.
  - Otherwise take the first brand, in id order, whose name or keywords appear in the haystack. The haystack is
    `[acc.handle_lower, lower(bio), lower(display_name)].filter(truthy).join(' ')`, and a token matches when
    `truthy(t) && haystack.includes(t.toLowerCase())`.
- `buildDossier` (:56-116):
  - posts are `postsForDossier(store, acc.id, 40)`
  - `stored_media_analysis` contains an observation only when it's non-empty, built from `{...exif}` plus `ocr_text`
    and `perceptual_hash` when truthy, then updated with `post_id`, `media_id`, `media_url` and `thumbnail_url`
  - entities are `entitiesOfAccount(...).slice(0, 500)`, each mapped to `{kind, value, domain, source_field, post_id,
    comment_id}`
  - `brand` is `{name, official_handles: or(..., []), official_domains, keywords}` or `null`
  - `account` has REF's 12 keys, with `account_created_at` and `first_seen_at` passed through as strings
  - `media_analysis` is `[...(mediaAnalysis ?? []), ...stored]`
  - Throw `ValueError('account {id} not found')` when the account is missing.

- [ ] **Step 4: Implement `server/engine/intelligence.js`**

This is a port of REF `darkmap/intelligence.py`.

**Helpers.** `canonicalJson` matches Python `json.dumps(v, ensure_ascii=False, sort_keys=True, default=str,
separators=(',', ':'))`: sort object keys with `cmpCodePoints`, compact separators, JSON string escaping.
`hashValue = sha256Hex(canonicalJson(v))`.

**Functions, keyed to REF lines:**
- **`profileState`** (:28-34): `{handle, display_name, biography, external_url, profile_pic_url, is_verified:
  Boolean(a.is_verified), followers_count, follows_count, media_count}`.
- **`profileChanges`** (:37-49):
  - FIX-1 guard: return `[]` when `isDiscoveryGrade(account.provenance)`.
  - The previous snapshot is the `account_snapshots` row with the largest id for that account.
  - Each change is `{field, before, after, observed_at: utcnowIso(clock)}`, in `PROFILE_FIELDS` order.
- **`sharedArtifactContext`** (:52-93):
  - `own` is the account's pivot entities: `PIVOT_KINDS` = url, email, phone, upi, crypto_wallet, telegram,
    download.
  - `byPair` is a Map from `kind+'\u0000'+value_lower` to `value`.
  - `matches` is every other account's pivot entities with the same `(kind, value_lower)`.
  - Media hashes: `sorted(dedupe(...))`.
  - Caption templates, preserving REF CORR-10 exactly:
    - Iterate own captions with `truthy(v) && pyLen(pyStrip(v)) >= 40`.
    - Normalize each with `v.replace(new RegExp(S + '+', 'gu'), ' ')` and then `pyStrip`.
    - Compare against other posts' **raw** `caption_lower`.
  - Output is `sorted(out, {key: i => [-i.account_count, i.kind, i.value]})` then `.slice(0, 50)`, and each item has
    keys `kind, value, linked_account_ids (sorted numbers), account_count`.
- **`velocityContext`** (:96-116):
  - `now = toMicros(utcnowIso(clock))`.
  - Count posts whose `posted_at` falls within 24 h or 1 h.
  - Snapshots: the latest 2 by id, descending. `follower_delta = current - snapshots[0].state.followers_count` when
    both are integers.
  - Captions are `pyStrip(normalized(or(caption_lower, '')))`. `duplicated = captions.length - new Set(captions.
    filter(Boolean)).size`, which preserves REF CORR-02.
  - Return `{posts_last_hour, posts_last_24h, follower_delta, duplicate_post_count: Math.max(0, duplicated)}`.
- **`enrichDossier`** (:119-122): assign `account_changes`, `shared_artifacts` and `velocity`, in that order.
- **`captureSnapshot`** (:125-137):
  - FIX-1 guard: return the latest snapshot (or `null`) without writing when `isDiscoveryGrade(account.provenance)`.
  - Skip the write when the fingerprint equals the latest snapshot's.
  - Insert rows as `{account_id, captured_at, fingerprint, state, changes}`.
- **`preserveEvidence`** (:140-172):
  - Take evidence with `weight >= 0.45`.
  - `postIdFromField` reads `posts[N]`.
  - The payload is `{assessment_id, evidence, account, captured_at: utcnowIso(clock)}`, and
    `content_hash = hashValue(payload)`.
  - Dedupe within the call on the hash.
  - `source_url` is the post permalink, or else `https://www.instagram.com/{handle}/`.
- **`clusterCampaign`** (:175-211):
  - `cluster_key` is `hashValue({brand_id, kind, value})` over `shared[0]`.
  - Name the campaign `` `Shared ${kind}: ${pySlice(String(value), 0, 80)}` ``.
  - Summaries, severity and member confidence use `Math.min(0.95, 0.55 + 0.08 * reasons.length)`.
  - A new campaign gets `public_id: newId()`, `status: 'open'`, `first_seen_at` and `last_seen_at`.
- **`finalizeAssessment`** (:214-220): return `{snapshot_id: snapshot?.id ?? null, evidence_artifacts: n,
  campaign_id: campaign?.public_id ?? null}`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/engine/intelligence.test.js`
Expected: PASS (4 tests).

---

### Task 11: `risk.assess_account` port

**Files:**
- Create: `server/engine/risk.js`
- Test: `tests/engine/risk.test.js`

**Interfaces:**
- Consumes:
  - `buildDossier` and `postDocument` (Task 10)
  - `enrichDossier` and `finalizeAssessment` (Task 10)
  - `analyze` (Task 6), and every `risk-core.js` function (Task 7)
  - `reindexAccount` (Task 9), `audit.record` (Task 8)
- Produces: `assessAccount(store, accountId, {brandId, mediaAnalysis, provider, aiWeight = 0.5, clock}) →
  assessment row`.
  - `provider` is `{name, analyze(dossier) → AnalysisResult}`.
  - The default is `{name: 'null', analyze: () => nullAnalysis('ai_provider_not_configured')}`.

- [ ] **Step 1: Write the failing tests by porting REF `tests/test_risk_engine.py:174-400`**

Create `tests/engine/risk.test.js` with one `test()` per REF test, named after it, with the same assertions. Build
REF's `session` fixture data with `ingestBundle`, or with direct `store.table(...).insert(...)` for the rows REF
inserts by hand. Use a fake provider for REF's `AnalysisProvider` subclasses:
`{ name: 'fake', analyze: () => ({ ...nullAnalysis(''), available: true, ... }) }`.

Tests to port:
- `test_assess_account_with_available_ai`
- `test_assess_account_evidence_is_explainable_and_sorted`
- `test_assess_account_action_never_downgrades_below_computed`
- `test_assess_account_ai_limitations_are_merged`
- `test_assess_account_confidence_higher_with_ai`
- `test_assess_account_media_analysis_removes_media_limitation`
- `test_assess_account_without_ai_uses_heuristics_only`
- `test_assess_account_without_ai_flags_missing_context`
- `test_assess_account_metadata_only_source_limitation`
- `test_assess_account_persists_assessment_and_updates_account`
- `test_assess_account_refreshes_account_search_index`
- `test_assess_account_scores_threat_post_beyond_ai_dossier_limit`
- `test_assess_account_reassessment_keeps_single_account_doc`
- `test_assess_account_writes_audit_log`
- `test_assess_account_unknown_account_raises`

This one shows the pattern:

```js
test('test_assess_account_unknown_account_raises', () => {
  const store = createStore();
  assert.throws(() => assessAccount(store, 999), ValueError);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/engine/risk.test.js`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implement `server/engine/risk.js`, a port of REF `darkmap/risk.py:108-215`**

1. `doc = buildDossier(...)`, then `enrichDossier(...)`, then `heur = analyze(doc)`.
2. `aiInput = {...doc, heuristic_signals: heur.signals}`; `ai = provider.analyze(aiInput)`.
3. `fused = fuse(heur, ai, aiWeight)`. If `hasTrustedProfileContext(doc, heur)`, set all categories to 0.0 in
   `CATEGORIES` order and the overall score to 0.0.
4. `confidence = computeConfidence(heur, ai, doc)`.
5. Evidence is `sorted([...heur.signals, ...ai.evidence], {key: e => e.weight ?? 0, reverse: true}).slice(0, 60)`,
   and limitations come from `limitations(doc, heur, ai)`.
6. The action logic follows REF :135-145 exactly, including `order.indexOf` and the `independent_indicators < 2`
   enforce downgrade.
7. `summary = or(ai.summary, fallbackSummary(doc, fused, heur))`.
8. Insert the `risk_assessments` row with these fields:
   - `account_id`
   - `brand_id: or(brandId, account.brand_id)`
   - `overall_score`, `category_scores`, `dimensions: or(heur.dimensions, {})`,
     `alert_families: or(heur.alert_families, {})`, `independent_indicators: or(heur.independent_indicators, 0)`
   - `evidence`, `confidence`, `limitations`, `recommended_action`, `summary`
   - `heuristic_score: heur.overall_score`, `ai_score: ai.available ? ai.overall_score : null`,
     `ai_available: ai.available`
   - `model: or(ai.model, DEFAULT_ANALYSIS_MODEL)`, `engine_version: ENGINE_VERSION`, `created_at: utcnowIso(clock)`
9. Set `account.latest_risk_score` and `account.latest_action`. Then call `finalizeAssessment(...)`, then
   `reindexAccount(...)`.
10. Per-post re-scoring (:181-208):
    - For each `search_documents` row with `doc_type === 'post'` for the account, in store order, use the dossier post
      whose `id` matches. Otherwise use `postDocument(store, storedPost)`, and if the post is missing set
      `risk_score = 0.0`.
    - Build `{...doc, posts: [post], entities: filtered by post_id, media_analysis: filtered by post_id,
      shared_artifacts: [], account_changes: [], content_only: true}`.
    - Set `search_doc.risk_score = analyze(...).overall_score`.
11. Write the audit row: `action: 'risk.assess'`, `provider: provider.name`, `target: handle`, `status: 'ok'`,
    `lawful_basis: or(account.provenance, {}).lawful_basis ?? null`, and `detail: {score, action, ai_available,
    signals: evidence.length, engine_version, ...finalizeResult}`.
12. Return the assessment row.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/engine/risk.test.js`
Expected: PASS (15 tests).

---

### Task 12: `search.py` port, with SQLite `LIKE`/`lower()` semantics

**Files:**
- Create: `server/engine/search.js`, `tests/fixtures/snippets.json`
- Test: `tests/engine/search.test.js`

**Interfaces:**
- Consumes: store and `sqlite-order.js` (Task 8), `pycompat.js`.
- Produces:
  - `search(store, {q, docType, scope = 'all', accountIds, handle, hashtag, mention, domain, minRisk, since, until,
    limit = 25, offset = 0}) → {query, scope, total, total_all, facets, hits}`
  - `snippet(body, term, width = 180)`
  - Each hit has REF's key order (search.py:214-250).

- [ ] **Step 1: Write the fixtures and the failing tests**

`tests/fixtures/snippets.json`:

```json
[["", "x"], ["short body", null], ["A long caption 😀 with Brand appearing late in the text and more words to push past the width limit so that ellipses appear on both sides of the snippet window for sure because it is long enough", "brand"],
 ["no match here", "zzz"], ["नमस्ते Brand ऑफर", "brand"]]
```

`tests/engine/search.test.js`:
- A golden snippet test: `for (const [body, term, expected] of golden('snippets')) assert.equal(snippet(body,
  term), expected)`.
- Port REF `tests/test_integration_controls.py:164-293` with the same fixture rows (inserted through `ingestBundle` or
  direct `store.table` inserts) and the same assertions:
  - `test_search_treats_like_wildcards_as_literals`
  - `test_global_search_covers_structured_entities_and_scopes`
  - `test_global_search_prioritizes_high_risk_impostor_over_official_exact_match`
  - `test_global_search_prioritizes_low_follower_mentions_at_equal_risk`
  - `test_search_uses_profile_photo_when_reel_only_has_a_video_file`
  - `test_strong_fraud_evidence_still_outranks_follower_adjustment`
- Two extra tests:
  - `account_ids order follows SQLite`: two accounts inserted as ids 1 and 2, with `accountIds: [2, 1]` and equal
    rank; hits come back account 1 first.
  - `non-ASCII title does not match under SQLite lower()`: an account whose display name is `ÉCOLE`, searched with
    `q: 'école'`, doesn't match on title, which reproduces SQLite's ASCII-only `lower()`.

- [ ] **Step 2: Regenerate the goldens and verify the tests fail**

Run: `python tests/golden/generate.py`, then `node --test tests/engine/search.test.js`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implement `server/engine/search.js`, a port of REF `darkmap/search.py` 1-252**

**SQLite semantics:**
- `asciiLower(s)` lowercases only A-Z, the way SQLite's `lower()` does.
- `like(haystack, term)` is true when `asciiLower(haystack ?? '').includes(asciiLower(term))`. REF escapes `%` and
  `_`, so LIKE is a literal, ASCII-case-insensitive substring test.
- JSON columns are cast to text the way SQLAlchemy stores them, `json.dumps(list)` with `ensure_ascii=True`, so
  non-ASCII becomes `\uXXXX` escapes. Write `jsonText(list)` that emits `["a", "b"]` with `", "` separators and those
  escapes.

**Row source, taken from `sqlite-order.js`:**
- With `accountIds`, use `searchDocsForAccounts`.
- Otherwise use `store.table('search_documents').all()`.
- Then apply REF's filters in order:
  - `docType`
  - `handle`, compared as `asciiLower(d.handle) === pyLstrip(handle.toLowerCase(), '@')`
  - `minRisk`
  - `since` / `until`, compared as isoformat strings
  - the q-clause across `body_lower`, `lower(handle)`, `lower(title)`, `lower(jsonText(hashtags))`,
    `lower(jsonText(mentions))` and `lower(jsonText(domains))`
- Then `.slice(0, 2000)`.
- An empty `accountIds` array returns REF's empty result (:38-42).

**Everything after the fetch** follows REF :63-252 line by line:
- media are ordered by id and comments by `(created_at, id)` with NULLs first
- `has()` and `contains()` use `pyLstrip(x.toLowerCase(), '#@')`
- keep the order of the `matched_fields` checks
- facets
- scope filtering
- `rank_factors`: numbers exactly as REF; `verified_discount` is -0.9, and the follower buckets use the same
  thresholds
- Sort with `sorted(rows, {key: ([r]) => [rank(r), r.posted_at ?? '0001-01-01T00:00:00'], reverse: true})`. The
  timestamp sentinel stands in for `datetime.min`; isoformat strings compare correctly as strings.
- Hit shaping (:199-250):
  - `image_url` is the first thumbnail, else the first still image whose URL, before any `?`, doesn't end in a video
    extension, else `profile_pic_url`
  - `score: pyRound(rank(r), 3)`
  - `ranking_factors` are each `pyRound(v, 3)`, in REF key order
  - comments are `{author, text, like_count, created_at, parent_id}`
  - provenance is the post's, or else the account's

**Snippet** (:15-24): `snippet(body, term, width)` uses `pyFind(body.toLowerCase(), term.toLowerCase())` and
code-point slicing. `start = Math.max(0, idx - Math.floor(width / 3))`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/engine/search.test.js`
Expected: PASS.

- [ ] **Step 5: Run the whole engine suite (checkpoint)**

Run: `npm test`
Expected: every test from Tasks 1-12 passes, with `fail 0`.

---

### Task 13: Config, credit quota, and the ScrapingDog client

**Files:**
- Create: `server/config.js`, `server/quota.js`, `server/scrapingdog.js`
- Test: `tests/server/scrapingdog.test.js`, `tests/server/quota.test.js`

**Interfaces:**
- Consumes:
  - `ENDPOINTS` from `costs.js` (Task 2); `audit.record`, `createStore` and `time.js` (Task 8)
  - `errors.js`, `stripApiKey` (Tasks 2-3)
- Produces `server/config.js`: `loadConfig(env) → {scrapingdogApiKey, concurrency, timeoutMs, creditBudgetPerSearch,
  creditCapPerDay, creditCapPerMinute, commentsScope, apiKey, maxRequestBytes, cursorSecret, dataFile, port}`.
- Produces `server/quota.js`:
  - `windowsFor(date) → {minute: 'm:YYYYMMDDHHmm', day: 'd:YYYYMMDD'}`
  - `assertRoom(store, scope, cost, config, clock)`, which throws QuotaExceeded
  - `consume(store, scope, cost, config, clock)`
  - `usage(store, scope, clock) → {minute, day}`
- Produces `server/scrapingdog.js`:
  - `PROVIDER = 'scrapingdog_instagram'`, `LAWFUL_BASIS = 'licensed_public_data_api'`
  - `createPool(limit)`
  - `checkSourceAvailability(status, text)`
  - `createClient({config, store, fetchImpl, clock}) → {call(endpointName, params) → Promise<{json, credits,
    status}>, pool}`. `call` throws `NotAuthorized`, `NotFound`, `SourceUnavailable`, `QuotaExceeded` or
    `FetchFailed`, and never charges credits for a failed call.

- [ ] **Step 1: Write the failing tests**

`tests/server/scrapingdog.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../server/store.js';
import { loadConfig } from '../../server/config.js';
import { createClient } from '../../server/scrapingdog.js';
import { FetchFailed, NotAuthorized, QuotaExceeded, SourceUnavailable } from '../../server/errors.js';
import { usage } from '../../server/quota.js';

const config = (env = {}) => loadConfig({ SCRAPINGDOG_API_KEY: 'TEST-KEY', ...env });
const reply = (status, body, headers = {}) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
const clock = () => Date.UTC(2026, 8, 23, 12, 0, 30);

test('success returns JSON, meters credits, and audits the URL without the key', async () => {
  const store = createStore();
  const seen = [];
  const client = createClient({ config: config(), store, clock, fetchImpl: async url => { seen.push(String(url)); return reply(200, { organic_results: [] })(); } });
  const { json, credits } = await client.call('google', { query: 'site:instagram.com "A&B" #x', country: 'in' });
  assert.deepEqual(json, { organic_results: [] });
  assert.equal(credits, 5);
  assert.equal(new URL(seen[0]).searchParams.get('query'), 'site:instagram.com "A&B" #x');
  const row = store.table('audit_logs').all().at(-1);
  assert.equal(row.action, 'http.request');
  assert.doesNotMatch(row.target, /TEST-KEY|api_key/);
  assert.equal(usage(store, 'scrapingdog_instagram', clock).day, 5);
});

test('HTTP 200 with a non-JSON or error body is a failed attempt, not an empty result (Review Focus 3)', async () => {
  for (const body of ['<html>busy</html>', '', { success: false, message: 'Try again' }, { error: 'upstream' }]) {
    const store = createStore();
    const client = createClient({ config: config(), store, clock, fetchImpl: reply(200, body) });
    await assert.rejects(client.call('google', { query: 'q' }), FetchFailed, JSON.stringify(body));
    assert.equal(usage(store, 'scrapingdog_instagram', clock).day, 0, 'failed calls cost nothing');
  }
});

test('status mapping: 401/403 refuse, account errors are SourceUnavailable, 429 carries Retry-After', async () => {
  const store = createStore();
  const call = (status, body, headers) => createClient({ config: config(), store, clock, fetchImpl: reply(status, body, headers) })
    .call('google', { query: 'q' });
  await assert.rejects(call(401, 'no'), NotAuthorized);
  await assert.rejects(call(403, 'forbidden'), NotAuthorized);
  await assert.rejects(call(400, 'Customer is not active'), e => e instanceof SourceUnavailable && e.code === 'source_account_inactive');
  await assert.rejects(call(402, 'x'), e => e instanceof SourceUnavailable && e.code === 'source_credits_required');
  await assert.rejects(call(403, 'Credits exhausted'), e => e instanceof SourceUnavailable && e.code === 'source_credits_required');
  await assert.rejects(call(429, 'slow down', { 'Retry-After': '90' }), e => e instanceof FetchFailed && e.statusCode === 429 && e.retryAfter === '90');
});

test('timeouts become FetchFailed with REF wording', async () => {
  const client = createClient({ config: config(), store: createStore(), clock,
    fetchImpl: async () => { throw Object.assign(new Error('aborted'), { name: 'TimeoutError' }); } });
  await assert.rejects(client.call('google', { query: 'q' }), /The read operation timed out/);
});

test('the pool never runs more than SCRAPINGDOG_CONCURRENCY requests at once', async () => {
  let active = 0, peak = 0;
  const fetchImpl = async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; return reply(200, { organic_results: [] })(); };
  const client = createClient({ config: config({ SCRAPINGDOG_CONCURRENCY: '2' }), store: createStore(), clock, fetchImpl });
  await Promise.all(Array.from({ length: 6 }, () => client.call('google', { query: 'q' })));
  assert.equal(peak, 2);
});

test('the daily credit cap stops a call before it is sent', async () => {
  let calls = 0;
  const client = createClient({ config: config({ CREDIT_CAP_PER_DAY: '20' }), store: createStore(), clock,
    fetchImpl: async () => { calls++; return reply(200, {})(); } });
  await client.call('profile', { username: 'a' });
  await assert.rejects(client.call('profile', { username: 'b' }), QuotaExceeded);
  assert.equal(calls, 1);
});
```

`tests/server/quota.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../server/store.js';
import { assertRoom, consume, usage, windowsFor } from '../../server/quota.js';

test('windows and per-minute cap follow REF quota.py bucket names', () => {
  assert.deepEqual(windowsFor(new Date(Date.UTC(2026, 8, 23, 7, 5))), { minute: 'm:202609230705', day: 'd:20260923' });
  const store = createStore();
  const clock = () => Date.UTC(2026, 8, 23, 7, 5, 20);
  const cfg = { creditCapPerMinute: 10, creditCapPerDay: 0 };
  consume(store, 's', 10, cfg, clock);
  assert.throws(() => assertRoom(store, 's', 1, cfg, clock), e => e.window === 'm:202609230705' && e.retryAfter === 40);
  assert.deepEqual(usage(store, 's', clock), { minute: 10, day: 10 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/server/scrapingdog.test.js tests/server/quota.test.js`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implement `server/config.js` and `server/quota.js`**

`server/config.js`:

```js
// Typed settings (spec §11). The ScrapingDog key never leaves the server.
const int = (env, name, fallback) => {
  const value = env[name];
  if (value === undefined || String(value).trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
};

export function loadConfig(env = process.env) {
  return {
    scrapingdogApiKey: env.SCRAPINGDOG_API_KEY || '',
    concurrency: Math.max(1, int(env, 'SCRAPINGDOG_CONCURRENCY', 5)),
    timeoutMs: int(env, 'SCRAPINGDOG_TIMEOUT_MS', 45000),
    creditBudgetPerSearch: int(env, 'CREDIT_BUDGET_PER_SEARCH', 15000),
    creditCapPerDay: int(env, 'CREDIT_CAP_PER_DAY', 100000),
    creditCapPerMinute: int(env, 'CREDIT_CAP_PER_MINUTE', 0),
    commentsScope: env.COMMENTS_SCOPE === 'matched_posts' ? 'matched_posts' : 'all_collected_posts',
    apiKey: env.DARKMAP_API_KEY || '',
    maxRequestBytes: int(env, 'DARKMAP_MAX_REQUEST_BYTES', 2000000),
    cursorSecret: env.DARKMAP_SEARCH_CURSOR_SECRET || '',
    dataFile: env.DATA_FILE || 'data/darkmap.json',
    port: int(env, 'PORT', 5173),
  };
}
```

`server/quota.js`:

```js
// REF darkmap/quota.py, denominated in ScrapingDog credits (spec §9). A cap of 0 disables that window.
import { QuotaExceeded } from './errors.js';

const pad = n => String(n).padStart(2, '0');
export function windowsFor(date) {
  const day = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
  return { minute: `m:${day}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`, day: `d:${day}` };
}
function counter(store, scope, window) {
  const table = store.table('quota_counters');
  return table.byUnique(0, scope, window) ?? table.insert({ scope, window, count: 0 });
}
function limits(config, date) {
  const w = windowsFor(date);
  return [[w.minute, config.creditCapPerMinute, 60 - date.getUTCSeconds()], [w.day, config.creditCapPerDay, 3600.0]];
}
export function assertRoom(store, scope, cost, config, clock = Date.now) {
  for (const [window, cap, retryAfter] of limits(config, new Date(clock()))) {
    if (cap > 0 && counter(store, scope, window).count + cost > cap) throw new QuotaExceeded(scope, window, retryAfter);
  }
}
export function consume(store, scope, cost, config, clock = Date.now) {
  for (const [window] of limits(config, new Date(clock()))) counter(store, scope, window).count += cost;
}
export function usage(store, scope, clock = Date.now) {
  const w = windowsFor(new Date(clock()));
  const table = store.table('quota_counters');
  return { minute: table.byUnique(0, scope, w.minute)?.count ?? 0, day: table.byUnique(0, scope, w.day)?.count ?? 0 };
}
```

- [ ] **Step 4: Implement `server/scrapingdog.js`**

```js
// ScrapingDog HTTP client (spec §6): pool, timeout, error mapping, credit meter and audit rows.
import { record as auditRecord } from './audit.js';
import { ENDPOINTS } from './costs.js';
import { FetchFailed, NotAuthorized, NotFound, SourceUnavailable } from './errors.js';
import { assertRoom, consume } from './quota.js';
import { stripApiKey } from './redact.js';

export const PROVIDER = 'scrapingdog_instagram';
export const LAWFUL_BASIS = 'licensed_public_data_api';
const BASE = 'https://api.scrapingdog.com';
const USER_AGENT = 'DarkmapBrandProtection/1.0 (+https://example.com/darkmap-bot)';

export function createPool(limit) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= limit || !queue.length) return;
    active += 1;
    const { task, resolve, reject } = queue.shift();
    task().then(resolve, reject).finally(() => { active -= 1; next(); });
  };
  return { run: task => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); next(); }) };
}

// REF http.check_source_availability (http.py:42-54), plus any account-error phrases recorded in
// tests/fixtures/scrapingdog/CONTRACT.md §5. Checked before 401/403 because vendors send those for credit problems.
const INACTIVE = ['customer is not active', 'account is inactive'];
const NO_CREDITS = ['insufficient balance', 'not enough credits', 'insufficient credits', 'credits exhausted'];
export function checkSourceAvailability(status, text) {
  const message = String(text || '').toLowerCase();
  if (INACTIVE.some(term => message.includes(term))) {
    throw new SourceUnavailable('source_account_inactive', 'The connected collection account is inactive. '
      + 'Reactivate it in the collection service dashboard, then retry this search.', { statusCode: status });
  }
  if (status === 402 || NO_CREDITS.some(term => message.includes(term))) {
    throw new SourceUnavailable('source_credits_required', 'The connected collection account has insufficient '
      + 'credits. Restore its balance, then retry this search.', { statusCode: status });
  }
}

// A 2xx body that is an error envelope (CONTRACT.md §5) is a failed attempt, never "no results".
const isErrorBody = json => json !== null && typeof json === 'object' && !Array.isArray(json)
  && (json.success === false || typeof json.error === 'string'
    || (Object.keys(json).length === 1 && typeof json.message === 'string'));
// Missing handle/post responses recorded in CONTRACT.md §5 (profile-missing): dropped silently like REF dataset errors.
const isMissing = (status, text) => status === 404 || /not found|does not exist|no user|page isn't available/i.test(text);

export function createClient({ config, store, fetchImpl = fetch, clock = Date.now }) {
  const pool = createPool(config.concurrency);
  async function send(endpointName, endpoint, params) {
    const url = new URL(endpoint.path, BASE);
    url.searchParams.set('api_key', config.scrapingdogApiKey);
    for (const [name, value] of Object.entries({ ...(endpoint.params ?? {}), ...params })) {
      if (value != null) url.searchParams.set(name, String(value));
    }
    const target = stripApiKey(url.href);
    const started = clock();
    let response;
    let text;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(config.timeoutMs), headers: { 'User-Agent': USER_AGENT } });
      text = await response.text();
    } catch (error) {
      auditRecord(store, { action: 'http.error', provider: PROVIDER, target, status: 'transport_error',
        lawful_basis: LAWFUL_BASIS, detail: { error: String(error.message).slice(0, 300), endpoint: endpointName } }, clock);
      throw new FetchFailed(error.name === 'TimeoutError' ? 'The read operation timed out' : String(error.message));
    }
    auditRecord(store, { action: 'http.request', provider: PROVIDER, target, status: String(response.status),
      lawful_basis: LAWFUL_BASIS, duration_ms: clock() - started, detail: { bytes: text.length, endpoint: endpointName } }, clock);
    checkSourceAvailability(response.status, text);
    if (response.status === 401 || response.status === 403) {
      throw new NotAuthorized(`${PROVIDER} returned ${response.status}; access is not authorized. `
        + 'Check the provider API key and subscription.');
    }
    if (response.status === 429 || response.status === 503) {
      auditRecord(store, { action: 'http.backoff', provider: PROVIDER, target, status: String(response.status),
        lawful_basis: LAWFUL_BASIS, detail: { retry_after: response.headers.get('retry-after') } }, clock);
      throw new FetchFailed(`${response.status} from ${endpoint.path}`, { statusCode: response.status,
        retryAfter: response.headers.get('retry-after') });
    }
    if (endpointName !== 'google' && isMissing(response.status, text)) throw new NotFound(`${endpoint.path} found nothing`);
    if (response.status >= 400) {
      throw new FetchFailed(`${response.status} from ${endpoint.path}: ${text.slice(0, 300)}`, { statusCode: response.status });
    }
    let json;
    try { json = JSON.parse(text); } catch { throw new FetchFailed(`${endpoint.path} returned a non-JSON body`, { statusCode: response.status }); }
    if (isErrorBody(json)) throw new FetchFailed(`${endpoint.path} returned an error body`, { statusCode: response.status });
    consume(store, PROVIDER, endpoint.credits, config, clock);
    return { json, credits: endpoint.credits, status: response.status };
  }
  return {
    pool,
    call(endpointName, params) {
      const endpoint = ENDPOINTS[endpointName];
      if (!endpoint) return Promise.reject(new Error(`unknown ScrapingDog endpoint ${endpointName}`));
      try { assertRoom(store, PROVIDER, endpoint.credits, config, clock); } catch (error) {
        auditRecord(store, { action: 'http.quota_exceeded', provider: PROVIDER, target: endpoint.path, status: 'blocked',
          lawful_basis: LAWFUL_BASIS, detail: { window: error.window, retry_after: error.retryAfter } }, clock);
        return Promise.reject(error);
      }
      return pool.run(() => send(endpointName, endpoint, params));
    },
  };
}
```

Adjust `isErrorBody`, `isMissing` and `NO_CREDITS` to the shapes CONTRACT.md §5 recorded, keeping the tests above
green.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/server/scrapingdog.test.js tests/server/quota.test.js`
Expected: PASS (7 tests).

---

### Task 14: Discovery helpers, record parsers, and ScrapingDog adapters

**Files:**
- Create: `server/engine/urlsplit.js`, by moving `urlsplitNetloc` out of `extract.js` and extending it
- Create: `server/discovery.js`, `server/adapters.js`
- Create fixtures:
  - `tests/fixtures/discovery-helpers.json`
  - `tests/fixtures/nodes/*.json`: REF-shaped record nodes, taken from REF tests
    `test_bright_data_instagram.py:31-104` plus one adapted node per step-0 recording
  - `tests/fixtures/organic/*.json`: organic lists, taken from REF tests :151-203, :236-281, :283-337 and
    `test_search_pages.py`, plus the adapted step-0 Google recording
  - `tests/fixtures/hits.json`
- Test: `tests/server/discovery.test.js`, `tests/server/adapters.test.js`

**Interfaces:**
- Consumes: `extract.js`, `pycompat.js`, `time.parseTs`, `raw.js`, `costs.js`.
- Produces `server/engine/urlsplit.js`: `urlsplit(url) → {scheme, netloc, path, query, fragment, hostname}`, which
  follows Python 3.12 and throws `ValueError`, and `urlunsplit([scheme, netloc, path, query, fragment])`.
  `extract.js` imports it; its tests must still pass.
- Produces `server/discovery.js`, whose names are ports of REF bright_data_instagram.py:27-231, 451-722:
  - Constants: `USERNAME_RE`, `MENTION_RE`, `SOURCE_HANDLE_RE`, `SUPPORTED_MODES`, `RESERVED_PROFILE_PATHS`
  - `discoveryQueries(keyword) → [query, country][]`
  - `first(node, ...names)`, `asInt(v)`, `serpFollowers(item)`, `asUrl(v)`, `looksLikeVideoUrl(v)`
  - `canonicalInstagramUrl(v)`, `urlKind(url)`
  - `bucketDiscovery(organic, clean, {limit, provenanceFor}) → {buckets: {profile, probe_profile, post, reel},
    serpFallback: RawBundle[]}`
  - `mediaItems(node)`, `comment(node, parentId)`, `post(node, comments)`, `account(node, fallback)`,
    `author(node)`
  - `provenance(mode, query, retrievedAt) → {provider:'scrapingdog_instagram', lawful_basis, collection_mode, query,
    source:'ScrapingDog Instagram API', retrieved_at}`
- Produces `server/adapters.js`:
  - `googleToOrganic(json) → organic[]`, which throws `ValueError` on a blank or invalid reply (REF :192-199)
  - `profileToNode(json)`, `postsToNodes(json)`, `postToNode(json, url)`, `commentsToNodes(json, postUrl)`, all
    producing the REF node keys listed in spec §7.3

- [ ] **Step 1: Write the fixtures**

`tests/fixtures/discovery-helpers.json`:

```json
{
  "as_int": ["12.4K", "3.1M followers", "1,234", {"count": 5}, "abc", null, "", 7, "7 posts", "0.5k", "2B", {"value": "9"}],
  "serp_followers": [{"title": "Brand (@brand) • 12.4K followers"}, {"followers": "1,200"}, {"snippet": "no count"}],
  "as_url": [["", "https://a"], {"url": "https://b"}, [{"link": "https://c"}], "  https://d  ", 5, null],
  "video": ["https://cdn/x.mp4?y=1", "https://cdn/x.jpg", null, "https://cdn/X.MOV"],
  "urls": ["https://www.instagram.com/p/ABC/", "http://instagram.com/p/ABC", "https://instagram.com/brand?igsh=1",
           "https://www.instagram.com/brand/reel/XYZ/", "https://www.instagram.com/explore/tags/x/",
           "https://evil.com/instagram.com/p/A/", "https://www.instagram.com/", "not a url", "https://www.instagram.com/reels/R1/"],
  "canonical_urls": ["https://www.instagram.com/p/ABC/", "https://www.instagram.com/reel/R/", "https://www.instagram.com/reels/R/",
                     "https://www.instagram.com/brand/reel/XYZ/", "https://www.instagram.com/brand/",
                     "https://www.instagram.com/explore/", "https://www.instagram.com/brand/p/ABC/"],
  "keywords": ["Brand", "A&B \"x\"", "sbi", "ÉTÉ", "loot 😀", "100% off"]
}
```

`tests/fixtures/hits.json`:

```json
[{"doc_type": "account", "handle": "Brand.Help"}, {"doc_type": "post", "instagram_url": "https://www.instagram.com/brand/reel/ABC/"},
 {"doc_type": "post", "instagram_url": "https://www.instagram.com/p/ABC"}, {"doc_type": "account", "handle": null}]
```

Write `tests/fixtures/nodes/*.json` and `tests/fixtures/organic/*.json` one scenario per file. Take them from the
REF test bodies named in **Files** above, and from `adapters` output on the step-0 recordings, written once by hand
from CONTRACT.md. Organic files have the shape `{"keyword": "...", "max_items": 250, "organic": [...]}`. Then add
checkpoint files to `tests/fixtures/checkpoints/` for Task 16; they're listed there.

- [ ] **Step 2: Write the failing tests**

`tests/server/discovery.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { account, asInt, asUrl, author, bucketDiscovery, canonicalInstagramUrl, comment, discoveryQueries,
  looksLikeVideoUrl, mediaItems, post, serpFollowers, urlKind } from '../../server/discovery.js';

const REF_PROVENANCE = mode => query => ({ provider: 'bright_data_instagram', lawful_basis: 'licensed_public_data_api',
  collection_mode: mode, query, source: 'Bright Data Instagram Scraper API', retrieved_at: '2026-09-23T00:00:00' });

test('discovery helpers equal REF', () => {
  const g = golden('discovery-helpers');
  for (const [v, expected] of g.as_int) assert.equal(asInt(v), expected, JSON.stringify(v));
  for (const [v, expected] of g.serp_followers) assert.equal(serpFollowers(v), expected);
  for (const [v, expected] of g.as_url) assert.equal(asUrl(v), expected);
  for (const [v, expected] of g.looks_like_video_url) assert.equal(looksLikeVideoUrl(v), expected);
  for (const [v, expected] of g.canonical) assert.equal(canonicalInstagramUrl(v), expected, v);
  for (const [v, expected] of g.url_kind) assert.equal(urlKind(v), expected, v);
  for (const [k, expected] of g.queries) assert.deepEqual(discoveryQueries(k), expected, k);
});

test('record parsers equal REF _post/_account/_comment/_author/_media_items', () => {
  for (const c of golden('parsers')) {
    assert.deepEqual(post(c.node), c.post, c.name);
    assert.deepEqual(account(c.node, c.node._fallback ?? ''), c.account, c.name);
    assert.deepEqual(comment(c.node, c.node._parent ?? null), c.comment, c.name);
    assert.equal(author(c.node), c.author, c.name);
    assert.deepEqual(mediaItems(c.node), c.media, c.name);
  }
});

test('bucketDiscovery equals REF _bucket_discovery (buckets and SERP fallback bundles)', () => {
  for (const c of golden('bucket-discovery')) {
    const provenanceFor = mode => REF_PROVENANCE(mode)(c.case.keyword);
    const result = bucketDiscovery(c.case.organic, c.case.keyword, { limit: c.case.max_items ?? 250, provenanceFor });
    assert.deepEqual(result.buckets, c.buckets, c.name);
    assert.deepEqual(result.serpFallback, c.serp_fallback, c.name);
  }
});

test('REF test_primary_brand_discovery_runs_before_broad_threat_tail and actionable-first order', () => {
  const queries = discoveryQueries('Brand').map(([q]) => q);
  assert.equal(queries.length, 17);
  assert.ok(queries.indexOf('site:instagram.com "Brand"') < queries.findIndex(q => q.includes('"UPI"')));
  assert.ok(queries[0].includes('telegram channel'));
});

test('special characters survive encoding into the ScrapingDog query (Review Focus 2)', () => {
  const [[query]] = discoveryQueries('A&B "x" #1 100%');
  const url = new URL('https://api.scrapingdog.com/google');
  url.searchParams.set('query', query);
  assert.equal(new URL(url.href).searchParams.get('query'), query);
  assert.match(url.href, /A%26B/);
});
```

`tests/server/adapters.test.js`. Replace each `expected` with the value CONTRACT.md recorded at the documented path:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commentsToNodes, googleToOrganic, postToNode, profileToNode } from '../../server/adapters.js';
import { ValueError } from '../../server/errors.js';

const recorded = name => JSON.parse(readFileSync(new URL(`../fixtures/scrapingdog/${name}.json`, import.meta.url))).json;

test('blank or invalid Google replies are failures, not empty searches (REF test_empty_gateway_response...)', () => {
  for (const body of [null, {}, { body: '' }, { error: 'upstream failure' }, 'text']) {
    assert.throws(() => googleToOrganic(body), ValueError, JSON.stringify(body));
  }
  assert.deepEqual(googleToOrganic({ organic_results: [] }), []);
});

test('recorded Google reply maps to REF organic items', () => {
  const organic = googleToOrganic(recorded('google-standard'));
  assert.ok(organic.length > 0);
  for (const item of organic) {
    assert.ok(Object.keys(item).every(k => ['link', 'title', 'description', 'snippet', 'source', 'image'].includes(k)));
    assert.match(item.link, /^https?:\/\//);
  }
});

test('recorded profile, post and comments map every spec §7.3 key', () => {
  const profile = profileToNode(recorded('profile'));
  for (const key of ['account', 'id', 'full_name', 'biography', 'profile_image_link', 'followers', 'posts']) {
    assert.ok(key in profile, `profile.${key}`);
  }
  assert.equal(typeof profile.account, 'string');
  const node = postToNode(recorded('post'), 'https://www.instagram.com/p/FROM-PROBE/');
  for (const key of ['url', 'shortcode', 'description', 'likes', 'num_comments', 'user_posted']) assert.ok(key in node, `post.${key}`);
  const comments = commentsToNodes(recorded('comments'), 'https://www.instagram.com/p/FROM-PROBE/');
  assert.ok(comments.length > 0);
  for (const c of comments) for (const key of ['post_url', 'comment_id', 'comment_user', 'comment']) assert.ok(key in c, `comment.${key}`);
});
```

- [ ] **Step 3: Regenerate the goldens and verify the tests fail**

Run: `python tests/golden/generate.py`, then `node --test tests/server/discovery.test.js tests/server/adapters.test.js`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 4: Implement `server/engine/urlsplit.js` and switch `extract.js` to it**

Move `checkBracketedNetloc`, `checkNetloc` and the netloc logic from `extract.js` into `urlsplit(url)`:
1. Strip leading C0 controls and spaces, and remove `\t\r\n`.
2. Take the scheme when the text before `:` is `[A-Za-z][A-Za-z0-9+.-]*`, lowercased.
3. Take the netloc when the rest starts with `//`, cut at the first of `/?#`.
4. Split `#` into fragment, then `?` into query.
5. `hostname`: the netloc after the last `@`, then the bracket content or the text before `:`, lowercased; `null`
   when empty.

`urlunsplit([s, n, p, q, f])` is `s + '://' + n + p + (q ? '?' + q : '') + (f ? '#' + f : '')` when `n` is set, as
Python does. `domainOf` becomes `urlsplit(candidate).netloc.toLowerCase()`, then the same trailing logic.

Run: `node --test tests/engine/extract.test.js`
Expected: still PASS.

- [ ] **Step 5: Implement `server/discovery.js`, a line-for-line port of REF bright_data_instagram.py**

| REF lines | Port |
|---|---|
| :27-43 | Constants: `USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/u`, `MENTION_RE = /(?<![A-Za-z0-9._])@([A-Za-z0-9._]{1,30})/gu`, `SOURCE_HANDLE_RE = new RegExp('instagram' + S + '*[·|:\\-]' + S + '*@?([A-Za-z0-9._]{1,30})', 'iu')`, `RESERVED_PROFILE_PATHS` as a Set, `SUPPORTED_MODES` |
| :45-84 | `discoveryQueries`: the 17 `[query, country]` pairs, verbatim templates |
| :87-148 | `first`, `asInt` (the abbreviation regexes use `S`), `serpFollowers`, `asUrl` |
| :151-158 | `looksLikeVideoUrl`, using `urlsplit(v).path.toLowerCase()` and falling back to the raw string on `ValueError` |
| :202-231 | `canonicalInstagramUrl`, `urlKind`, using `urlsplit` |
| :451-557 | `bucketDiscovery` (see below) |
| :559-722 | `mediaItems`, `comment`, `post`, `account`, `author` (see below) |

**`bucketDiscovery`.** This is `_bucket_discovery` with `self._limit()` → `limit` and `self._provenance(m, q)` →
`provenanceFor(m)`:
- `text` is `['title','description','snippet'].map(k => pyStr(or(item[k], ''))).join(' ')`
- mentions are `findall(MENTION_RE, text).map(v => pyRstrip(v, '.'))`
- the SERP fallback bundle uses these fields:
  - `biography: kind === 'profile' ? pySlice(text, 0, 1200) : null`
  - `profile_pic_url: kind === 'profile' ? searchImage : null`
  - `followers_count: serpFollowers(item)`
  - `raw: {serp_result: compactRaw}`, where `compactRaw` excludes `image`, `image_base64` and `icon`
- fallback posts use `caption: pySlice(text, 0, 2200)`, and their media is kept only when the image is `https://`
  or `data:image/`
- the 29 probe variants are verbatim, filtered by `USERNAME_RE`, with the exact username moved to the front
- return `{buckets, serpFallback: [...fallbackByHandle.values()].slice(0, limit)}`

**Parsers:**
- `comment` (:627-636): `author_handle` is `pyLstrip(pyStr(or(first(...), '')), '@') || null`, `created_at` is
  `parseTs(...)`, and it returns a `rawComment`.
- `post` (:638-673): builds the hashtag suffix with the same `casefold` membership test, `platform_post_id: post_id
  != null ? pyStr(post_id) : shortcode`, and returns a `rawPost`.
- `account` (:675-717): same candidate order. `raw` is the node without `posts`.

**`provenance(mode, query, retrievedAt)`.** Uses REF's key order, with our provider and source labels (spec §14,
item 5).

- [ ] **Step 6: Implement `server/adapters.js` from CONTRACT.md**

```js
// ScrapingDog JSON -> REF (Bright Data-shaped) record nodes, so REF's parsers run unchanged (spec §7.3).
// Every path list comes from tests/fixtures/scrapingdog/CONTRACT.md; the first path that holds a value wins.
import { ValueError } from './errors.js';

const at = (value, path) => (path === '' ? value : path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), value));
const pick = (value, paths) => {
  for (const path of paths) {
    const found = at(value, path);
    if (found !== undefined && found !== null && found !== '') return found;
  }
  return null;
};
const node = (source, mapping) => Object.fromEntries(Object.entries(mapping).map(([key, paths]) => [key, pick(source, paths)]));

export const MAPPING = {
  googleList: ['organic_results', 'organic_data', 'organic'],
  google: { link: ['link', 'url'], title: ['title'], description: ['snippet', 'description'], snippet: ['snippet'],
    source: ['source', 'displayed_link'], image: ['thumbnail', 'image'] },
  profileRoot: ['data.user', 'data', 'user', ''],
  profile: { account: ['username'], id: ['id', 'user_id', 'pk'], full_name: ['full_name'], biography: ['biography'],
    external_url: ['external_url'], profile_image_link: ['profile_pic_url_hd', 'profile_pic_url'],
    is_verified: ['is_verified'], is_business_account: ['is_business_account'],
    followers: ['followers_count', 'edge_followed_by.count', 'followers'],
    following: ['following_count', 'edge_follow.count', 'following'],
    posts_count: ['posts_count', 'media_count', 'edge_owner_to_timeline_media.count'] },
  profilePosts: ['posts', 'edge_owner_to_timeline_media.edges', 'recent_posts'],
  postsList: ['posts', 'data', 'items', 'edges', ''],
  post: { url: ['url', 'permalink'], post_id: ['id', 'pk'], shortcode: ['shortcode', 'code'],
    content_type: ['product_type', '__typename', 'media_type', 'type'],
    description: ['caption.text', 'caption', 'edge_media_to_caption.edges.0.node.text'], hashtags: ['hashtags'],
    date_posted: ['taken_at_timestamp', 'taken_at', 'timestamp', 'date'],
    likes: ['like_count', 'edge_liked_by.count', 'edge_media_preview_like.count', 'likes'],
    num_comments: ['comment_count', 'edge_media_to_comment.count', 'comments_count'],
    views: ['video_view_count', 'play_count', 'view_count'], thumbnail: ['display_url', 'thumbnail_src', 'image_url'],
    video_url: ['video_url'], user_posted: ['owner.username', 'user.username', 'username'],
    profile_name: ['owner.full_name', 'user.full_name'], is_verified: ['owner.is_verified', 'user.is_verified'],
    profile_image_link: ['owner.profile_pic_url', 'user.profile_pic_url'],
    followers: ['owner.edge_followed_by.count', 'owner.followers_count', 'user.follower_count'] },
  commentsList: ['comments', 'data', 'edges', ''],
  comment: { comment_id: ['id', 'pk', 'node.id'], comment_user: ['owner.username', 'user.username', 'username', 'node.owner.username'],
    comment: ['text', 'node.text'], likes_number: ['like_count', 'comment_like_count', 'node.edge_liked_by.count'],
    comment_date: ['created_at', 'created_at_utc', 'node.created_at'] },
  commentReplies: ['replies', 'child_comments', 'preview_child_comments', 'node.edge_threaded_comments.edges'],
};

const unwrap = item => (item && typeof item === 'object' && 'node' in item && Object.keys(item).length === 1 ? item.node : item);

export function googleToOrganic(json) {
  const payload = typeof json?.body === 'string' ? (() => { try { return JSON.parse(json.body); } catch { return null; } })() : json;
  const list = payload && typeof payload === 'object' ? pick(payload, MAPPING.googleList) : null;
  if (!Array.isArray(list)) throw new ValueError('Collection search returned an empty or invalid response');
  return list.filter(i => i && typeof i === 'object').map(i => Object.fromEntries(
    Object.entries(node(i, MAPPING.google)).filter(([, v]) => v != null)));
}

const toPostNode = raw => {
  const item = unwrap(raw);
  const out = node(item, MAPPING.post);
  if (Array.isArray(out.hashtags) === false) delete out.hashtags;
  return out;
};

export function profileToNode(json) {
  const root = pick(json, MAPPING.profileRoot) ?? json;
  const out = node(root, MAPPING.profile);
  const posts = pick(root, MAPPING.profilePosts);
  out.posts = Array.isArray(posts) ? posts.map(toPostNode) : [];
  return out;
}
export const postsToNodes = json => {
  const list = pick(json, MAPPING.postsList);
  return (Array.isArray(list) ? list : []).map(toPostNode);
};
export function postToNode(json, url) {
  const out = toPostNode(pick(json, ['data', 'post', '']) ?? json);
  out.url = out.url ?? url;
  return out;
}
export function commentsToNodes(json, postUrl) {
  const list = pick(json, MAPPING.commentsList);
  return (Array.isArray(list) ? list : []).map(raw => {
    const item = unwrap(raw);
    const replies = pick(raw, MAPPING.commentReplies);
    return { post_url: postUrl, ...node(item, MAPPING.comment),
      replies: (Array.isArray(replies) ? replies : []).map(r => node(unwrap(r), MAPPING.comment)) };
  });
}
```

Put the paths CONTRACT.md recorded first in each list; drop any path that doesn't exist in the recordings.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/server/discovery.test.js tests/server/adapters.test.js tests/engine/extract.test.js`
Expected: PASS.

---

### Task 15: Signed continuation (`search_cursor.py` port)

**Files:**
- Create: `server/cursor.js`
- Test: `tests/server/cursor.test.js`

**Interfaces:**
- Consumes: `errors.InvalidSearchCursor`.
- Produces:
  - `MAX_TOKEN_BYTES`, `MAX_STATE_BYTES`
  - `resolveCursorSecret(config, {fs, dir}) → string`: the config value, else a random secret persisted to
    `data/cursor-secret`
  - `encodeCursor(state, secret) → token`
  - `decodeCursor(token, secret, clock) → state`, which throws `InvalidSearchCursor` with REF's message

- [ ] **Step 1: Write the failing test (a port of REF `test_checkpoint_integrity_expiry_and_cold_start`)**

`tests/server/cursor.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidSearchCursor } from '../../server/errors.js';
import { decodeCursor, encodeCursor, resolveCursorSecret } from '../../server/cursor.js';

const state = (extra = {}) => ({ version: 1, expires_at: Date.now() / 1000 + 1000, query: 'Brand',
  retrieved_at: '2026-09-23T00:00:00', visible: [], params: { mode: 'keyword', max_items: 250 }, ...extra });

test('round trip, tamper detection and expiry', () => {
  const secret = 's3cret';
  const original = state({ inputs: [{ dataset: 'post', inputs: [{ url: 'https://www.instagram.com/p/A/' }], attempt: 0 }] });
  const token = encodeCursor(original, secret);
  assert.deepEqual(decodeCursor(token, secret), original);
  assert.ok(!token.includes(secret));
  assert.throws(() => decodeCursor((token[0] === 'a' ? 'b' : 'a') + token.slice(1), secret), InvalidSearchCursor);
  assert.throws(() => decodeCursor(token, 'other-secret'), InvalidSearchCursor);
  assert.throws(() => decodeCursor(encodeCursor(state({ expires_at: Date.now() / 1000 - 1 }), secret), secret),
    /Search continuation is invalid or expired\. Start a new search\./);
  assert.throws(() => decodeCursor('bad', secret), InvalidSearchCursor);
});

test('oversized state is refused with REF wording', () => {
  const big = state({ organic: Array.from({ length: 120_000 }, (_, i) => ({ link: `https://x/${i}`, title: 'y'.repeat(200) })) });
  assert.throws(() => encodeCursor(big, 's'), /Search checkpoint is too large; narrow the search/);
});

test('a missing secret is generated once and reused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-'));
  const first = resolveCursorSecret({ cursorSecret: '' }, { dir });
  assert.equal(resolveCursorSecret({ cursorSecret: '' }, { dir }), first);
  assert.equal(resolveCursorSecret({ cursorSecret: 'fixed' }, { dir }), 'fixed');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/server/cursor.test.js`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implement `server/cursor.js`**

```js
// Port of REF darkmap/search_cursor.py: compressed, HMAC-signed, 6-hour checkpoints (spec §5 item 10).
import * as nodeFs from 'node:fs';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { InvalidSearchCursor } from './errors.js';

export const MAX_TOKEN_BYTES = 1_800_000;
export const MAX_STATE_BYTES = 24_000_000;
const INVALID = 'Search continuation is invalid or expired. Start a new search.';
const key = secret => createHmac('sha256', secret).update('darkmap-search-cursor-v1').digest();

export function resolveCursorSecret(config, { fs = nodeFs, dir = 'data' } = {}) {
  if (config.cursorSecret) return config.cursorSecret;
  const file = join(dir, 'cursor-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  fs.mkdirSync(dir, { recursive: true });
  const secret = randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export function encodeCursor(state, secret) {
  const raw = Buffer.from(JSON.stringify(state), 'utf8');
  if (raw.length > MAX_STATE_BYTES) throw new InvalidSearchCursor('Search checkpoint is too large; narrow the search');
  const body = deflateSync(raw, { level: 6 }).toString('base64url');
  const token = `${body}.${createHmac('sha256', key(secret)).update(body).digest('hex')}`;
  if (token.length > MAX_TOKEN_BYTES) throw new InvalidSearchCursor('Search checkpoint is too large; narrow the search');
  return token;
}

export function decodeCursor(token, secret, clock = Date.now) {
  try {
    if (typeof token !== 'string' || token.length > MAX_TOKEN_BYTES) throw new Error('size');
    const dot = token.lastIndexOf('.');
    if (dot < 0) throw new Error('format');
    const body = token.slice(0, dot);
    const signature = Buffer.from(token.slice(dot + 1), 'utf8');
    const expected = Buffer.from(createHmac('sha256', key(secret)).update(body).digest('hex'), 'utf8');
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new Error('signature');
    const raw = inflateSync(Buffer.from(body, 'base64url'), { maxOutputLength: MAX_STATE_BYTES + 1 });
    if (raw.length > MAX_STATE_BYTES) throw new Error('size');
    const state = JSON.parse(raw.toString('utf8'));
    if (state.version !== 1 || !(state.expires_at > clock() / 1000)) throw new Error('expired');
    return state;
  } catch {
    throw new InvalidSearchCursor(INVALID);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/server/cursor.test.js`
Expected: PASS (3 tests).

---

### Task 16: Paged collector, a sync port of REF `PagedInstagramCollector`

**Files:**
- Create: `server/collector.js`, `tests/helpers/fake-scrapingdog.js`
- Create: `tests/fixtures/checkpoints/*.json`, one REF-shaped checkpoint per scenario, using REF dataset IDs as the
  `records`/`scheduled` keys:
  - `prioritize-evidence.json`: REF test_search_pages.py:47-62
  - `speculative-wait.json`: :187-194
  - `post-fills-profile.json`: :156-184
  - `full-records.json`: profiles, posts, reels, comments and organic together
- Test: `tests/server/collector.test.js`

**Interfaces:**
- Consumes:
  - the client interface (Task 13); `adapters.js` and `discovery.js` (Task 14)
  - `ENDPOINTS`, `USE_ADVANCED_FOR_CRITICAL` and `PROFILE_HAS_RECENT_POSTS` (Task 2)
  - `audit.record`, `quota.js`, `pycompat.js`, `raw.js`, `errors.js`
- Produces `server/collector.js`:
  - `PAGE_NETWORK_SECONDS = 48`
  - `hitKey(hit)`
  - `REF_DATASETS`, which maps REF dataset IDs to `profile|post|reel|comment`, for the golden tests
  - `class PagedCollector({store, state, client, config, clock, monotonic})` with:
    - `collect({targetResults, budgetSeconds}) → Promise<RawBundle[]>`
    - `bundles() → {bundles, buckets}`
    - `schedule()`
    - `profileEnrichmentPending(bundles)`
    - `hasWork()`
- Produces `tests/helpers/fake-scrapingdog.js`: `fakeClient(handler, {clock}) → {call, calls}`. Here
  `handler(endpoint, params)` returns `{json, credits}` or throws, `calls` records `[endpoint, params]`, and each call
  advances the fake clock by `stepMs`.

- [ ] **Step 1: Write the fake client and the failing tests**

`tests/helpers/fake-scrapingdog.js`:

```js
// Scripted stand-in for server/scrapingdog.js createClient(); advances a fake clock per call.
export function fakeClock(start = Date.UTC(2026, 8, 23, 12, 0, 0)) {
  let now = start;
  return { now: () => now, tick: ms => { now += ms; }, monotonic: () => now };
}
export function fakeClient(handler, { clock, stepMs = 2000 } = {}) {
  const calls = [];
  return {
    calls,
    async call(endpoint, params) {
      calls.push([endpoint, params]);
      clock?.tick(stepMs);
      await Promise.resolve();
      return handler(endpoint, params);
    },
  };
}
```

`tests/server/collector.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { golden } from '../helpers/golden.js';
import { fakeClient, fakeClock } from '../helpers/fake-scrapingdog.js';
import { createStore } from '../../server/store.js';
import { loadConfig } from '../../server/config.js';
import { encodeCursor, decodeCursor } from '../../server/cursor.js';
import { FetchFailed, NotFound, SourceUnavailable } from '../../server/errors.js';
import { PagedCollector, REF_DATASETS } from '../../server/collector.js';

const config = (env = {}) => loadConfig({ SCRAPINGDOG_API_KEY: 'k', CREDIT_CAP_PER_DAY: '0', ...env });
const baseState = (clock, extra = {}) => ({ version: 1, id: 'x', expires_at: clock.now() / 1000 + 1000, query: 'Brand',
  retrieved_at: '2026-09-23T00:00:00', visible: [], page: 0,
  params: { mode: 'keyword', max_items: 250, profile_limit: 50, include_comments: true, comments_per_post: 20 }, ...extra });
const organicFor = index => ({ organic_results: [{ link: `https://www.instagram.com/reel/FOUND${index}/`,
  source: `Instagram · seller${index}`, title: `Brand loot offer ${index}` }] });
const make = (state, client, clock, env) => new PagedCollector({ store: createStore(), state, client,
  config: config(env), clock: clock.now, monotonic: clock.monotonic });
const toOurs = state => JSON.parse(JSON.stringify(state).replace(/gd_[a-z0-9]+/g, id => REF_DATASETS[id] ?? id));

test('schedule() and bundles() equal REF on every checkpoint fixture', () => {
  for (const c of golden('collector-core')) {
    const clock = fakeClock();
    const collector = make(toOurs(c.state), fakeClient(() => ({})), clock);
    collector.provenanceFor = mode => ({ provider: 'bright_data_instagram', lawful_basis: 'licensed_public_data_api',
      collection_mode: mode, query: c.state.query, source: 'Bright Data Instagram Scraper API', retrieved_at: '2026-09-23T00:00:00' });
    const before = collector.bundles();
    assert.deepEqual(before.bundles, toOurs(c.bundles), c.name);
    assert.deepEqual(before.buckets, c.buckets, c.name);
    assert.equal(collector.profileEnrichmentPending(before.bundles), c.profile_pending, c.name);
    collector.schedule();
    assert.deepEqual(collector.state.inputs, toOurs(c.scheduled_state).inputs, c.name);
    assert.deepEqual(collector.state.scheduled, toOurs(c.scheduled_state).scheduled, c.name);
  }
});

test('REF: profile allowance expands with each requested page', async () => {
  const clock = fakeClock();
  const state = baseState(clock, { query: 'brand research!', query_tasks: [], inputs: [] });
  await make(state, fakeClient(() => ({})), clock).collect({ targetResults: 100 });
  assert.equal(state.profile_target, 100);
});

test('REF (sync): unfinished work survives page deadlines and every input is requested exactly once', async () => {
  const clock = fakeClock();
  let searches = 0;
  const seen = new Set();
  const client = fakeClient((endpoint, params) => {
    const identity = JSON.stringify([endpoint, params]);
    assert.ok(!seen.has(identity), `requested twice: ${identity}`);
    seen.add(identity);
    if (endpoint.startsWith('google')) return { json: organicFor(++searches), credits: 5 };
    if (endpoint === 'profile') return { json: { username: params.username, followers_count: 10, biography: 'Public profile',
      profile_pic_url: 'https://cdn.example/profile.jpg', id: `id-${params.username}`, posts: [] }, credits: 15 };
    if (endpoint === 'posts') return { json: { posts: [] }, credits: 15 };
    if (endpoint === 'comments') return { json: { comments: [{ id: `c${params.url}`, text: 'I paid but no delivery', username: 'reviewer' }] }, credits: 15 };
    return { json: { url: params.url, owner: { username: `author${params.url.split('/').at(-2)}` }, caption: 'Brand offer',
      display_url: 'https://cdn.example/cover.jpg' }, credits: 15 };
  }, { clock });
  let state = baseState(clock);
  let collector = make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '3' });
  await collector.collect({ targetResults: 10000, budgetSeconds: 48 });
  assert.ok(collector.hasWork());
  assert.deepEqual(state.errors, []);
  for (let page = 0; page < 30 && collector.hasWork(); page++) {
    state = decodeCursor(encodeCursor(state, 's'), 's', clock.now);
    collector = make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '3' });
    await collector.collect({ targetResults: 10000, budgetSeconds: 48 });
  }
  assert.ok(!collector.hasWork(), 'collection must eventually exhaust');
  assert.equal(state.queries_completed, 17);
  assert.equal(searches, 17);
  assert.equal(state.records.reel.length, 17);
  assert.equal(state.records.comment.length, 17);
  assert.ok(collector.bundles().bundles.some(b => b.posts.some(p => p.comments.length)));
  assert.deepEqual(state.errors, []);
});

test('REF: a 429 stops the page, keeps every input and blocks resumption until Retry-After passes', async () => {
  const clock = fakeClock();
  const client = fakeClient(() => { throw new FetchFailed('429 from /google', { statusCode: 429, retryAfter: '90' }); }, { clock });
  const state = baseState(clock);
  await make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '1' }).collect({ targetResults: 50 });
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0][0], 'profile', 'REF turn 0 enriches the queued exact-brand profile first');
  assert.ok(state.blocked_until > clock.now() / 1000 + 85);
  assert.equal(state.query_tasks.length, 17);
  assert.equal(state.inputs[0].attempt, 0);
  await make(decodeCursor(encodeCursor(state, 's'), 's', clock.now), client, clock, { SCRAPINGDOG_CONCURRENCY: '1' })
    .collect({ targetResults: 50 });
  assert.equal(client.calls.length, 1, 'View more during Retry-After sends nothing');
});

test('REF: an inactive account stops once and keeps all work for an explicit retry', async () => {
  const clock = fakeClock();
  let active = false;
  const client = fakeClient(() => {
    if (!active) throw new SourceUnavailable('source_account_inactive', 'The connected collection account is inactive.');
    return { json: { username: 'brand', followers_count: 1, profile_pic_url: 'https://x', id: '1', posts: [] }, credits: 15 };
  }, { clock });
  const state = baseState(clock);
  assert.deepEqual(await make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '1' }).collect(), []);
  assert.equal(client.calls.length, 1);
  assert.equal(state.source_error.code, 'source_account_inactive');
  assert.equal(state.query_tasks.length, 17);
  assert.equal(state.inputs[0].attempt, 0);
  assert.deepEqual(state.errors, []);
  active = true;
  await make(decodeCursor(encodeCursor(state, 's'), 's', clock.now), client, clock, { SCRAPINGDOG_CONCURRENCY: '1' })
    .collect({ targetResults: 1 });
  assert.ok(client.calls.length >= 2);
});

test('missing profiles are dropped silently; transient failures get 3 attempts then one error', async () => {
  const clock = fakeClock();
  const client = fakeClient((endpoint, params) => {
    if (endpoint === 'profile') throw new NotFound('no such user');
    if (endpoint.startsWith('google')) return { json: { organic_results: [{ link: 'https://www.instagram.com/p/P1/', title: 't' }] }, credits: 5 };
    throw new FetchFailed('500 from /instagram/post', { statusCode: 500 });
  }, { clock });
  const state = baseState(clock, { params: { ...baseState(clock).params, include_comments: false } });
  const collector = make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '2' });
  for (let i = 0; i < 5 && collector.hasWork(); i++) await collector.collect({ targetResults: 10000 });
  assert.equal(client.calls.filter(([e]) => e === 'post').length, 3);
  assert.deepEqual(state.errors.map(e => e.stage), ['enrich']);
  assert.ok(!state.errors.some(e => e.dataset === 'profile'));
});

test('the per-search credit budget ends collection with one budget error', async () => {
  const clock = fakeClock();
  const client = fakeClient(e => ({ json: e.startsWith('google') ? { organic_results: [] } : { username: 'brand', posts: [] }, credits: e.startsWith('google') ? 5 : 15 }), { clock });
  const state = baseState(clock);
  const collector = make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '1', CREDIT_BUDGET_PER_SEARCH: '40' });
  await collector.collect({ targetResults: 10000 });
  assert.ok(state.credits_used <= 40);
  assert.deepEqual(state.errors.filter(e => e.stage === 'budget').length, 1);
  assert.ok(!collector.hasWork());
});

test('a request started before the deadline finishes and is kept (it is paid for)', async () => {
  const clock = fakeClock();
  const client = fakeClient(endpoint => {
    if (endpoint === 'profile') { clock.tick(30_000); return { json: { username: 'brand', followers_count: 5, profile_pic_url: 'https://x', id: '1', posts: [] }, credits: 15 }; }
    return { json: { organic_results: [] }, credits: 5 };
  }, { clock, stepMs: 20_000 });
  const state = baseState(clock);
  await make(state, client, clock, { SCRAPINGDOG_CONCURRENCY: '1' }).collect({ targetResults: 10000, budgetSeconds: 48 });
  assert.equal(state.records.profile.length, 1);
});
```

- [ ] **Step 2: Write the checkpoint fixtures, regenerate the goldens, and verify the tests fail**

Write the four checkpoint files named in **Files**. Each one is the REF test's `state()`, plus the
`organic`/`records` it sets, as JSON with REF dataset IDs. Run `python tests/golden/generate.py`, then
`node --test tests/server/collector.test.js`.
Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Implement `server/collector.js`**

```js
// Sync port of REF providers/instagram_pages.py over ScrapingDog (spec §7). Methods keep REF's order and names.
import { record as auditRecord } from './audit.js';
import { ENDPOINTS, PROFILE_HAS_RECENT_POSTS, USE_ADVANCED_FOR_CRITICAL } from './costs.js';
import { commentsToNodes, googleToOrganic, postToNode, postsToNodes, profileToNode } from './adapters.js';
import { account as parseAccount, author as parseAuthor, bucketDiscovery, canonicalInstagramUrl,
  comment as parseComment, discoveryQueries, post as parsePost, provenance, urlKind } from './discovery.js';
import { FetchFailed, NotAuthorized, NotFound, ProviderNotConfigured, QuotaExceeded, SourceUnavailable,
  ValueError } from './errors.js';
import { dedupe, or, pyCasefold, pyLstrip, pyRstrip, pySlice, pyStr, truthy } from './engine/pycompat.js';
import { windowsFor } from './quota.js';
import { rawAccount, rawBundle } from './raw.js';
import { PROVIDER } from './scrapingdog.js';
import { utcnowIso } from './time.js';

export const PAGE_NETWORK_SECONDS = 48;
export const REF_DATASETS = { gd_l1vikfch901nx3by4: 'profile', gd_lk5ns7kz21pck8jpis: 'post',
  gd_lyclm20il4r5helnj: 'reel', gd_ltppn085pokosxh13: 'comment' };
const ACCOUNT_FIELDS = Object.keys(rawAccount({ handle: '' }));
const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const emptyObject = v => isPlainObject(v) && Object.keys(v).length === 0;
const lastSegment = url => pyRstrip(url, '/').split('/').at(-1);

export function hitKey(hit) {   // REF instagram_pages.py:32-37
  if (hit.doc_type === 'account') return `account:${pyCasefold(or(hit.handle, ''))}`;
  return `post:${lastSegment(or(hit.instagram_url, ''))}`;
}

export class PagedCollector {
  constructor({ store, state, client, config, clock = Date.now, monotonic = () => performance.now() }) {
    Object.assign(this, { store, state, client, config, clock, monotonic });
    this.params = state.params;
    this.inFlight = new Set();
    this.reserved = 0;
    this.provenanceFor = mode => provenance(mode, this.state.query, utcnowIso(this.clock));
    const s = state;
    s.organic ??= [];
    s.query_tasks ??= discoveryQueries(s.query).map(([query, country], index) => ({ query, country, index, attempt: 0 }));
    s.inputs ??= [];
    s.scheduled ??= {};
    s.records ??= {};
    s.errors ??= [];
    s.queries_completed ??= 0;
    s.blocked_until ??= 0;
    s.profile_target ??= Math.min(this.limit(), Math.trunc(Number(this.params.profile_limit ?? 50)));
    s.credits_used ??= 0;
  }

  limit() { return Math.max(1, Math.min(Math.trunc(Number(this.params.max_items ?? 100)), 500)); }

  checkConfiguration() {
    if (!this.config.scrapingdogApiKey) throw new ProviderNotConfigured('scrapingdog_instagram requires SCRAPINGDOG_API_KEY');
  }

  deferRefusal(error) {   // REF :58-71
    if (!(error instanceof FetchFailed) || ![429, 503].includes(error.statusCode)) return false;
    let delay = 30.0;
    const header = error.retryAfter == null ? '' : String(error.retryAfter).trim();
    if (header) {
      const seconds = Number(header);
      if (Number.isFinite(seconds)) delay = Math.max(0, seconds);
      else if (!Number.isNaN(Date.parse(header))) delay = Math.max(0, Date.parse(header) / 1000 - this.clock() / 1000);
    }
    this.state.blocked_until = this.clock() / 1000 + delay;
    return true;
  }

  quotaCheckpoint(restore) {   // REF :73-89, over credit counters
    const w = windowsFor(new Date(this.clock()));
    const table = this.store.table('quota_counters');
    const windows = [w.minute, w.day];
    if (restore) {
      for (const [window, count] of Object.entries(this.state.quota ?? {})) {
        if (!windows.includes(window)) continue;
        const row = table.byUnique(0, PROVIDER, window);
        if (row) row.count = Math.max(row.count, count);
        else table.insert({ scope: PROVIDER, window, count });
      }
    } else {
      this.state.quota = Object.fromEntries(windows.map(window => [window, table.byUnique(0, PROVIDER, window)?.count])
        .filter(([, count]) => count != null));
    }
  }

  bundles() {   // REF :91-167
    const { buckets, serpFallback } = bucketDiscovery(this.state.organic, this.state.query,
      { limit: this.limit(), provenanceFor: this.provenanceFor });
    const merged = new Map(serpFallback.map(b => [pyCasefold(b.account.handle), b]));
    const add = bundle => {
      const key = pyCasefold(bundle.account.handle);
      if (!key) return;
      const current = merged.get(key);
      if (!current) { merged.set(key, bundle); return; }
      for (const field of ACCOUNT_FIELDS) {
        const value = bundle.account[field];
        if (value != null && !emptyObject(value)) current.account[field] = value;
      }
      const posts = new Map(current.posts.map(p => [or(p.permalink, p.platform_post_id), p]));
      for (const p of bundle.posts) posts.set(or(p.permalink, p.platform_post_id), p);
      current.posts = [...posts.values()];
      current.provenance = bundle.provenance;
    };
    const prov = { ...this.provenanceFor('keyword'), retrieved_at: this.state.retrieved_at };
    for (const node of this.state.records.profile ?? []) {
      add(rawBundle(parseAccount(node), or(node.posts, []).filter(isPlainObject).map(p => parsePost(p)).slice(0, this.limit()), prov));
    }
    for (const dataset of ['post', 'reel']) {
      for (const node of this.state.records[dataset] ?? []) {
        const name = parseAuthor(node);
        if (!name) continue;
        const key = pyCasefold(name);
        const mediaAccount = parseAccount(node, name);
        if (!merged.has(key)) merged.set(key, rawBundle(mediaAccount, [], prov));
        else {
          const current = merged.get(key).account;
          for (const field of ACCOUNT_FIELDS) {
            const existing = current[field];
            const value = mediaAccount[field];
            const placeholder = field === 'display_name' && typeof existing === 'string'
              && pyLstrip(pyCasefold(existing), '@') === pyCasefold(current.handle);
            if ((existing == null || existing === '' || placeholder) && !(value == null || value === '' || emptyObject(value))) current[field] = value;
          }
        }
        const bundle = merged.get(key);
        const p = parsePost(node);
        const existing = new Map(bundle.posts.map(x => [x.permalink, x]));
        existing.set(p.permalink, p);
        bundle.posts = [...existing.values()];
      }
    }
    const comments = new Map();
    for (const node of this.state.records.comment ?? []) {
      const url = canonicalInstagramUrl(pyStr(or(node.post_url, '')));
      if (!url) continue;
      const parent = parseComment(node);
      if (!comments.has(url)) comments.set(url, []);
      comments.get(url).push(parent, ...or(node.replies, []).filter(isPlainObject).map(r => parseComment(r, parent.platform_comment_id)));
    }
    for (const bundle of merged.values()) {
      for (const p of bundle.posts) {
        const combined = new Map();
        for (const c of [...p.comments, ...(comments.get(p.permalink) ?? [])]) {
          combined.set(truthy(c.platform_comment_id) ? `id:${c.platform_comment_id}` : `t:${JSON.stringify([c.author_handle, c.text])}`, c);
        }
        p.comments = [...combined.values()].slice(0, this.params.comments_per_post ?? 20);
      }
    }
    return { bundles: [...merged.values()], buckets };
  }

  commentTargets(bundles, buckets) {
    const all = bundles.flatMap(b => b.posts.map(p => p.permalink)).filter(truthy);
    if (this.config.commentsScope !== 'matched_posts') return all;
    const matched = new Set([...buckets.post, ...buckets.reel,
      ...(this.state.records.post ?? []).map(n => canonicalInstagramUrl(pyStr(or(n.url, '')))),
      ...(this.state.records.reel ?? []).map(n => canonicalInstagramUrl(pyStr(or(n.url, ''))))]);
    return all.filter(url => matched.has(url));
  }

  schedule() {   // REF :169-217
    const { bundles, buckets } = this.bundles();
    const profileLimit = Math.min(this.limit(), Math.trunc(Number(this.state.profile_target ?? this.params.profile_limit ?? 50)));
    const exactProbe = buckets.probe_profile.slice(0, 1);
    const evidence = bundles.filter(b => truthy(b.account.handle)).map(b => `https://www.instagram.com/${b.account.handle}/`);
    const speculative = this.state.query_tasks.length ? [] : buckets.probe_profile.slice(1);
    const candidates = dedupe([...exactProbe, ...evidence, ...buckets.profile, ...speculative]);
    const knownProfiles = (this.state.scheduled.profile ??= []);
    const remaining = Math.max(0, profileLimit - knownProfiles.length);
    const profiles = candidates.filter(url => !knownProfiles.includes(lastSegment(url))).slice(0, remaining);
    const plan = [['profile', profiles.map(url => ({ user_name: lastSegment(url) }))],
      ['post', buckets.post.slice(0, this.limit()).map(url => ({ url }))],
      ['reel', buckets.reel.slice(0, this.limit()).map(url => ({ url }))]];
    if (this.params.include_comments ?? true) {
      plan.push(['comment', dedupe(this.commentTargets(bundles, buckets)).slice(0, this.limit()).map(url => ({ url }))]);
    }
    for (const [dataset, inputs] of plan) {
      const known = (this.state.scheduled[dataset] ??= []);
      let fresh = inputs.filter(item => !known.includes(Object.values(item)[0]));
      if (dataset === 'profile' && fresh.length) {
        const pending = [...this.state.inputs].reverse()
          .find(t => t.dataset === 'profile' && !truthy(t.attempt) && t.inputs.length < 20);
        if (pending) {
          const room = 20 - pending.inputs.length;
          pending.inputs.push(...fresh.slice(0, room));
          known.push(...fresh.slice(0, room).map(item => Object.values(item)[0]));
          fresh = fresh.slice(room);
        }
      }
      for (let start = 0; start < fresh.length; start += 20) {
        const chunk = fresh.slice(start, start + 20);
        this.state.inputs.push({ dataset, inputs: chunk, attempt: 0 });
        known.push(...chunk.map(item => Object.values(item)[0]));
      }
    }
  }

  profileEnrichmentPending(bundles) {   // REF :219-228; "in flight" replaces "snapshots"
    const missing = bundles.some(b => truthy(b.account.handle)
      && (!truthy(b.account.profile_pic_url) || b.account.followers_count == null));
    return missing && (this.state.inputs.some(t => t.dataset === 'profile')
      || [...this.inFlight].some(op => op.dataset === 'profile'));
  }

  hasWork() { return Boolean(this.state.query_tasks.length || this.state.inputs.length || this.inFlight.size); }

  costOf(kind, dataset) {
    if (kind === 'discovery') {
      const critical = this.state.query_tasks[0]?.index < 5;
      return ENDPOINTS[critical && USE_ADVANCED_FOR_CRITICAL ? 'google_advanced' : 'google'].credits;
    }
    if (dataset === 'profile') return ENDPOINTS.profile.credits + (PROFILE_HAS_RECENT_POSTS ? 0 : ENDPOINTS.posts.credits);
    return ENDPOINTS[dataset === 'comment' ? 'comments' : 'post'].credits;
  }

  peekInput() {
    const tasks = this.state.inputs;
    let index = tasks.findIndex(t => t.dataset === 'profile');
    if (index < 0) index = tasks.findIndex(t => t.dataset === 'post' || t.dataset === 'reel');
    return { index: index < 0 ? 0 : index, task: tasks[index < 0 ? 0 : index] };
  }

  takeInput() {
    const { index, task } = this.peekInput();
    const input = task.inputs.shift();
    if (!task.inputs.length) this.state.inputs.splice(index, 1);
    return { dataset: task.dataset, input, attempt: task.attempt ?? 0 };
  }

  putBack({ dataset, input, attempt }) { this.state.inputs.unshift({ dataset, inputs: [input], attempt }); }

  async discoverOne() {   // REF :230-263 (the single discovery lane guarantees query_tasks[0] is ours)
    const task = this.state.query_tasks[0];
    const critical = task.index < 5;
    try {
      const { json, credits } = await this.client.call(critical && USE_ADVANCED_FOR_CRITICAL ? 'google_advanced' : 'google',
        { query: task.query, country: task.country, language: 'en', results: 10, page: 0 });
      this.state.credits_used += credits;
      const organic = googleToOrganic(json);
      if (critical && !organic.length && task.attempt === 0) { task.attempt += 1; return; }
      this.state.organic.push(...organic);
      this.state.query_tasks.shift();
      this.state.queries_completed += 1;
      auditRecord(this.store, { action: 'ingest.discover.page', provider: PROVIDER, target: this.state.query, status: 'ok',
        lawful_basis: 'licensed_public_data_api', detail: { query_index: task.index, organic_results: organic.length } }, this.clock);
    } catch (error) {
      if (!(error instanceof FetchFailed || error instanceof ValueError) || error instanceof SourceUnavailable) throw error;
      if (this.deferRefusal(error)) return;
      task.attempt += 1;
      if (task.attempt >= 3) {
        this.state.query_tasks.shift();
        this.state.errors.push({ stage: 'discovery', index: task.index, error: pySlice(String(error.message), 0, 300) });
      }
    }
  }

  async enrichOne(job) {
    const { dataset, input } = job;
    try {
      if (dataset === 'profile') {
        const r = await this.client.call('profile', { [ENDPOINTS.profile.param]: input.user_name });
        this.state.credits_used += r.credits;
        const node = profileToNode(r.json);
        if (!PROFILE_HAS_RECENT_POSTS && node.id != null) {
          try {
            const posts = await this.client.call('posts', { [ENDPOINTS.posts.param]: node.id });
            this.state.credits_used += posts.credits;
            node.posts = postsToNodes(posts.json);
          } catch (error) {
            if (!(error instanceof FetchFailed) || error instanceof SourceUnavailable) { (this.state.records.profile ??= []).push(node); throw error; }
            this.state.errors.push({ stage: 'enrich', dataset: 'posts', error: pySlice(String(error.message), 0, 300) });
          }
        }
        (this.state.records.profile ??= []).push(node);
      } else if (dataset === 'comment') {
        const r = await this.client.call('comments', { [ENDPOINTS.comments.param]: input.url });
        this.state.credits_used += r.credits;
        (this.state.records.comment ??= []).push(...commentsToNodes(r.json, input.url));
      } else {
        const param = ENDPOINTS.post.param;
        const r = await this.client.call('post', { [param]: param === 'shortcode' ? lastSegment(input.url) : input.url });
        this.state.credits_used += r.credits;
        const node = postToNode(r.json, input.url);
        (this.state.records[urlKind(input.url) === 'reel' ? 'reel' : dataset] ??= []).push(node);
      }
    } catch (error) {
      if (error instanceof NotFound) return;                        // REF: missing inputs are dropped dataset errors
      if (error instanceof SourceUnavailable || error instanceof QuotaExceeded || error instanceof NotAuthorized) {
        this.putBack(job);
        throw error;
      }
      if (!(error instanceof FetchFailed || error instanceof ValueError)) throw error;
      if (this.deferRefusal(error)) { this.putBack(job); return; }
      if (job.attempt + 1 >= 3) {
        this.state.errors.push({ stage: 'enrich', dataset, error: pySlice(String(error.message), 0, 300) });
        return;
      }
      this.putBack({ ...job, attempt: job.attempt + 1 });
    }
  }

  async collect({ targetResults = 50, budgetSeconds = PAGE_NETWORK_SECONDS } = {}) {   // REF :370-428
    this.checkConfiguration();
    delete this.state.source_error;
    const stopAt = this.monotonic() + budgetSeconds * 1000;
    const pageProfileLimit = Math.max(0, Math.min(50, Math.trunc(Number(this.params.profile_limit ?? 50))));
    const requestedPages = Math.max(1, Math.floor((Math.trunc(targetResults) + 49) / 50));
    this.state.profile_target = Math.min(this.limit(), Math.max(Math.trunc(Number(this.state.profile_target ?? 0)),
      pageProfileLimit * requestedPages));
    this.quotaCheckpoint(true);
    this.schedule();
    const slots = Math.max(1, this.config.concurrency);
    let halted = false;
    let fatal = null;
    let lastKind = 'discovery';   // concurrency 1: REF's turn 0 enriches a queued input before discovering
    const canStart = () => {
      if (halted || fatal || this.monotonic() >= stopAt - 12_000) return false;
      if (this.state.blocked_until > this.clock() / 1000) return false;
      const { bundles } = this.bundles();
      const shortcodes = new Set(bundles.flatMap(b => b.posts).filter(p => truthy(p.permalink)).map(p => lastSegment(p.permalink)));
      return !(bundles.length + shortcodes.size >= targetResults && !this.profileEnrichmentPending(bundles));
    };
    const pick = () => {
      const discovering = [...this.inFlight].some(op => op.kind === 'discovery');
      const canDiscover = this.state.query_tasks.length > 0 && !discovering;
      const canEnrich = this.state.inputs.length > 0;
      if (slots === 1) {
        if (canEnrich && (lastKind === 'discovery' || !canDiscover)) return 'enrich';
        return canDiscover ? 'discovery' : null;
      }
      if (canDiscover) return 'discovery';
      const enrichSlots = slots - (this.state.query_tasks.length ? 1 : 0);
      const enriching = [...this.inFlight].filter(op => op.kind === 'enrich').length;
      return canEnrich && enriching < enrichSlots ? 'enrich' : null;
    };
    const onError = error => {
      if (error instanceof SourceUnavailable) {
        this.state.source_error = { code: error.code, message: error.message };
        auditRecord(this.store, { action: 'ingest.source_blocked', provider: PROVIDER, target: this.state.query,
          status: 'blocked', detail: { code: error.code } }, this.clock);
        halted = true;
      } else if (error instanceof QuotaExceeded) {
        this.state.blocked_until = this.clock() / 1000 + error.retryAfter;
      } else {
        fatal ??= error;
      }
    };
    const launch = kind => {
      const peek = kind === 'enrich' ? this.peekInput() : null;
      const cost = this.costOf(kind, peek?.task.dataset);
      if (this.state.credits_used + this.reserved + cost > this.config.creditBudgetPerSearch) {
        const remaining = this.state.inputs.reduce((n, t) => n + t.inputs.length, 0) + this.state.query_tasks.length;
        this.state.errors.push({ stage: 'budget', error: 'credit budget reached', remaining_inputs: remaining });
        this.state.inputs = [];
        this.state.query_tasks = [];
        halted = true;
        return false;
      }
      const job = kind === 'enrich' ? this.takeInput() : null;
      const op = { kind, dataset: job?.dataset };
      this.reserved += cost;
      this.inFlight.add(op);
      lastKind = kind;
      op.promise = (kind === 'discovery' ? this.discoverOne() : this.enrichOne(job))
        .catch(onError)
        .finally(() => { this.reserved -= cost; this.inFlight.delete(op); this.schedule(); });
      return true;
    };
    for (;;) {
      while (this.inFlight.size < slots && canStart()) {
        const kind = pick();
        if (!kind || !launch(kind)) break;
      }
      if (!this.inFlight.size) break;
      await Promise.race([...this.inFlight].map(op => op.promise));
    }
    this.quotaCheckpoint(false);
    if (fatal) throw fatal;
    return this.bundles().bundles;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/server/collector.test.js`
Expected: PASS (8 tests). If the golden `collector-core` test fails, compare the named fixture with the REF lines
cited in each method, and fix the port, not the golden.

---

### Task 17: Account search, the inline scrape, and REF's `handle_ingest`

**Files:**
- Create: `server/account-search.js`, `server/jobs.js`
- Test: `tests/server/account-search.test.js`

**Interfaces:**
- Consumes:
  - `PagedCollector` (Task 16); `discovery.js` and `adapters.js` (Task 14)
  - `ingestBundle` (Task 9), `assessAccount` (Task 11), `search` (Task 12)
  - `nullAnalysis` (Task 7), `newId` (Task 8)
- Produces `server/jobs.js`, a port of REF queue.py:20-101 limited to enqueue, complete and fail:
  - `enqueue(store, kind, payload, {maxAttempts = 3, clock}) → job`
  - `complete(store, job, result, {clock})`
  - `fail(store, job, error, {clock})`
  - `jobOut(job) → JobOut`, which includes REF `_redact` (api.py:111-125)
- Produces `server/account-search.js`:
  - `accountSearch({client, query, params}) → {bundles, partial}`
  - `keywordScrape({store, client, config, query, params, clock, monotonic}) → {bundles, partial}`
  - `inlineIngest({store, client, config, jobPayload, query, clock, monotonic}) → JobOut`, a port of REF
    api.py:128-211 and worker.py:21-53

- [ ] **Step 1: Write the failing tests**

`tests/server/account-search.test.js` ports these REF tests to the fake client:
- REF `test_bright_data_instagram.py:106-149`, `test_account_collection_uses_bright_data_key_and_normalizes_profile`.
  Serve the recorded `profile` fixture; assert the normalized account's followers, bio, avatar and verified flag
  equal the fixture's values, and that the dossier gets the profile's recent posts.
- REF :283-337, `test_keyword_empty_serp_falls_back_to_exact_profile`. All Google calls return `{organic_results:
  []}` and the profile call returns a record, so one bundle comes back for the exact username.
- REF :205-234 and :236-281. Post calls fail 3 times; the SERP-fallback author, post and thumbnail are kept, and
  `partial` is true.
- REF :378-409, `test_vercel_search_returns_terminal_job_with_inline_results`. `inlineIngest` returns
  `status: 'succeeded'`, with `result.inline_search.hits` non-empty, `result.serverless_inline === true` and
  `analysis_mode === 'heuristics_inline'`.

Plus these three:

```js
test('an invalid username fails the job with REF wording', async () => {
  const job = await inlineIngest(env({ handle: 'bad name!', params: { mode: 'account' } }));
  assert.equal(job.status, 'failed');
  assert.equal(job.error, 'CollectionNotPermitted: account search requires an Instagram username containing letters, numbers, dots, or underscores');
});
test('no bundles fails with REF wording', async () => {
  const job = await inlineIngest(env({ handle: 'ghost', params: { mode: 'account' } }, () => { throw new NotFound('x'); }));
  assert.equal(job.error, 'CollectionNotPermitted: provider returned no ingestible accounts');
});
test('owned and tagged modes fail as REF does without Meta credentials', async () => {
  const job = await inlineIngest(env({ provider: 'instagram_graph', handle: '', params: { mode: 'owned' } }));
  assert.equal(job.status, 'failed');
  assert.match(job.error, /^ProviderNotConfigured: /);
});
```

Here `env(payload, handler)` builds `{store: createStore(), client: fakeClient(handler), config: loadConfig({
SCRAPINGDOG_API_KEY: 'k'}), jobPayload: {provider: 'scrapingdog_instagram', brand_id: null, analyze: true, ...payload,
params: {max_items: 250, include_comments: true, comments_per_post: 20, profile_limit: 50, ...payload.params}},
query: payload.handle, clock, monotonic}`.

Run: `node --test tests/server/account-search.test.js`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 2: Implement `server/jobs.js`**

A port of REF `queue.py:20-101`:
- `enqueue` inserts `{public_id: newId(), kind, status: 'queued', payload, result: {}, error: null, attempts: 0,
  max_attempts, available_at, locked_at: null, locked_by: null, created_at, updated_at}` and writes the
  `queue.enqueue` audit row, `{payload_keys: sorted(Object.keys(payload))}`.
- `complete` and `fail` follow REF, including their audit rows. `fail` with `attempts >= max_attempts` gives status
  `failed`, and it truncates errors to 4000 characters and audit detail to 500.
- `jobOut(job)` returns `{id: public_id, kind, status, attempts, payload: redact(payload), result, error,
  created_at, updated_at}`. `redact` replaces the value of any key whose lowercase name contains `token`, `secret`,
  `password` or `api_key` with `[REDACTED]`, recursing into objects and arrays.

- [ ] **Step 3: Implement `server/account-search.js`**

```js
// Sync ports of REF _account_search (bright_data_instagram.py:767-790), fetch_many (:926-944),
// worker.handle_ingest (worker.py:21-53) and api._serverless_inline_ingest (api.py:128-211).
import { record as auditRecord } from './audit.js';
import { ENDPOINTS, PROFILE_HAS_RECENT_POSTS } from './costs.js';
import { commentsToNodes, postsToNodes, profileToNode } from './adapters.js';
import { account as parseAccount, canonicalInstagramUrl, comment as parseComment, post as parsePost, provenance,
  USERNAME_RE } from './discovery.js';
import { CollectionNotPermitted, FetchFailed, NotFound, ProviderNotConfigured, SourceUnavailable, ValueError } from './errors.js';
import { or, pyLstrip, pyStrip, pyStr, truthy } from './engine/pycompat.js';
import { nullAnalysis } from './engine/risk-core.js';
import { assessAccount } from './engine/risk.js';
import { search } from './engine/search.js';
import { ingestBundle } from './normalize.js';
import { PagedCollector } from './collector.js';
import { rawBundle } from './raw.js';
import { PROVIDER } from './scrapingdog.js';
import { complete, enqueue, fail, jobOut } from './jobs.js';
import { newId } from './store.js';
import { utcnowIso } from './time.js';

const limitOf = params => Math.max(1, Math.min(Math.trunc(Number(params.max_items ?? 100)), 500));

async function attempts(fn, times = 3) {   // failed ScrapingDog requests are free, so transient errors are retried
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); } catch (error) {
      const transient = error instanceof FetchFailed && !(error instanceof SourceUnavailable) && ![429, 503].includes(error.statusCode);
      if (!transient || attempt >= times) throw error;
    }
  }
}

export async function accountSearch({ client, query, params, clock = Date.now }) {
  const username = pyStrip(pyLstrip(query, '@'));
  if (!USERNAME_RE.test(username)) {
    throw new CollectionNotPermitted('account search requires an Instagram username containing letters, numbers, dots, or underscores');
  }
  let node;
  try { node = profileToNode((await attempts(() => client.call('profile', { [ENDPOINTS.profile.param]: username }))).json); }
  catch (error) { if (error instanceof NotFound) return { bundles: [], partial: false }; throw error; }
  let partial = false;
  if (!PROFILE_HAS_RECENT_POSTS && node.id != null) {
    try { node.posts = postsToNodes((await attempts(() => client.call('posts', { [ENDPOINTS.posts.param]: node.id }))).json); }
    catch (error) { if (!(error instanceof FetchFailed) || error instanceof SourceUnavailable) throw error; partial = true; }
  }
  const account = parseAccount(node, username);
  const posts = or(node.posts, []).filter(p => p && typeof p === 'object').map(p => parsePost(p)).slice(0, limitOf(params));
  const grouped = new Map();
  if (params.include_comments ?? true) {
    const limit = Math.max(1, Math.min(Math.trunc(Number(or(params.comments_per_post, 50))), 100));
    const urls = [...new Set(posts.map(p => p.permalink).filter(truthy))].slice(0, limitOf(params));
    await Promise.all(urls.map(async url => {
      try {
        const records = commentsToNodes((await attempts(() => client.call('comments', { [ENDPOINTS.comments.param]: url }))).json, url);
        for (const record of records) {
          const key = canonicalInstagramUrl(pyStr(or(record.post_url, '')));
          if (!key) continue;
          if (!grouped.has(key)) grouped.set(key, []);
          const list = grouped.get(key);
          if (list.length >= limit) continue;
          const parent = parseComment(record);
          list.push(parent);
          for (const reply of or(record.replies, [])) if (list.length < limit) list.push(parseComment(reply, parent.platform_comment_id));
        }
      } catch (error) {
        if (error instanceof NotFound) return;
        if (!(error instanceof FetchFailed) || error instanceof SourceUnavailable) throw error;
        partial = true;
      }
    }));
  }
  for (const p of posts) p.comments = grouped.get(or(p.permalink, '')) ?? [];   // REF one-shot replaces embedded comments
  return { bundles: [rawBundle(account, posts, provenance('account', username, utcnowIso(clock)))], partial };
}

export async function keywordScrape({ store, client, config, query, params, clock = Date.now, monotonic = () => performance.now() }) {
  const state = { version: 1, id: newId(), expires_at: clock() / 1000 + 21600, query, retrieved_at: utcnowIso(clock),
    visible: [], page: 0, params: { ...params, mode: 'keyword' } };
  const collector = new PagedCollector({ store, state, client, config, clock, monotonic });
  const started = monotonic();
  for (let target = 50; ; target += 50) {
    const left = 145 - (monotonic() - started) / 1000;
    if (left <= 12) break;
    await collector.collect({ targetResults: target, budgetSeconds: Math.min(48, left) });
    if (!collector.hasWork() || state.source_error || state.blocked_until > clock() / 1000) break;
  }
  return { bundles: collector.bundles().bundles, partial: collector.hasWork() || state.errors.length > 0 };
}

async function fetchMany(ctx, payload) {   // REF fetch_many + provider selection results (api.py:449-467)
  const params = payload.params ?? {};
  if (payload.provider === 'instagram_graph') {
    throw new ProviderNotConfigured('instagram_graph requires DARKMAP_IG_ACCESS_TOKEN and DARKMAP_IG_BUSINESS_ID');
  }
  if (!ctx.config.scrapingdogApiKey) throw new ProviderNotConfigured('scrapingdog_instagram requires SCRAPINGDOG_API_KEY');
  const mode = String(or(params.mode, 'account')).toLowerCase();
  const handle = payload.handle ?? '';
  const result = mode === 'account'
    ? await accountSearch({ client: ctx.client, query: handle, params, clock: ctx.clock })
    : await keywordScrape({ ...ctx, query: pyStrip(pyLstrip(handle, '#')), params });
  const bundles = result.bundles.filter(b => truthy(b.account.handle));
  auditRecord(ctx.store, { action: 'ingest.fetch', provider: PROVIDER, target: pyLstrip(handle, '@#'), status: 'ok',
    lawful_basis: 'licensed_public_data_api', detail: { mode, accounts: bundles.length,
      posts: bundles.reduce((n, b) => n + b.posts.length, 0) } }, ctx.clock);
  return { bundles, partial: result.partial };
}

export async function inlineIngest(ctx) {
  const { store, jobPayload, query, clock = Date.now } = ctx;
  let job = enqueue(store, 'ingest', jobPayload, { maxAttempts: 1, clock });
  Object.assign(job, { status: 'running', locked_at: utcnowIso(clock), locked_by: 'vercel:inline', attempts: 1 });
  try {
    const { bundles, partial } = await fetchMany(ctx, jobPayload);
    if (!bundles.length) throw new CollectionNotPermitted('provider returned no ingestible accounts');
    const brand = jobPayload.brand_id != null ? store.table('brands').get(jobPayload.brand_id) : null;
    if (jobPayload.brand_id != null && !brand) throw new ValueError(`brand ${jobPayload.brand_id} not found`);
    const imported = bundles.map(bundle => ingestBundle(store, bundle, { brand, clock }));
    const result = { accounts: imported.map(i => ({ account_id: i.account_id, posts: i.posts, media: i.media, comments: i.comments })),
      account_count: imported.length, posts: imported.reduce((n, i) => n + i.posts, 0),
      media: imported.reduce((n, i) => n + i.media, 0), comments: imported.reduce((n, i) => n + i.comments, 0),
      collection_partial: partial };
    if (imported.length === 1) result.account_id = imported[0].account_id;
    const accountIds = imported.map(i => i.account_id);
    if (jobPayload.analyze ?? true) {
      const provider = { name: 'null', analyze: () => nullAnalysis('serverless_live_search: fast heuristic assessment; '
        + 'run a durable deployment for queued Claude analysis') };
      result.assessments = accountIds.map(accountId => {
        const a = assessAccount(store, accountId, { brandId: jobPayload.brand_id, provider, clock });
        const acc = store.table('accounts').get(accountId);
        return { assessment_id: a.id, account_id: accountId, handle: acc?.handle ?? null,
          profile_pic_url: acc?.profile_pic_url ?? null,
          instagram_url: acc ? `https://www.instagram.com/${acc.handle}/` : null,
          overall_score: a.overall_score, category_scores: or(a.category_scores, {}), evidence: or(a.evidence, []),
          limitations: or(a.limitations, []), ai_available: a.ai_available, dimensions: or(a.dimensions, {}),
          alert_families: or(a.alert_families, {}), independent_indicators: or(a.independent_indicators, 0),
          summary: a.summary, top_evidence: or(a.evidence, []).slice(0, 8), recommended_action: a.recommended_action,
          confidence: a.confidence, created_at: a.created_at ?? null };
      });
      result.analysis_mode = 'heuristics_inline';
    }
    const snapshot = search(store, { q: null, scope: 'all', accountIds, limit: 500 });
    result.inline_search = { ...snapshot, query, complete_collection: !result.collection_partial };
    result.serverless_inline = true;
    complete(store, job, result, { clock });
  } catch (error) {
    fail(store, job, `${error.name}: ${error.message}`, { clock });
  }
  return jobOut(job);
}
```

The `ProviderNotConfigured` text in `fetchMany` is REF's exact string from `providers/instagram_graph.py:71-72`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/server/account-search.test.js`
Expected: PASS.

---

### Task 18: The `/v1` API, request plumbing, and the Vite mount

**Files:**
- Create: `server/http.js`, `server/schemas.js`, `server/api.js`, `server/vite-plugin.js`
- Modify: `vite.config.mjs`, to register the plugin
- Test: `tests/api/helpers.js`, `tests/api/contract.test.js`, `tests/api/search-page.test.js`, `tests/api/scrape.test.js`

**Interfaces:**
- Consumes everything from Tasks 3-17.
- Produces `server/http.js`:
  - `readJson(req, maxBytes) → Promise<any>`
  - `send(res, status, body)`
  - `protect(req, config) → null | {status, body}`, a port of REF api.py:74-93
- Produces `server/schemas.js`: `parseBrandIn`, `parseScrapeIn`, `parseSearchPageIn`, `parseAnalyzeIn`, `parseCaseIn`
  and `parseCaseUpdate`. They follow REF schemas.py defaults, bounds and literals, and throw
  `HttpError(422, [{type, loc, msg, input}])`.
- Produces `server/api.js`:
  - `createApp({config, store?, client?, clock?, monotonic?, collectorFactory?, fetchImpl?}) → {handles(req): boolean,
    handle(req, res): Promise<void>, store}`.
  - `collectorFactory` defaults to `opts => new PagedCollector(opts)`. It's a test seam that REF's tests get from
    `monkeypatch`.
- Produces `server/vite-plugin.js`: `default darkmapApi(env) → Vite plugin`.

- [ ] **Step 1: Write the test server helper**

`tests/api/helpers.js`:

```js
import { createServer } from 'node:http';
import { createStore } from '../../server/store.js';
import { loadConfig } from '../../server/config.js';
import { createApp } from '../../server/api.js';

export async function startApp({ env = {}, client, collectorFactory, store = createStore(), clock, monotonic } = {}) {
  const config = loadConfig({ SCRAPINGDOG_API_KEY: 'k', DARKMAP_SEARCH_CURSOR_SECRET: 'test-secret', CREDIT_CAP_PER_DAY: '0', ...env });
  const app = createApp({ config, store, client, collectorFactory, ...(clock ? { clock } : {}), ...(monotonic ? { monotonic } : {}) });
  const server = createServer((req, res) => (app.handles(req) ? app.handle(req, res) : (res.statusCode = 404, res.end())));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, path, body, headers = {}) => {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, text };
  };
  return { app, store, request, close: () => new Promise(resolve => server.close(resolve)) };
}
```

- [ ] **Step 2: Write the failing contract tests**

`tests/api/contract.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';
import { parseSearchPageIn } from '../../server/schemas.js';

test('healthz reports the ScrapingDog source the dashboard expects', async () => {
  const on = await startApp();
  const health = (await on.request('GET', '/healthz')).body;
  assert.equal(health.status, 'ok');
  assert.equal(health.instagram.configured, false);
  assert.deepEqual(health.instagram_alternative, { provider: 'scrapingdog_instagram', configured: true, keyword_search_configured: true });
  await on.close();
  const off = await startApp({ env: { SCRAPINGDOG_API_KEY: '' } });
  assert.equal((await off.request('GET', '/healthz')).body.instagram_alternative.keyword_search_configured, false);
  const page = await off.request('POST', '/v1/instagram/search-page', { query: 'Brand' });
  assert.deepEqual([page.status, page.body.detail], [503, 'An Instagram keyword collection source is required']);
  await off.close();
});

test('REF test_api_key_auth_request_limit_and_secret_redaction', async () => {
  const app = await startApp({ env: { DARKMAP_API_KEY: 'letmein', DARKMAP_MAX_REQUEST_BYTES: '100' } });
  assert.deepEqual((await app.request('GET', '/v1/brands')).body, { detail: 'invalid or missing API key' });
  assert.equal((await app.request('GET', '/v1/brands', undefined, { 'x-api-key': 'letmein' })).status, 200);
  assert.equal((await app.request('GET', '/v1/brands', undefined, { authorization: 'Bearer letmein' })).status, 200);
  assert.equal((await app.request('GET', '/healthz')).status, 200);
  const big = await app.request('POST', '/v1/brands', { name: 'x'.repeat(200) }, { 'x-api-key': 'letmein' });
  assert.deepEqual([big.status, big.body.detail], [413, 'request body too large']);
  await app.close();
});

test('REF test_search_page_requests_metadata_for_all_fifty_accounts', () => {
  assert.equal(parseSearchPageIn({ query: 'Brand' }).profile_limit, 50);
});

test('REF test_alert_campaign_case_endpoints_exist, legal pages, brands, jobs, audit', async () => {
  const app = await startApp();
  for (const path of ['/v1/alerts?min_score=45&limit=200', '/v1/campaigns?limit=200', '/v1/cases?limit=200',
    '/v1/jobs?limit=100', '/v1/audit?limit=100', '/v1/brands', '/v1/accounts?limit=200&offset=0']) {
    const r = await app.request('GET', path);
    assert.equal(r.status, 200, path);
    assert.ok(Array.isArray(r.body), path);
  }
  const created = await app.request('POST', '/v1/cases', { title: 'Test investigation' });   // REF :139-145
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'open');
  const pack = await app.request('GET', `/v1/cases/${created.body.id}/evidence-package`);
  assert.equal(pack.status, 200);
  assert.equal(pack.body.format, 'darkmap-evidence-package/v1');
  const brand = await app.request('POST', '/v1/brands', { name: 'Acme', official_handles: ['@Acme'] });
  assert.deepEqual([brand.status, brand.body.official_handles], [201, ['acme']]);
  assert.equal((await app.request('POST', '/v1/brands', { name: 'Acme' })).status, 409);
  for (const path of ['/privacy', '/data-deletion']) assert.match((await app.request('GET', path)).text, /<html/i);
  await app.close();
});
```

- [ ] **Step 3: Write the failing search-page tests (ported from REF test_search_pages.py plus Review Focus 4)**

`tests/api/search-page.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';
import { createStore } from '../../server/store.js';
import { fakeClient, fakeClock } from '../helpers/fake-scrapingdog.js';
import { hitKey } from '../../server/collector.js';

// REF test_pages_of_50...: collect() is replaced so each "invocation" sees the same 1 profile + 106 posts.
const pagedRecords = calls => opts => {
  const real = opts.makeReal();
  real.collect = async ({ targetResults }) => {
    calls.push(targetResults);
    if (!real.state.records.profile) {
      real.state.records.profile = [{ account: 'brand.research', followers: 432, full_name: 'Brand research',
        biography: 'Product reviews', posts: [] }];
      real.state.records.post = Array.from({ length: 106 }, (_, i) => ({ url: `https://www.instagram.com/p/POST${i}/`,
        user_posted: 'brand.research', post_id: String(i), description: `Brand product review ${i} #brand @brand`,
        image_url: `https://cdn.example/${i}.jpg`, likes: i,
        latest_comments: [{ id: `c${i}`, username: 'reader', text: 'Useful review' }] }));
    }
    real.state.query_tasks = [];
    real.state.inputs = [];
    real.state.queries_completed = 17;
    return real.bundles().bundles;
  };
  return real;
};

test('REF: pages of 50 preserve every row and metadata across store restarts', async () => {
  const calls = [];
  let cursor = null;
  let previous = new Set();
  const pages = [];
  for (const [page, expected] of [50, 100, 107].entries()) {
    const app = await startApp({ store: createStore(), collectorFactory: pagedRecords(calls) });
    const r = await app.request('POST', '/v1/instagram/search-page', { query: 'Brand', continuation: cursor, max_items: 250, profile_limit: 50 });
    assert.equal(r.status, 200, r.text);
    const body = r.body.result;
    pages.push(body);
    const keys = new Set(body.inline_search.hits.map(hitKey));
    assert.equal(keys.size, expected);
    assert.equal(body.inline_search.hits.length, expected);
    for (const key of previous) assert.ok(keys.has(key));
    for (const hit of body.inline_search.hits) {
      assert.equal(hit.followers_count, 432);
      if (hit.doc_type === 'post') {
        assert.ok(hit.image_url.startsWith('https://cdn.example/'));
        assert.equal(hit.comments[0].text, 'Useful review');
        assert.deepEqual(hit.hashtags, ['brand']);
      }
    }
    assert.equal(body.pagination.has_more, page < 2);
    cursor = body.pagination.continuation;
    previous = keys;
    await app.close();
  }
  assert.equal(cursor, null);
  assert.deepEqual(calls, [50, 100, 150]);
  for (const hit of pages[0].inline_search.hits) {
    assert.equal(pages[2].inline_search.hits.find(h => hitKey(h) === hitKey(hit)).risk_score, hit.risk_score);
  }
});

test('REF test_malformed_cursor_cannot_launch_network_work', async () => {
  const client = fakeClient(() => { throw new Error('network'); });
  const app = await startApp({ client });
  const r = await app.request('POST', '/v1/instagram/search-page', { query: 'Brand', continuation: 'bad' });
  assert.equal(r.status, 400);
  assert.equal(client.calls.length, 0);
  await app.close();
});

for (const [scenario, status, outcome] of [['inactive', 'failed', 'blocked'], ['errors', 'failed', 'failed'],
  ['pending', 'succeeded', 'pending'], ['empty', 'succeeded', 'empty'], ['partial_blocked', 'succeeded', 'blocked']]) {
  test(`REF test_page_outcome_matches_collection_evidence[${scenario}]`, async () => {
    const app = await startApp({ collectorFactory: opts => {
      const real = opts.makeReal();
      real.collect = async () => {
        const s = real.state;
        if (scenario === 'inactive' || scenario === 'partial_blocked') {
          s.source_error = { code: 'source_account_inactive', message: 'The collection account is inactive. Reactivate it, then retry.' };
        }
        if (scenario === 'partial_blocked') s.records.profile = [{ account: 'brand.research', followers: 10 }];
        if (scenario === 'errors' || scenario === 'empty') {
          s.query_tasks = [];
          s.inputs = [];
          s.queries_completed = scenario === 'errors' ? 0 : 17;
        }
        if (scenario === 'errors') s.errors = [{ stage: 'discovery', error: 'blank response' }];
        return real.bundles().bundles;
      };
      return real;
    } });
    const r = await app.request('POST', '/v1/instagram/search-page', { query: 'Brand' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.status, status);
    assert.equal(r.body.result.collection_outcome, outcome);
    assert.equal(r.body.result.pagination.outcome, outcome);
    assert.equal(r.body.result.inline_search.complete_collection, scenario === 'empty');
    assert.equal(Boolean(r.body.result.pagination.continuation), ['inactive', 'pending', 'partial_blocked'].includes(scenario));
    assert.equal(Boolean(r.body.error), ['inactive', 'errors', 'partial_blocked'].includes(scenario));
    if (scenario === 'partial_blocked') assert.equal(r.body.result.inline_search.hits.length, 1);
    await app.close();
  });
}

test('replaying a continuation spends nothing and returns the same response (Review Focus 4)', async () => {
  // 20 s per fake call: a 48 s page stops after two calls, so work (and a continuation) remains.
  const clock = fakeClock();
  const client = fakeClient(endpoint => ({ json: endpoint.startsWith('google') ? { organic_results: [
    { link: 'https://www.instagram.com/reel/R1/', source: 'Instagram · seller', title: 'Brand loot' }] }
    : { username: 'brand', followers_count: 3, profile_pic_url: 'https://x', id: '1', posts: [] }, credits: 5 }),
    { clock, stepMs: 20_000 });
  const app = await startApp({ client, clock: clock.now, monotonic: clock.monotonic, env: { SCRAPINGDOG_CONCURRENCY: '1' } });
  const first = await app.request('POST', '/v1/instagram/search-page', { query: 'Brand' });
  const continuation = first.body.result.pagination.continuation;
  assert.ok(continuation);
  const second = await app.request('POST', '/v1/instagram/search-page', { query: 'Brand', continuation });
  const callsAfterSecond = client.calls.length;
  const replay = await app.request('POST', '/v1/instagram/search-page', { query: 'Brand', continuation });
  assert.equal(client.calls.length, callsAfterSecond);
  assert.deepEqual(replay.body, second.body);
  await app.close();
});
```

`tests/api/scrape.test.js` ports:
- REF `test_bright_data_instagram.py:355-376`, `test_instagram_endpoint_auto_selects_bright_data`. With the key set,
  `POST /v1/instagram/scrape {mode:'keyword', query:'brand'}` returns 202 with `payload.provider ===
  'scrapingdog_instagram'`.
- :378-409 through the route: `{mode:'account', query:'brand'}` returns 202, `status: 'succeeded'`, and
  `result.inline_search.hits.length > 0`.

Add these assertions too:
- `{provider:'bright_data', mode:'owned'}` → 422 with detail `'owned and tagged modes require the authorized Meta API'`
- `{provider:'meta', mode:'account', query:'x'}` → 503 with `'Meta Instagram credentials are not configured'`
- `{mode:'account', query:''}` → 422 with `'query is required for account, hashtag, and keyword modes'`

Run: `node --test tests/api/`
Expected: FAIL, `Cannot find module`.

- [ ] **Step 4: Implement `server/http.js` and `server/schemas.js`**

`server/http.js`:

```js
// Request plumbing: JSON bodies, REF's access-key/size middleware (api.py:74-93), JSON responses.
import { timingSafeEqual } from 'node:crypto';
import { HttpError } from './errors.js';

export function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  res.end(text);
}

export function protect(req, config) {
  if (!req.url.startsWith('/v1/')) return null;
  if (config.apiKey) {
    let supplied = req.headers['x-api-key'] ?? '';
    const auth = req.headers.authorization ?? '';
    if (auth.toLowerCase().startsWith('bearer ')) supplied = auth.slice(7).trim();
    const a = Buffer.from(String(supplied));
    const b = Buffer.from(config.apiKey);
    if (!supplied || a.length !== b.length || !timingSafeEqual(a, b)) return { status: 401, body: { detail: 'invalid or missing API key' } };
  }
  const length = req.headers['content-length'];
  if (length !== undefined) {
    if (!/^\d+$/.test(length)) return { status: 400, body: { detail: 'invalid Content-Length' } };
    if (Number(length) > config.maxRequestBytes) return { status: 413, body: { detail: 'request body too large' } };
  }
  return null;
}

export async function readJson(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'request body too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return undefined;
  try { return JSON.parse(text); }
  catch { throw new HttpError(422, [{ type: 'json_invalid', loc: ['body', 0], msg: 'JSON decode error', input: {} }]); }
}
```

`server/schemas.js` gives one parser per REF request model, applying REF defaults and bounds exactly
(schemas.py:8-191):
- **BrandIn:** `name` is a required string; `official_handles`, `official_domains` and `keywords` are string lists
  defaulting to `[]`.
- **InstagramScrapeIn:**
  - `provider` is one of `auto|meta|bright_data`, default `auto`
  - `mode` is one of `account|owned|hashtag_recent|hashtag_top|keyword|tagged`, default `account`
  - `query` is a string, `max_length` 200, default `''`
  - `brand_id` is an int or null
  - `max_items` 1-500, default 100; `page_size` 1-100, default 50; `max_pages` 1-20, default 10
  - `include_comments` true; `comments_per_post` 1-100, default 50; `profile_limit` 0-50, default 25
  - `analyze` true; `fresh` false
- **InstagramSearchPageIn:** InstagramScrapeIn plus `mode` with the literal `'keyword'`, `batch_size` with the
  literal `50`, `profile_limit` default 50, and `continuation` an optional string of at most 1_800_000 characters.
- **AnalyzeIn:** `brand_id`, `media_analysis` and `inline` (default false).
- **CaseIn / CaseUpdate:** the literal sets, lengths and `artifact_ids` lists given at schemas.py:174-191.

Coercion follows Pydantic's lax mode: numeric strings become ints, `true`/`false`/`1`/`0` become booleans, and unknown
keys are ignored. Any violation throws `HttpError(422, [{type, loc: ['body', field], msg, input}])`.

- [ ] **Step 5: Implement `server/api.js`**

Structure. The router matches `METHOD path-pattern`, and every handler is a port of the cited REF function:

```js
// The REF dashboard's API (REF darkmap/api.py) over the ScrapingDog pipeline.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { record as auditRecord } from './audit.js';
import { PagedCollector, hitKey } from './collector.js';
import { decodeCursor, encodeCursor, resolveCursorSecret } from './cursor.js';
import { HttpError, InvalidSearchCursor, NotAuthorized } from './errors.js';
import { assessAccount } from './engine/risk.js';
import { nullAnalysis } from './engine/risk-core.js';
import { search } from './engine/search.js';
import { dedupe, or, pyRound, pySplit, pyStrip } from './engine/pycompat.js';
import { inlineIngest } from './account-search.js';
import { ingestBundle } from './normalize.js';
import { protect, readJson, send } from './http.js';
import { parseAnalyzeIn, parseBrandIn, parseCaseIn, parseCaseUpdate, parseScrapeIn, parseSearchPageIn } from './schemas.js';
import { createClient, PROVIDER } from './scrapingdog.js';
import { createStore, newId } from './store.js';
import { usage } from './quota.js';
import { utcnowIso } from './time.js';
import { jobOut } from './jobs.js';

const STATIC = join(process.cwd(), 'public', 'static');
const QUICK_SEARCH_OFFICIAL_CONTEXTS = {   // REF api.py:51-60
  sbi: { handles: ['theofficialsbi', 'sbilifeinsurance', 'sbimutualfund'], domains: ['sbi.bank.in'] },
  hdfc: { handles: ['hdfcbank', 'hdfcsec'], domains: ['hdfcbank.com', 'hdfcsec.com'] },
};
const asciiLower = s => String(s ?? '').replace(/[A-Z]/g, c => c.toLowerCase());

export function createApp({ config, store, client, clock = Date.now, monotonic = () => performance.now(),
  collectorFactory = opts => new PagedCollector(opts), fetchImpl } = {}) {
  if (!store) { store = createStore({ file: config.dataFile }); store.load(); }
  client ??= createClient({ config, store, fetchImpl, clock });
  const cursorSecret = resolveCursorSecret(config);
  const replay = new Map();   // Review Focus 4: last 20 page responses by `${checkpoint.id}:${page}`
  const ctx = { config, store, client, clock, monotonic, cursorSecret };
  const routes = [
    ['GET', /^\/healthz$/, healthz],
    ['GET', /^\/privacy$/, () => ({ html: 'privacy.html' })],
    ['GET', /^\/data-deletion$/, () => ({ html: 'data-deletion.html' })],
    ['POST', /^\/v1\/brands$/, createBrand, 201],
    ['GET', /^\/v1\/brands$/, listBrands],
    ['POST', /^\/v1\/instagram\/search-page$/, searchPage],
    ['POST', /^\/v1\/instagram\/scrape$/, scrape, 202],
    ['GET', /^\/v1\/ingest\/jobs\/([^/]+)$/, getJob],
    ['GET', /^\/v1\/jobs$/, listJobs],
    ['GET', /^\/v1\/accounts$/, listAccounts],
    ['GET', /^\/v1\/accounts\/(\d+)$/, getAccount],
    ['GET', /^\/v1\/accounts\/(\d+)\/assessments$/, accountAssessments],
    ['GET', /^\/v1\/accounts\/(\d+)\/history$/, accountHistory],
    ['POST', /^\/v1\/analysis\/accounts\/(\d+)$/, analyzeAccount],
    ['GET', /^\/v1\/assessments\/(\d+)$/, getAssessment],
    ['GET', /^\/v1\/alerts$/, listAlerts],
    ['GET', /^\/v1\/campaigns$/, listCampaigns],
    ['POST', /^\/v1\/cases$/, createCase, 201],
    ['GET', /^\/v1\/cases$/, listCases],
    ['PATCH', /^\/v1\/cases\/(\d+)$/, updateCase],
    ['GET', /^\/v1\/cases\/(\d+)\/evidence-package$/, evidencePackage],
    ['GET', /^\/v1\/search$/, searchRoute],
    ['GET', /^\/v1\/audit$/, auditTail],
  ];
  const match = req => {
    const path = req.url.split('?')[0];
    for (const [method, pattern, handler, status = 200] of routes) {
      const m = pattern.exec(path);
      if (m && method === req.method) return { handler, status, args: m.slice(1) };
    }
    return null;
  };
  // … the route handlers below, each closing over ctx …
  return {
    store,
    handles: req => match(req) !== null || req.url.startsWith('/v1/'),
    async handle(req, res) {
      const blocked = protect(req, config);
      if (blocked) return send(res, blocked.status, blocked.body);
      const route = match(req);
      if (!route) return send(res, 404, { detail: 'Not Found' });
      try {
        const query = new URL(req.url, 'http://local').searchParams;
        const body = ['POST', 'PATCH'].includes(req.method) ? await readJson(req, config.maxRequestBytes) : undefined;
        const out = await route.handler({ ...ctx, replay, query, body }, ...route.args);
        if (out?.html) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          return res.end(readFileSync(join(STATIC, out.html)));
        }
        store.save();
        return send(res, route.status, out);
      } catch (error) {
        if (error instanceof HttpError) return send(res, error.status, { detail: error.detail });
        console.error(error);
        return send(res, 500, { detail: 'Internal Server Error' });
      }
    },
  };
}
```

Handlers to write inside `createApp`, each porting the REF lines shown and returning REF's response shapes. Use
`jobOut` for JobOut; the Out models list fields in REF schemas.py order.

| Handler | REF lines | Port notes |
|---|---|---|
| `healthz` | api.py:214-256 | See Step 5a below. |
| `createBrand`, `listBrands` | :260-277 | Duplicate name → 409 with detail `brand "X" already exists`; handles become `pyLstrip(h, '@').toLowerCase()`; domains lowercase; list ordered by name in code-point order. |
| `searchPage` | :281-431 | Port the full logic, keeping REF's order: brand/checkpoint creation, then `collectorFactory({store, state: checkpoint, client, config, clock, monotonic, makeReal})`, then collect, then the brand upsert by exact name, then import, then assessments with `nullAnalysis('paged_live_search: deterministic risk assessment')`, then `search(..., limit: 2000)`, then deduplication by `hitKey`, then the visible/buffered/`has_more`/outcome logic, then facets, then the continuation (`InvalidSearchCursor` → 413), then the result object with REF's keys plus `pagination.credits_used`, then the audit `ingest.page`. `makeReal: () => new PagedCollector(opts)` is the test seam. Replay: after decoding, look up `replay.get(`${id}:${page}`)` and return it if found; after building a response, store it and drop the oldest entry beyond 20. `pending_snapshots` is the count of queued inputs. `retry_after_seconds: Math.max(0, Math.trunc(blocked_until - clock()/1000))`. `total_seconds: pyRound(elapsed, 3)`. `NotAuthorized` → `HttpError(403, 'The connected collection source refused access. Check access settings.')`. |
| `scrape` | :434-524 | Validation and REF detail strings; provider selection with `meta_ready = false` and ScrapingDog ready when the key is set; `bright_data` is a synonym; a missing key gives 503 `SCRAPINGDOG_API_KEY is not configured`. For keyword/hashtag modes, infer the brand exactly as :469-487, with the brand name compared through `asciiLower`. `params` and `job_payload` keys and order as :489-505, with `provider: 'scrapingdog_instagram'` or `'instagram_graph'`. Always `await inlineIngest(...)`. |
| `getJob`, `listJobs` | :537-551 | `listJobs`: `status` filter, `limit` ≤ 200 (else 422), ordered by id descending. |
| `listAccounts`, `getAccount`, `accountAssessments`, `accountHistory` | :555-589, :660-669 | `listAccounts` orders by `latest_risk_score DESC` with NULLs last, then id. `AccountOut` fields as schemas.py:100-114. `post_count` is the account's post count. The latest assessment uses the (created_at, id) descending order. |
| `analyzeAccount` | :593-609 | Run `assessAccount` with the default null provider. `inline: true` → `{mode: 'inline', assessment}`. Otherwise record a job with kind `analyze` that is already `succeeded`, holding REF's `handle_analyze` result (`assessment_id`, `overall_score`, `recommended_action`, `ai_available`), and return `{mode: 'queued', job: jobOut(job)}`. |
| `getAssessment`, `listAlerts`, `listCampaigns` | :612-697 | Straight ports, including the alerts query of :626-636 (inherited as-is) and campaign member handles. |
| `createCase`, `listCases`, `updateCase`, `evidencePackage` | :700-793 | The manifest hash is sha256 of Python `str([(id, hash), …])`, i.e. `pyRepr(artifacts.map(a => [a.id, a.content_hash]))` with each pair printed as a tuple: `'(' + pyRepr(id) + ', ' + pyRepr(hash) + ')'` joined as a list. |
| `searchRoute` | :815-835 | `doc_type` and `scope` use REF's patterns, else 422; `account_ids` are comma-separated ints, else 422 with `account_ids must be comma-separated integers`; `limit` ≤ 500. |
| `auditTail` | :839-847 | |

**Step 5a: the `healthz` payload.** It has REF's keys:
- `status`, `env: 'local'`, `database: 'json'`
- `ai: {provider: 'experiential_labs_claude', model: 'claude-opus-5', configured: false}`
- `instagram: {provider: 'meta_graph_api_v26', configured: false}`
- `instagram_alternative: {provider: 'scrapingdog_instagram', configured, keyword_search_configured}`
- `ingestion_providers`: `[{name: 'instagram_graph', lawful_basis: 'official_api'}, {name: 'scrapingdog_instagram',
  lawful_basis: 'licensed_public_data_api'}]`
- `quota: {scrapingdog_instagram: usage(...)}`
- `compliance`, and `brand_protection` as REF

- [ ] **Step 6: Implement `server/vite-plugin.js` and register it**

```js
// Mounts the REF-compatible API inside Vite's dev and preview servers (spec §4.2).
import { createApp } from './api.js';
import { loadConfig } from './config.js';

export default function darkmapApi(env) {
  let app = null;
  const mount = server => {
    app ??= createApp({ config: loadConfig(env) });
    server.middlewares.use((req, res, next) => (app.handles(req) ? app.handle(req, res) : next()));
  };
  return { name: 'darkmap-api', configureServer: mount, configurePreviewServer: mount };
}
```

In `vite.config.mjs`, add `import darkmapApi from './server/vite-plugin.js';` and `plugins: [darkmapApi(env)],`
alongside `server`/`preview`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/api/`
Expected: PASS.

Then run the full suite with `npm test`.
Expected: `fail 0`.

---

### Task 19: CLI scan, key-hygiene check, live smoke test, README

**Files:**
- Create: `scripts/scan.js`, `tests/server/key-hygiene.test.js`, `tests/live/smoke.test.js`, `README.md`

**Interfaces:**
- Consumes: `createApp` (Task 18), `loadConfig` (Task 13).
- Produces:
  - `npm run scan -- "<keyword>" [--pages=N]` or `npm run scan -- "@handle"`, which prints a ranked table and the
    credits used
  - `LIVE=1 npm test`, which runs the smoke test

- [ ] **Step 1: Write the key-hygiene test**

`tests/server/key-hygiene.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { PROJECT_ROOT } from '../helpers/ref.js';

const walk = dir => readdirSync(dir).flatMap(n => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const envKey = () => {
  const file = join(PROJECT_ROOT, '.env');
  return existsSync(file) ? (readFileSync(file, 'utf8').match(/^SCRAPINGDOG_API_KEY=(.*)$/m)?.[1] ?? '').trim() : '';
};

test('neither the key name nor its value reaches index.html, public/ or the built bundle', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'dm-dist-'));
  await build({ root: PROJECT_ROOT, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  const needles = ['SCRAPINGDOG_API_KEY', envKey()].filter(Boolean);
  const files = [join(PROJECT_ROOT, 'index.html'), ...walk(join(PROJECT_ROOT, 'public')), ...walk(outDir)];
  for (const file of files) {
    const text = readFileSync(file, 'latin1');
    for (const needle of needles) assert.ok(!text.includes(needle), `${needle === envKey() ? 'key value' : needle} found in ${file}`);
  }
});
```

Run: `node --test tests/server/key-hygiene.test.js`
Expected: PASS. It writes only to a temp directory.

- [ ] **Step 2: Write `scripts/scan.js`**

```js
// Terminal scan through the dashboard's own API code path (spends credits).
//   npm run scan -- "brand" --pages=2        npm run scan -- "@handle"
import { createServer } from 'node:http';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/api.js';

try { process.loadEnvFile('.env'); } catch { /* use exported variables */ }
const args = process.argv.slice(2);
const query = args.find(a => !a.startsWith('--'));
const pages = Number((args.find(a => a.startsWith('--pages=')) ?? '--pages=1').split('=')[1]);
if (!query) { console.error('usage: npm run scan -- "<keyword>" [--pages=N] | "@handle"'); process.exit(1); }
const app = createApp({ config: loadConfig(process.env) });
const server = createServer((req, res) => app.handle(req, res)).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body) }).then(r => r.json());
const started = Date.now();
let job;
if (query.startsWith('@')) {
  job = await post('/v1/instagram/scrape', { provider: 'auto', mode: 'account', query: query.slice(1), max_items: 250,
    page_size: 100, max_pages: 10, profile_limit: 50, include_comments: true, comments_per_post: 20, analyze: true, fresh: true });
} else {
  let continuation = null;
  for (let page = 0; page < pages; page++) {
    job = await post('/v1/instagram/search-page', { query, continuation, max_items: 250, page_size: 100, max_pages: 10,
      profile_limit: 50, include_comments: true, comments_per_post: 20, analyze: true, fresh: true });
    continuation = job.result?.pagination?.continuation;
    console.log(`page ${page + 1}: ${job.result?.pagination?.new_results ?? 0} new, outcome ${job.result?.collection_outcome}, `
      + `credits ${job.result?.pagination?.credits_used ?? '?'}`);
    if (!continuation) break;
  }
}
const hits = job.result?.inline_search?.hits ?? [];
console.table(hits.slice(0, 40).map((h, i) => ({ rank: i + 1, type: h.doc_type, handle: h.handle,
  risk: h.risk_score, followers: h.followers_count, url: h.instagram_url })));
console.log(`${hits.length} results · status ${job.status} · ${((Date.now() - started) / 1000).toFixed(1)}s`
  + (job.error ? ` · error: ${job.error}` : ''));
await app.store.flush();
server.close();
```

- [ ] **Step 3: Write the live smoke test**

`tests/live/smoke.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from '../api/helpers.js';
import { createStore } from '../../server/store.js';

const live = process.env.LIVE === '1';
test('LIVE: one keyword page and one account search through real ScrapingDog', { skip: !live && 'set LIVE=1' }, async () => {
  process.loadEnvFile('.env');
  const app = await startApp({ env: { SCRAPINGDOG_API_KEY: process.env.SCRAPINGDOG_API_KEY, CREDIT_BUDGET_PER_SEARCH: '3000',
    SCRAPINGDOG_CONCURRENCY: process.env.SCRAPINGDOG_CONCURRENCY ?? '5' }, store: createStore(), client: undefined });
  const page = await app.request('POST', '/v1/instagram/search-page', { query: process.env.LIVE_QUERY ?? 'nike', profile_limit: 10 });
  assert.equal(page.status, 200, page.text);
  assert.ok(page.body.result.inline_search.hits.length > 0);
  assert.ok(page.body.result.pagination.credits_used <= 3000);
  const account = await app.request('POST', '/v1/instagram/scrape', { mode: 'account', query: process.env.LIVE_HANDLE ?? 'nike' });
  assert.equal(account.body.status, 'succeeded', account.text);
  console.log('credits used:', page.body.result.pagination.credits_used);
  await app.close();
});
```

`startApp` passes `client: undefined`, so `createApp` builds the real client. That works because `startApp` spreads
`env` into `loadConfig`.

Run: `npm test`
Expected: PASS, with the live test reported as skipped.

- [ ] **Step 4: Write `README.md`**

The README has these sections:
1. **What this is.** REF's dashboard over ScrapingDog, for a local bake-off against the Bright Data prototype, with a
   link to the spec.
2. **Setup.** `npm install`, `cp .env.example .env`, then put the key in `.env`.
3. **Run.** `npm run dev` then open `http://localhost:5173`. `npm run scan -- "brand"`. `npm test`.
   `LIVE=1 npm test`.
4. **Cost controls.** Each `.env` knob with its default, and a note that failed ScrapingDog requests cost nothing.
5. **Differences from REF.** Copy the spec's §14 list verbatim.
6. **Security.** The key stays server-side; never commit `.env`; rotate the key that was shared during the design
   conversation.

---

### Task 20: End-to-end acceptance

**Files:** none new.

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: `fail 0`. The live test is skipped.

- [ ] **Step 2: Live API run through the dev server (spends credits, typically 1-3k for the first page)**

```bash
npm run dev > /tmp/dm-dev.log 2>&1 &
DEV=$!; sleep 5
curl -s http://localhost:5173/healthz | head -c 300; echo
curl -s -X POST http://localhost:5173/v1/instagram/search-page -H 'content-type: application/json' \
  -d '{"query":"nike","max_items":250,"profile_limit":50,"include_comments":true,"comments_per_post":20,"analyze":true,"fresh":true}' \
  > /tmp/page1.json
node -e "const j=require('/tmp/page1.json'); console.log(j.status, j.result.collection_outcome, j.result.inline_search.hits.length, j.result.pagination.credits_used, Boolean(j.result.pagination.continuation))"
```

Expected:
- `healthz` shows `"keyword_search_configured":true`.
- The last line prints `succeeded`, an outcome of `partial` or `complete`, between 1 and 50 hits, a credits number
  no larger than 15000, and `true` when more results remain.

- [ ] **Step 3: View more, then an account search**

```bash
CONT=$(node -e "console.log(require('/tmp/page1.json').result.pagination.continuation||'')")
node -e "fetch('http://localhost:5173/v1/instagram/search-page',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:'nike',continuation:process.argv[1]})}).then(r=>r.json()).then(j=>console.log(j.status,j.result.pagination.page,j.result.inline_search.hits.length,j.result.pagination.new_results))" "$CONT"
curl -s -X POST http://localhost:5173/v1/instagram/scrape -H 'content-type: application/json' \
  -d '{"mode":"account","query":"nike","include_comments":true,"comments_per_post":20}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.status,j.result.account_count,j.result.inline_search.hits.length)})"
ls -la data/
kill $DEV
```

Expected:
- The view-more line prints `succeeded 2`, a cumulative hit count at least page 1's, and its new count.
- The account line prints `succeeded 1` and a hit count ≥ 1.
- `data/darkmap.json` and `data/cursor-secret` exist.

- [ ] **Step 4: Hand the dashboard checklist to the user**

Ask the user to run `npm run dev`, open `http://localhost:5173`, and confirm each item behaves as it did in REF:
1. A keyword search from the overview banner, which shows the loading scene, then results.
2. "View more · next 50" twice.
3. An `@account` search.
4. The Search history view, reopening the first search.
5. The overview metrics and charts, and the critical alerts view.
6. Download JSON.
7. The dossier drawer, opened from the overview table.

Report the total credits used, and remind them to rotate the ScrapingDog key.

---

## Spec coverage

| Spec section | Task(s) |
|---|---|
| §1 success criteria 1-5 | 1 (1), 16-18 and 20 (2), 3-7 and 10-12 (3), 19 (4), 13 and 16 (5) |
| §4.1 layout, §4.2 process/key | 1, 18, 19 |
| §4.3 API contract | 18 |
| §5 flow items 1-4 (dashboard) | 1 (byte-identical files), 20 |
| §5 items 5-12 (server) | 14, 16, 17, 18, 15 (item 10), 13 (item 11) |
| §6 client | 2 (costs), 13 |
| §7.1-7.6 collector, adapters, account search, pagination | 14, 16, 17, 18 |
| §8 three fixes (+3b) | 9, 10 |
| §9 quota and credit budget | 13, 16 |
| §10 store | 8 |
| §11 configuration | 1, 13 |
| §12 engine and Python compatibility | 3-7, 10-12 |
| §13 testing | every task; 19 (hygiene, live) |
| §14 differences | README (19); each item implemented where noted |
| §15 step 0 | 2 (gate) |

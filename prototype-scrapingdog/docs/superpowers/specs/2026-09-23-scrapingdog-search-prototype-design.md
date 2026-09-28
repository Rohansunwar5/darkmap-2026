# ScrapingDog search prototype: design

- **Date:** 2026-09-23
- **Status:** design approved in conversation (sections 1–3); this written spec is awaiting review
- **Location:** `c:\darkmap 2026\prototype-scrapingdog\`
- **Reference implementation ("REF"):** `c:\darkmap 2026\prototype-made\darkmap-opus-team-share\darkmap-opus\`.
  Its source is byte-identical to `prototype-made/darkmap-opus/`. All `REF path:line` citations below point into it.

## 1. Goal

Rebuild REF's Instagram brand-protection **search flow** on **ScrapingDog** instead of Bright Data, as a local
prototype whose dashboard behaves exactly like REF's. Everything except the data vendor is held equal, so
ScrapingDog's data quality and cost can be judged directly against the Bright Data prototype.

### Success criteria

1. The dashboard served at `http://localhost:<port>/` is REF's dashboard, byte-identical, and every step of the
   search flow in §5 works.
2. A keyword search and an `@account` search return ranked, scored Instagram results through ScrapingDog.
   "View more · next 50", saved search history, the overview, critical alerts, the account dossier and the JSON
   download all behave as in REF.
3. The scoring engine reproduces REF's Python outputs exactly on the shared fixtures (§12).
4. The ScrapingDog API key never reaches the browser or any built asset.
5. Every ScrapingDog call is costed in credits. Spend per search and per day is capped by configuration.

## 2. Decisions taken in the design conversation

| Topic | Decision |
|---|---|
| Purpose | Standalone prototype for validating ScrapingDog against REF. Touches nothing in production. |
| Runtime | Local only: `npm run dev`. No deployment, no multi-user concerns. |
| Architecture | One Vite dev server. The API is mounted inside it by a Vite plugin, the pipeline lives in Node modules, and a CLI reuses the same pipeline. |
| Dashboard | REF's static dashboard files are reused **unchanged**. No React rewrite. |
| Scoring | Full port of REF's engine: all 17 categories, 8 alert families, 4 dimensions and every gate. Parity-tested against the Python original. |
| Allowed deviations | Only the ScrapingDog substitutions (§5–§7), the three data fixes (§8) and the items listed in §14. |

## 3. Scope

**In scope**
- Every endpoint the REF dashboard calls (§4.3).
- Keyword search, paged and resumable, through `POST /v1/instagram/search-page`.
- `@account` search and the scan panel's Account/Hashtag/Top-posts modes, run inline through `POST /v1/instagram/scrape`.
- The full scoring engine, ranking, and intelligence: profile snapshots, shared artifacts, velocity, evidence
  artifacts and campaign clustering. Cases are minimal: create, list, update and export.
- Local persistence to a JSON file.
- `scripts/scan.js`, a command-line scan through the same collector.
- `scripts/probe-scrapingdog.js`, the step-0 contract recorder (§15).

**Out of scope**
- Meta Graph API collection. The Owned and Tagged scan modes return REF's "not configured" failure.
- AI/LLM analysis. REF's inline paths already use the deterministic engine, and so does this prototype.
- `POST /v1/ingest/jobs` (the export_file and public_page providers) and `POST /v1/infrastructure/inspect`. The
  dashboard never calls them.
- REF's HTTP response cache. The dashboard always sends `fresh: true`, so REF never uses it on these paths.
- Deployment, and any auth beyond REF's optional access key.

## 4. Architecture

### 4.1 Layout

```
prototype-scrapingdog/
  package.json            one dependency: vite. Scripts: dev, preview, test, scan, probe
  vite.config.js          registers server/vite-plugin.js; no framework plugin
  .env.example            documented configuration (§11); real .env is gitignored
  .gitignore              .env, data/, node_modules/, dist/
  index.html              REF darkmap/static/index.html, byte-identical
  public/static/          REF darkmap/static/* (app.js, styles.css, overview-data.js, search-history.js,
                          search-outcome.js, fonts/, logos, privacy.html, data-deletion.html, legal.css),
                          byte-identical
  server/
    vite-plugin.js        mounts the API in configureServer + configurePreviewServer
    config.js             loads settings from Vite's loadEnv(mode, root, '') / process.env
    api.js                /healthz and all /v1 routes (§4.3): same shapes and status codes as REF api.py
    http.js               request-body parsing, size limit, access-key middleware (REF api.py:74-93)
    scrapingdog.js        ScrapingDog client (§6)
    costs.js              credit cost per endpoint, filled in from step-0 recordings
    adapters.js           ScrapingDog JSON -> REF-shaped record nodes (§7.3)
    discovery.js          port of REF discovery helpers (§7.2)
    collector.js          port of REF providers/instagram_pages.py over ScrapingDog (§7)
    account-search.js     port of REF _account_search over ScrapingDog (§7.5)
    cursor.js             port of REF search_cursor.py
    store.js              in-memory tables + JSON persistence (§10)
    normalize.js          port of REF normalize.py with the three fixes (§8)
    quota.js              credit-denominated port of REF quota.py (§9)
    audit.js              REF audit.record equivalent
    engine/
      pycompat.js         Python-compatible helpers (§12.2)
      sequence-matcher.js port of difflib.SequenceMatcher (ratio and its dependencies)
      extract.js          port of REF extract.py
      heuristics.js       port of REF ai/heuristics.py
      dossier.js          port of REF dossier.py
      intelligence.js     port of REF intelligence.py
      risk.js             port of REF risk.py (deterministic provider only)
      search.js           port of REF search.py
  scripts/
    scan.js               CLI: `npm run scan -- "<keyword>"` or `-- "@handle"`
    probe-scrapingdog.js  step 0 (§15)
  tests/                  node --test (§13)
    golden/generate.py    runs REF's Python extract/heuristics on fixtures -> golden JSON
  data/                   runtime only (gitignored): darkmap.json, cursor-secret
```

### 4.2 Process and key handling

- **One process.** `npm run dev` starts Vite. The plugin registers middleware for `/healthz`, `/v1/*`, `/privacy` and
  `/data-deletion` in both `configureServer` and `configurePreviewServer`. Vite serves `/` from `index.html` and
  `/static/*` from `public/static/`, which matches REF's URLs.
- **Key handling.** The plugin reads the configuration with `loadEnv(mode, root, '')` and passes it to
  `server/config.js`. The key has no `VITE_` prefix, so Vite never exposes it to client code.
- **Key check.** `index.html` and `public/` contain no environment references. A test (§13) asserts that neither the
  key's variable name nor its value appears in `index.html`, `public/` or a fresh `vite build` output.
- **CLI.** `scripts/scan.js` imports the same `server/` modules directly; there's no HTTP involved.

### 4.3 API contract

Paths, methods, request bodies, status codes, error `detail` strings and response JSON match REF
`darkmap/api.py` and `darkmap/schemas.py`. That includes timestamps as the naive-UTC ISO strings Pydantic emits.

| Route | REF | Notes |
|---|---|---|
| `GET /healthz` | api.py:214-256 | See the provider note below. |
| `POST/GET /v1/brands` | api.py:260-277 | |
| `POST /v1/instagram/search-page` | api.py:281-431 | Main keyword path (§5, §7) |
| `POST /v1/instagram/scrape` | api.py:434-524, inline branch api.py:128-211 | Always inline (§14 item 6) |
| `GET /v1/ingest/jobs/{id}`, `GET /v1/jobs` | api.py:537-551 | Jobs created by inline scrapes and analyses |
| `GET /v1/accounts`, `/v1/accounts/{id}`, `/v1/accounts/{id}/assessments`, `/v1/accounts/{id}/history` | api.py:555-589, 660-669 | |
| `POST /v1/analysis/accounts/{id}` | api.py:593-609 | Runs the engine immediately; the non-inline form returns `{mode:'queued', job}` with an already-succeeded job (§14 item 7) |
| `GET /v1/assessments/{id}` | api.py:612-617 | |
| `GET /v1/alerts` | api.py:621-657 | REF logic kept as-is (§14, inherited) |
| `GET /v1/campaigns` | api.py:672-697 | |
| `POST/GET/PATCH /v1/cases`, `GET /v1/cases/{id}/evidence-package` | api.py:700-793 | |
| `GET /v1/search` | api.py:815-835 | |
| `GET /v1/audit` | api.py:839-847 | |
| `GET /`, `/privacy`, `/data-deletion` | api.py:96-108 | |

- **Provider note.** `/healthz` reports `instagram.configured: false` and
  `instagram_alternative: {provider: 'scrapingdog_instagram', configured, keyword_search_configured}`. Both flags are
  true when the ScrapingDog key is set, so REF's dashboard takes its ScrapingDog-equivalent paths unchanged. The
  request field `provider` accepts `auto`, `meta`, and `bright_data` as a synonym for ScrapingDog.
- **Request middleware** is REF `protect_data_routes`: optional `DARKMAP_API_KEY` compared in constant time, and
  `DARKMAP_MAX_REQUEST_BYTES`.

## 5. Search-flow parity contract

✅ means identical to REF. 🔁 means the same observable behaviour through a different mechanism, required by
ScrapingDog being synchronous.

**Dashboard** (✅ throughout, because the files are REF's):
1. Any of the three search boxes calls `beginGlobalSearch` (REF app.js:707-824). `@name` means account search;
   anything else is keyword search. It runs the health check, shows the loading overlay and resets the results
   view.
2. Keyword search sends `POST /v1/instagram/search-page` with REF's payload: `max_items 250`, `profile_limit 50`,
   `include_comments true`, `comments_per_post 20`, `analyze true`, `fresh true`. "View more" re-posts
   `{query, continuation}` (app.js:853-883).
3. Account search sends `POST /v1/instagram/scrape` with `mode: 'account'`.
4. `finishJob` (app.js:1235-1335) does the following:
   - Computes the outcome via `search-outcome.js`: pending, partial, complete, empty, blocked or failed.
   - Shows toasts.
   - Updates the overview (sessionStorage) and alerts (score ≥ 45).
   - Refreshes the detection-coverage panel, scope tabs, result cards and pagination panel.
   - Auto-resumes while the outcome is `pending`.
   - Saves history to IndexedDB. The JSON download is available.

**Server:**

5. ✅ **Brand context.** Uses a saved brand if one is selected. Otherwise it infers one from the query: the query
   becomes the name, its lowercase form becomes an official handle when it matches `[A-Za-z0-9._]{2,30}`, and the
   keyword list is `[query]`. The SBI/HDFC reviewed aliases are merged in (api.py:47-71, 305-322, 469-487).
6. ✅ **Discovery.** Runs the same 17 queries in the same order and countries (bright_data_instagram.py:45-84).
   Failed queries get up to 3 attempts. The first five queries are retried once on an empty result. An empty or
   invalid reply is a failure, never "zero matches" (instagram_pages.py:230-263).
   🔁 The queries run through ScrapingDog's Google Search API (§6). The `num=20&filter=0` parameters are dropped
   because Google ignores them. REF's `&start=0` retry marker was only a cache-buster; this app has no cache, so a
   retry is simply the same request sent again.
7. ✅ **Link handling.** Same URL canonicalisation and classification into profile, post and reel; the same author
   extraction; the same search-snippet fallback bundles; and the same 29 guessed handle variants
   (bright_data_instagram.py:161-231, 451-557).
8. ✅ **Scheduling.** REF `_schedule` (instagram_pages.py:169-217) is kept:
   - Profile order: exact brand handle, then accounts already seen in evidence, then discovered profiles, then
     guessed handles, the last only after discovery is exhausted.
   - The profile allowance grows by 50 per requested page, up to `max_items`.
   - Posts and reels are fetched per discovered URL.
   - Comments are fetched for every collected post, unless `COMMENTS_SCOPE=matched_posts`.

   🔁 Each input is one ScrapingDog request, run through the concurrency pool inside the same 48-second page budget
   (§7.4). There are no snapshots, so nothing is triggered, polled or abandoned. REF's "retry a missing profile by
   URL" step (instagram_pages.py:310-322) has no ScrapingDog equivalent and is dropped.
9. ✅ **Per page** (api.py:333-431):
   - Re-import every bundle collected so far and assess every account with the deterministic engine.
   - Build the search snapshot, remove duplicate hits by handle or shortcode, keep earlier rows in place and add at
     most 50 new ones.
   - Count the rest as buffered and compute `has_more` and the outcome as REF does.
   - Build the pagination object with the same keys (§7.6).
10. ✅ **Continuation.** Same signed, compressed continuation: HMAC-SHA256 over a base64url zlib body, version 1,
    6-hour expiry, and REF's size limits (search_cursor.py). "View more" therefore survives a server restart.
11. 🔁 **Rate limiting.** REF's per-minute and per-day quota counted HTTP calls. Here the same pause-and-resume
    behaviour (`blocked_until`, `retry_after_seconds`, auto-resume while pending) is driven by credits (§9).
12. 🔁 **Account search and scan-panel scrapes** run inline in the same request and return scored results
    immediately, as REF does on Vercel (api.py:128-211). There's no worker queue.

## 6. ScrapingDog client (`server/scrapingdog.js`)

- **Transport.** Base URL `https://api.scrapingdog.com`. Calls are GETs with `api_key` as a query parameter,
  confirmed in step 0. Node 22's built-in `fetch` is used.
- **Endpoints.** Exact names, parameters and response fields are fixed by step 0 (§15):

  | Use | Expected endpoint | Credits |
  |---|---|---|
  | Discovery | `/google` with `query`, `country`, `language=en`, `results`, `page`, `advance_search` | 5 (10 with `advance_search`) |
  | Profile | `/instagram/profile` with `username` | 15 (reported; confirm) |
  | Recent posts of a profile | Instagram Posts API (by profile id), only if the profile response lacks recent posts | step 0 |
  | Post/reel details | Instagram Post Details API (by post URL or shortcode) | step 0 |
  | Comments | Instagram Comments API (by post) | step 0 |

  `advance_search` is used for the first five queries only if step 0 shows it returns the author or thumbnail
  fields REF obtained from Bright Data's full parse.
- **Concurrency.** A pool limited to `SCRAPINGDOG_CONCURRENCY` (default 5, ScrapingDog's Lite plan).
- **Timeouts.** Each request is limited to `SCRAPINGDOG_TIMEOUT_MS` (default 45000).
- **Retries.**
  - Transport errors, timeouts and 5xx count as one failed attempt. The input goes back in the queue, and after 3
    attempts it's dropped with an error recorded, mirroring REF's attempt counting.
  - A 429 or 503 goes through REF's `_defer_refusal` (instagram_pages.py:58-71): `Retry-After` if present, else 30
    seconds, sets `blocked_until`, and the page stops.
  - Failed ScrapingDog requests aren't charged, so retries cost nothing.
- **Access refusals.**
  - 401/403 raise NotAuthorized, and search-page answers with REF's 403 detail (api.py:329-331).
  - Account-level refusals raise SourceUnavailable with REF's codes and messages: `source_account_inactive` and
    `source_credits_required` (http.py:42-54). The matching rules come from REF's text checks plus the error bodies
    recorded in step 0.
- **"Not found".** An unknown or private handle, or a missing post, is dropped silently, with no error. This matches
  REF, where the dataset returned error records that were filtered out.
- **Credit meter.**
  - Every successful call adds its cost from `costs.js` to the search's `credits_used`, which is carried in the
    continuation, and to the day's counter in the store.
  - Failed calls add nothing.
  - Nothing starts once the next call would exceed `CREDIT_BUDGET_PER_SEARCH` (§9).
- **Audit.** Every call writes REF-shaped audit rows (`http.request`, `http.error`, `http.backoff`,
  `http.quota_exceeded`) with the URL recorded **without** `api_key`.

## 7. Collector

### 7.1 Checkpoint state

REF's checkpoint fields are kept: `version`, `id`, `expires_at`, `query`, `retrieved_at`, `visible`, `page`,
`params`, `brand`, `query_tasks`, `organic`, `inputs`, `scheduled`, `records`, `errors`, `queries_completed`,
`blocked_until`, `profile_target`, `quota` and `elapsed_seconds`. `snapshots` is removed, and `credits_used` is added.

- `records` keeps REF's four buckets, keyed `profile`, `post`, `reel` and `comment`. They hold REF-shaped nodes
  produced by the adapters (§7.3), trimmed to the fields REF's parsers read, so the continuation stays under REF's
  1.8 MB token cap.
- `organic` stores only the SERP fields REF reads: `link`, `title`, `description`, `snippet`, `source`, `image`,
  and follower text.

### 7.2 Discovery (port)

These ported functions keep REF's names and semantics:
- `_discovery_queries` (bright_data_instagram.py:45-84)
- `_as_int`, `_serp_followers`, `_as_url`, `_looks_like_video_url`, `_canonical_instagram_url` and `_url_kind`
  (:95-231)
- `_bucket_discovery` (:451-557), including `probe_profile` generation and the SERP-fallback bundles with
  `collection_mode: 'keyword_serp_fallback'`
- `_media_items`, `_comment`, `_post`, `_account` and `_author` (:559-722)

The ScrapingDog Google response is mapped into REF's `organic` item shape by `adapters.js`.

### 7.3 Adapters (`server/adapters.js`)

The adapters translate each ScrapingDog Instagram response into the REF record-node shape that REF's parsers
already read. REF parsing code (`_account`, `_post`, `_comment`, `_author`, `_bundles`) is then reused unchanged:

| Adapter | Output keys it must produce |
|---|---|
| Profile node | `account` or `username`, `id`, `full_name`, `biography`, `external_url`, `profile_image_link`, `is_verified`, `is_business_account`, `followers`, `following`, `posts_count`, and `posts` (a list of post nodes) |
| Post/reel node | `url`, `post_id`, `shortcode`, `content_type`, `description`, `hashtags`, `date_posted`, `likes`, `num_comments`, `views`, `photos`/`videos`/`thumbnail`, `latest_comments`, `user_posted`, plus any author profile fields |
| Comment node | `post_url`, `comment_id`, `comment_user`, `comment`, `likes_number`, `comment_date`, `replies` (list of the same) |

Unmapped ScrapingDog fields are dropped. The mappings are pinned by tests on the step-0 recordings.

### 7.4 Page loop (sync port of REF `collect`, instagram_pages.py:370-428)

1. Budget: stop starting new requests at `stop_at − 12 s`, where `stop_at` is 48 seconds from the start of
   collection. Requests already in flight are awaited, because an abandoned request that succeeds is still charged.
2. Set `profile_target` exactly as REF does (:374-379). Restore the quota from the checkpoint, then run `_schedule()`.
3. **Discovery lane.** Run one query at a time, in REF order, while `query_tasks` remain. Call `_schedule()` after
   each query.
4. **Enrichment lanes.** Take the next input by REF's priority:
   1. profile inputs
   2. post/reel inputs
   3. anything else, which in practice means comments

   Within each group, keep `inputs` order. Call `_schedule()` after each completion.
   - **Concurrency N ≥ 2:** one slot is reserved for the discovery lane while `query_tasks` remain, and the other
     N − 1 run enrichment. Once discovery is exhausted, all N slots run enrichment.
   - **Concurrency 1:** alternate one discovery query with one enrichment request, starting with discovery, as REF
     interleaves its turns. Once discovery is exhausted, run enrichment only.
5. Before starting each request, apply REF's stop checks (:386-392):
   - Stop if the accounts plus unique post shortcodes number at least `target_results` and no profile enrichment is
     pending. "Pending" means profile inputs are queued or in flight.
   - Stop if `blocked_until` is in the future.
   - Stop if `credits_used` has reached the budget.
6. On SourceUnavailable, store `source_error` and stop, as REF does (:417-422). A daily or per-minute credit cap
   raises QuotaExceeded; set `blocked_until` from its `retry_after`, as REF does (:423-425). Reaching the
   **per-search** budget is different: it ends collection for the search as described in §9, and does not set
   `blocked_until`.
7. Return `_bundles()`, a verbatim port of REF :91-167 over the adapted records.

### 7.5 Account search (sync port of REF `_account_search`, bright_data_instagram.py:767-790)

1. Profile lookup. If the profile response lacks recent posts, call the Posts API.
2. Posts are capped at `max_items`.
3. Fetch comments for each post, capped at `comments_per_post` per post.
4. Return one bundle with provenance mode `account`.

REF's one-shot semantics are kept, including replacing embedded comments with the Comments API result (§14,
inherited). The result goes through REF's inline flow (api.py:128-211): ingest, deterministic assessment, then
`search(q=None, account_ids, limit=500)` into `inline_search`.

Scan-panel keyword, Hashtag and Top-posts modes run the §7.4 collector page after page, within 145 seconds (REF
`SERVERLESS_TOTAL_BUDGET_SECONDS`), then return through the same inline flow. REF's one-shot Bright Data keyword
path (`_keyword_search`) is not ported (§14 item 6).

### 7.6 Pagination object

REF's keys are kept as-is: `has_more`, `continuation`, `outcome`, `page_size: 50`, `page`, `new_results`,
`loaded_results`, `buffered_results`, `pending_snapshots`, `queries_completed`, `queries_total: 17`,
`collection_complete`, `failed_branches`, `retry_after_seconds` and `total_seconds`. `pending_snapshots` reports the
number of enrichment inputs still queued; the dashboard doesn't read it. `credits_used` is added, and the dashboard
ignores it.

## 8. Normalization: port of REF normalize.py with the three approved fixes

The port is REF's `upsert_account`, `ingest_bundle` and `reindex_account`, with exactly these changes:

1. **A search snippet never overwrites a fetched profile** (audit finding 9; REF normalize.py:28-36 and
   intelligence.py:37-49, 125-137).
   - A bundle whose provenance `collection_mode` is `keyword_serp_fallback` is *discovery-grade*.
   - When the stored account is not discovery-grade, a discovery-grade bundle may only fill fields that are
     currently null. It never replaces provenance or `raw`.
   - Profile snapshots are captured, and profile changes computed, only from non-discovery-grade account state.
     When an account's first fetched profile arrives there's no prior snapshot, so no change is reported.
2. **Re-import keeps other posts' entities** (finding 10; REF normalize.py:62). Ingest deletes only the account's
   entities with `post_id` null (bio and external URL) plus the entities of posts present in this bundle, then
   rebuilds those. Entities of the account's other posts are left alone.
3. **Each post is stored once** (finding 11; REF normalize.py:73).
   - The post key is the shortcode when one can be derived from the record or URL, otherwise `platform_post_id`,
     otherwise the permalink.
   - Lookup is by `(account_id, shortcode)` first, then by `(account_id, platform_post_id)`, so a snippet post later
     fetched in full updates the same row.
   - When a row is updated, `platform_post_id` takes the fetched record's own id if it has one. A URL used as a
     snippet placeholder is replaced; a real id is never replaced by a URL.
   - A post with no derivable key is skipped rather than inserted with a null key.

Each fix has a test showing REF's behaviour, then the fixed behaviour.

## 9. Quota and credit budget (`server/quota.js`)

- REF quota.py's interface (`consume`, `usage`, `QuotaExceeded(scope, window, retry_after)`) is kept, but the unit is
  **credits**:
  - `CREDIT_CAP_PER_MINUTE`: default 0, meaning off. The concurrency pool throttles instead.
  - `CREDIT_CAP_PER_DAY`: default 100000.
- `CREDIT_BUDGET_PER_SEARCH` (default 15000) covers the largest REF search plan at the known costs. When it's reached:
  - The page stops starting requests.
  - One entry is added to `errors`:
    `{stage: 'budget', error: 'credit budget reached', remaining_inputs: <queued count>}`. The outcome therefore
    becomes `partial`, and `failed_branches` counts that entry.
  - The remaining queued inputs and discovery queries are cleared, so `has_more` depends only on buffered rows.
- The paged collector carries the day's counter in the checkpoint as REF does (`_quota_checkpoint`,
  instagram_pages.py:73-89).

## 10. Store (`server/store.js`)

- **Tables.** In-memory tables mirror REF models.py: brands, accounts, posts, media_assets, comments, entities,
  search_documents, risk_assessments, account_snapshots, evidence_artifacts, campaigns, campaign_members,
  investigation_cases, case_evidence, jobs, audit_logs and quota_counters.
- **Constraints.** Integer autoincrement IDs per table, and REF's unique constraints: account `(platform, handle_lower)`,
  post `(account_id, platform_post_id)` extended per §8, search doc, quota, campaign member and case evidence.
- **Ordering.** Iteration is in insertion order. This reproduces REF's SQLite row order for queries without
  `ORDER BY`, such as REF search.py:62.
- **Persistence.** After each mutating request the tables are written to `DATA_FILE` (default `data/darkmap.json`)
  via a temp file and rename, debounced to 250 ms, and loaded on startup.
- **Limits.** The audit log keeps the latest 5,000 entries. There's no HTTP cache table.

## 11. Configuration (`.env.example`)

```
SCRAPINGDOG_API_KEY=
SCRAPINGDOG_CONCURRENCY=5
SCRAPINGDOG_TIMEOUT_MS=45000
CREDIT_BUDGET_PER_SEARCH=15000
CREDIT_CAP_PER_DAY=100000
CREDIT_CAP_PER_MINUTE=0
COMMENTS_SCOPE=all_collected_posts        # or matched_posts
DARKMAP_API_KEY=                          # optional access key, as in REF
DARKMAP_MAX_REQUEST_BYTES=2000000
DARKMAP_SEARCH_CURSOR_SECRET=             # empty: a random secret is generated into data/cursor-secret
DATA_FILE=data/darkmap.json
PORT=5173
```

## 12. Scoring engine

### 12.1 Modules

Each REF module is ported line for line into `server/engine/`:
- extract.py
- ai/heuristics.py (all term lists, weights, families, dimensions and gates)
- dossier.py (40 posts, 12 comments per post, 500 entities)
- intelligence.py
- search.py

From risk.py only the deterministic-provider behaviour is ported: `fuse` with AI weight 0, `compute_confidence`,
`_limitations`, `recommend_action`, the trusted-profile gate, `_fallback_summary`, per-post content-only
re-scoring, evidence artifacts and campaign clustering.

Assessment metadata matches REF on its deterministic path:
- `ai_available: false`, `ai_score: null`, `engine_version: '2.3.0'`.
- `model: 'claude-opus-5'`. REF stores its default `DARKMAP_ANALYSIS_MODEL` even when AI is unavailable, and the
  dashboard never displays it.
- Limitations include REF's provider reason strings: `'paged_live_search: deterministic risk assessment'` and
  `'serverless_live_search: fast heuristic assessment; …'`.

### 12.2 Python-compatibility rules (`engine/pycompat.js`)

- **Regex classes.** Python `re` is Unicode-aware, so the port uses these equivalents:
  - `\w` becomes `[\p{L}\p{N}_]` with the `u` flag.
  - `\d` becomes `\p{Nd}`.
  - `\b` becomes explicit lookarounds on that class.
  - `re.IGNORECASE` becomes the `iu` flags.
- **Rounding.** `round(x, n)` and `f'{x:.2f}'` round half to even on the exact binary value. The port implements this
  exactly rather than using `Math.round` or `toFixed`.
- **Sorting.** `sorted()` over strings and tuples uses code-point order; `Array.prototype.sort` comparators do the same.
- **Ordering.** Dicts become `Map`s wherever insertion order matters. `Counter` counting and `dict.fromkeys`
  de-duplication keep first-seen order.
- **SequenceMatcher.** `difflib.SequenceMatcher(None, a, b).ratio()` is ported faithfully, including
  `find_longest_match` tie-breaking and the autojunk rule for `len(b) >= 200`.

## 13. Testing and verification

`npm test` runs `node --test tests/`. It needs no network and no API key.

1. **Dashboard identity.** `index.html` and `public/static/**` are byte-identical to REF's `darkmap/static/`, checked
   by SHA-256 over every file.
2. **Dashboard unit tests.** REF's `tests/*.cjs` (overview-data, search-history, search-outcome; 17 tests) are copied
   and run unchanged.
3. **Engine parity.**
   - `python tests/golden/generate.py` loads REF's `extract.py` and `ai/heuristics.py` by file path with a stub
     package (standard library only). It runs them over `tests/fixtures/dossiers/*.json` and writes
     `tests/golden/*.json`.
   - The fixture dossiers come from the dossiers in REF test_heuristics.py, test_advanced_alerts.py and
     test_risk_engine.py, plus dossiers built from the step-0 recordings.
   - JS tests deep-equal the port's output against the goldens: every score, signal, quote, rationale string, note,
     dimension, alert family and independent-indicator count.
   - The goldens are committed. The generator is re-run only when fixtures change.
4. **Ported REF tests** run against a fake ScrapingDog client:
   - test_search_pages.py (14 tests: scheduling order, allowance growth, deadlines, 50-row pages, cursor integrity
     and expiry, malformed cursor, rate limit and Retry-After, empty gateway response, inactive account, outcomes)
   - the discovery and bucketing tests in test_bright_data_instagram.py
   - the ranking tests in test_integration_controls.py
   - test_extract_normalize.py
   - test_risk_engine.py and test_advanced_alerts.py (their assertions on stored assessments)

   Tests tied to Bright Data's transport, such as snapshot polling, NDJSON and retry-by-URL, are replaced by their
   ScrapingDog equivalents: pool concurrency, "not found" dropped, 3 attempts, a budget stop, and in-flight requests
   finishing.
5. **The three fixes** each get a before/after test (§8).
6. **Adapters and mapping** are tested on the recorded step-0 responses.
7. **Key hygiene.** No key name or value appears in `index.html`, `public/` or `vite build` output. Audit URLs never
   contain `api_key`.
8. **API contract.** One request per route through the real plugin middleware, asserting status codes and response
   keys against REF schemas.py.
9. **Live smoke test** (`LIVE=1 npm test`, opt-in, spends credits): one keyword search page and one account search,
   with the credits used printed.

Manual acceptance: `npm run dev`, then in the dashboard run a keyword search, click "View more" twice, run an
`@account` search, and reopen a saved search from history. Check the overview, alerts, JSON download and dossier
drawer.

## 14. Differences from REF (complete list)

**Deliberate:**
1. The data vendor is ScrapingDog (Google Search API and Instagram Profile, Posts, Post Details and Comments)
   instead of Bright Data (SERP API and Web Scraper datasets).
2. Requests are synchronous: there are no snapshots, and in-flight requests may finish after the 48-second budget.
3. There's no profile retry-by-URL. `num=20&filter=0` is dropped.
4. Quota is in credits, with a per-search credit budget (§9).
5. `/healthz` provider labels; `bright_data` is accepted as a synonym for ScrapingDog.
6. `/v1/instagram/scrape` always runs inline, as on REF's Vercel path. Its keyword and hashtag modes use the §7.4
   collector instead of REF's one-shot Bright Data keyword path.
7. `POST /v1/analysis/accounts/{id}` assesses immediately and returns an already-succeeded job.
8. The three normalization fixes (§8).
9. The cursor secret is a random per-install value instead of being derived from the vendor API key.
10. The audit log is capped at 5,000 entries. There's no HTTP cache.

**Inherited on purpose** (REF behaviour kept for parity; flagged in the 2026-09-23 audit):
- `/v1/alerts` can show an account's older high score instead of its latest (audit CORR-03).
- Empty captions count toward duplicate-post velocity, which leaks into per-post scores (CORR-02).
- A trusted official account's takeover scores 0 (CORR-09).
- Caption-template reuse never matches multi-line captions (CORR-10).
- A bare search term is registered as an official handle (CORR-11).
- Every page re-imports and re-scores every account collected so far (PERF-02).
- Search loads up to 2,000 rows, unordered, before filtering (CORR-07).
- Comments are collected for every collected post by default (audit finding 4; switchable via `COMMENTS_SCOPE`).
- Account search replaces embedded comments with the Comments API result.

## 15. Step 0: ScrapingDog contract discovery (first implementation task)

`npm run probe` (`scripts/probe-scrapingdog.js`) makes one real call to each of these:
- Google (standard and `advance_search`)
- Profile (a known public brand handle, and a handle that doesn't exist)
- Posts, if needed
- Post Details (one post and one reel)
- Comments

It saves each response to `tests/fixtures/scrapingdog/` with `api_key` stripped. It records the HTTP status, the
credits charged (from ScrapingDog's account usage endpoint if one exists, otherwise from their documented costs) and
the error body shapes for a bad key and a missing handle. Expected spend is about 100 credits.

**Gate.** Implementation pauses and reports back if any of these turns out false:
- The profile response yields followers, bio, verified status, avatar and a profile id or recent posts.
- Post Details accepts a post or reel URL or shortcode and yields caption, author, counts and media.
- The Comments API yields commenter, text, likes and timestamp for a post.
- Google responses include organic `link`, `title` and `snippet`.

`costs.js`, the adapters (§7.3) and the `advance_search` decision (§6) are filled in from these recordings.

## 16. Risks

- **ScrapingDog's Instagram response shapes and coverage are unknown until step 0.** Mitigation: the adapter layer
  plus the step-0 gate.
- **Credit costs of three endpoints are unknown.** Mitigation: `costs.js` and configurable budgets.
- **Latency.** Synchronous calls take roughly 5–30 seconds each. At 5 concurrent requests (the Lite plan) a page may
  collect fewer results than REF in 48 seconds. `has_more` and "View more" absorb this; a higher concurrency on the
  Standard plan closes the gap.
- **The API key was shared in the design conversation.** Rotate it in ScrapingDog after the build.

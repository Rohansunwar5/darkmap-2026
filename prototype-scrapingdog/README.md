# Darkmap search over ScrapingDog (local prototype)

## What this is

The Darkmap brand-protection dashboard from `prototype-made/darkmap-opus-team-share` (REF), byte-identical, running
on Vite. Its `/v1` API is re-implemented in Node over ScrapingDog instead of Bright Data. The search flow, the
threat-first discovery plan, "View more · next 50" paging and the heuristic risk engine match REF. The engine port is
checked against REF's own Python output. Use it for a local bake-off against the Bright Data prototype.

Design: [docs/superpowers/specs/2026-09-23-scrapingdog-search-prototype-design.md](docs/superpowers/specs/2026-09-23-scrapingdog-search-prototype-design.md).
The recorded ScrapingDog contract (endpoints, credits, response shapes):
[tests/fixtures/scrapingdog/CONTRACT.md](tests/fixtures/scrapingdog/CONTRACT.md).

## Setup

Requires Node 22.12 or later.

```bash
npm install
cp .env.example .env
# edit .env and put your key after SCRAPINGDOG_API_KEY=
```

## Run

| Command | What it does |
|---|---|
| `npm run dev` | Dashboard and API on http://localhost:5173 |
| `npm run scan -- "brand"` | A keyword search from the terminal, one page (`--pages=N` for more), printing a ranked table |
| `npm run scan -- "@handle"` | An account search from the terminal |
| `npm test` | The full offline suite: no network, no key needed |
| `LIVE=1 npm test` | Adds one real keyword page and one account search (spends credits) |
| `npm run probe` | Re-records the ScrapingDog contract fixtures (about 115 credits) |

Collected data is saved to `data/darkmap.json`. Delete the file to start over.

## Cost controls

What each call costs, as recorded in CONTRACT.md:

| Call | Credits |
|---|---|
| Google search | 5 (10 with `advance_search`, used for the 5 threat-first queries) |
| Profile, plus that account's Posts | 15 + 15 |
| Post details | 15 |
| Comments | 15 |

ScrapingDog bills 200 and 404 answers. So an unknown handle still costs 15 credits, but a failed request (a timeout,
a 5xx or a non-JSON reply) costs nothing, and retries are free.

Comments are fetched for **every** collected post by default, as REF does. That is usually the largest share of a
page's spend. Set `COMMENTS_SCOPE=matched_posts` to fetch comments only for posts the searches found.

| `.env` setting | Default | Meaning |
|---|---|---|
| `SCRAPINGDOG_API_KEY` | (required) | Stays on the server. It is never sent to the browser |
| `SCRAPINGDOG_CONCURRENCY` | `5` | Requests in flight at once |
| `SCRAPINGDOG_TIMEOUT_MS` | `45000` | Per-request timeout |
| `CREDIT_BUDGET_PER_SEARCH` | `15000` | A search stops starting requests at this spend and reports a partial result |
| `CREDIT_CAP_PER_DAY` | `100000` | Daily cap across all searches (`0` turns it off) |
| `CREDIT_CAP_PER_MINUTE` | `0` | Per-minute cap (`0` means off; the concurrency limit throttles instead) |
| `COMMENTS_SCOPE` | `all_collected_posts` | Or `matched_posts` |
| `DARKMAP_API_KEY` | (empty) | If set, `/v1` requests need `X-API-Key` or `Authorization: Bearer` |
| `DARKMAP_MAX_REQUEST_BYTES` | `2000000` | Request body limit |
| `DARKMAP_SEARCH_CURSOR_SECRET` | (empty) | Empty means a random secret is written to `data/cursor-secret` |
| `DATA_FILE` | `data/darkmap.json` | Where collected data is stored |
| `PORT` | `5173` | Dev server port |

Each search page reports what it spent in `result.pagination.credits_used`.

## Differences from REF

This is spec §14, copied verbatim.

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

## Security

- The ScrapingDog key lives only in `.env`, which is gitignored and blocked from the dev server. It never goes into
  the browser bundle; a test builds the bundle and checks this.
- ScrapingDog echoes the key inside its pagination links. The server strips those links, and it redacts the key from
  every log line, audit row and error message.
- Never commit `.env`.
- **Rotate the ScrapingDog API key** in the ScrapingDog dashboard. It was shared in plain text while this prototype
  was being designed.

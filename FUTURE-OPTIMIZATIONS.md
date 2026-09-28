# Future optimizations

Backlog for channel discovery after the Decodo migration (2026-09-09/10).
Every item below is backed by a measurement recorded here, so nobody has to
re-derive it. Where something was **rejected**, the reason is written down —
those entries exist to stop the idea being re-proposed.

Current state: `POST /tg-decodo` → Lambda `darkmap-decodo-scraper` → Decodo Web
Scraping API. ~$20/mo, down from ~$242. Full search ~12–14s.

---

## 1. Call Decodo directly from the backend — biggest remaining win

**Measured gap.** Decodo's own API answers a full 10-request search in
**~8.0s**, but the same search through our stack measures **12–14s**. The
difference is **~4–6s of API Gateway + Lambda overhead**, not vendor time.

| Path | Measured |
|---|---|
| Decodo API called directly | **7,979ms** |
| Through API Gateway → Lambda | 12,000–14,000ms |

**Change.** Move the 10 concurrent calls into `telegram.service.ts` and drop
the API Gateway hop entirely.

**Wins:** ~4–6s off every search; removes the **29s API Gateway ceiling**
(currently only ~2× our p95); no Lambda cold path; two fewer moving parts.

**Costs:** the parser must be ported from Python to Node (`cheerio` or
equivalent); the `x-api-key` guard and the Lambda both become redundant.

**Watch out:** the CSE URL must stay in **query-string** form
(`?cx=…&q=…&sort=date&start=`). The `#fragment` form breaks — Decodo
URL-decodes before navigating, so `&` inside a term like `AT&T` truncates the
query and Google silently returns confident, wrong results.

---

## 2. Reconsider `RETRIES` now that hedging exists

`RETRIES=2` predates hedging. A genuinely failing request now burns two retries
*and* a hedge, stacking latency on the slowest path. Hedging already covers
slow requests; retries should only cover transport errors (~1.7% of calls).

**Suggested:** `RETRIES=1`. Low risk, small win. Verify against the
`failed` count in the `[decodo]` log line before and after.

---

## 3. Tune `HEDGE_AFTER_MS` with real traffic

Currently `7000`. Logs show it firing on **5–8 of 10 requests**, so it is
effectively racing most requests rather than rescuing stragglers — Decodo's
median under concurrency is above 7s.

It works (tail collapsed from 10–20s to 12.6–14.2s) and costs ~$0.40/mo, but
the threshold was set against an earlier, lower median. Re-measure the actual
per-request distribution and set the threshold at roughly the median.

---

## 4. Drop page 2 for the narrow dorks

Dorks 1, 4 and 6 return little or nothing on page 2, while dorks 2, 3 and 5
carry most of the yield. Fetching page 2 only for the broad dorks takes the
request count from 10 to ~7.

**Wins:** ~30% fewer Decodo requests; more headroom under the plan's 10 req/s.
**Does not reduce latency** — requests run in parallel, so total time is the
*slowest* one, not the sum. Verify per-dork page-2 yield before cutting.

---

## 5. All-region cost reviews

A cost review scoped to `us-east-1` missed a load balancer in `us-west-1` that
had been live since **August 2024** with every target unhealthy and no tasks
behind it: **$25.25/month for 13 months, ~$300 wasted**.

The AWS CLI is region-scoped. Any future cost or resource audit must sweep every
region. As of 2026-09-09, verified zero ALBs / Elastic IPs / public ENIs
account-wide.

---

## 6. Housekeeping

- **ECR repos** `tgbackend`, `telegram-scraper`, `wmnrepo` — retained because
  nothing could be shown to use them. Confirm and delete if dead.
  (`financial-fraud-scraper` and `telegram-channels-scraper` **are** in use by
  other clusters — do not delete.)
- **`scrape/dork1..6`** images are the only remaining copy of the retired
  scraper. Keep until confident, then delete.
- **Old controller Lambdas** (`ECS-Service-Controller-*`) still sit behind
  `/tg` and `/tg-2`. Harmless, but they now point at nothing and those routes
  return empty results.
- **ECS creation Lambdas** were kept deliberately. Note they would rebuild
  against deleted stacks using templates pinning **older** task-definition
  revisions than were live — treat as build-from-scratch, not a restore.

---

## 7. Security (not optimizations — do these)

- **`scrape/dork6`'s image contains `.env` and `saum*.session`.** Anyone who can
  pull it controls those Telegram accounts. Rotate alongside the session work.
- **`Iac/dorks-script/dork-dockers/connect.py:7-8`** has plaintext AWS access
  keys. Rotate.
- **Telegram sessions are dead** — `/add-ch` and `/get_tg_msg` return 502 on
  every channel click. Discovery works; opening a channel does not. This is now
  the largest gap in the user journey and is unrelated to the migration.

---

## Rejected — do not re-propose without new evidence

### Redis caching of search results
Repeat searches would drop to <1s, free, on infrastructure already running.
**Rejected on product grounds:** results are sorted by recency and this is
threat intelligence. A cache hit is stale by construction — "here is what was
leaking two hours ago" is a different product. Owner's call.

### Moving `rankChannels` off the critical path
Would remove ~6s of perceived wait. **Rejected: it breaks the client.** The
frontend immediately fetches message history for the AI-ranked top 10. An
unranked response makes it fetch the *wrong* ten and visibly reshuffle. Moves
the cost rather than removing it.

### Upgrading the Decodo plan
Higher tiers buy **concurrency**, and there is no queueing to remove — 10
requests, 10 workers, zero rate-limit errors in every test. Latency is Decodo's
per-request time, which no tier changes. Measured cost of the upgrade: 1–2
seconds for $30/month.

### Switching to ScrapeGraphAI
Tested head-to-head, same minute, same term (2026-09-10):

| | wall time | channels | security-relevant |
|---|---|---|---|
| Decodo | **7,979ms** | 52 | **11** |
| ScrapeGraphAI | 8,457ms | 49 | **11** |

Security-relevant lists were **identical**. No speed advantage, no coverage
advantage, and it adds two problems Decodo doesn't have: an **Iranian egress**
that can't be overridden (`country: "us"` → 502 on 8 of 10 requests) and a
**response cache** requiring a URL hack to defeat. Good product; sideways move.

*(An earlier note that ScrapeGraphAI was "3× faster" was a measurement error —
its cached API vs Decodo measured through the full stack.)*

### Switching to a general web-search API (Serper etc.)
**Structurally disqualified.** Our `cx` is a curated engine restricted to a few
Telegram directory sites, and that curation is the asset. A general web-search
API reproduced only **33 of 72** channels, and adding result pages *flattened*
the overlap while piling on irrelevant channels:

| pages | channels | matching baseline |
|---|---|---|
| 1 | 21 | 16 |
| 1–2 | 42 | 32 |
| 1–5 | 61 | **33** (plateau) |

**Rule this establishes:** anything that *renders our CSE* preserves the
results; anything that *queries Google generally* does not.

### Static proxy pools (own scraper + bought IPs)
Shared datacentre IPs went from **0/120 CAPTCHAs to 9/10 blocked** after ~900
cumulative requests. They're a consumable, not an asset, and they don't scale
with concurrency: 10 simultaneous users = 120 concurrent requests, which at
~1 request per IP needs ~120 addresses — more expensive than the fleet that was
deleted.

### dork6 as an automatic fallback when dorks 1–5 return nothing
**Rejected on evidence.** Two separate problems:

1. **For multi-word terms it is redundant.** dork5's `re.search(r'[\d\W]', q)`
   matches the space, so dork5 *already* collapses to the bare term. Measured:
   `"Kanpur Dehat"` and `"Bhavnagar municipal"` → dork6 added **0 new channels**.
2. **For single-word terms it adds only noise.** dork5 takes its malware branch,
   so dork6 differs — but what it returns is worthless:

| term | dorks 1–5 | dork6 new channels | new that are security-relevant |
|---|---|---|---|
| `Cochin` | 11 | 14 | **0** |
| `Zomato` | 20 | 7 | **0** |

New channels were betting, jobs and food-delivery feeds (`BETFAIRTOSSBOOK`,
`OnlineJobGyan`, `Free_zomato_food`, `magicpin_groupbuys`). For a threat-intel
product this is worse than an empty result: it manufactures the appearance of
leads. "No results" is the more honest answer, and the **user-driven** dork6
path (`include_keywords` / `exclude_keywords`) already exists for when an
analyst knows what to look for.

---

## Reference

- Lambda source + self-check: `Iac/decodo-scraper/`
- Retired fleet config (for rebuild): `Iac/fleet-snapshot/`
- Baseline used for every parity diff: `Iac/dorks-script/scraper_baseline.json`
- Comparison harnesses: `Iac/dorks-script/{cse_harness,bench,soak,proxy_probe}.py`
- Rollback: remove `SCRAPER_URL` + `SCRAPER_API_KEY` from the backend `.env`.
  **Note there is no longer an ECS fleet behind the old route** — it was
  deleted 2026-09-09.

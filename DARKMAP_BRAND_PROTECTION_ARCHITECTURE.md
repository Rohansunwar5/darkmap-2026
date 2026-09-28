# DarkMap Brand Protection and Anti-Piracy: Technical Architecture

**Status:** proposed, not yet built
**Date:** 2026-09-15
**Companion to:** `Darkmap_Brand_Protection_AntiPiracy_Product_Plan.md`
**Scope:** `darkmap backend/darkmap-server` and `client/Darkmap-2025`

---

## 0. Scope and non-scope

This document describes how the brand protection and anti-piracy product in the
product plan gets built inside DarkMap.

**In scope:** the DarkMap backend, the DarkMap client, the collection pipeline,
storage, scheduling, scoring, evidence, and the takedown workflow.

**Explicitly out of scope:** `telegram-new/telegram-premium-server`. That is a
separate product with its own users, its own Telegram accounts, and its own
release cycle. It is referenced in this document **only as a reference
implementation**, because it already solves the queue, scheduling, storage and
process-supervision problems we are about to solve again. We copy patterns from
it. We do not couple to it, we do not share a database, and we do not build a
shared library.

---

## 1. The one structural change

DarkMap today is a **search engine**. The product plan describes a **monitoring
platform**. The difference between them is a single property: persistence.

Today, a user's HTTP request *is* the collection run:

```
SearchBar -> POST /telegram/search-channels -> Decodo Lambda -> Google CSE
          -> rankChannels (gpt-4o-mini) -> per-channel Telethon -> rankMessages
          -> render -> everything is discarded
```

Mongo currently holds three collections: `User`, `Admin`, `ContactLead`. Every
record listed in section 11 of the product plan (watchlist, monitoring rule,
source item, linked item, alert, evidence, case, removal request, history
record) does not exist. Neither does anything that depends on remembering
yesterday: first seen and last seen, repeat offenders, the network graph,
time-to-action metrics, or removal verification.

The change is therefore:

> **Collection stops being triggered by a user request and starts being
> triggered by a schedule. It writes to a store. The UI reads from the store.**

Consequences of that single inversion:

* Search latency drops from about 24 seconds to milliseconds, because the UI is
  reading Mongo instead of waiting on a vendor and an LLM.
* Freshness labels ("last checked at") become free, satisfying the product rule
  "Show fresh and latest information".
* Repeat-offender and network detection become possible at all.
* Cost moves from per-search to per-watchlist, which is the model the business
  actually sells.

**Search is not a footnote to this, it is the front door.** The first thing a
customer does on the platform is type a query, and they may do that for weeks
before they ever configure a watchlist. A studio whose film released on Friday
types the title on Monday and needs an answer while they wait. Monitoring is the
later stage of the same journey, not a replacement for it.

So the two modes share one pipeline and differ only in trigger and in what
happens to the result:

| | **Search** (first journey) | **Monitoring** (later stage) |
|---|---|---|
| Triggered by | a user, waiting | a Bull cron |
| Discovery | live fan-out, section 6.1.2 | the same fan-out |
| Result | ranked, on screen in 10-15s | persisted, diffed against the last run |
| New findings | all of them are new to the user | only the diff becomes an Alert |

One code path, two triggers, one store. Persistence is what turns the second
mode on; it does not demote the first.

---

## 2. Runtime topology

Three places things run, and nothing else.

### 2.1 The VPS (primary)

Runs under pm2 alongside the existing `darkmap-server` process. Hosts:

* The Express API (`darkmap-server`).
* **Local Redis** on `127.0.0.1:6379`, used for Bull queues and for the
  existing JWT and profile cache.
* The Bull queue processors and all collection workers.
* The MongoDB connection (existing `MONGO_URI`).

### 2.2 AWS Lambda (only where it already exists)

We are not adding AWS services. The Lambdas that stay are the ones already
deployed and working:

| Lambda | Route | Purpose | State |
|---|---|---|---|
| `darkmap-decodo-scraper` | `POST /tg-decodo` on API GW `4phuyf7tlf` | Telegram channel discovery through Decodo against the Google CSE | working |
| `Additional-Channels-Telethon` | `POST /add-ch` | fetch messages for a named channel | **broken, see section 15** |
| `telethon_dynamo_code` | `POST /get_tg_msg` | fetch messages for a discovered channel | **broken, see section 15** |

Two existing AWS dependencies are inherited rather than newly chosen: **API
Gateway** fronts those Lambdas, and **DynamoDB** table `Additional-Channels`
stores the Telethon session strings. Both stay as they are. No new AWS service
is introduced by this design.

**New collectors do not need Lambda.** Instagram, Facebook, Reddit, YouTube,
TikTok, X and the website crawler are all plain HTTPS calls to vendor or
official APIs. They run directly inside the Bull worker on the VPS. Lambda buys
IP diversity and process isolation, which mattered when we ran Chromium
ourselves. The vendor now does the rendering, so it buys nothing here.

### 2.3 Cloudflare R2

All captured bytes: screenshots, page HTML, images, video frames, raw API
payloads, and generated proof-packet PDFs. Details in section 8.

### 2.4 What we are not using, and why

| Not used | Why |
|---|---|
| **EventBridge Scheduler** | It is an AWS cron that invokes a Lambda on a timer. We do not need it. Bull already schedules recurring work **inside the application** with `repeat: { cron, tz }`, which is the same capability with three advantages: it lives in the same codebase as the job it runs, it can be created and cancelled per watchlist at runtime by ordinary application code, and it needs no IAM role. The previous DarkMap design used EventBridge only because the workers were Lambdas with no long-lived process to hold a timer. On a VPS with a persistent pm2 process, that reason disappears. |
| **SQS** | Redis plus Bull is already running on the box and provides retries, backoff, delayed jobs, cron, concurrency limits and inspectable job state. SQS would add an AWS dependency to replace something we already have. |
| **S3** | Replaced by R2. See section 8. |
| **A graph database (Neo4j and similar)** | Edges are computed by deterministic joins and traversals are 2 to 3 hops. Mongo `$graphLookup` covers that. Revisit only when a traversal is measurably slow. |
| **BullMQ** | Bull v4 is already proven in production on this box in `telegram-premium-server`. Running two queue libraries against one Redis instance on a 4 GiB machine is a needless risk. BullMQ's Flows feature would only matter if the enrichment chain branched, and it does not. |
| **Local Chromium or Playwright for evidence capture** | See section 13. The VPS has no memory headroom for it, and the vendor returns screenshots in the same call. |

---

## 3. System diagram

```
                     C L I E N T   (client/Darkmap-2025, React + Redux)
                     /app/watchlists  /app/queue     /app/finding/:id
                     /app/cases       /app/takedowns /app/graph
                     /app/dashboard   /generic  (Investigate, existing search)
                                     |
                                     |  REST via RTK Query
                                     |  socket.io for live queue updates
                                     v
  +=========================== V P S  (pm2) ==================================+
  |                                                                           |
  |  darkmap-server (Express + TypeScript)                                    |
  |    master process   : owns the Bull queue processors                      |
  |    worker processes : serve HTTP only                                     |
  |                                                                           |
  |  Local Redis 127.0.0.1:6379                                               |
  |    - Bull queues: collect / analyze / recheck                             |
  |    - existing JWT and profile cache                                       |
  |                                                                           |
  |  +------------------ QUEUE: collect (concurrency 5) -------------------+  |
  |  |  triggered by a Bull repeat-cron per Monitor, or self-chained delay |  |
  |  |                                                                     |  |
  |  |  telegram   -> Lambda POST /tg-decodo   (Decodo -> Google CSE)      |  |
  |  |             -> Lambda POST /get_tg_msg, /add-ch  (Telethon)         |  |
  |  |  instagram  -> ScrapingDog Instagram Profile / Posts / Comments     |  |
  |  |  facebook   -> ScrapingDog Facebook Profile / Posts                 |  |
  |  |  meta ads   -> Meta Ad Library API        (official, free)          |  |
  |  |  reddit     -> Reddit OAuth API           (official,)          |  |
  |  |  youtube    -> YouTube Data API v3        (official, free)          |  |
  |  |  tiktok / x -> ScrapingDog TikTok / X APIs                          |  |
  |  |  web        -> own fetch + redirect chain; ScrapingDog if blocked   |  |
  |  |  darkweb    -> existing *.darkmap.org scrapers                      |  |
  |  |                            |                                        |  |
  |  |   raw bytes + screenshot --+--> Cloudflare R2   (sha256 at capture) |  |
  |  |   normalized record -------+--> Mongo: SourceItem upsert            |  |
  |  |        key = (orgId, platform, externalId)                          |  |
  |  |        sets firstSeenAt once, lastSeenAt on every sighting          |  |
  |  +----------------------------|----------------------------------------+  |
  |                               v                                           |
  |  +------------------ QUEUE: analyze (concurrency 3, BATCHED) ----------+  |
  |  |  1. cheap deterministic gate                                        |  |
  |  |       lookalike name and domain distance, pHash against official    |  |
  |  |       logos, keyword and price/contact regex, redirect chain        |  |
  |  |  2. ONE batched OpenAI call over the survivors (reuses scoreBatch)  |  |
  |  |  3. score = 5 named weighted components  -> scoreBreakdown          |  |
  |  |  4. LinkedItem edges (domain / contact / pHash / explicit mention)  |  |
  |  |  5. dedupe cluster, then emit Alert                                 |  |
  |  +----------------------------|----------------------------------------+  |
  |                               v                                           |
  |  +------------------ QUEUE: recheck (repeat cron) ---------------------+  |
  |  |  re-fetch every RemovalRequest URL past its recheckAt               |  |
  |  |  record live / 404 / moved   ->  RemovalRequest.status              |  |
  |  +---------------------------------------------------------------------+  |
  |                                                                           |
  |  MongoDB: Watchlist  Monitor  SourceItem  Alert  LinkedItem  Evidence      |
  |           Case  RemovalRequest  AuditLog                                  |
  +===========================================================================+
             |                                        |
             v                                        v
     AWS Lambda (existing only)              Cloudflare R2 (all bytes)
```

---

## 4. Scheduling model

No external scheduler. Two Bull patterns, both already running in
`telegram-premium-server` and both copied from there.

### 4.1 Fixed cadence: repeatable cron jobs

For "check this watchlist every day at 06:00 IST". Created and destroyed by
ordinary application code when a Monitor is created, paused or deleted.

```ts
await collectQueue.add(
  'collect',
  { monitorId, platform },
  {
    repeat: { cron: '0 6 * * *', tz: 'Asia/Kolkata' },
    jobId: `monitor-${monitorId}`,
  }
);
```

Pausing a monitor removes the repeatable job by key, exactly as
`bookmark.service.ts` does for alerts today.

### 4.2 Adaptive cadence: self-chaining delayed jobs

For "check this watchlist more often while it is producing findings". Each
completed job enqueues its own successor with a computed delay, the same shape
as `scheduleNextScrape()`.

```ts
await collectQueue.add('collect', { monitorId, platform }, { delay: interval });
await Monitor.updateOne(
  { _id: monitorId },
  { nextRunAt: new Date(Date.now() + interval), interval }
);
```

The interval function is a direct descendant of
`telegram-premium-server/src/utils/scrapeInterval.util.ts`, which is already
pure and unit tested. It gains one branch that the product plan asks for:

```
releaseDate within T-7 to T+14       -> 1 hour     (pre-release piracy window)
findings in the most recent run      -> 6 hours
no findings for 5 consecutive runs   -> 24 hours
floor                                -> 30 minutes, never faster
```

That single branch implements "detect impersonations and scams early,
especially around big releases" from the product plan, in about ten lines.

### 4.3 The two things that must not be skipped

Both exist in `telegram-premium-server`, and both must be ported. Without them,
one transient outage silently kills a monitor forever.

1. **Re-arm on terminal failure.** When a job exhausts its Bull retries, the
   `failed` handler re-enqueues the chain. Source:
   `rescheduleScrapeAfterFailure()`.
2. **Reconcile on boot.** On startup, find every active Monitor that is overdue
   and has no pending job, and enqueue it. Source:
   `reconcileStrandedScrapes()`.

### 4.4 Process supervision

pm2 in `fork` mode with `instances: 1`, with the application's own Node
`cluster` module forking the HTTP workers. **The master process owns the queue
processors; the HTTP workers do not.** This is what guarantees each scheduled
job runs exactly once. Source: `telegram-premium-server/src/index.ts` and its
`ecosystem.config.js`.

---

## 5. Queues

Three, not six.

| Queue | Concurrency | Job payload | Responsibility |
|---|---|---|---|
| `collect` | 5 | `{ monitorId, platform }` | Call the collector, store bytes in R2, upsert `SourceItem`, enqueue `analyze` |
| `analyze` | 3 | `{ sourceItemIds: [] }` (batched) | Deterministic gate, one batched LLM call, score, link, dedupe, emit `Alert` |
| `recheck` | 2 | `{ removalRequestId }` | Re-fetch a takedown target, update its status |

Enrichment and scoring are **one queue, and the job carries a batch of items**,
because the existing `ai.service.scoreBatch()` already scores up to 80 items in
a single OpenAI call. Per-item LLM jobs would cost roughly 80 times more for
the same result. This is the single largest cost decision in the pipeline.

Standard Bull options on all three, matching the existing `config/redis.ts`:
`attempts: 3`, exponential backoff from 2000 ms, `removeOnComplete: 100`,
`removeOnFail: 50`.

---

## 6. Platform matrix

Two rules applied throughout:

1. **Use the free official API where one exists, and pay a vendor only where
   none does.**
2. **Say which platforms the product plan actually asked for.** Section 3 of
   the product plan names exactly five: Telegram, Instagram, Facebook, Reddit,
   and Websites and URLs. Section 9 narrows the first release further, to
   Instagram, Facebook, Reddit and Website. Everything else in the table below
   is marked **proposed** and is a suggestion from this document, not a
   requirement from the plan. Nothing marked proposed should be built before
   the five in-plan platforms are working.

| Platform | In plan? | Discovery method | Content fetch | Provider | Cost | Notes |
|---|---|---|---|---|---|---|
| **Telegram** | ✅ section 3 | existing Decodo against the Google CSE, 6 dork queries | Telethon Lambdas `/add-ch` and `/get_tg_msg` | Decodo | $19/mo, already paid | Already built and working. Do not replace. The curated `cx` is the asset. Telethon sessions are currently dead, see section 15. |
| **Reddit** | ✅ section 3 and first release | Reddit OAuth search API | same API: posts, comments, authors, subreddits | **official, free** | $0 | The easiest platform to add. A real API also means defensible evidence. Build first among the new ones. |
| **Websites and URLs** | ✅ section 3 and first release | Certificate Transparency logs for newly registered lookalike domains, dnstwist-style permutations of the official domains, and `site:` dorks through the existing CSE | own `fetch` following the redirect chain; ScrapingDog generic scrape API for sites that block us; vendor-side screenshot | mostly free | low | Highest value for piracy, phishing and fake storefronts. CT logs surface lookalike domains **on the day they are registered**, before any content exists. |
| **Instagram** | ✅ section 3 and first release | ScrapingDog Instagram Profile API against generated handle variants, plus `site:instagram.com` through the existing CSE | ScrapingDog Instagram Posts API, Post Details API, Comments API | **ScrapingDog** | paid | No legal public API exists. See section 7. |
| **Facebook** | ✅ section 3 and first release | ScrapingDog Facebook Profile API, plus `site:facebook.com` through the existing CSE | ScrapingDog Facebook Posts API | **ScrapingDog** | paid | Same situation as Instagram. |
| **Meta Ad Library** (Facebook and Instagram paid ads) | ⚠️ not a new platform | Meta Ad Library API | same | **official, free** | $0 | Not named in the plan, but this is not a sixth platform. It is a free, official, fully public access path into Facebook and Instagram, both of which **are** in the plan. It covers scam ads, fake giveaways and counterfeit sellers running paid promotion, which section 5 of the plan does ask for. Recommended. Both scraping vendors simply wrap this API. |
| **YouTube** | ❌ **proposed** | YouTube Data API v3 search | Data API for videos, channels and comments; transcripts via ScrapingDog YouTube Transcripts API | **official, free** (10k units/day) | $0 | Not in the plan. Raised because for OTT and studio piracy, which is the plan's first named customer segment, YouTube is arguably the highest-value platform of all, and the API is free. A scope decision for product, not an engineering one. |
| **TikTok** (organic and Commercial Content Library) | ❌ **proposed** | ScrapingDog TikTok Profile API; the Ad Library via TikTok's Commercial Content Library | ScrapingDog TikTok Post API | ScrapingDog, plus one official free source | paid | Not in the plan. Lower priority than everything above. |
| **X / Twitter** | ❌ **proposed** | ScrapingDog X Post URLs Scraper API | same | ScrapingDog | paid | Not in the plan. Lowest priority. |
| **Dark web, ransomware, breach forums** | ❌ **proposed** | existing scrapers at `ransome.darkmap.org`, `db.darkmap.org`, `breachf.darkmap.org`, `hack.darkmap.org` | same | **existing, free** | $0 | Not in the plan, but already built and currently commented out in `client/Darkmap-2025/src/store/slices/searchSlice.js`. Modelling them as `SourceItem`s costs almost nothing and ships brand protection plus breach exposure as one product. |

### 6.1 Discovery vs enrichment: the split that drives everything

**This is the most important thing in section 6. Getting it wrong means buying
the wrong product.**

Every social API on the market falls into one of two categories, and the
vendors' marketing does not distinguish them:

| | **Discovery** | **Enrichment** |
|---|---|---|
| Input | a keyword, hashtag or query | a username, profile ID or post URL |
| Answers | "who is talking about Obsession right now?" | "tell me everything about @obsession_hd_movie" |
| Needed for | the primary user journey | everything after it |

**ScrapingDog's Instagram and Facebook endpoints are enrichment only.** Profile
requires `username`, Posts requires the profile `id`, Comments requires a post.
Verified in their docs.

**Bright Data's are too, at the documented level.** Their Instagram scraper
quickstart shows profile-by-URL, and even the product marketed as a "Hashtag
Scraper" documents post URLs as its input. The marketing pages claim discovery;
the documentation shows identifiers. Treat the discovery claim as unverified
until a sales engineer demonstrates keyword input.

**Neither vendor sells the thing the primary user journey needs.** So we build
that step, and it is smaller than it sounds.

#### 6.1.1 Why this matters: the actual first user journey

Monitoring is a later stage. The **first** thing a customer does is search.

> A film called *Obsession* released this week. The studio's team logs in, types
> `Obsession`, and needs to know right now whether Instagram or Facebook
> accounts are posting leaked scenes, full-movie download links, or streaming
> mirrors.

There is no watchlist yet. There are no known accounts. There is a person
waiting for an answer. And the pirates will never appear in the comments of the
official film account, because their customers find them through hashtags.

Google and the CSE cannot serve this. A pirate account created four hours ago is
not in Google's index, and may never be. **Index lag makes search-engine
discovery structurally unfit as the primary path.** It stays as a weekly
backfill that catches the long tail.

#### 6.1.2 The discovery engine already exists

The Telegram flow is: one query, **six dorks fanned out in parallel**, merge,
dedupe, AI rank. That is a discovery engine. It is currently pointed at one
source with one dork set.

Piracy discovery is the same engine with a new dork set and new source adapters.

```
User types "Obsession"
        |
        v
QUERY EXPANSION           (free, instant, local - this is the new IP)
  hashtags:  #obsession #obsessionmovie #obsession2026
             #obsessionfullmovie #obsessionleaked #obsessionhd
  phrases:   "obsession full movie" | "obsession download"
             "obsession leaked" | "obsession watch online"
  lexicon:   download | watch free | full HD | link in bio | dm for link
        |
        v
PARALLEL FAN-OUT          (same shape as the six dorks today)
  |- instagram.com/explore/tags/<tag>/        x6   <- Decodo renders
  |- instagram.com/web/search/topsearch/?q=   x1   <- Decodo renders
  |- facebook.com/search/posts?q=             x2   <- Decodo renders
  |- Meta Ad Library keyword query                 <- free official API
  |- existing Telegram dork set                    <- already built
  \- CSE site: dorks for piracy sites              <- already built
        |
        v
MERGE + DEDUPE  ->  SCORE  ->  RANKED RESULTS
```

The **piracy dork set is to this what the six breach dorks are to Telegram
search: the actual product IP.** Treat it that way. Version it, test it, and do
not let it live only in someone's head.

#### 6.1.3 Who renders those URLs: Decodo, which is already paid for

Not ScrapingDog, not Bright Data. Decodo's Web Scraping API renders arbitrary
URLs server-side with JavaScript, which is exactly what it already does for CSE
pages. Pointing it at an Instagram hashtag URL is the same operation, and
`Iac/decodo-scraper/lambda_function.py` already contains a stdlib HTML parser
for result cards.

| Layer | Tool | Cost |
|---|---|---|
| **Discovery** (keyword to URLs and handles) | **Decodo** + our own parser | already paid |
| **Enrichment** (handle to profile, posts, comments) | ScrapingDog | per call |
| **Evidence** (screenshot) | ScrapingDog Screenshot API, 5 credits | per call |

This demotes ScrapingDog to a smaller, cheaper role than earlier drafts of this
document assumed, and it keeps the expensive vendor off the highest-volume path.

#### 6.1.4 The test that decided the design: RUN, and it PASSED

> **Status: answered 2026-09-21. Logged-out discovery works. No session pool and
> no Web Unlocker are needed for discovery.**

The test is implemented as a runnable prototype in `prototype/`. Re-run it with
`node probe.js "<query>"` rather than re-arguing any of this from memory. Full
results and method in `prototype/README.md`.

**Measured against Decodo, logged out:**

| URL shape | Upstream | Body | Verdict |
|---|---|---|---|
| `instagram.com/explore/tags/<tag>/` | 200 | ~935 KB | **WORKS** |
| `facebook.com/hashtag/<tag>` | 200 | ~1.4 MB | **WORKS** |
| `facebook.com/<page>` | 200 | ~1.3 MB | **WORKS** (enrichment) |
| `instagram.com/web/search/topsearch/?query=` | **401** | 42 B | needs auth, dropped |
| `facebook.com/search/pages?q=` | **404** | 48 B | needs auth, dropped |

Four consequences, all of which amend earlier sections of this document:

1. **Hashtag pages are the discovery surface on both platforms.** Keyword search
   is walled on both. This is fine: hashtags are where piracy content lives,
   because that is how its customers find it.
2. **The fan-out in 6.1.2 must drop the two search URLs** and use
   `facebook.com/hashtag/<tag>` in place of `facebook.com/search/posts`.
3. **Latency is 20 to 40 seconds, not the 10 to 15 estimated in 6.1.7.** These
   are 1 to 2 MB rendered-JavaScript pages. Measured: 23.5s for "Jawan", 39.2s
   for "Obsession", 56.3s when a source needed a retry. Progressive rendering is
   now mandatory rather than a nicety.
4. **Concurrency needs a cap.** Firing six URLs at once produced one empty body;
   three serial Instagram fetches succeeded 3/3 at 11.7 to 22.9 seconds. Reuse
   the `MAX_WORKERS` / `RETRIES` / `HEDGE_AFTER_MS` pattern already in
   `Iac/decodo-scraper/lambda_function.py`.

**One trap, recorded so nobody rediscovers it:** a *working* Instagram hashtag
page still contains `accounts/login` in its chrome. Presence of that marker is
not evidence of a wall. A real wall is the marker on a small body, or an
upstream 401/403.

**Known open defect in the prototype**, carried here because it gates trusting
any score: handle-to-caption pairing is positional and unreliable, so the harm
lexicon frequently scores against the wrong text and live findings all land at
15 to 26. It is the same bug class as the Telegram card parser. Pair by where
the next card starts, not by index.

#### 6.1.5 Instagram sessions: do not build this

**6.1.4 passed, so this is not needed for discovery.** It is kept because the
question will come back the moment someone proposes Instagram keyword search,
which is 401-walled. If that requirement ever returns, here is what sessions
actually commit us to:

- Burner Instagram accounts, each holding a `sessionid` cookie.
- Each session pinned to a **consistent** residential IP, because Instagram
  flags session and IP mismatches.
- A pool, because accounts get banned, plus health checks and rotation.
- Re-login flows that hit 2FA and checkpoint challenges needing SMS or email.
- Encrypted storage in Mongo. Never in the repo, never baked into an image.

**We have direct evidence of what this costs us.** `HANDOVER.md` section 10:
both Telethon sessions are dead, every channel click returns 502, and the core
product is blocked on it today. Same section: `.env` and `.session` files were
baked into the deployed dork6 image. Instagram bans considerably harder than
Telegram does.

**Decision: do not build session management.** If the 6.1.4 test fails, buy
**Bright Data's Web Unlocker**, which handles sessions, proxies and challenges
as a service and moves the ban risk off our books. That is cheaper than
operating an account pool, and it is the strongest argument for Bright Data in
this entire document.

#### 6.1.6 What "realtime" honestly means here

Two limits, both of which must reach the customer as written, not softened.

**It is pull, not push.** There is no webhook from Instagram. A post is seen
when a hashtag page is fetched. For ad-hoc search that is genuinely live, the
user searches and gets what exists at that second. For monitoring, latency
equals the poll interval and nothing better.

> Say **"live as of the moment you search."** Never say "alerts the instant
> content appears."

**Hashtag pages are not a complete feed.** The Recent tab has been degraded or
removed in places, and Instagram deliberately filters and delays content it
suspects breaches policy, which piracy content does. Some posts appear late,
some never appear, some accounts are private or do not use hashtags.

**No single surface gives full recall.** That is the entire argument for the
parallel fan-out in 6.1.2: hashtags, native search, the Ad Library, Telegram and
web dorks each miss different things, and the union is what makes the product
credible.

#### 6.1.7 Latency budget for interactive search

Roughly nine parallel fetches at Decodo's measured ~6s median, hedged for
stragglers, gives **10 to 15 seconds to first results**. Comparable to the
current Telegram search, and the loader UX already exists.

**Render progressively.** Meta Ad Library and Telegram return fast; show those
immediately and fill in Instagram and Facebook as they land. The user sees
motion at two seconds instead of a spinner for fifteen.

---

### 6.2 Vendor choice: ScrapingDog now, Bright Data as the escalation path

**Decision: start on ScrapingDog. Keep Bright Data as a named, triggered
escalation.**

#### 6.2.1 Why ScrapingDog now

ScrapingDog is used for **exactly one job in this architecture**: Instagram and
Facebook, which are the only in-plan platforms with no legal official API. It
is not used for Telegram (Decodo owns that), not for Reddit, and not for
websites. That narrow scope is what makes the cheaper vendor the right one.

Four reasons:

1. **The catalog is a near exact match for the gap.** Instagram Profile, Posts,
   Post Details and Comments; Facebook Profile and Posts. Those map almost one
   to one onto what section 3 of the product plan says we must collect from
   Instagram and Facebook. We are not paying for breadth we will not use.
2. **Cost.** Materially cheaper at pilot scale, and the tier we need is driven
   by monthly request volume, which starts low. See 6.1.2.
3. **Onboarding is same-day.** Sign up, get a key, ship. Bright Data requires
   KYC and a compliance review that takes days to weeks and gates some targets.
   That delay would block phase 6 of the build for no benefit we can currently
   use.
4. **Measured speed.** In the earlier vendor bake-off, ScrapingDog was about 20
   percent faster per request than the alternative tested. Latency matters less
   now that collection is scheduled rather than synchronous, but it is not a
   point against it.

There is no reliability or compliance benefit from Bright Data that we can
actually cash in at pilot volume. Paying for it now is paying for insurance
against a risk we do not yet carry.

#### 6.2.2 The concurrency question, and why "at least 12" no longer applies

An earlier assessment of ScrapingDog rejected its cheapest tier because it
allows only 5 concurrent requests, "and we need at least 12". **That figure
does not apply to this architecture and should not be carried forward.**

It came from the old synchronous Telegram search path: 6 dork queries times 2
result pages, all fired in parallel while a user waited for a response. That
work now belongs to **Decodo**, which we are not replacing, and it never
touches ScrapingDog.

ScrapingDog's work here is Instagram and Facebook collection, which runs in the
`collect` queue on a schedule. Nobody is waiting on it. The constraint is
therefore **throughput over a day**, not burst parallelism.

The arithmetic, at roughly 30 requests per watchlist per platform per run
(about 20 handle and name variants checked as profile lookups, plus posts
fetched for the variants that hit):

| Watchlists | Requests/day (IG + FB, daily cadence) | Requests/month |
|---|---|---|
| 5 (early pilot) | about 300 | about 9,000 |
| 50 | about 3,000 | about 90,000 |

Capacity at just **5 concurrent requests**, assuming 3 seconds each, is roughly
1.7 requests per second, which is about 144,000 requests per day. At 50
watchlists we would be using around 2 percent of that. Even at a concurrency of
1, capacity is about 28,800 per day, still an order of magnitude more than
needed.

**Conclusion: concurrency is not a constraint on this design.** The binding
constraint is the tier's **monthly request allowance**, which scales with the
number of watchlists sold, not with how parallel the workload is.

**Therefore: start on the lowest ScrapingDog tier whose monthly request
allowance covers the current watchlist count, and move up on volume alone.**
Verify the current allowance per tier against ScrapingDog's live pricing page
before committing, since vendor pricing changes and the figures quoted in this
document are from an earlier assessment.

#### 6.2.3 What Bright Data has that ScrapingDog does not

Three things, listed so the future decision is already reasoned out.

| Bright Data advantage | What it actually means | Worth paying for today? |
|---|---|---|
| **Evidence defensibility** | Bright Data publishes a compliance framework, performs KYC on its customers, and gates certain targets behind review. In a contested takedown, "collected through Bright Data's compliance-reviewed public data API" is a materially stronger answer than "we used a scraping API". | **This is the one that will eventually matter**, because DarkMap's output goes to legal teams. Not yet, because we have no customer contesting evidence. |
| **Reliability at high volume** | Better success rates and fewer blocks when pushing sustained throughput. This is the core of what their price premium buys. | No. At 3,000 requests per day we are nowhere near where this shows up. |
| **Coverage breadth** | The same social targets plus a SERP API, Web Unlocker, and prebuilt datasets. | No. Telegram is covered by Decodo and the curated CSE, Reddit by its official API, and websites by our own fetcher. |

**An important limit on the first row, so it is not over-read:** the difference
is one of posture and paperwork, not of legal authorization. Neither vendor is
authorized by Meta, and collecting Instagram and Facebook content through
either one is against Meta's terms of service. Bright Data gives a better
account of how the data was obtained. It does not give permission. The only
route that actually gives permission is the Meta Brand Rights Protection
application in section 7, which should be started regardless of vendor choice.

#### 6.2.4 The switch trigger

Written down now so it stays a measurement rather than a debate. Move to Bright
Data at whichever comes first:

* **More than 5,000 collected records per day**, where reliability at volume
  starts to be worth its premium; or
* **The first paying customer whose contract references legal proceedings**,
  where evidence defensibility stops being theoretical.

The cost of being wrong is small. The collector seam in section 6.3 is a single
function type, so switching vendors means adding one file, not refactoring.

### 6.3 The collector contract

Three genuinely different implementations exist, so a thin seam is justified.
It is a function type, not a class hierarchy.

```ts
// src/collectors/types.ts
// ponytail: a type, not an interface hierarchy. Three real implementations
// exist (decodo/CSE, scrapingdog/social, fetch/web), so this seam earns its
// keep. Swapping a vendor means adding one file, not refactoring.
export type Collect = (monitor: Monitor) => Promise<RawItem[]>;
```

---

## 7. The Meta access decision

This is the largest open question in the plan, and it is not an engineering
decision. There is **no legal public API** for Instagram profiles and posts, or
for Facebook pages and posts. Meta's Graph API returns only assets you already
own.

Three paths, not mutually exclusive:

1. **Meta Brand Rights Protection and Rights Manager.** The front door.
   Requires an application and approval. Gives both **search and takedown** in
   one, with semi-automatic removals. Free. Slow to obtain.
2. **ScrapingDog or Bright Data.** Fast, works this week, costs money, and is
   against Meta's terms of service. For a product whose output goes to legal
   teams, a contestable collection method is a real liability.
3. **`site:instagram.com` and `site:facebook.com` through the CSE we already
   pay for.** Zero new vendor, zero new code path (it is a dork variant), and
   it surfaces public profiles and posts that Google has already indexed. Lower
   recall, legally uninteresting, available immediately.

**Recommendation: ship path 3 now, apply for path 1 today in parallel, and add
path 2 only when a customer's coverage requirement makes it necessary.** Never
promise real-time Meta coverage. The product plan already supplies the correct
commercial framing in its section 12: "Use clear platform coverage and
freshness labels instead of promising real-time everywhere."

---

## 8. Storage: Cloudflare R2

All captured bytes live in one R2 bucket. R2 is S3-compatible, so
`@aws-sdk/client-s3` is used with a custom `endpoint`. The existing
`s3.service.ts` in `telegram-premium-server` is the template and changes by
about three lines.

### 8.1 Why R2 rather than S3

| | R2 | S3 |
|---|---|---|
| Storage | about $0.015 per GB-month | about $0.023 per GB-month |
| **Egress** | **$0** | about $0.09 per GB |
| API | S3-compatible | native |

The deciding factor is egress, and it is structural rather than marginal.
Evidence screenshots are read constantly: every analyst opening a finding,
every proof-packet download, every recheck, every dashboard thumbnail. At
roughly 50 GB of screenshots served a handful of times each, S3 egress alone
runs $20 to $50 per month, while R2 runs $0.

### 8.2 Key layout

```
evidence/{orgId}/{sourceItemId}/{capturedAtISO}/screenshot.png
evidence/{orgId}/{sourceItemId}/{capturedAtISO}/page.html
evidence/{orgId}/{sourceItemId}/{capturedAtISO}/raw.json
evidence/{orgId}/{sourceItemId}/{capturedAtISO}/media/{sha256}.{ext}
packets/{orgId}/{caseId}/{packetId}.pdf
```

### 8.3 Chain of custody without Object Lock

What makes evidence defensible is not the storage product. It is:

1. **SHA-256 computed at capture time**, before the bytes touch anything else.
2. That hash written into an **append-only `AuditLog`** together with
   `capturedAt`, `method`, and `collectorVersion`.
3. A **documented collection method** that can be described to a third party.

```
capture -> sha256(buffer) -> R2 put -> AuditLog.append({
  sha256, r2Key, capturedAt,
  method: 'scrapingdog:instagram-post-details@v1',
  collectorVersion, monitorId, sourceItemId
})
```

That is defensible on R2 today. Write-once storage is belt and braces on top of
it, not the substance of it.

**If a customer's legal team demands true WORM**, mirror only the original
captures (small, written once, almost never read, therefore almost free) into
an S3 bucket with Object Lock in compliance mode. Do not build that until
someone actually asks for it.

---

## 9. Data model

Nine collections. **Every one carries `orgId`, from the first line of code.**
Retrofitting multi-tenancy later is the classic production incident.

| Collection | Key fields | Notes |
|---|---|---|
| `Watchlist` | `orgId`, `brandNames[]`, `titles[]`, `releaseDates[]`, `officialAccounts[]`, `officialDomains[]`, `logos[]` (with pHash), `keywords[]`, `variants[]`, `territories[]` | Replaces the raw `search_query` string. Also absorbs `BLACKLISTED_CHANNELS` and `predefinedChannels`, currently hardcoded client-side in `src/constants/channels.js`. |
| `Monitor` | `orgId`, `watchlistId`, `platform`, `cadence`, `interval`, `enabled`, `lastRunAt`, `lastOkAt`, `nextRunAt` | `lastOkAt` is the freshness and source-health label the product plan requires. |
| `SourceItem` | `orgId`, `platform`, `externalId`, `url`, `author{}`, `content{}`, `capturedAt`, **`firstSeenAt`**, **`lastSeenAt`**, `contentHash`, `evidenceRefs[]` | Upsert on `(orgId, platform, externalId)`. This one collection unlocks roughly 70 percent of the product plan. |
| `Alert` | `orgId`, `sourceItemIds[]`, `watchlistId`, `type`, `score`, **`scoreBreakdown{}`**, `reasons[]`, `status`, `assignee` | `scoreBreakdown` is not optional. See section 10. |
| `LinkedItem` | `orgId`, `fromId`, `toId`, `edgeType`, **`reason`**, `confidence`, `evidenceRef` | Deterministic edges only. See section 11. |
| `Evidence` | `orgId`, `r2Key`, `sha256`, `capturedAt`, `method`, `mimetype`, `collectorVersion` | Mirrors the proven `ScrapeData` pattern: large bytes in object storage, metadata plus indexes in Mongo. |
| `Case` | `orgId`, `alertIds[]`, `owner`, `priority`, `dueAt`, `status` | |
| `RemovalRequest` | `orgId`, `caseId`, `channel`, `status`, `submittedAt`, `recheckAt`, `outcome` | Status values from section 7 of the product plan. |
| `AuditLog` | `orgId`, `actor`, `action`, `entity`, `before`, `after`, `at` | Append-only. Never updated, never deleted except by the retention policy. |

Two things to store from day one, even though nothing consumes them for months,
because they cannot be reconstructed later:

* **Analyst "not relevant" clicks.** These are the useful-alert-rate metric the
  product plan asks for, and they are also training labels.
* **`scoreBreakdown` snapshots.** So that a prompt or model change is auditable
  rather than a silent reshuffle of the review queue.

---

## 10. Detection and scoring

The product plan's rule "Never show a score or relationship without a clear
reason" dictates the design. The score is a **deterministic weighted sum of
five named components**. The LLM contributes to two of them. It never produces
the total.

```
score = 0.30 * matchStrength        deterministic: fuzzy and homoglyph name
                                    distance, logo pHash, domain distance
      + 0.30 * harmLikelihood       LLM (must return evidence_spans), plus
                                    keyword rules
      + 0.20 * impact               deterministic: audience size, release-date
                                    proximity, presence of payment details
      + 0.15 * repeatNetworkRisk    deterministic: prior Alerts for this actor,
                                    domain, payment detail or media hash
      + 0.05 * evidenceQuality      deterministic: link still live, screenshot
                                    present, hash recorded
```

Four of the five components are stable, cheap, explainable, and unaffected by a
model change. The LLM piece already exists in
`darkmap backend/darkmap-server/src/services/ai.service.ts` as `scoreBatch()`
and `rankChannels()`. It needs one change: return `{ score, evidence_spans[] }`
per item, so the UI can highlight the exact text that drove the score. Keep the
existing untrusted-input guardrail in `CHANNEL_SYSTEM_PROMPT`; it is correct
and it is load-bearing.

### 10.1 Cheapest thing that works, per signal

| Signal | Method | Why not something heavier |
|---|---|---|
| Lookalike names and domains | Pure string algorithm: dnstwist-style permutations, homoglyph table, Levenshtein distance | No AI, no cost, fully explainable, and it already covers most of "spelling mistakes, short forms, lookalike account names" |
| Copied logo or reused image | **Perceptual hash (pHash)**, about 30 lines | "Same image, Hamming distance 2" is an explanation a lawyer accepts. Reach for CLIP embeddings only if pHash demonstrably misses |
| Text inside images | The multimodal model we already pay for | One fewer dependency than adding a separate OCR service |
| Audio in reels and videos | Whisper API, **only on items that already scored high** | Transcribing everything is the cost trap that kills this class of product |
| Redirect chains and page text | Own fetcher | Not an AI problem |

**Gate order is the cost control:** cheap deterministic filters first, one
batched LLM call over the survivors, vision and audio only on high scorers. The
difference between doing this and not doing it is roughly 100x on the monthly
AI bill.

---

## 11. The link graph

Edges are computed by joins that can be named. These are exactly the four
connection types listed in the product plan.

| Edge type | Computation |
|---|---|
| Same link or domain | Registrable-domain equality across items |
| Same public contact or payment detail | Normalized phone, email, UPI or wallet address extracted by regex |
| Same media or logo | pHash within threshold |
| Direct platform link | Forward, reply, mention, tag, or outbound link |

Every edge stores its `reason` and `confidence`, and the UI renders that reason
alongside the edge.

This design satisfies the product plan's hardest constraint for free: *"It must
never claim that two accounts belong to the same real person without strong
evidence and a human review."* Every edge is a stated fact rather than an
inference. Similarity-embedding edges would violate that rule, and are
therefore excluded by design rather than by oversight.

Storage is the `LinkedItem` collection. Traversal is Mongo `$graphLookup` at 2
to 3 hops. Rendering is one force-directed graph component in React, which is
the only new frontend dependency this plan requires.

**This graph is the commercial moat.** It is proprietary data that cannot be
bought, and it compounds with every scan.

---

## 12. Evidence and the takedown workflow

### 12.1 Capture

Every capture is a single atomic vendor call returning rendered HTML plus a
screenshot, so the screenshot and the DOM are guaranteed to reflect the same
page state. That atomicity is better for chain of custody than fetching and
then separately screenshotting.

Recorded per capture: URL, final URL after redirects, HTTP status, response
headers, capture timestamp, collector version, and the SHA-256 of each
artifact.

### 12.2 Proof packet

Generated **server-side** as a PDF: manifest, hashes, capture metadata,
screenshots, the matched watchlist entry, the score breakdown, and the
analyst's written explanation. Stored in R2 under `packets/`.

Server-side rather than in the client's existing `jspdf`, because
client-generated evidence is not defensible.

### 12.3 Removal request state machine

The statuses come straight from the product plan:

```
Draft -> WaitingForApproval -> Submitted -> InReview -> RemovedCheckNeeded -> Closed
```

Version 1 has **no platform submission integrations**. Analysts prepare,
managers approve, and submission is recorded manually. The product plan agrees
with this: "For the first release, people should prepare and approve removals."

The `recheck` queue handles verification. A repeatable cron scans for
`RemovalRequest` records past their `recheckAt`, re-fetches the target, and
records live, 404, or moved.

---

## 13. Why no Chromium on the VPS

The box is a t2.medium with 4 GiB of RAM. It already runs the DarkMap server
plus, per `telegram-new/telegram-premium-server/ecosystem.config.js`, a second
pm2 application capped at 2048 MB, that application's HTTP workers, and local
Redis. That same file documents a history of RSS spiking toward 4.5 GB and
repeated OOM restart cycles.

Chromium costs 300 to 700 MB per instance. Adding a collection worker fleet
plus Playwright for every evidence screenshot will exhaust that box.

**We are already paying a vendor to render pages. Ask for the screenshot in the
same call.** Decodo and ScrapingDog both return a rendered screenshot alongside
the HTML. This removes the memory problem entirely and improves chain of
custody at the same time.

The existing Playwright code in `telegram-premium-server` stays where it is,
serving the automation it was written for. We do not extend it to evidence
capture.

If local rendering ever becomes genuinely necessary, the collection worker
moves to its own small host. It does not go on the machine already running two
pm2 applications and Redis.

---

## 14. Frontend

`client/Darkmap-2025` is currently one search page (`Genric.jsx` composing
`Sidebar`, `BoxContainer` and `RightContent`). The product needs a workspace.
**Do not refactor the search UI. Add a shell beside it.**

```
/                 Hero                          (keep as is)
/generic          existing search, relabelled "Investigate"
                  (keep; it now also writes to the store)
/app
  /watchlists     brands, titles, logos, release dates, name variants
  /queue          triage list: score, reason chips, platform, freshness
                  (the daily-driver screen)
  /finding/:id    post, account, evidence, score breakdown, connected items
  /cases/:id      grouped alerts, owner, priority, timeline
  /takedowns      state board plus recheck results
  /graph          force-directed network view
  /dashboard      useful-alert rate, time to review, time to action,
                  removal rate, repeat-risk rate, source health
```

Stack decisions, all of which add nothing new:

* **Data fetching: RTK Query**, already inside the installed
  `@reduxjs/toolkit`. Do not add TanStack Query.
* **UI: MUI v7 plus Tailwind**, both already installed.
* **Live updates: socket.io**, the same pattern as
  `telegram-premium-server/src/socket/emitter.ts`.
* **Graph rendering:** one force-graph library. The only justified new
  dependency in this plan.

Two cleanups that fall out naturally:

* `searchSlice.js` currently calls `tgdev.darkmap.org` directly from the
  browser and holds channel blacklists client-side. Both move server-side once
  watchlists exist.
* `channels[].description` has been flowing from the backend for months and is
  still not rendered anywhere. The queue screen is where it finally gets used.

---

## 15. Build order

| Phase | Deliverable | Why it sits here |
|---|---|---|
| **0. Unblock** | Regenerate the Telethon sessions. Rotate the plaintext AWS keys in `Iac/dorks-script/dork-dockers/connect.py`, and the `.env` and `.session` files baked into the dork6 image. | The core product is broken today: every channel click returns 502. And a brand-protection product with leaked credentials is unsellable. |
| ~~**0b. Decide the discovery path**~~ **DONE 2026-09-21.** Passed. Working prototype in `prototype/`. | Discovery runs on Decodo alone. No unblocker, no sessions. Remaining work from that test: fix handle-to-caption pairing, cap concurrency, design for 20-40s. |
| **1. The spine** | `SourceItem` and `AuditLog` collections. `orgId` on everything. Persist what search already collects. | Roughly 50 lines of writes. Immediately delivers freshness, dedupe, repeat detection, history, and a cache that turns a repeat search from 24 seconds into milliseconds. Everything else depends on it. |
| **2. Queues and monitors** | Port `config/redis.ts`, the queue processor, the re-arm and reconcile logic. `Watchlist` and `Monitor` CRUD. Telegram only. | Turns search into monitoring using only what is already deployed. No new vendor, no new AWS. |
| **3. Scoring and the queue UI** | Five-component scoring with `scoreBreakdown`, `Alert` generation, dedupe clustering, and the `/app/queue` screen. | The first screen an analyst opens every day. Descriptions finally get rendered. |
| **4. Evidence, cases, takedown** | R2 wiring, capture hashing, the `Case` state machine, server-side proof packets, the `recheck` cron. | Completes section 7 of the product plan. This is the part that is actually sold. |
| **5. Free in-plan platforms** | Website and URL crawler plus CT logs, then Reddit. Then `site:instagram.com` and `site:facebook.com` through the existing CSE, and the Meta Ad Library. | Three of the four platforms named in the plan's first release, at zero additional cost. Ordered by value per unit of effort. |
| **6. Paid in-plan platforms** | ScrapingDog for Instagram and Facebook, for the coverage the CSE path misses. | Completes the plan's first release. Deliberately last among the collectors. Do not start paying until a customer requires the coverage. |
| **6b. Proposed platforms (scope decision required)** | YouTube, then the dark-web sources, then TikTok, then X. | **Not in the product plan.** See section 6. Do not build any of these before phases 1 to 6 are complete, and only after product has agreed to the scope change. YouTube is the strongest case of the four because it is free and it targets the plan's own first customer segment. |
| **7. Graph and dashboard** | `LinkedItem` edges, the force graph, and the six metrics from section 12 of the product plan. | Needs phases 1 through 6 of accumulated data before it displays anything at all. |
| **8. Later** | Video fingerprinting partners, approved automated submissions, more language support. | The product plan's own "later release", and correctly so. |

---

## 16. Cost model

**Phases 1 to 5, free platforms only:**

| Line | Monthly |
|---|---|
| Decodo (Telegram, existing) | $19 |
| OpenAI, with the deterministic gate in front | $20 to $60 |
| Cloudflare R2 | $5 to $15 |
| AWS Lambda plus API Gateway (existing) | under $5 |
| Reddit, Meta Ad Library, CT logs, own web fetcher | $0 |
| **Total** | **about $50 to $100** |

**Phase 6, adding ScrapingDog for Instagram and Facebook:**

The ScrapingDog line is driven by **monthly request volume**, not by
concurrency, for the reasons set out in section 6.2.2. Volume scales with the
number of watchlists sold, so this line grows with revenue rather than sitting
as a fixed cost from day one.

| Line | Early pilot (about 5 watchlists) | At about 50 watchlists |
|---|---|---|
| Everything in phases 1 to 5 | $50 to $100 | $50 to $100 |
| Estimated ScrapingDog request volume | about 9,000/month | about 90,000/month |
| ScrapingDog tier | lowest tier whose allowance covers it | a higher tier, historically quoted around $119 |
| **Total** | **about $90 to $140** | **about $170 to $220** |

Start on the lowest tier that covers current volume and move up only when
volume requires it. Confirm the per-tier request allowances against
ScrapingDog's live pricing page before committing; the $119 figure above is
carried over from an earlier assessment and should be treated as indicative
only.

The upper figure is close to the $217 per month the old ECS fleet cost, which
is worth stating plainly. The difference is what it buys. The fleet served 106
ad-hoc searches per month against one platform. This serves continuous
monitoring across the five platforms the product plan asks for, with
persistence, evidence and a workflow, and it only reaches that figure at ten
times the customer count.

**The number to watch is the OpenAI line.** It stays in the range above only
while the deterministic gate runs first and scoring stays batched. Enriching
every item with vision and audio instead of gating on score is the single
failure mode that turns this into a four-figure monthly bill.

---

## 17. Open decisions

| # | Decision | Owner | Blocks |
|---|---|---|---|
| 1 | **Meta access path**: Brand Rights Protection application, ScrapingDog, or CSE-only. Not mutually exclusive. | Business and Legal | Phase 6 scope, and what sales is allowed to promise |
| 2 | **Cross-tenant actor intelligence**: the same pirate channel targets many studios. An anonymized shared bad-actor store improves detection for every customer and is the strongest network effect available to this product. Requires a contractual and privacy decision. | Business and Legal | Nothing immediately. Design the schema so it stays possible |
| 3 | **Evidence standard**: good enough for an internal report, or good enough for court. Determines whether the S3 Object Lock mirror gets built. | Legal | Section 8.3. Cannot be retrofitted onto already-collected evidence |
| 4 | **Retention policy defaults** per customer, and legal hold support. | Product and Legal | Phase 4 |
| 6 | **Discovery path for Instagram and Facebook.** Decided by the 6.1.4 test, not by discussion. Pass means Decodo plus our own parser. Fail means Bright Data Web Unlocker. Building a session pool is ruled out either way, see 6.1.5. | Engineering | Everything in the social pipeline |
| 5 | **Platform scope.** The product plan names five platforms. This document proposes four more (YouTube, TikTok, X, and the existing dark-web sources) and one additional access path into two in-plan platforms (the Meta Ad Library). All are marked in section 6. Product decides whether any of them are in scope, and none should be built before the in-plan five are working. | Product | Phase 6b only. Nothing earlier depends on it |

---

## 18. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Telethon sessions are dead.** Every channel click currently returns 502. | Critical | Phase 0. Nothing built on top of Telegram works until this is fixed. |
| **Plaintext AWS credentials in the repo and baked into a deployed image.** | Critical | Phase 0. Rotate, then remove them from the image layers. |
| **VPS memory exhaustion.** 4 GiB, already running two pm2 applications and Redis. | High | No Chromium on the box (section 13). Monitor RSS. Move the collector to its own host before it becomes urgent rather than after. |
| **Meta coverage cannot be promised.** No legal API exists. | High | Sell coverage and freshness labels rather than completeness, per section 12 of the product plan. Apply for Brand Rights Protection now. |
| **OpenAI cost runaway** if the deterministic gate is bypassed or scoring stops being batched. | High | Batch scoring is a hard design rule, not a nice-to-have. Alert on monthly spend. |
| ~~Instagram blocks logged-out hashtag access~~ **RETIRED 2026-09-21.** Measured working: 935 KB and 11-24 handles per scan. | resolved | Re-check with `prototype/probe.js` if results degrade. Keyword search remains 401-walled and is out of scope. |
| **Interactive latency is 20-40s**, well above the 10-15s originally designed for. | High | Progressive rendering, measured and mandatory. Cap concurrency and retry rather than widening the fan-out. |
| **Recall gaps.** No single surface returns everything; hashtag pages filter and delay policy-violating content. | High | The parallel fan-out in 6.1.2. Sell freshness and coverage labels, never completeness. |
| **Vendor ban or rate limiting** on ScrapingDog for social targets. | Medium | The collector seam in section 6.3 makes Bright Data a one-file swap. |
| **Single Redis instance is a single point of failure** for all scheduling. | Medium | Bull persists to Redis, so enable Redis AOF persistence. The boot reconcile in section 4.3 recovers anything still lost. |

---

## 19. Reference implementations to copy

All from `telegram-new/telegram-premium-server`. Copy the files, adjust the
names, and put a comment at the top of each copy naming its origin.

**Do not build a shared package for two consumers.** Duplicating roughly 400
lines is cheaper than a private registry, version skew, and coupling two
products that ship on different schedules.

| Source file | Copy as | What it gives |
|---|---|---|
| `src/config/redis.ts` | same path | Bull queue definitions against local Redis, with retry and backoff defaults |
| `src/processors/queue.processor.ts` | same path | Processor registration, pause and resume on boot, event handlers, terminal-failure re-arm, boot reconcile, graceful cleanup |
| `src/utils/scrapeInterval.util.ts` | `src/utils/monitorInterval.util.ts` | Pure, unit-tested adaptive interval math. Add the release-date branch from section 4.2 |
| `src/services/s3.service.ts` | `src/services/r2.service.ts` | Object storage wrapper. Change the endpoint, add the SHA-256 at put time |
| `src/models/scrapeData.model.ts` | `src/models/sourceItem.model.ts` | The "large bytes in object storage, metadata and indexes in Mongo" pattern, including the index layout |
| `src/index.ts` (master and worker split) | same path | pm2 fork mode plus internal cluster, with the queue processors owned by the master only |
| `ecosystem.config.js` | same path | pm2 configuration, memory caps, graceful restart handling |
| `src/socket/emitter.ts` | same path | socket.io with the Redis adapter, for live queue updates in the UI |

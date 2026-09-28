# DarkMap — Session Handover

**Written:** 2026-09-08 · **AWS account:** `407343953791` · **Region:** `us-east-1`

**Read this file top to bottom before touching anything.** It is written so a fresh session can continue with zero prior conversation.

---

## 0. PRIME DIRECTIVE — the crucial goal

> ### 🔴 REDUCE INFRASTRUCTURE COST. This is the single most important objective.
>
> The scraping stack costs **~$217/month** and served **106 searches in the last 30 days** — about **$2.05 per search**. The user has explicitly stated this is now the main goal.
>
> **The proposed fix (agreed direction, not yet started):** replace the entire browser-scraping fleet with Google's official **Custom Search JSON API**, which serves the *same* Programmable Search Engine (`cx=006368593537057042503:efxu7xprihg`) that the scraper currently screen-scrapes.
>
> **Expected outcome:** ~$217/mo → **~$0–5/mo**, latency 2.2–2.9s → ~0.5s, and deletion of ~90% of `Iac/`.
>
> **Immediate next action:** ask the user for a **Google Cloud API key**, then build a side-by-side comparison harness (old scraper vs JSON API) *before* migrating anything. Full detail in §7.

---

## 1. Project overview

**DarkMap** is a cyber-threat-intelligence product. A user searches a term (e.g. `delhi`, `AT&T`); the system finds Telegram channels likely to be leaking data about it, ranks them by relevance, then lets the user open a channel and read its messages (also AI-ranked).

The part this session worked on is **channel discovery**: turning a search term into a ranked list of Telegram channel names *with descriptions*.

### End-to-end request flow (current, working)

```
Frontend (client/Darkmap-2025, client/Telegram-premium-2025)
   │  POST /telegram/search-channels  { search_query }
   ▼
Backend on VPS  (darkmap backend/darkmap-server, Express + TypeScript)
   │  telegram.service.searchChannels()
   ▼
API Gateway  4phuyf7tlf ("Darkmap")  POST /tg
   ▼
Lambda  ECS-Service-Controller-MyLambdaFunction-4dOCutIT76KM
   │  fans out to 5 ALB URLs in parallel
   │  (API_URLS env var, ThreadPoolExecutor max_workers=5, httpx timeout 10s)
   ▼
6 × ALB :5000  →  6 × ECS Fargate service (Generic1..Generic6), 3 tasks each
   │  each runs channels.py — headless Chromium (pyppeteer) against Google CSE
   │  scrapes result cards → {name, title, description, url}
   ▼
Lambda merges + dedupes
   │  → { channel_names: [...], channels: [{name,title,description,url}] }
   ▼
Backend: aiService.rankChannels()  → OpenAI gpt-4o-mini scores 0–100, re-sorts
   ▼
Frontend paginates channel_names, takes top 10, fetches messages per channel
```

**Why 6 services exist:** Google shows CAPTCHAs to repeated requests from one IP. The fleet spreads scraping across many Fargate public IPs. **This is the cost driver, and §7 makes it unnecessary.**

---

## 2. Tech stack

| Layer | Tech |
|---|---|
| Scrapers | Python 3.10, Quart, `pyppeteer` (headless Chromium), hypercorn, Docker |
| Container runtime | ECS **Fargate**, ARM64 for dork1–5, **x86_64 for dork6** |
| Orchestration | CloudFormation (per-service JSON), Lambda (Python 3.10/3.12), EventBridge Scheduler |
| Backend | Node.js, Express, TypeScript, Mongoose/MongoDB, Redis, Winston |
| AI | OpenAI `gpt-4o-mini` via `axios` |
| Frontend | React (two apps), Redux Toolkit |

---

## 3. Important files

### Scrapers (source of the container images)

| File | Role |
|---|---|
| `Iac/dorks-script/dork-dockers/main2.py` | **Reference copy** of the dork1–5 app. Deployed filename inside the image is `channels.py`. |
| `Iac/dorks-script/dork-dockers/test_channels.py` | Self-check: URL→channel-name regexes, dedupe, CSE URL encoding, Lambda merge. Run `python test_channels.py` |
| `Iac/Channel_links_Extraction/dork4-extracted/channels.py` | **dork6** source (dynamic include/exclude keywords). Despite the folder name, this is dork6. |
| `Iac/dorks-script/build/dork{1..6}/` | Ready-to-push build contexts: `channels.py` + `requirements.txt` + `Dockerfile`. **Generated** — see §5.3. |
| `Iac/dorks-script/build/Dockerfile.dork1-5` | Dockerfile **reconstructed from image layer history** — no Dockerfile ever existed in the repo for dork1–5. |
| `Iac/dorks-script/build/push.sh` | ECR login + buildx build/push per platform. Requires Docker daemon. |

### Lambdas

| File | Deployed as |
|---|---|
| `Iac/ECS-Service-Controller/index.py` | Both `...-4dOCutIT76KM` (zip member must be `index.py`) **and** `...-dynamic` (zip member must be `lambda_function.py`) |
| `Iac/stop-ecs-services/lambda_function.py` | `stop_ecs_services` — idle shutdown (§5.4) |
| `Iac/stop-ecs-services/test_idle_shutdown.py` | 12-branch decision table. Run `python test_idle_shutdown.py` |
| `Iac/ECS-Darkmap-infrastructure/lambda_function.py` + `Generic1..5.json` | Creates ECS services + ALBs via CloudFormation |
| `Iac/Delete-ECS-Darkmap-infrastructure/lambda_function.py` | Deletes those stacks |
| `Iac/Deploy-Generic6-Infrastructure/` + `Generic6.json` | Generic6 isolated stack |
| `Iac/ECS-cluster-services{,-stop}/lambda_function.py` | Scale to 3 / scale to 0 (blunt, unconditional) |

### Backend

| File | Role |
|---|---|
| `darkmap backend/darkmap-server/src/services/ai.service.ts` | `rankMessages` (pre-existing) + **`rankChannels`** (new) + shared `scoreBatch` |
| `darkmap backend/darkmap-server/src/services/telegram.service.ts` | Upstream calls + **`logUpstream()`** diagnostic logging (new) |
| `darkmap backend/darkmap-server/src/controllers/telegram.controller.ts` | Wires `rankChannels` into both search endpoints |
| `darkmap backend/darkmap-server/src/utils/logger/` | Winston. **`error.log` receives ALL levels, not just errors** — misleading filename. |

### Frontend (read-only this session)

- `client/Darkmap-2025/src/store/slices/searchSlice.js:147` — filters `channel_names`, `.slice(0,10)`
- `client/Telegram-premium-2025/src/components/SearchBar.jsx:81`
- Neither renders `channels[].description` yet.

---

## 4. What the 6 dorks actually are

All six run **identical code**; only the query differs. Recovered from the live ECR images (see §5.3).

| Dork | Query |
|---|---|
| 1 | `"{q}" AND ("database leak" OR "data breach") AND ("hack" OR "database" OR "leak") -telegraph -news` |
| 2 | `"{q}" AND "database" "leak" -telegraph` |
| 3 | `"{q}" AND "leak" OR “leaked” OR “hack” OR “hacked” OR “attack” OR “attacked” -telegraph -news` |
| 4 | `"{q}"AND ("database leak" OR "data breach") AND ("hack" OR "database" OR "leak" OR "link" OR "download") -telegraph -news` |
| 5 | **branches:** if `re.search(r'[\d\W]', q)` → bare `"{q}"`; else `"{q}" AND ("malware" OR "c2") AND ("hack" OR "trojan" OR "leak" OR "stealer") -telegraph -news` |
| 6 | dynamic — built from `include_keywords` / `exclude_keywords` |

**These query strings are the actual intellectual property. Preserve them verbatim through any migration.**

Channel names are extracted from 3 sources: `tgstat.com/...@name`, `t.me/s/name` or `telegram.me/s/name`, and `telemetr.io/<lang>/channels/<id>-name`.

Known quirks — flagged and deliberately **not** changed (they alter search semantics; user's call):

- dork3 uses **curly quotes** (`“leaked”`). Tested empirically: Google normalises them, 46 vs 50 results. **Not a bug.**
- dork4 is missing a space: `"{q}"AND`.
- dork5's `\W` matches a **space**, so *any multi-word query* skips its malware dork entirely and searches the bare term. Probably unintended.

---

## 5. What was completed this session

### 5.1 Scraped meta descriptions end to end — ✅ DEPLOYED & VERIFIED

**Goal:** previously only channel *names* were returned. Now each channel carries the search-result description so the AI can rank on it.

**Implementation:** `scrape_page` no longer sweeps every `<a href>` blindly. It walks CSE result cards (`.gsc-webResult.gsc-result`) and pairs each link with that card's `a.gs-title` text and `.gs-snippet` text. It falls back to the old all-anchors sweep if the markup ever changes, so a DOM change degrades to *names, no descriptions* rather than returning nothing. The three per-domain extractors were collapsed into one `channel_name_from_url()`. Dedupe keeps the **longest** description seen per channel.

The response is **additive** — `channel_names` preserved, `channels` added:

```json
{ "channel_names": ["indohaxsec", "..."],
  "channels": [{"name":"indohaxsec","title":"IndoHaxSec","description":"...","url":"..."}] }
```

**Verified live:** each ALB individually (Generic1 6/6, G2 24/24, G3 32/32, G4 9/9, G5 11/11 descriptions) and through the merging Lambda (`70 channels, 70 with descriptions`).

### 5.2 Two real scraper bugs fixed — ✅ DEPLOYED

1. **Unencoded query truncation (critical).** An `&` in a search term truncated the CSE URL fragment. Searching `AT&T` actually searched `"AT` and returned 55 *confident but wrong* results. Fixed with `quote()`, extracted into a testable `cse_url()`. Proven live: `AT&T` now returns `onhex_ir`, which genuinely mentions AT&T and BreachForum.
2. **Dead Chromium wedged a task permanently.** If Chromium died, `browser_instance` stayed set and every request returned `[]` — but Quart still answered the ALB health check on `/`, so ECS never restarted the task. Now detects a dead process and relaunches.

### 5.3 Images rebuilt and pushed — ✅ DONE (read §9 before repeating)

Docker's daemon was unavailable, and ARM64 builds on this x86 Windows box need QEMU emulation. A full rebuild would also pull *newer* apt/pip packages than the Sept-2024 originals, risking breakage of working images. The user explicitly asked to keep everything identical to AWS.

**Method used: ECR layer swap via the registry HTTP API.** Only layer index **7** (containing `app/channels.py`) was replaced; every other layer was reused byte-for-byte. Scripts: `scratchpad/swap.py`, `scratchpad/ecrlib.py`.

Gotcha discovered: ECR redirects blob GETs to presigned S3, which **400s if the Basic auth header is carried along** — strip auth on redirect to non-ECR hosts.

All six verified after push: `channels.py` byte-matches local, every other layer digest unchanged, each image carries its own correct query.

**Rollback digests (pre-push, retained — no lifecycle policies on any repo):**

```
dork1 sha256:2cff777821f2a833810b831d382fd01f55f129b43a169d096e4b3c2303edb537
dork2 sha256:a753719e270b5e8fffb6bf01509f462c9f3fe8c8360a8ee4fcdfd27a40e9c027
dork3 sha256:a4998d78bbb28714966256bae40e0aae9b5e2adddb2a44a244df224ae07b6fac
dork4 sha256:700d93a51c226f380876034978db12b88399984c3d7c7021e1cb4db1cca473b1
dork5 sha256:f33140e3a5b2c2fadb9590edbf809e12a87de14e4984e03bea97bee0535d8a43
dork6 sha256:bfc07fb2f23e4f58760aea4d6bdbfc2808537169054c9f9d229ea7bea6fd2866
```

**Critical deployment lesson:** pushing to ECR is not enough. Task definitions reference the image **untagged** (→ `:latest`), and ECS resolves and **pins that digest at deployment time**. A 44-day-old deployment kept pulling the old digest even for brand-new tasks. The fix is `--force-new-deployment`, which re-resolves the tag. **No task-definition change is required or wanted.**

### 5.4 Idle auto-shutdown rebuilt — ✅ DEPLOYED & VERIFIED END-TO-END

Replaces a CloudWatch alarm that had rotted. See §6 for why an alarm **cannot** work here.

`stop_ecs_services` is now **stateless** and re-derives everything each run:

1. `describe_services` for Generic1–6 → desiredCount + PRIMARY `updatedAt`. No-op if all are already 0.
2. Sum `AWS/Lambda Invocations` for the **two controller Lambdas** over the last 30 min.
3. Stop all six only if: something running **AND** searches < 1 **AND** nothing inside the startup grace.

Two independent clocks, **both** must be clear:

- **Rolling search window** (`IDLE_MINUTES`, default 30) — resets on every search.
- **One-time startup grace** (`STARTUP_GRACE_MINUTES`, default 30) — measured from the PRIMARY deployment's `updatedAt`, which bumps on scale changes and deployment progress but **not** on searches (searches never touch ECS).

Events: `{"dry_run":true}` reports without acting; `{"force":true}` bypasses all checks.

**Trigger:** EventBridge Scheduler `TriggerStopECSServices`, `rate(10 minutes)`, FlexibleTimeWindow `OFF`. Ticks land at `:08:32, :18:32, :28:32, :38:32, :48:32, :58:32`.

**Verified 2026-09-08 (IST):** services started 12:33 → ticks at 12:38 / 12:48 / 12:58 all declined citing grace (3 / 13 / 23 min elapsed) → reaped at **13:08:32, exactly as predicted**.

IAM was already sufficient — `iam simulate-principal-policy` confirmed `ecs:DescribeServices`, `ecs:UpdateService`, `cloudwatch:GetMetricData`, `elasticloadbalancing:DescribeLoadBalancers` all allowed. **No IAM change needed.**

### 5.5 Controller Lambdas updated — ✅ DEPLOYED

Both now merge `channels` across services, dedupe by name keeping the longest description, keep the existing noise-keyword demotion, and emit **both** keys in the same order. Back-compat: a service still on an old image returning only `channel_names` is absorbed with empty descriptions — so images can roll out one at a time.

Also fixed: the noise list compared mixed-case entries (`"News"`, `"Updates"`) against a lower-cased channel name, so those entries never matched.

### 5.6 Backend AI channel ranking — ⚠️ CODE COMPLETE, VPS DEPLOY STATUS UNCONFIRMED

`aiService.rankChannels(query, payload)` scores each channel 0–100 from name + title + description, sorts, and returns the same payload shape with both keys reordered. Fails open to scraper order on any error. Shares `scoreBatch()` with `rankMessages`. Caps at `MAX_CHANNELS = 80`; anything beyond stays unranked at the end.

Wired into **both** `/telegram/search-channels` and `/telegram/search-channels-advanced` (one line each).

**Diagnostic logging added** (the user asked for this explicitly, to verify it works):

- `[upstream /tg] query="..." 3042ms channel_names=71 channels=71 withDescription=0`
- `[rankChannels] IN ...` / `SCORED n/m in Xms - N of M positions moved`, then one line per channel: `#1 score=95 (was #2) indohaxsec :: <description>`
- Named failure modes: `SKIP no "channels" array` · `WARN N channels but 0 descriptions` · `SKIP OPENAI_API_KEY is not set` · `SKIP model returned no usable scores` · `FAILED after Nms`

`npx tsc --noEmit` → **exit 0**. The user's production logs showed it running at 17:20 on 2026-09-05, so it *was* deployed at least once — but confirm before assuming the current build is live.

---

## 6. Key decisions and reasoning

| Decision | Reasoning |
|---|---|
| **Layer swap instead of `docker build`** | User: *"i want the same thats in the aws, so that there wont be any issue"*. A rebuild pulls newer apt/pip than Sept 2024 and could break a working image. The layer swap changes exactly one file. |
| **Additive response shape** | Keeping `channel_names` means the frontends need zero changes and images can roll out incrementally. |
| **No CloudWatch alarm for idle shutdown** | Two hard AWS limits, both hit and confirmed: (1) `SEARCH` expressions are **rejected** by `put-metric-alarm` — *"SEARCH is not supported on Metric Alarms"*; (2) `AWS/ApplicationELB RequestCount` is published **only** per-`LoadBalancer` dimension, so a dimension-less query returns zero datapoints. Therefore any alarm must hardcode ALB IDs, which change on every IaC recreate. |
| **Idle = controller-Lambda invocations, NOT ALB RequestCount** | The 6 ALBs are public; background internet probes keep the total above zero almost continuously. Measured: real searches stopped 17:53 UTC yet ALB hits continued at 18:13 and 18:53 with no search behind them. RequestCount would never reap anything. |
| **Startup grace period** | Without it, services started and not *immediately* searched were reaped on the next tick — this actually happened twice on 2026-09-08 (06:48:32 and 06:58:33 UTC). Starting a service is itself an intent signal. |
| **Old alarm left in place, not deleted** | It is now inert: even if it fires from its Generic6-only blind spot, the Lambda independently re-checks real usage and refuses to stop busy services. Deleting it was offered but not approved. |
| **dork3 curly quotes left alone** | Empirically tested — Google normalises them. Changing it would alter tuned semantics for no gain. |
| **`httpx` timeout left at 10s** | Originally flagged as risky three times; then measured at **2.2–2.9s** in-container (warm browser, close to Google in us-east-1). The concern was overstated. **Leave it.** |

---

## 7. 🔴 THE CRUCIAL GOAL — cost reduction plan (NOT STARTED)

### Evidence

Cost by service, last 30 days:

| Service | USD |
|---|---|
| **Elastic Load Balancing** | **115.04** |
| Elastic Container Service (Fargate) | 61.05 |
| VPC (public IPv4 addresses) | 39.94 |
| ECR | 1.01 |
| **scraping total** | **~217** |

Volume: **106 searches / 30 days** (`ECS-Service-Controller-*` invocations: 101 + 5) → **~$2.05 per search**.

> **Critical insight:** the 6 ALBs cost ~$16/mo *each just to exist*. The idle shutdown built in §5.4 saves Fargate + IPv4 charges but **does not touch the largest line item**. Cost cannot be meaningfully reduced without removing the ALBs.

### The plan

The scraper screen-scrapes `cse.google.com/cse?cx=006368593537057042503:efxu7xprihg`. That `cx` is a **Google Programmable Search Engine**, and it has an official **Custom Search JSON API** serving the same engine and index.

Per user search = 6 dorks × 2 pages = **12 API queries**. At 106 searches/mo → ~1,272 queries/mo ≈ **42/day**. Google's free tier is **100 queries/day**, so most days would be free. The busiest day observed (2026-08-18, 29 searches = 348 queries) would cost roughly **$1.24**.

| | Now | JSON API |
|---|---|---|
| Cost | ~$217/mo | ~$0–5/mo |
| Latency | 2.2–2.9s | ~0.5s (12 parallel calls) |
| CAPTCHA | the reason the fleet exists | impossible — official endpoint |
| Infra | 6 services, 6 ALBs, 6 TGs, 6 listeners, 6 ECR repos, 5+ Lambdas, scheduler, alarm | one function |

**Bonus:** the API returns `title`, `snippet`, `link` as structured JSON. The `snippet` **is** the meta description — so all of §5.1's scraping work becomes unnecessary (no `.gs-snippet` selector, no href regexes, no fallback path, no ARM64 images, no Chromium).

**Keep:** the 6 dork query strings, the AI ranking, the backend, the frontend.
**Delete:** essentially all of `Iac/`, including the idle-shutdown machinery (nothing left to shut down).

### Required first step — DO NOT SKIP

1. Ask the user for a **Google Cloud API key** (free; the Custom Search API must be enabled on the project).
2. Build a **side-by-side comparison harness**: run all 6 dorks through the JSON API *and* through the current scraper for the same terms — use `delhi`, `AT&T`, and a multi-word term to exercise dork5's `\W` branch. Diff the channel sets and the descriptions.
3. Migrate only if results hold up. **Do not delete any infrastructure before this comparison passes.**

### Caveats to verify

- JSON API results may differ slightly from the CSE web UI; `gsc.sort=date` maps to the `sort` parameter.
- Confirm current Google pricing — the figures above are from documented rates, not a live quote.
- Free tier 100/day, hard cap 10k/day.
- If volume grows 10×, Serper.dev (~$50/mo per 100k queries) is the next step — still far below $217.
- Easy extra win: page 2 is empty for the narrower dorks, so dropping it halves the query count.

---

## 8. Current state — exactly where we stopped

- All 6 ECS services: **`desiredCount=0`, `runningCount=0`** (reaped 13:08:32 IST 2026-09-08 by the new scheduler — working as designed).
- Scheduler: `ENABLED`, `rate(10 minutes)`, window `OFF`.
- Alarm `ALB-NoRequests-30min-ECS-Shutdown`: state `OK`, actions enabled, **inert by design**.
- ECR: all 6 images pushed 2026-09-05 ~14:43 IST, verified.
- Controller Lambdas: deployed, verified, smoke-tested.
- Last action: the user asked for a plain-English explanation of the cost plan, then requested this handover. **No migration work has begun.**

---

## 9. ⛔ DO NOT redo or change

1. **Do not rebuild the dork images with `docker build`.** Use the layer-swap method (§5.3) unless the user explicitly changes their mind. A rebuild pulls newer dependencies and risks breaking working images.
2. **Do not "fix" dork3's curly quotes.** Tested — Google normalises them. Not a bug.
3. **Do not change dork4's missing space or dork5's `\W` condition** without asking. They alter search semantics; the user was told and chose to leave them.
4. **Do not raise the `httpx` 10s timeout.** Measured at 2.2–2.9s. The earlier concern was wrong.
5. **Do not try to build a self-discovering CloudWatch alarm.** `SEARCH` is rejected by alarms and dimension-less ALB metrics return nothing. Both were attempted and failed.
6. **Do not use ALB `RequestCount` as an idle signal.** It tracks internet background noise, not product usage.
7. **Do not change task definitions to fix "old image" problems.** They are correct (untagged → `:latest`). The fix is `--force-new-deployment`, which re-resolves the tag.
8. **Do not delete the old alarm** without asking — it was deliberately left as a harmless secondary.
9. **Do not remove `channel_names`** from any response. Both frontends depend on it.

---

## 10. Bugs, blockers, known issues

### 🔴 Telegram sessions are dead — blocks the core product

Both `Additional-Channels-Telethon` (`/add-ch`) and `telethon_dynamo_code` (`/get_tg_msg`) log:

```
Please enter your phone (or bot token): Error: EOF when reading a line
```

Telethon cannot authorise with its stored session, falls back to **interactive login**, hits EOF in Lambda, and crashes → API Gateway returns **502**. Every channel click fails. Sessions live in DynamoDB table `Additional-Channels` (written by `Iac/dorks-script/dork-dockers/connect.py`) and as `saum.session` / `saum2.session`. **They need regenerating.** The user said they would handle this manually.

### 🟠 504s — Lambda timeouts exceed API Gateway's cap

`Additional-Channels-Telethon` timeout is **90s** and `telethon_dynamo_code` is **63s**, but API Gateway REST APIs hard-cap at **29s**. Anything slower returns 504 to the backend while the Lambda keeps running and billing. These should be ≤29s.

### 🟠 Task-definition drift — one click from a downgrade

| | live | CFN template pins |
|---|---|---|
| Generic1 | **:13** | :11 |
| Generic2 | **:12** | :1 |
| Generic3 | **:12** | :10 |
| Generic4 | **:12** | :10 |
| Generic5 | :7 | :7 ✅ |
| Generic6 | :2 | :2 ✅ |

Running `ECS-Darkmap-infrastructure` (the "Create Infrastructure" button) would **downgrade Generic1–4**. Also, `Iac/task-definitions/generic5-taskdef.json` **does not exist**.

### 🔴 Secrets exposed

- `Iac/dorks-script/dork-dockers/connect.py:7-8` — **plaintext AWS access key + secret**, plus Telegram `API_ID` / `API_HASH` / phone number.
- `app/.env`, `app/saum.session`, `app/saum2.session` are **baked into the deployed dork6 image** (layer 7) and also present in the repo. Anyone who can pull that image controls those Telegram accounts. They were **carried across unchanged during the layer swap** because the user asked for identical-to-AWS.

### 🟡 `Generic6.json` resurrects deleted autoscaling

The template still contains `ServiceScalableTarget` + `ScaleBasedOnALBRequests`. Redeploying that stack recreates the scale-to-zero policy that was deliberately deregistered on 2026-08-19.

### 🟡 Frontend never displays descriptions

Both clients read `channel_names` only. They get the *reordering* benefit, but `channels[].description` is unused. Would need `BoxContainer.jsx` changes in both apps.

### 🟡 `ECS-cluster-services` scales to 3, CFN pins `DesiredCount: 2`

Any stack update silently reverts the scale-up.

---

## 11. AWS resource inventory

**Cluster** `ECS-DarkMap` · **VPC** `vpc-055e0fb33099720e4` · **SG** `sg-0908175731368b263`

**Subnets:** `subnet-04931abb6aab28bff`, `subnet-0b3d6b2a132982d44`, `subnet-02e4ca77ef96edf9a`, `subnet-0ddb30bea800328c0`, `subnet-083fe118cefb43448`, `subnet-035756c2054db076b`

**ECR:** `scrape/dork1` … `scrape/dork6` (single `latest` tag each, mutable, **no lifecycle policies** — so untagged rollback images are retained)

**ALBs** (the only 6 in the whole account; names deterministic, **IDs change on recreate**):

```
Service-Generic1-ELB  app/Service-Generic1-ELB/8f98b568d5f633ad
Service-Generic2-ELB  app/Service-Generic2-ELB/2de2182aca3189a3
Service-Generic3-ELB  app/Service-Generic3-ELB/e6bd6c2c5edfbf4c
Service-Generic4-ELB  app/Service-Generic4-ELB/a81948408970989e
Service-Generic5-ELB  app/Service-Generic5-ELB/1d4646b290d20745
Service-Generic6-ELB  app/Service-Generic6-ELB/fe23267e102234cf
```

**API Gateways**

- `4phuyf7tlf` ("Darkmap") — `/tg` → `ECS-Service-Controller-MyLambdaFunction-4dOCutIT76KM`, `/tg-2` → `...-dynamic`, `/add-ch` → `Additional-Channels-Telethon`, `/get_tg_msg` → `telethon_dynamo_code`
- `3n9j098tbf` — `/create`, `/delete`, `/start-services`

**Lambdas of interest**

| Name | Handler | Notes |
|---|---|---|
| `ECS-Service-Controller-MyLambdaFunction-4dOCutIT76KM` | `index.lambda_handler` | 5 ALB URLs in `API_URLS`, timeout 30s |
| `ECS-Service-Controller-MyLambdaFunction-dynamic` | `lambda_function.lambda_handler` | 1 ALB URL |
| `stop_ecs_services` | `lambda_function.lambda_handler` | idle shutdown; role `stop_ecs_services-role-xworrtx2` |
| `Additional-Channels-Telethon` | — | 90s timeout, **broken** |
| `telethon_dynamo_code` | — | 63s timeout, **broken** |

⚠️ The two controller zips need **different member filenames** — they are not interchangeable.

**Scheduler:** `TriggerStopECSServices` — `ENABLED`, `rate(10 minutes)`, `FlexibleTimeWindow: OFF`, role `Amazon_EventBridge_Scheduler_LAMBDA_3af68f9408`

**Alarms:** `ALB-NoRequests-30min-ECS-Shutdown` (OK, inert, 5 of 6 dimensions stale) · `stop-services` (disabled) · `Stop ECS-DarkMap Services` (disabled)

---

## 12. Environment & configuration

- **Google CSE:** `cx=006368593537057042503:efxu7xprihg` — the key asset for §7.
- **Backend env** (`darkmap backend/darkmap-server/.env`): `OPENAI_API_KEY` is **set**. Also `MONGO_URI`, `REDIS_*`, `JWT_*`, `TG_DEV_API_KEY`.
- **Backend runs on a VPS** at `/root/darkmap-server`, under pm2 as `darkmap-server` (process id 3 in the logs the user shared).
- Logging is Winston → console + `error.log`; **`error.log` receives all levels**, not just errors.
- **Windows gotchas on this dev machine:** the `aws` CLI is the Windows exe — use `C:/...` paths for `file://` (MSYS `/c/...` fails), and set `MSYS_NO_PATHCONV=1` for `/aws/...` log-group names. Use `PYTHONIOENCODING=utf-8` when printing scraped text or the console dies on cp1252.
- **Docker daemon was not running** for the entire session. Local Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe` was used for scraper testing.
- Scratchpad holding working scripts (`swap.py`, `ecrlib.py`, rollback zips): `C:\Users\reeja\AppData\Local\Temp\claude\c--darkmap-2026\904340aa-54cd-4449-836b-a553156f4625\scratchpad` — **temporary; re-create if gone.**

---

## 13. Pending tasks, prioritized

1. **🔴 Cost reduction (§7).** Get a Google API key → build the comparison harness → migrate if results hold. **This is the stated main goal.**
2. **🔴 Regenerate the Telegram sessions.** The product is broken without it — every channel click 502s. (User plans to do this manually; confirm.)
3. **🟠 Fix task-def drift** so "Create Infrastructure" stops being a downgrade button.
4. **🔴 Rotate exposed credentials** — `connect.py` AWS keys, and the `.env`/`.session` files inside the dork6 image.
5. **🟡 Trim the two Telethon Lambda timeouts to ≤29s** so they fail honestly instead of 504.
6. **🟡 Render descriptions in the UI** (`BoxContainer.jsx` in both clients) — the data is already flowing and unused.
7. **🟡 Confirm the backend VPS is running the current build** with `rankChannels` + logging.

Note: items 3, 5 and 6 largely evaporate if §7 lands. **Do §7 first.**

---

## 14. User preferences & working style

- **Prefers minimal, non-invasive change.** Explicitly asked to keep AWS artifacts identical rather than rebuild.
- **Wants verification, not claims.** This session produced two wrong "it works" claims that the user caught. Always verify against live state and show the evidence.
- **Asks for plain-English explanations** when a technical answer is dense.
- **Approves production actions explicitly**, action by action. Several were blocked by a permission classifier and required an explicit go-ahead — expect the same.
- Wants deliberate simplifications marked with `ponytail:` comments (a global instruction in `~/.claude/CLAUDE.md`).
- Cost is now the top concern.

---

## 15. Corrections log — mistakes made this session

Recorded so they are not repeated or re-litigated:

1. Claimed Generic1–5 404 on the ALB health check. **Wrong** — read from a stale local `main2.py`; every deployed image has `@app.route("/")`.
2. Claimed CSE page 2 was broken and half the results were wasted. **Wrong** — page 2 is empty only when the query has under one page of results.
3. Claimed the shutdown alarm was permanently stuck and could never fire again. **Wrong** — it recovered and fired twice afterwards.
4. Proposed `SUM(SEARCH(...))` for the alarm. **Not supported by CloudWatch alarms.**
5. Claimed the scheduler had performed a shutdown. **Wrong** — it was the user's manual invocation; the timing did not match the 10-minute cadence.
6. Pushed three times to raise the `httpx` 10s timeout. **Overstated** — real latency is 2.2–2.9s.
7. First idle-shutdown implementation used ALB `RequestCount`, which never reaps anything on public ALBs. Caught by the user noticing services up for 2 hours.

Pattern to avoid: asserting a conclusion from a single snapshot without checking timing, cadence, or the actually-deployed artifact.

---

## 16. First commands for the next session

```bash
# 1. Live state
aws ecs describe-services --cluster ECS-DarkMap \
  --services Generic1 Generic2 Generic3 Generic4 Generic5 Generic6 \
  --region us-east-1 --query 'services[].[serviceName,desiredCount,runningCount]' --output text

aws scheduler get-schedule --name TriggerStopECSServices --region us-east-1 \
  --query '[State,ScheduleExpression,FlexibleTimeWindow.Mode]' --output text

# 2. Is the idle shutdown behaving? (read-only)
aws lambda invoke --function-name stop_ecs_services --region us-east-1 \
  --cli-binary-format raw-in-base64-out --payload '{"dry_run":true}' /tmp/out.json && cat /tmp/out.json

# 3. Cost + volume — the numbers driving the main goal
aws ce get-cost-and-usage --time-period Start=$(date -d '-30 days' +%F),End=$(date +%F) \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE --region us-east-1

# 4. Tests still green
cd "Iac/dorks-script/dork-dockers" && python test_channels.py
cd "Iac/stop-ecs-services" && python test_idle_shutdown.py
cd "darkmap backend/darkmap-server" && npx tsc --noEmit
```

**Files to read first, in order:**

1. This file.
2. `Iac/dorks-script/dork-dockers/main2.py` — the scraper being replaced.
3. `Iac/ECS-Service-Controller/index.py` — the fan-out, which is the migration point.
4. `darkmap backend/darkmap-server/src/services/ai.service.ts` — `rankChannels`, unaffected by the migration.
5. `Iac/stop-ecs-services/lambda_function.py` — only if touching shutdown (likely obsolete after §7).

**Memory files** (auto-loaded into context): `~/.claude/projects/c--darkmap-2026/memory/` — `ecs-darkmap-shutdown-arch.md` and `dork-image-deploy.md`. Both are current as of 2026-09-08.

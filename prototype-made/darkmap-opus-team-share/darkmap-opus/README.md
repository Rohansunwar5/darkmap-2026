# Darkmap

Darkmap is a brand-protection search engine. Version 1 focuses on **Instagram-like** data
ingestion, normalization, search, and **explainable AI risk analysis** powered by
Experiential Labs Claude Opus (`claude-opus-5`).

## Compliance posture (read first)

Darkmap only supports **authorized, compliant collection**:

1. `instagram_graph` - the main Instagram collector, using Meta's official Graph API and a token
   you are authorized to use.
2. `bright_data_instagram` - public Instagram profiles, posts, reels, and comments through
   Bright Data's authenticated Scraper API. Darkmap sends no Instagram cookie or password.
3. `export_file` - user-provided data exports (e.g. "Download your information" archives) or
   licensed third-party datasets that you are permitted to process.
4. `public_page` - fetching *clearly permitted* public pages only. This provider requires the
   host to be on an explicit operator allowlist AND requires `robots.txt` to permit the path.

Darkmap deliberately contains **no** rate-limit bypassing, no session/account rotation for
evasion, no stealth or fingerprint-spoofing scraping, no CAPTCHA solving, and no ban avoidance.
If a provider returns 401/403/429 or a block page, Darkmap backs off, records the reason in the
audit log, and stops. That behaviour is intentional; do not "fix" it.

Every outbound request is quota-checked, cached, retried with exponential backoff + jitter,
and written to an append-only audit log (`audit_logs`).

## Architecture

```
REST API (FastAPI)
  -> jobs table (durable queue, claim + lease + retry)
      -> worker
           -> ingestion provider (swappable)   -> raw bundle
           -> normalizer                        -> accounts/posts/media/comments/entities
           -> risk engine
                 heuristic signals  (deterministic, always available)
                 + AI provider      (Claude Opus, optional/fallback-safe)
                 -> RiskAssessment (0-100, categories, evidence, confidence,
                                    limitations, recommended_action)
  -> search API over the normalized schema
```

Swappable interfaces:

* `darkmap/providers/base.py` - `IngestionProvider`
* `darkmap/ai/base.py` - `AnalysisProvider` (`ClaudeAnalysisProvider`, `NullAnalysisProvider`)

## Main Instagram collector

`POST /v1/instagram/scrape` selects Meta Graph API v26.0 when it is configured and otherwise
uses Bright Data for supported public searches. Set `provider` to `meta` or `bright_data` to
choose explicitly; its default is `auto`.

### Meta-free public search with Bright Data

Bright Data enables public account lookup and ordinary keyword discovery while Meta business
verification is pending. Keyword search uses Bright Data's documented SERP listener pattern,
classifies validated `instagram.com` results, and sends profile, post, and reel URLs to the
matching Instagram datasets. Author profiles are enriched, and latest public comments are
retrieved when `include_comments` is enabled. The normalized output includes accounts, profiles,
posts, reels, captions, hashtags, mentions, outbound URLs/domains, timestamps, engagement, media
metadata, comments, and provenance.

Configure the provider in `.env`:

```bash
BRIGHT_DATA_API_KEY=your_bright_data_api_key
BRIGHT_DATA_SERP_ZONE=your_serp_zone_name
```

Account lookup requires the API key. Global keyword search also requires a SERP API zone. Keep
both values server-side; never paste an Instagram session cookie into Darkmap. The UI automatically
uses Bright Data for phrase searches when it is configured.

The Meta provider supports:

| Mode | Data collected | Boundary |
|---|---|---|
| `account` | Another professional account's username, profile metadata, posts, reels, captions, engagement and media metadata | Meta Business Discovery; personal, private, and age-gated accounts are unavailable |
| `owned` | The connected professional account, its posts/reels, and comments with parent IDs | Comments require the account and media to be managed by the authorized app user |
| `hashtag_recent` | Recent public media for a hashtag, grouped by publishing account | Requires Instagram Public Content Access; Meta allows at most 30 unique hashtags per rolling seven days |
| `hashtag_top` | Top public media for a hashtag, grouped by publishing account | Same permissions and hashtag quota |
| `tagged` | Public media in which the connected professional account was tagged | Limited to the connected account's authorized tags edge |

Every mode paginates to explicit `max_items` and `max_pages` ceilings. Requests pass through the
shared quota, cache, retry, `Retry-After`, and audit layer. Access tokens remain in environment
configuration and are not returned by the REST API or written into audit targets. Captions,
comments, and bios are parsed for `@mentions`, `#hashtags`, URLs, emails, and payment handles.

Configure an Instagram professional account that your Meta app is authorized to access:

```bash
export DARKMAP_IG_ACCESS_TOKEN='...'
export DARKMAP_IG_BUSINESS_ID='...'
```

Queue an account collection:

```bash
curl -X POST http://localhost:8000/v1/instagram/scrape \
  -H 'content-type: application/json' \
  -d '{"mode":"account","query":"target.brand","brand_id":1,"max_items":100}'
```

Queue public hashtag discovery:

```bash
curl -X POST http://localhost:8000/v1/instagram/scrape \
  -H 'content-type: application/json' \
  -d '{"mode":"hashtag_recent","query":"targetbrand","brand_id":1,"max_items":100}'
```

Run the collector directly without the REST API or worker:

```bash
python -m darkmap.scrape account target.brand --brand-id 1 --max-items 100 --analyze
python -m darkmap.scrape hashtag_recent targetbrand --brand-id 1 --max-items 100 --analyze
python -m darkmap.scrape owned --brand-id 1 --max-items 100 --analyze
```

The direct command requires the same `DARKMAP_IG_ACCESS_TOKEN` and
`DARKMAP_IG_BUSINESS_ID`. Claude analysis is opt-in with `--analyze`, which prevents a broad
hashtag search from unexpectedly spending analysis credits.

Meta permissions and App Review determine what succeeds. The connector does not fall back to
browser automation when Meta refuses or omits data. See Meta's current documentation for
[Business Discovery](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/business-discovery),
[Hashtag Search](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/hashtag-search),
[Mentions and tags](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-facebook-login/mentions), and
[owned-media comments](https://developers.facebook.com/documentation/instagram-platform/comment-moderation).

## Quickstart (local, SQLite)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # set EXPLABS_API_KEY if you have one
python -m darkmap.seed          # creates darkmap.db and loads sample data
uvicorn darkmap.api:app --reload --port 8000
# in a second shell:
python -m darkmap.worker
```

Open [http://localhost:8000](http://localhost:8000) for the Darkmap dashboard. Its main search
starts a fresh provider collection. With Bright Data, an ordinary phrase discovers public
Instagram links and retrieves their profiles, posts, reels, and optional comments. With Meta,
an exact `@username` uses Business Discovery and a keyword maps to an exact hashtag. The resulting
accounts, posts/reels, captions, hashtags, mentions, and domains are normalized before they
appear. The dashboard also supports focused
account, hashtag, owned-media, and tagged-media investigations, collection-job monitoring, and
explainable risk dossiers.

Meta does not offer unrestricted Instagram-wide free-text search for arbitrary account names
or captions, so its keyword mode maps to an exact hashtag. Bright Data keyword mode uses
search-engine discovery and therefore depends on indexed public Instagram results. API credentials,
quotas, audit logs, and worker controls apply to browser-initiated searches.

The public legal pages required by Meta are available at `/privacy` and `/data-deletion`.
On Vercel, `app.py` is the FastAPI entry point. Live Instagram searches use a serverless inline
path: collection, normalization, fast heuristic scoring, and the search snapshot are returned by
one request, so the browser never polls a job from another ephemeral function instance. The
dashboard displays the total elapsed time when that response arrives. `vercel.json` gives the
function a 180-second duration window. Configure `DARKMAP_DATABASE_URL` with hosted PostgreSQL
before relying on saved investigations, collection history, audit history, or queued Claude
analysis across requests; Vercel's fallback SQLite data is temporary.

Then:

```bash
curl 'http://localhost:8000/v1/search?q=luminaire&min_risk=50'
curl -X POST http://localhost:8000/v1/ingest/jobs \
  -H 'content-type: application/json' \
  -d '{"provider":"export_file","handle":"luminaire.support.hq","params":{"path":"data/seed/export_luminaire_support_hq.json"}}'
curl -X POST http://localhost:8000/v1/analysis/accounts/1
```

Set `DARKMAP_API_KEY` in `.env` to protect every `/v1/` route, then send it as
`X-API-Key: <value>` or `Authorization: Bearer <value>`. `/healthz` remains available for
liveness checks. Request bodies and export files are bounded by `DARKMAP_MAX_REQUEST_BYTES`
and `DARKMAP_MAX_EXPORT_BYTES`.

## PostgreSQL

```bash
export DARKMAP_DATABASE_URL=postgresql+psycopg://darkmap:darkmap@localhost:5432/darkmap
python -m darkmap.seed
```

The schema is dialect-portable. On PostgreSQL the queue uses `FOR UPDATE SKIP LOCKED`, and
search uses `ILIKE`; on SQLite it uses a lease-based claim and `LIKE` with lowercasing.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | liveness + provider config summary |
| POST | `/v1/brands` | register a protected brand (names, domains, keywords) |
| GET | `/v1/brands` | list brands |
| POST | `/v1/instagram/scrape` | primary authorized Instagram account/hashtag/tag collection |
| POST | `/v1/ingest/jobs` | enqueue an ingestion job |
| GET | `/v1/ingest/jobs/{id}` | job status |
| GET | `/v1/accounts` | list/filter accounts |
| GET | `/v1/accounts/{id}` | account detail + latest assessment |
| POST | `/v1/analysis/accounts/{id}` | enqueue (or run inline) a risk analysis |
| GET | `/v1/assessments/{id}` | full explainable assessment |
| GET | `/v1/alerts` | latest critical/priority alerts with family and dimension scores |
| GET | `/v1/accounts/{id}/history` | profile change snapshots |
| GET | `/v1/campaigns` | accounts clustered by shared infrastructure and artifacts |
| POST/GET/PATCH | `/v1/cases` | create, list, and update investigation cases |
| GET | `/v1/cases/{id}/evidence-package` | export hash-manifested case evidence |
| POST | `/v1/infrastructure/inspect` | safely inspect public redirects, DNS and TLS metadata |
| GET | `/v1/search` | cross-entity search (accounts, posts, captions, urls, hashtags) |
| GET | `/v1/audit` | audit log tail |

## Risk model

Categories scored 0-100 each:
`brand_impersonation`, `counterfeit`, `scam_phishing`, `suspicious_naming`, `logo_misuse`,
`risky_urls`, `giveaway_payment_scam`, `fake_support`, `credential_harvesting`,
`coordinated_abuse`, `payment_fraud`, `executive_impersonation`, `recruitment_fraud`,
`malicious_downloads`, `investment_fraud`, `victim_signals`, and `account_change_risk`.

Those categories are grouped into eight investigator-facing alert families: credential/account
takeover, payment fraud, fake support, scam promotions, counterfeit sales, employee/recruiter
impersonation, malicious downloads, and investment impersonation. Every assessment also reports
four dimension scores: **deception**, **harm**, **exposure**, and **coordination**. A heuristic
assessment is capped below critical unless it has at least two different grounded indicators.

Darkmap extracts and correlates URLs, domains, email addresses, phone numbers, UPI IDs,
cryptocurrency wallets, Telegram handles, downloadable applications, media hashes, and duplicate
captions. Reuse across accounts creates a campaign cluster. Profile snapshots detect changes to
handles, display names, biographies, outbound URLs, and profile images; post and follower changes
feed velocity scoring. Victim-report comments add an exposure signal.

The overall score is a weighted blend of a deterministic heuristic pass and the AI pass
(`DARKMAP_RISK_AI_WEIGHT`, default 0.5). If the AI provider is unavailable the assessment still
returns, flagged with `ai_available: false`, reduced confidence, and an explicit limitation.

Recommended actions: `monitor`, `investigate`, `evidence_package`, `enforce`.

## Media / logo analysis

Media metadata and available provider observations are normalized. Supported observations are
`ocr_text`, decoded `qr_payloads`, reel/audio `transcript`, `brand_match_score`,
`synthetic_media_score`, and `perceptual_hash`. They can arrive from a licensed provider, an
authorized export, or the `media_analysis` field of the analysis API. The risk engine detects
credential/payment language in OCR, QR destinations, malicious-install instructions in text or
audio, copied logos, synthetic investment media, and repeated media hashes. When the connected
provider supplies only media URLs, Darkmap records `media_analysis_unavailable` rather than
claiming pixel-level findings it did not perform.

Evidence items are stored with their source URL, collection provenance, capture time, and SHA-256
content hash. Case exports include a manifest hash. Durable screenshot/media-byte preservation
requires durable object storage; Vercel's temporary filesystem is not used as an evidence vault.

## Tests

```bash
pytest -q
```

### Resumable live search (50 results per batch)

Global keyword search uses `POST /v1/instagram/search-page`. The first request sends the
usual collection options. The response is a `JobOut` containing cumulative ranked
`inline_search.hits` and a `pagination` object. Send its opaque `continuation` value with
the same query to request up to 50 more unique accounts/posts. Result identities use
Instagram handles and post shortcodes rather than invocation-local database IDs.

Each request aims to finish in about a minute: up to 48 seconds of collection work plus
normalization and risk assessment. Fifty is a batch target, not a promise that the source
will complete 50 records within one minute. A batch may contain fewer or no new records
while snapshots process. `has_more` stays true until pending queries, dataset inputs,
snapshots, comments, and buffered results are exhausted. Time spent waiting for a page is
never a reason to discard a snapshot. All 17 original discovery queries, full threat
query parsing, configured result limits, and comment collection remain in the plan.

The UI retains previous results while **View more · next 50** runs. JSON export includes
all loaded rows, cumulative ranking, batch count and collection completeness. An error
loading another page retains the current rows and continuation for retry.

Continuation state is compressed and HMAC-signed, expires after six hours, and survives
Vercel process/database restarts. It carries public evidence and source snapshot IDs, never
API credentials. Set `DARKMAP_SEARCH_CURSOR_SECRET` to a stable secret to use a dedicated
signing key; otherwise a purpose-specific HMAC key is derived from the configured
collection key. Rotating that key invalidates old cursors. The browser must send the
cursor back unchanged. A persistent PostgreSQL deployment remains preferable for shared
investigation history; pagination does not pretend that serverless SQLite is durable.

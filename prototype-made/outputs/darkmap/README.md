# Darkmap

Darkmap is a local, explainable brand-protection triage service for authorized Instagram-like exports. It accepts profiles, posts, reels and comments, normalizes them into SQLite, queues an analysis job, and produces evidence-bound risk findings.

It does not scrape Instagram or bypass rate limits, sessions, CAPTCHA, bans or platform controls. Bring data from an authorized official API integration or a rights-holder-provided export. The included importer accepts only `user_export` provenance and requires an authorization statement.

## Start locally

```sh
python3 -m venv .venv
.venv/bin/python -m pip install '.[test]'
cp .env.example .env
# Set a long random DARKMAP_API_KEY in .env
.venv/bin/uvicorn darkmap.api:app --reload
```

In another terminal, run the worker against the same persistent SQLite file:

```sh
.venv/bin/python -m darkmap.worker
```

The worker cannot be run unchanged in a serverless Vercel function because it depends on a persistent database and a long-running process.

## Import and review

```sh
curl -X POST http://127.0.0.1:8000/imports \
  -H "X-API-Key: $DARKMAP_API_KEY" -H 'Content-Type: application/json' \
  --data @samples/authorized_export.json
curl -H "X-API-Key: $DARKMAP_API_KEY" http://127.0.0.1:8000/jobs/JOB_ID
curl -H "X-API-Key: $DARKMAP_API_KEY" 'http://127.0.0.1:8000/search?q=Acme&brand=acme'
```

Every import requires a `brand` and one or more entities. An entity has a stable `external_id`, `kind` (`profile`, `post`, `reel`, or `comment`), account metadata, text, mentions, hashtags, URLs, timezone-aware timestamp, engagement map, media metadata, and `provenance`. See `samples/authorized_export.json` for the complete schema.

`GET /health` is unauthenticated. `/imports`, `/jobs/{id}`, `/search`, and `/audit` require `X-API-Key`. Search accepts `q`, `brand`, `account`, `kind`, `limit`, and `offset`.

## Analysis providers

`ANALYSIS_PROVIDER=rules` is the default and runs entirely locally. It is useful for development and provides deterministic triage rules.

For Experiential Labs, set `ANALYSIS_PROVIDER=experiential`, `EXPERIENTIAL_LABS_API_KEY`, and optionally `CLAUDE_MODEL=claude-opus-5`. Darkmap calls the existing OpenAI-compatible Experiential Labs endpoint and locally validates the response before it can affect a result. It retries transient failures with capped exponential backoff, respects `Retry-After`, has a shared hourly quota, cache, worker lease, and audit trail.

`ANALYSIS_PROVIDER=anthropic` is an optional direct Messages API adapter. Set `ANTHROPIC_API_KEY`. It uses JSON-schema output configuration, then applies the same local validation.

Findings are triage hypotheses rather than proof. The 0–100 total equals the highest category score; confidence expresses certainty in the finding, not probability that an account is abusive. Every finding must cite a stored evidence field. The service never fetches external URLs or media, and `observed_logos` is supplied upstream metadata, not pixel-level model analysis.

## Verify

```sh
.venv/bin/python -m pytest -q
```

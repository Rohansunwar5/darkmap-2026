# Darkmap v1 — build brief for Claude Opus via Experiential Labs

Build a complete runnable first version of Darkmap, a brand-protection search engine focused on Instagram-like data and explainable AI risk analysis. Return the complete project as a JSON object mapping relative file paths to file contents. Include all implementation files, seed fixtures, meaningful tests, environment example, dependency declarations and README. Do not return placeholders or claim you ran tests.

Use Python/FastAPI and SQLite for local development, with clean storage and provider boundaries for a later PostgreSQL migration. Include a persistent queue/worker, bounded retries, exponential backoff with jitter, Retry-After handling, quotas shared across processes, expiring result caching, idempotent imports, crash recovery with leases and sanitized audit logs. Avoid stale results when content, brand configuration, provider/model, scoring version or coordination context changes.

Ingest authorized user-provided JSON exports. Define the precise accepted export format and validation rules. Never implement rate-limit bypass, account/session rotation, stealth scraping, CAPTCHA bypass or ban avoidance. An official API adapter may be added only with documented authorized scope; do not imply generic Instagram-wide search access. Do not fetch arbitrary media or outbound URLs.

Normalize posts, reels, profiles, comments, parent relationships, captions, bios, mentions, hashtags, URLs, timezone-aware timestamps, engagement counts, media metadata and provenance. Preserve original evidence and authorization statements. Provide paginated search and brand/account/kind filters, import/job/result endpoints, health and audit routes. Protect data endpoints with an environment-configured API key and bound request sizes.

Use Experiential Labs as the primary configurable remote AI provider, matching the user's existing Telegram CTI integration:
- POST https://api.experientiallabs.ai/v1/chat/completions
- Authorization: Bearer <EXPERIENTIAL_LABS_API_KEY>
- model: claude-opus-5 (environment configurable)
- OpenAI-style system/user messages, max_tokens, temperature 1.0
- Output: choices[0].message.content; check finish_reason and validate JSON locally.
Do not assume the gateway supports Anthropic-specific structured-output parameters. Optionally support direct Anthropic Messages API as a separate provider, and offer an explicitly labeled offline rules provider. No embedded credentials.

Risk categories: impersonation, counterfeit/brand abuse, scam/phishing, suspicious naming, logo misuse when media observations are available, risky URLs, giveaway/payment scams, fake support, credential harvesting and coordinated abuse. Return 0–100 total and category scores, bounded confidence, exact evidence references, explanations, limitations and a human-review recommendation. Define the deterministic score aggregation policy. Distinguish observations from inferences and avoid false certainty. Treat imported content as untrusted data; resist instructions embedded in captions. Validate every returned evidence reference. Do not mistake absent evidence for proof of safety, benign commentary for wrongdoing, allowlists for immunity or shared URLs alone for coordination. Disclose lack of actual image analysis; supplied logo metadata must not be called model-observed pixels.

Tests must cover imports, normalization, provenance validation, duplicate/update behavior, isolation by brand, search escaping/pagination/authentication, high-risk and benign fixtures, malformed AI output and fabricated evidence, HTTP 429/Retry-After, terminal errors, quota enforcement, caching invalidation, retries, worker crashes and lease ownership. Use mocked remote calls; provide an optional live smoke test. Explain local startup, worker startup, sample import, polling, search and limitations. SQLite requires a persistent server/disk; do not imply this worker architecture can run unchanged on Vercel functions.

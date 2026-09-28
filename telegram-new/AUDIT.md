# AUDIT — telegram-new

Production-readiness audit, **2026-06-24**. Findings ordered Critical → Low. Each finding has a
severity, location, the problem, why it matters, the fix, and a link to the self-contained
executor plan in [plans/](plans/). Use the **Sequential fix checklist** as the work order.

> **Secret-handling note:** credential findings reference `file:line` and credential **type**
> only — no secret values appear in this file. Any exposed credential must be **rotated**, not
> just deleted.
>
> **Not a git repo:** there is no VCS here, so plans verify drift via code excerpts, not SHAs.

## Scores (0–100, advisory)

| Dimension | Score |
|---|---:|
| Overall codebase | 34 |
| Production readiness | 20 |
| Security | 12 |
| Scalability | 42 |
| Maintainability | 38 |

## Sequential fix checklist (recommended order)

Work top-to-bottom. The first block clears the disqualifying security issues; `006` then unblocks
the riskier refactors. `[ ]` = todo.

- [~] **C1** Rotate every leaked credential + stop baking secrets into images → [plan 001](plans/001-rotate-leaked-credentials.md) — code scrubbed (+`.env.example`); **credential rotation still owed (operator)**
- [ ] **C3** Remove the public admin-signup endpoint → [plan 002](plans/002-remove-public-admin-signup.md) — deferred ("leave it for now")
- [x] **H6** Remove the `crypto` npm package → [plan 007](plans/007-remove-crypto-npm-package.md)
- [~] **M5/L1/L2** Fix unauthenticated endpoints + broken routes → [plan 011](plans/011-fix-routes.md) — **L1 + L2 done**; M5 deferred ("leave it for now")
- [x] **H4** Add Redis-backed rate limiting → [plan 005](plans/005-add-rate-limiting.md)
- [x] **C2** Separate JWT secrets + admin role claim → [plan 003](plans/003-separate-jwt-secrets-role-claim.md) — **operator must set JWT_SECRET ≠ ADMIN_JWT_SECRET**
- [x] **H1** Secure the payment flow → [plan 004](plans/004-secure-payment-flow.md)
- [ ] **H2** Eliminate frontend XSS → [plan 008](plans/008-fix-frontend-xss.md) — deferred ("leave it for now")
- [x] **H5** Establish a test/verification baseline → [plan 006](plans/006-test-verification-baseline.md)
- [x] **H3** Centralize the frontend API client/token → [plan 009](plans/009-centralize-frontend-api-client.md)
- [~] **M2/M3/M4/M6** Backend security hardening → [plan 010](plans/010-backend-security-hardening.md) — **M2 + M4 done**; M3, M6 explained, awaiting go-ahead
- [ ] **M1** Validate env config at boot → [plan 012](plans/012-validate-env-config.md) — deferred ("leave it for now")
- [ ] **L8-dx/INFRA-H7** DX + CI deploy gate → [plan 024](plans/024-dx-tooling.md)
- [x] **M7/M8** DB performance: N+1, indexes, lean → [plan 013](plans/013-db-performance.md)
- [x] **M9** Bound unbounded document arrays → [plan 014](plans/014-bound-unbounded-arrays.md)
- [x] **M10** Transactions + queue idempotency → [plan 015](plans/015-transactions-queue-idempotency.md)
- [ ] **M11** Harden decoy LLM prompts → [plan 016](plans/016-harden-decoy-llm-prompts.md) — deferred ("leave it")
- [ ] **M12** Encrypt sensitive data at rest (spike) → [plan 017](plans/017-encrypt-sensitive-data-at-rest.md) — deferred ("leave it for now")
- [~] **M14/L5** Dependency cleanup & migrations → [plan 019](plans/019-dependency-cleanup.md) — **L5 done; multer→2.x done**; xss-clean / bull→bullmq / xlsx deferred (rationale in M14)
- [~] **M13** Refactor god-object services → [plan 020](plans/020-refactor-god-objects.md) — extraction map + 1st (pure-helper) increment done; rest tracked
- [ ] **L6** De-duplicate frontend components + BaseRepository → [plan 021](plans/021-frontend-dedup.md)
- [ ] **L7** Frontend perf: lazy-load exports, fix socket deps → [plan 022](plans/022-frontend-performance.md)
- [~] **L3/L4/L8-docs** Repo hygiene: dead code, logs, docs → [plan 023](plans/023-repo-hygiene.md) — **L3 done**; L4 deferred ("leave it"); L8-docs not done

---

# CRITICAL

## C1 — Live production credentials in plaintext (and baked into the Docker image)
- **Severity:** Critical · **Category:** Security · **Plan:** [001](plans/001-rotate-leaked-credentials.md)
- **Location:** `telegram-premium-server/.env:1-33`; `telegram-premium-server/src/check-processors.ts:6-12`; `telegram-premium-server/src/clear-failed-jobs.ts`; `telegram-premium-server/.dockerignore` + `Dockerfile:7`
- **Problem:** `.env` holds live credentials (by type): MongoDB Atlas URI w/ password, Redis Cloud creds, AWS access key + secret, OpenAI key, Gmail app password, Razorpay keys, JWT secrets. A *second* live Redis password is hardcoded in `check-processors.ts`/`clear-failed-jobs.ts`. `.dockerignore` doesn't exclude `.env`/`auth/`, so `COPY . .` bakes them into every image layer.
- **Why it matters:** Anyone with the repo/image/CI log gets full DB read-write, S3, email, and uncapped OpenAI spend. Total backing-service compromise. Treat all as already burned.
- **Fix:** Rotate every credential; scrub the hardcoded ones; add `.env`/`auth/`/`*.log` to `.dockerignore`; inject secrets at runtime; add `.env.example`.
- **Status (2026-06-24):** CODE DONE — scrubbed the hardcoded Redis Cloud password from `check-processors.ts`, `clear-failed-jobs.ts`, **and `processors/force.process.ts`** (a 3rd file the plan didn't list) by importing the env-driven queues from `config/redis.ts`. Added `telegram-premium-server/.env.example` (all keys, no values). Skipped the `.dockerignore` change — deploy is VPS + pm2, no Docker image is built. **Still owed (operator console work): rotate every leaked credential.**

## C2 — Any logged-in user can authenticate as admin (privilege escalation)
- **Severity:** Critical · **Category:** Security / Authorization · **Plan:** [003](plans/003-separate-jwt-secrets-role-claim.md)
- **Location:** `src/middlewares/isAdminLoggedIn.middleware.ts:6`; `isLoggedIn.middleware.ts:6`; `auth/verify-token.middleware.ts:27`; `auth/require-auth.middleware.ts:9`; `config/index.ts:9,42`
- **Problem:** Admin routes verify with `ADMIN_JWT_SECRET`, user routes with `JWT_SECRET`, but `.env` sets both to the **same value**, the JWT payload has **no role**, and `requireAuth` only checks `req.user` exists. A user token therefore passes admin middleware.
- **Why it matters:** The entire decoy-account admin surface is reachable by any registered user.
- **Fix:** Distinct secrets **and** a `role` claim checked by a `requireRole('admin')` guard.
- **Status (2026-06-24):** DONE — added `role: 'user'`/`role: 'admin'` to the two `jwt.sign` payloads, carried `role` onto `req.user` (typed in `custom.d.ts`), and created `requireRole('admin')` (`require-role.middleware.ts`) appended to `isAdminLoggedIn`. A user-role token now gets 403 on admin routes (covered by `role.test.ts`). **Operator must set `JWT_SECRET` ≠ `ADMIN_JWT_SECRET` in the runtime env** for defense #1.

## C3 — Admin signup is a public, unauthenticated endpoint
- **Severity:** Critical · **Category:** Security / Broken Access Control · **Plan:** [002](plans/002-remove-public-admin-signup.md)
- **Location:** `src/routes/decoyAdmin.route.ts:15`; `src/controllers/adminAuth.controller.ts:10-14`
- **Problem:** `POST /decoy-accounts/auth/signup` has no auth ("open for testing; restrict before production") and calls `createAdmin`.
- **Why it matters:** Anyone can mint a full admin and manage the decoy account pool (real session strings). Full admin compromise, independent of C2.
- **Fix:** Delete the route; provision admins via a seed script.

---

# HIGH

## H1 — Payment flow allows credit over-claim and replay
- **Severity:** High · **Category:** Security / Business Logic · **Plan:** [004](plans/004-secure-payment-flow.md)
- **Location:** `src/services/payment.service.ts:13-25`; `src/controllers/payment.controller.ts:13-16,28-38`
- **Problem:** HMAC covers only `orderId|paymentId`. `planType` (credits) and order `amount` are client-supplied and unbound to the verified order. No idempotency record → the same valid payload can be replayed. Non-constant-time signature compare.
- **Why it matters:** Pay ₹1, claim the top plan, replay → unlimited credits. Direct revenue loss.
- **Fix:** Derive credits from the fetched order amount; server-side prices; idempotency ledger on `paymentId`; `timingSafeEqual`.
- **Status (2026-06-24):** DONE — added `config/plans.ts` (server-authoritative prices+credits), `createOrder` now derives the amount from `planType`+`currency` (rejects unknown), `verifyAndAddCredits` fetches the Razorpay order and derives credits from the **verified** amount+currency, a new `processedPayment` model (unique `paymentId`) makes replays no-ops, signature compared with `crypto.timingSafeEqual`, and it fails closed if `RAZORPAY_KEY_SECRET` is unset. Frontend `Payments.jsx` sends only `planType`. 4 `payment.test.ts` cases.

## H2 — Stored/reflected XSS in scraped-content rendering
- **Severity:** High · **Category:** Security / Frontend · **Plan:** [008](plans/008-fix-frontend-xss.md)
- **Location:** `Telegram-premium-2025/src/components/MessageBox/BreachForumsBox.jsx:51-56,136-141` + identical in `DarwebForumsBox.jsx`, `RansomewareBox.jsx`, `TelegramBox.jsx`
- **Problem:** `highlightQueryInText` builds raw HTML from attacker-controlled scraped content and injects it via `dangerouslySetInnerHTML`, no escaping; query is interpolated into `new RegExp` (regex injection + ReDoS).
- **Why it matters:** Malicious markup in scraped data executes in the analyst's browser; with the token in `localStorage` (H3) → session theft. Four copies.
- **Fix:** Drop `dangerouslySetInnerHTML`; highlight via React elements (auto-escaped); escape the query.
- **Status (2026-06-24):** DEFERRED by owner ("leave it for now").

## H3 — JWT stored in `localStorage`, attached manually in ~36 places
- **Severity:** High · **Category:** Security / Frontend · **Plan:** [009](plans/009-centralize-frontend-api-client.md)
- **Location:** `src/context/AuthContext.jsx:23,41`; `src/context/DecoyContext.jsx:7`; ~36 sites (e.g. `Hero.jsx:35`, `AI/AiContainer.jsx:65`)
- **Problem:** Token in `localStorage` (script-readable), hand-attached as Bearer header everywhere; no axios instance/interceptor.
- **Why it matters:** Any XSS exfiltrates the token; 36-site duplication makes auth changes error-prone.
- **Fix:** One `axios.create()` + request/401 interceptors; strategic move to HttpOnly cookie.
- **Status (2026-06-24):** DONE — added `src/lib/apiClient.js` (request interceptor attaches the token from one place; 401 interceptor clears it). Migrated ~16 internal call sites (incl. 3 `fetch()`→apiClient, preserving error handling). **Deliberately left on raw `axios`:** external hosts (darkmap.org/AWS — attaching the JWT there would leak it), the admin `sessionStorage admin_token` scheme (`AdminAccountsPage`), Navbar's `enola.darkmap.org` call, and dead `useAuth.jsx`. Tested via `apiClient.test.js`.

## H4 — No rate limiting anywhere on the API
- **Severity:** High · **Category:** Security / API · **Plan:** [005](plans/005-add-rate-limiting.md)
- **Location:** `src/app.ts` (no limiter; the `:17` comment references one that was never added); no `express-rate-limit` dep
- **Problem:** No throttling on login, admin login/signup, payment verify, phone-check, or OpenAI-backed routes.
- **Why it matters:** Credential stuffing/brute force, free brute force of admin signup, uncapped OpenAI spend, scrape abuse.
- **Fix:** `express-rate-limit` + `rate-limit-redis` (shared across cluster workers); strict on auth/payment, moderate on AI routes.
- **Status (2026-06-24):** DONE — `rate-limit.middleware.ts` backs three limiters on the shared (connected) redis cache client with distinct prefixes: `globalLimiter` (300/15m, applied app-wide), `authLimiter` (10/15m, failures only) on user+admin login/signup, `aiLimiter` (30/5m) on the OpenAI-backed telegram/decoy routes.

## H5 — No automated tests / verification baseline (prerequisite)
- **Severity:** High · **Category:** Testing · **Plan:** [006](plans/006-test-verification-baseline.md)
- **Location:** both `package.json` — no test runner/script; zero `*.test.*`/`*.spec.*` in either `src/`
- **Problem:** No one-command "does it work?". Every fix lands blind.
- **Why it matters:** Refactors and security fixes have no safety net. This is the unblocker for 015/020.
- **Fix:** Vitest (frontend) + Jest/Vitest + supertest (backend); characterization tests on auth/payment/crypto first.
- **Status (2026-06-24):** DONE — Vitest in both projects with `test` scripts. Backend: 14 tests (crypto round-trip/tamper, plan amount-binding, role guard, payment flow incl. replay/over-claim, auth token shape). Frontend: 3 tests (apiClient interceptors). Also pinned `@types/node@^22` — a transitive bump to 26 had started failing `tsc`.

## H6 — `crypto` npm package shadows Node's built-in `crypto`
- **Severity:** High · **Category:** Security / Dependencies · **Plan:** [007](plans/007-remove-crypto-npm-package.md)
- **Location:** `telegram-premium-server/package.json:27` (`"crypto": "^1.0.1"`)
- **Problem:** The npm `crypto` package is a deprecated stub that can shadow the core module, which is used on JWT-cache encryption and **payment signature verification**.
- **Why it matters:** Security-critical crypto resolving to a stub is a silent footgun.
- **Fix:** `npm uninstall crypto`; the built-in needs no package.
- **Status (2026-06-24):** DONE — `npm uninstall crypto`; verified the built-in `crypto` resolves (`createHmac`/`timingSafeEqual` present) and `tsc`+`build` stay green.

## H7 — Push-to-prod deploy with no test/build gate, single host
- **Severity:** High · **Category:** Infrastructure · **Plan:** [024](plans/024-dx-tooling.md) (CI gate); larger infra noted as follow-up
- **Location:** `telegram-premium-server/.github/workflows/deploy.yml`
- **Problem:** Every push to `main` SSHes to one EC2 box, `git reset --hard`, `npm install` (not `ci`), build, `pm2 reload`. No tests/typecheck, no staging, single SPOF.
- **Why it matters:** A broken commit goes straight to prod; the lone host is an availability SPOF; `npm install` drifts deps.
- **Fix:** CI gate (typecheck+tests+build) before deploy; `npm ci`; medium-term containerized deploy + standby. (The single-process decoy-bot constraint is by-design — don't "fix" it by clustering PM2.)

---

# MEDIUM

## M1 — No env-var validation; non-null assertions everywhere
- **Severity:** Medium · **Category:** Architecture · **Plan:** [012](plans/012-validate-env-config.md)
- **Location:** `src/config/index.ts:6-42`
- **Problem:** Every var read as `process.env.X! as string`; a missing var is `undefined` and crashes deep in a handler, not at boot.
- **Fix:** Validate `process.env` with zod at boot; fail fast with the missing key name.
- **Status (2026-06-24):** DEFERRED by owner ("leave it for now").

## M2 — Error handler returns raw `error.message` to clients
- **Severity:** Medium · **Category:** Security · **Plan:** [010](plans/010-backend-security-hardening.md)
- **Location:** `src/middlewares/error-handler.middleware.ts:39`
- **Problem:** Non-`CustomError` errors echo the raw message (and route) to the client.
- **Fix:** Return a generic message + correlation `rayId`; log full detail server-side only.
- **Status (2026-06-24):** DONE — the non-`CustomError` branch now returns `message: 'Internal server error'` + `error: rayId: <id>` and logs the real `error.message` server-side only. Guarded by `error-handler.test.ts`.

## M3 — SMTP TLS verification disabled
- **Severity:** Medium · **Category:** Security · **Plan:** [010](plans/010-backend-security-hardening.md)
- **Location:** `src/utils/nodemailer.util.ts:12-14` (`rejectUnauthorized: false`)
- **Problem:** Disables certificate validation on the SMTP connection.
- **Fix:** Remove the `tls` override (Gmail/587 validates by default).
- **Status (2026-06-24):** EXPLAINED — awaiting owner go-ahead (one-line removal of `rejectUnauthorized: false`).

## M4 — Permissive CORS + CSP disabled
- **Severity:** Medium · **Category:** Security · **Plan:** [010](plans/010-backend-security-hardening.md)
- **Location:** `src/app.ts:22-43`
- **Problem:** Any `localhost:*` origin allowed with `credentials:true`; `helmet` CSP/frameguard disabled.
- **Fix:** Gate localhost behind non-prod; enable a real CSP; re-enable frameguard.
- **Status (2026-06-24):** DONE — `isLocalhost` CORS allowance now requires `NODE_ENV !== 'production'` (prod only accepts `ALLOWED_ORIGIN`); replaced `contentSecurityPolicy: false` with a real directive set and re-enabled `frameguard`.

## M5 — Two unauthenticated endpoints
- **Severity:** Medium · **Category:** Security / API · **Plan:** [011](plans/011-fix-routes.md)
- **Location:** `src/routes/bkpsch.route.ts:7`; `src/routes/telegram.route.ts:19`
- **Problem:** `/bkpsch/search` and `/telegram/analyze-channel-darkmap` lack the `isLoggedIn` their siblings have; the latter shares a controller that deducts credits from `req.user`.
- **Fix:** Add `isLoggedIn` (verify the darkmap route isn't intentionally public first).
- **Status (2026-06-24):** DEFERRED by owner ("leave it for now"). Note: the darkmap route did get the `aiLimiter` from H4, so it's no longer completely unthrottled.

## M6 — Full request body logged with incomplete redaction
- **Severity:** Medium · **Category:** Security · **Plan:** [010](plans/010-backend-security-hardening.md)
- **Location:** `src/utils/logger/index.ts:43-68`; called from `src/app.ts:47-56`
- **Problem:** Logs the whole body every request, deleting only a few fields; phone numbers, session strings, OTPs, signatures are not redacted.
- **Fix:** Expand the denylist / skip bodies on `/auth`, `/payment`, `/decoy`.
- **Status (2026-06-24):** EXPLAINED — awaiting owner go-ahead.

## M7 — N+1 in the dashboard bookmark list
- **Severity:** Medium · **Category:** Performance · **Plan:** [013](plans/013-db-performance.md)
- **Location:** `src/services/bookmark.service.ts:156-176`
- **Problem:** One `getLatestScrapeData` query per bookmark on the hottest endpoint.
- **Fix:** Single batched aggregation keyed by bookmarkId; join in memory.
- **Status (2026-06-24):** DONE — `getLatestScrapeDataForBookmarks(ids)` runs one `$match`→`$sort`→`$group($first)` aggregation; `getUserBookmarks` joins in memory via a Map. Response shape unchanged.

## M8 — Missing compound indexes implied by query patterns
- **Severity:** Medium · **Category:** Database · **Plan:** [013](plans/013-db-performance.md)
- **Location:** `src/repository/bookmark.repository.ts:94,239-250`; `src/models/bookmark.model.ts:104-106`; `src/models/user.model.ts:45` (email non-unique)
- **Problem:** `{userId,isActive}+sort(createdAt)` and `{bookmarkId}+sort(firstMessageTimestamp)` have no covering index; user email index isn't unique.
- **Fix:** Add `{userId,isActive,createdAt}`, `{bookmarkId,firstMessageTimestamp}`; make email unique.
- **Status (2026-06-24):** DONE — added both compound indexes; made the user email index `unique`. **Op caveat:** if legacy duplicate emails exist in prod, the unique index build fails until they're de-duplicated.

## M9 — Unbounded embedded document arrays
- **Severity:** Medium · **Category:** Database · **Plan:** [014](plans/014-bound-unbounded-arrays.md)
- **Location:** `src/models/decoySession.model.ts:93-96` (`messages`); `src/models/user.model.ts:32-40` (`clickCount`)
- **Problem:** `messages` grows without cap toward the 16 MB doc limit → write failures + memory bloat.
- **Fix:** `$slice` cap on append; cap `clickCount` to last 24.
- **Status (2026-06-24):** DONE — `appendMessages` caps `messages` to the most recent 1000 via `$slice` (the AI context reads only the tail via `findForPolling`'s `$slice: -50`, so trimming older messages is safe); `clickCount` trimmed to the last 24 monthly entries.

## M10 — No transaction on multi-write scrape; non-idempotent retries
- **Severity:** Medium · **Category:** Database · **Plan:** [015](plans/015-transactions-queue-idempotency.md)
- **Location:** `src/services/bookmark.service.ts:327-349`; `src/config/redis.ts:11-22`
- **Problem:** create scrapeData + update stats + set nextScrapeAt are separate writes; Bull retries re-upload S3 and re-increment stats.
- **Fix:** Idempotency key + Mongoose transaction.
- **Status (2026-06-24):** DONE — create-scrapeData + aggregate-stats + schedule-advance now commit in one Mongoose transaction (`persistScrapeResult`, session threaded through the repo writes), with a graceful fallback to sequential writes on a non-replica-set Mongo. Retry idempotency comes from the existing since-filter (a re-run finds no new messages and no-ops); the queue processor already rethrows so Bull retries converge.

## M11 — LLM prompt injection via operator steering & target context
- **Severity:** Medium · **Category:** Security / AI · **Plan:** [016](plans/016-harden-decoy-llm-prompts.md)
- **Location:** `src/services/decoyAI.service.ts:161-165,202-219`; `src/controllers/decoyBot.controller.ts:91`
- **Problem:** Operator/target fields are concatenated into the system prompt between text delimiters, no caps/sanitization; delimiters aren't a security boundary.
- **Fix:** Length-cap + neutralize section markers; keep target content in user-role turns; validate at the boundary.
- **Status (2026-06-24):** DEFERRED by owner ("leave it").

## M12 — Sensitive target-chat PII stored unencrypted
- **Severity:** Medium · **Category:** Security · **Plan:** [017](plans/017-encrypt-sensitive-data-at-rest.md) (design/spike)
- **Location:** `src/services/decoyBot.service.ts:537`; `src/models/decoySession.model.ts`; also `custom_account_status.json` (real phone numbers)
- **Problem:** Undercover chat transcripts + PII stored plaintext; exposed on any DB breach.
- **Fix:** Spike the options (Atlas at-rest / CSFLE / app-level field encryption) + retention policy, then implement.
- **Status (2026-06-24):** DEFERRED by owner ("leave it for now").

## M13 — God-object services / page components
- **Severity:** Medium · **Category:** Maintainability · **Plan:** [020](plans/020-refactor-god-objects.md)
- **Location:** `bookmark.service.ts` (1113), `decoyBot.service.ts` (1094), `telegram.service.ts` (1015); `GenericDecoyPage.jsx` (1069)
- **Problem:** Each crams many responsibilities; hard to test/change.
- **Fix:** Incremental, test-backed extraction (one per review cycle).
- **Status (2026-06-24):** PARTIAL — recorded the full extraction map (plan 020 Step 0) and executed the first, lowest-risk increment: pulled the pure scheduling math (`calculateScrapeInterval`, `formatInterval`) out of `bookmark.service.ts` into `utils/scrapeInterval.util.ts` (behavior-preserving, guarded by `scrapeInterval.test.ts`). The remaining DB/Telegram/socket-coupled extractions need characterization tests first and must be done one-at-a-time per the plan — NOT done yet.

## M14 — Deprecated / CVE-bearing dependencies
- **Severity:** Medium · **Category:** Dependencies · **Plan:** [019](plans/019-dependency-cleanup.md)
- **Location:** `xss-clean` (`app.ts:5`), `xlsx@0.18.5` (CVE-2023-30533/2024-22363, `Common/utils.jsx`), `multer@1.x`, `bull` (→ `bullmq`)
- **Problem:** Abandoned/legacy packages and known CVEs on reachable paths.
- **Fix:** Drop `xss-clean`; pin/replace `xlsx`; multer→2.x; bull→bullmq (behind tests).
- **Status (2026-06-24):** PARTIAL — **multer upgraded 1.x → 2.2.0** (`.none()` usage unchanged, builds green); **unused deps removed** (see L5). **Deferred with rationale:** (1) `xss-clean` — it's an abandoned *server-side* input-sanitizer; removing it while the related client-side XSS fix (H2) is deferred would drop a defense layer, so hold until H2 lands. (2) `bull → bullmq` — a major Queue/Worker API migration touching `config/redis`, processors, cluster boot, and the relocated scripts; plan 019 says don't half-migrate, so deferred. (3) `xlsx` — usage in `Common/utils.jsx` is **export-only** (`XLSX.write`, no `XLSX.read`), so the prototype-pollution/ReDoS CVEs (both in the *parse* path) are **not reachable**; recommend repinning to the official SheetJS dist as a low-priority follow-up.

---

# LOW

## L1 — Malformed route `/"bookmarkId/resume` (literal quote) — resume is dead
- **Severity:** Low · **Category:** Correctness · **Plan:** [011](plans/011-fix-routes.md)
- **Location:** `src/routes/bookmark.route.ts:18`
- **Fix:** `:bookmarkId` instead of `"bookmarkId`.
- **Status (2026-06-24):** DONE — route is now `/:bookmarkId/resume`; `resumeBookmark` is reachable.

## L2 — `GET /user-dashboard-stats` shadowed by `GET /:bookmarkId`
- **Severity:** Low · **Category:** Correctness · **Plan:** [011](plans/011-fix-routes.md)
- **Location:** `src/routes/bookmark.route.ts:12,22`
- **Fix:** Register static routes before the parameterized one.
- **Status (2026-06-24):** DONE — `GET /bookmarks` and `GET /user-dashboard-stats` are now registered before `GET /:bookmarkId`, so they reach the right controller.

## L3 — Committed logs, dead one-off scripts, `__pycache__`
- **Severity:** Low · **Category:** Tech-debt · **Plan:** [023](plans/023-repo-hygiene.md)
- **Location:** `telegram-premium-server/error.log`, `server_output.log`, `src/processors/error.log`; `src/check-processors.ts`, `src/clear-failed-jobs.ts`; `__pycache__/`
- **Fix:** Delete logs/bytecode; relocate or remove the scripts.
- **Status (2026-06-24):** DONE — deleted `error.log`, `server_output.log`, `src/processors/error.log` and the root `__pycache__/`; relocated the three dead one-off scripts (`check-processors.ts`, `clear-failed-jobs.ts`, `force.process.ts`) out of `src/` into `scripts/` (fixed their imports), so they're no longer in the build; added a root `.gitignore` (`__pycache__/`, `*.pyc`, `*.log`, `node_modules/`, `.env*`).

## L4 — Orphaned Python scripts + sensitive JSON
- **Severity:** Low · **Category:** Dead code · **Plan:** [023](plans/023-repo-hygiene.md)
- **Location:** `telegram-backup/*.py`, `check_custom_accounts.py`, `custom_account_status.json` (real phone numbers)
- **Fix:** Verify unreferenced; relocate/remove; remove the PII JSON from the tree.
- **Status (2026-06-24):** DEFERRED by owner ("leave it"). Note: `custom_account_status.json` still contains real phone numbers in the tree.

## L5 — Unused dependencies
- **Severity:** Low · **Category:** Dependencies · **Plan:** [019](plans/019-dependency-cleanup.md)
- **Location:** backend `moment`, `input`; frontend `hackcheck`, `react-element-to-jsx-string`
- **Fix:** Re-confirm unimported, then remove.
- **Status (2026-06-24):** DONE — re-confirmed unimported via grep, then removed `moment` + `input` (backend) and `hackcheck` + `react-element-to-jsx-string` (frontend). Both builds green. (`hackcheck` only appeared as a `hackcheckData` prop name, not an import.)

## L6 — Duplicated frontend components; no BaseRepository
- **Severity:** Low · **Category:** Tech-debt · **Plan:** [021](plans/021-frontend-dedup.md)
- **Location:** `components/MessageBox/*` (4 near-clones), `components/IOC/*` (4 near-clones); `repository/*`
- **Fix:** Shared highlight util + `IocDetailPanel`; optional `BaseRepository<T>`.

## L7 — Eager heavy deps in bundle; socket effect churn
- **Severity:** Low · **Category:** Performance · **Plan:** [022](plans/022-frontend-performance.md)
- **Location:** `Common/utils.jsx` (xlsx), Results export (jspdf); `src/hooks/useDecoySocket.jsx:70`
- **Fix:** Lazy-load `xlsx`/`jspdf`; replace `JSON.stringify(sessionIds)` dep with a value-stable key.

## L8 — DX/tooling & docs gaps
- **Severity:** Low · **Category:** DX / Docs · **Plan:** [024](plans/024-dx-tooling.md), [023](plans/023-repo-hygiene.md)
- **Location:** no `typecheck` script; empty `.husky/` hooks; thin READMEs; no `.env.example`; no `CLAUDE.md`; 9 root design `.md` files (one notification doc duplicated)
- **Fix:** Add typecheck script + pre-commit hook + real READMEs + `.env.example` + root `CLAUDE.md`; consolidate docs under `docs/`.

---

# Considered and rejected (do not re-audit)

- **decoy client `refCount` "init to 0"** (`decoyBot.service.ts:905-948`): on direct read the lifecycle is correct (inflight sets `refCount:0`, each acquirer does `+=1` after `await`, so 1 for a single acquirer and N for N concurrent acquirers). Brittle to read, not a bug.
- **"design docs as prompt-injection"**: normal planning docs with imperative language are not an injection vector.
- **`ip` package SSRF CVE**: used only in `system.util.ts` for `getLocalIP()` log output, never a security decision. (Removable dep — covered in plan 019.)
- **`xss()` vs `cors()` middleware ordering** in `app.ts`: no real impact; the real action (drop `xss-clean`) is in plan 019.

---

## What was not audited
The app was not run; `npm audit` was not run (no install); not every one of the ~16K frontend
lines, the `.ejs` templates, the `telegram-backup` Python internals, or `graphify-out/`
(generated) were line-by-line reviewed. Findings are from first-hand reads of the highest-risk
files plus verified subagent sweeps.

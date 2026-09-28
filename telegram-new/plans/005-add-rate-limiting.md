# Plan 005: Add Redis-backed API rate limiting

> **Executor instructions**: Follow step by step; run each verification. Honor STOP conditions.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**: open the files in "Current state" and confirm they match the
> excerpts. Not a git repo — no SHA diff. On mismatch, STOP.

## Status
- **Priority**: P1
- **Effort**: M
- **Risk**: MED — too-tight limits break legitimate traffic; the limiter must share state across
  the cluster workers (the app forks one HTTP worker per CPU in production).
- **Depends on**: none (but pairs with 002/003 — auth endpoints are the priority targets)
- **Category**: security
- **Planned at**: working tree, 2026-06-24 (no VCS)

## Why this matters

There is **no rate limiting anywhere**. The `app.ts:17` comment claims `trust proxy` is set
"for rate-limiter" but none was ever added, and `express-rate-limit` is not a dependency.
Consequences: credential stuffing / brute force on login and admin login, free brute force of
the (currently public) admin signup, uncapped OpenAI spend via the analyze/decoy endpoints, and
scraping abuse. The app runs multiple HTTP workers (`src/index.ts` clusters per CPU in prod), so
an in-memory limiter would be per-worker and leaky — the store must be Redis.

## Current state

- `telegram-premium-server/src/app.ts:16-44` — middleware chain: `express.json`, `cors`, `xss`,
  `helmet`, `mongoSanitize`, request logger, then `rootRouter`. No limiter. `app.set('trust proxy', true)` at line 17.
- `telegram-premium-server/src/config/redis.ts:1-9` — a `redisConfig` `{ host: REDIS_LOCAL_HOST, port: REDIS_LOCAL_PORT, ... }` used for Bull queues. `ioredis` is already a dependency (`package.json`).
- `telegram-premium-server/src/services/cache/index.ts` — exports a connected redis client (open it to confirm the export shape before reusing).
- Auth routes: `src/routes/auth.route.ts`, `src/routes/decoyAdmin.route.ts` (admin login).
- `express-rate-limit` and `rate-limit-redis` are **not** installed yet.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Install | `cd telegram-premium-server && npm install express-rate-limit rate-limit-redis` | exit 0 |
| Typecheck | `cd telegram-premium-server && npx tsc --noEmit` | exit 0 |

## Scope
**In scope:**
- `package.json` (add `express-rate-limit`, `rate-limit-redis`)
- `src/middlewares/rate-limit.middleware.ts` (create — limiter factory + named limiters)
- `src/app.ts` (apply a global default limiter)
- `src/routes/auth.route.ts`, `src/routes/decoyAdmin.route.ts` (apply a strict limiter to auth)
- the AI/expensive routes: `src/routes/telegram.route.ts`, `src/routes/decoyBot.route.ts` (apply a moderate limiter)

**Out of scope:**
- Per-user quota/billing logic (separate concern).
- The decoy-bot MTProto polling (server-internal, not HTTP).

## Steps

### Step 1: install dependencies
`npm install express-rate-limit rate-limit-redis`.
**Verify**: both appear in `package.json` dependencies; `npm install` exits 0.

### Step 2: build a limiter factory backed by Redis
Create `src/middlewares/rate-limit.middleware.ts`. Reuse the existing connected redis client
(from `src/services/cache`) for the `RedisStore` `sendCommand`. Export:
- `globalLimiter` — generous (e.g. 300 req / 15 min / IP).
- `authLimiter` — strict (e.g. 10 req / 15 min / IP), `skipSuccessfulRequests: true` so only
  failed logins count.
- `aiLimiter` — moderate (e.g. 30 req / 5 min / IP) for OpenAI-backed endpoints.
Use `keyGenerator` honoring `trust proxy` (the default uses `req.ip`, which is correct since
`trust proxy` is set). Set `standardHeaders: true, legacyHeaders: false`.
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: apply the global limiter
In `app.ts`, add `app.use(globalLimiter)` immediately after the body/security middleware and
before `rootRouter`. Replace the misleading `// very important for rate-limiter...` comment with
an accurate one referencing the limiter.
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: apply strict limiters to sensitive routes
- `auth.route.ts`: put `authLimiter` on the login route (and any signup/reset routes).
- `decoyAdmin.route.ts`: put `authLimiter` on `/auth/login`.
- `telegram.route.ts` / `decoyBot.route.ts`: put `aiLimiter` on the OpenAI-backed routes
  (analyze-channel, decoy generate).
**Verify**: `npx tsc --noEmit` → exit 0; `grep -rn "authLimiter\|aiLimiter" src/routes` shows the wiring.

## Test plan
- If Plan 006 has landed: an integration test that hammers the login route past the threshold
  and asserts a `429` is returned. Use the test redis or a memory store override for the test env.
- Manual smoke (any env): with the server running, send >10 rapid bad logins; the 11th returns 429.

## Done criteria
- [ ] `express-rate-limit` + `rate-limit-redis` installed; limiter middleware exists.
- [ ] Global limiter applied in `app.ts`; auth routes use a strict limiter; AI routes a moderate one.
- [ ] Exceeding the auth threshold returns HTTP 429 (verified by test or manual smoke).
- [ ] Limiter state is in Redis (shared across cluster workers), not in-memory.
- [ ] `npx tsc --noEmit` exits 0; `plans/README.md` updated.

## STOP conditions
- The redis client export from `src/services/cache` isn't reusable as a `rate-limit-redis`
  `sendCommand` source → create a dedicated `ioredis` client from `redisConfig` instead, and note it.
- "Current state" files don't match excerpts → STOP.
- Applying `aiLimiter` would throttle a server-to-server internal caller that shares the route → STOP and report.

## Maintenance notes
- Thresholds are first guesses; tune from real traffic. Keep them in one file.
- New auth or AI route → attach the matching named limiter; reviewer should check this.
- If a CDN/proxy sits in front, confirm `trust proxy` depth matches so `req.ip` is the real client.

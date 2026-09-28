# Plan 006: Establish a test / verification baseline

> **Executor instructions**: Follow step by step; run each verification. Honor STOP conditions.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**: confirm the `package.json` files still have no test runner (the
> premise of this plan). If tests already exist, STOP — this plan is stale.

## Status
- **Priority**: P1
- **Effort**: M
- **Risk**: LOW — purely additive (new dev deps + new test files). Writing the first tests may
  surface existing bugs; report those, don't fix them in this plan.
- **Depends on**: none — this is an **unblocker** for 015 and 020 and a safety net for 003/004/013/014/018.
- **Category**: tests
- **Planned at**: working tree, 2026-06-24 (no VCS)

## Why this matters

There is **no automated test of any kind** in either project, and no test script. Every fix in
this plan set would land blind. A one-command "does it still work?" is the prerequisite for the
risky refactors and for trusting the security fixes. This plan stands up the harness and writes
characterization tests for the **money/auth/crypto critical paths** — not coverage for coverage's
sake.

## Current state

- `telegram-premium-server/package.json` — scripts: `start`, `dev`, `prepare`, `clean`, `build`,
  `lint:fix`. **No `test`**. No jest/vitest/supertest in devDependencies. TypeScript 5.4, ts-node-dev.
- `Telegram-premium-2025/package.json` — scripts: `dev`, `build`, `lint`, `preview`. **No `test`**.
  Vite 5, React 18. No vitest / @testing-library.
- Pure, testable units already exist, e.g. `src/services/crypto.service.ts` (encode/decode),
  `src/services/decoyAI.service.ts` (`buildSystemPrompt`, `buildSteeringBlock` — explicitly
  documented as "pure + exported so it can be unit-tested"), and the auth/payment services.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Backend install | `cd telegram-premium-server && npm install -D vitest @vitest/coverage-v8 supertest @types/supertest` | exit 0 |
| Backend tests | `cd telegram-premium-server && npm test` | runs, all pass |
| Frontend install | `cd Telegram-premium-2025 && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom` | exit 0 |
| Frontend tests | `cd Telegram-premium-2025 && npm test` | runs, all pass |

## Scope
**In scope:**
- Both `package.json` files (add `test` script + dev deps)
- `telegram-premium-server/vitest.config.ts` (create)
- `Telegram-premium-2025/vitest.config.js` (create)
- Backend tests: `src/services/__tests__/crypto.test.ts`, `.../auth.test.ts` (token shape), `.../payment.test.ts` (if 004 not yet done, basic signature test)
- Frontend test: one test for the safe-highlight util once 008 creates it (or a placeholder smoke test of a pure util)

**Out of scope:**
- Achieving any coverage target. Write the critical-path tests listed; stop there.
- Fixing bugs the tests reveal — report them as new findings.
- E2E / browser automation.

## Steps

### Step 1: backend test harness (Vitest)
Install the backend dev deps. Add `vitest.config.ts` (node environment, `globals: true`). Add
`"test": "vitest run"` and `"test:watch": "vitest"` to `package.json` scripts.
**Verify**: `npm test` runs and reports "no test files" (or passes) with exit 0 once a test exists.

### Step 2: characterization tests for crypto + auth
- `src/services/__tests__/crypto.test.ts`: `encode` then `decode` round-trips a string with a
  generated key; `decode` of tampered ciphertext throws.
- `src/services/__tests__/auth.test.ts`: signing produces a JWT whose decoded payload has
  `_id`, `sessionId` (and `role` once 003 lands). Mock the user repo + cache.
**Verify**: `npm test` → these pass.

### Step 3: frontend test harness (Vitest + Testing Library)
Install frontend dev deps. Add `vitest.config.js` (`environment: 'jsdom'`, setup file importing
`@testing-library/jest-dom`). Add `"test": "vitest run"` to scripts.
**Verify**: `npm test` runs with exit 0.

### Step 4: one meaningful frontend test
Write a test for a pure util (e.g. the existing `truncateToFirst20Words`, or the safe highlighter
from Plan 008 if done): asserts plain text passes through and that HTML special chars are escaped
(this becomes the regression guard for the XSS fix).
**Verify**: `npm test` → passes.

## Test plan
This plan *is* the test plan. The deliverable is a working `npm test` in both projects plus the
critical-path tests above.

## Done criteria
- [ ] `cd telegram-premium-server && npm test` runs and passes (≥3 tests: crypto round-trip + tamper, auth token shape).
- [ ] `cd Telegram-premium-2025 && npm test` runs and passes (≥1 meaningful util test).
- [ ] `test` script present in both `package.json` files.
- [ ] No production source files modified (tests + config only).
- [ ] `plans/README.md` status row updated.

## STOP conditions
- Tests already exist (plan stale) → STOP.
- A characterization test reveals a clear bug in crypto/auth/payment → record it as a finding and STOP for that unit (don't silently fix it here).
- ts-node/ESM interop fights Vitest config beyond a reasonable attempt → report the blocker; consider Jest+ts-jest as the fallback runner and note it.

## Maintenance notes
- Every subsequent plan adds its tests next to the code it changes; this plan just makes that possible.
- Wire `npm test` into CI as a deploy gate (Plan 024 / the CI improvement).
- Keep tests fast and side-effect-free (mock Mongo/Redis/OpenAI/Razorpay); no real network.

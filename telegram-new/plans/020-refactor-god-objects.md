# Plan 020: Refactor the god-object services (DESIGN + INCREMENTAL)

> **Executor instructions**: This is a **design-led, incremental** refactor. Do **not** attempt
> all three god objects at once. Produce the extraction map first, then execute ONE extraction,
> verify behavior is unchanged via Plan 006 tests, and stop for review before the next. Update
> `plans/README.md` after each increment.
>
> **Drift check (run first)**: confirm the three files still exceed ~1000 lines. Not a git repo —
> no SHA diff.

## Status
- **Priority**: P3
- **Effort**: L (multi-session)
- **Risk**: HIGH — these files are central; behavior-preserving extraction needs the test net.
- **Depends on**: 006 (hard — characterization tests must exist for the file being extracted before you touch it)
- **Category**: tech-debt / architecture
- **Planned at**: working tree, 2026-06-24 (no VCS)
- **Findings**: M13 (god objects)

## Why this matters

Three backend services and one frontend page concentrate too many responsibilities, making them
hard to test, reason about, and change without collateral risk — exactly the files a growing team
trips over. They are also the files most coupled to the security/reliability fixes in this plan
set, so cleaning them up compounds the value of the other work. But refactoring them is only safe
*after* characterization tests pin current behavior.

## Current state (sizes verified)

- `src/services/bookmark.service.ts` — 1113 lines: bookmark CRUD + scrape-job processing +
  alert scheduling + statistics aggregation + dashboard reporting.
- `src/services/decoyBot.service.ts` — 1094 lines: Telegram client lifecycle (connect/acquire/
  release/reconnect) + session polling + AI reply orchestration + timers.
- `src/services/telegram.service.ts` — 1015 lines: primary proxy request logic + bkpsch fallback +
  retry/timeout coordination.
- `Telegram-premium-2025/src/pages/decoy/GenericDecoyPage.jsx` — 1069 lines: session lifecycle +
  socket wiring + message state + 3-column layout.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Backend tests | `cd telegram-premium-server && npm test` | pass before AND after each extraction |
| Typecheck | `cd telegram-premium-server && npx tsc --noEmit` | exit 0 |

## Scope
**In scope (per increment, ONE at a time):** the single service/page being extracted + the new
module(s) it spawns + its callers. **Out of scope:** changing behavior, signatures consumed by
controllers, or doing more than one god object per review cycle.

## Steps

### Step 0: write the extraction map (design)
For each of the four files, list its distinct responsibilities and propose target modules. Suggested:
- `bookmark.service.ts` → `AlertScheduler`, `BookmarkStatisticsService`, keep orchestration in `bookmark.service`.
- `decoyBot.service.ts` → `TelegramClientManager` (connect/acquire/release/reconnect/floodwait), keep conversation logic in `decoyBot.service`.
- `telegram.service.ts` → `TelegramProxyService` + `BkpschFallbackService` behind one interface.
- `GenericDecoyPage.jsx` → `useDecoySession` hook + presentational components.
Record it in this file or a sibling design doc.

### Step 1: ensure characterization tests exist for the FIRST target
Pick the highest-value extraction (suggest `TelegramClientManager` out of `decoyBot.service.ts`,
since it's coupled to the single-process constraint). Before touching it, ensure Plan 006-style
tests capture its current observable behavior. If absent, write them first.
**Verify**: `npm test` green on current code.

### Step 2: extract behind a stable surface
Move the identified methods/state into the new module; the original service delegates to it. Keep
the original public methods' signatures identical so controllers/callers don't change.
**Verify**: `npx tsc --noEmit` → 0; `npm test` → same results as Step 1 (no behavior change).

### Step 3: stop and review; repeat for the next target only after merge
Update the status row, hand off for review. Do not start the next extraction in the same pass.

## Test plan
The Plan 006 characterization tests ARE the safety net: they must pass identically before and
after each extraction. Add focused unit tests for each newly-extracted module.

## Done criteria (per increment)
- [ ] One responsibility cleanly extracted into its own module; original delegates.
- [ ] No public signature consumed by controllers/callers changed.
- [ ] `npm test` and `npx tsc --noEmit` green; behavior identical to pre-extraction.
- [ ] `plans/README.md` updated; remaining extractions tracked.

## STOP conditions
- Characterization tests for the target don't exist and can't be written cheaply → STOP; do 006 first.
- An extraction would change a controller-facing signature → STOP and reconsider the boundary.
- The single-process / single-MTProto-connection invariant (documented in `config/index.ts` and
  `ecosystem.config.js`) would be violated by moving client ownership → STOP; that constraint is by-design.

## Extraction map (Step 0 — recorded 2026-06-24)

Responsibilities and proposed target modules for each god object:

- **`bookmark.service.ts`** (now ~1075 lines) →
  - `scrapeInterval.util.ts` — pure scheduling math (`calculateScrapeInterval`, `formatInterval`). **✅ EXTRACTED 2026-06-24** (pure, behavior-preserving; guarded by `scrapeInterval.test.ts`).
  - `BookmarkStatisticsService` — `updateBookmarkAggregateStatistics` + the aggregate-merge helpers (needs characterization tests first; touches the M10 transaction path).
  - `AlertScheduler` — `scheduleAlertJob` / alert cron + `calculateManualAlertTimeWindow`.
  - keep CRUD + scrape orchestration in `bookmark.service`.
- **`decoyBot.service.ts`** → `TelegramClientManager` (connect/acquire/release/reconnect/floodwait — must stay owned by the single master process), keep conversation logic in `decoyBot.service`.
- **`telegram.service.ts`** → `TelegramProxyService` + `BkpschFallbackService` behind one interface.
- **`GenericDecoyPage.jsx`** → `useDecoySession` hook + presentational components.

**Increment done this pass:** the pure `scrapeInterval` helpers only — the lowest-risk extraction that needs no DB/network characterization tests. The remaining extractions are DB/Telegram/socket-coupled and must be done one-at-a-time behind Plan 006 characterization tests per the steps above; they are NOT done yet.

## Maintenance notes
- This is deliberately incremental; a "rewrite all four" PR would be unreviewable and unsafe.
- The decoy single-process constraint is real — `TelegramClientManager` must still be owned by the
  one master process; extraction is about structure, not relocating the connection across processes.

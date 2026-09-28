# Plan 015: Transactions & queue idempotency in the scrape pipeline

> **Executor instructions**: Higher-risk reliability work — do **after** Plan 006 (tests are the
> safety net). Follow step by step; run each verification. Honor STOP conditions. Update
> `plans/README.md` when done.
>
> **Drift check (run first)**: open the files in "Current state" and confirm they match. Not a
> git repo — no SHA diff. On mismatch, STOP.

## Status
- **Priority**: P3
- **Effort**: L
- **Risk**: HIGH — MongoDB transactions add latency and require a replica set; queue idempotency
  changes job semantics. Wrong handling can drop or double-process scrapes.
- **Depends on**: 006 (hard)
- **Category**: database / reliability
- **Planned at**: working tree, 2026-06-24 (no VCS)
- **Findings**: M10 (no transaction on multi-write scrape; non-idempotent retries)

## Why this matters

`processScrapeJob` performs several writes in sequence — create scrapeData, update bookmark
aggregate statistics, set `nextScrapeAt` — with no transaction. A crash between writes leaves
inconsistent state (data stored but stats stale, or schedule not advanced). The Bull queue
retries jobs (`attempts: 3`), but the job isn't idempotent: a retry re-uploads to the same S3 key
and re-increments statistics, corrupting counts. At scale these inconsistencies accumulate.

## Current state

- `src/services/bookmark.service.ts:327-349` — `processScrapeJob` creates scrapeData, calls
  `updateBookmarkAggregateStatistics(...)`, then `updateBookmark(..., { nextScrapeAt })` — three
  separate awaited writes, no session/transaction, no idempotency guard.
- `src/config/redis.ts:11-22` — `scrapeQueue` has `attempts: 3`, exponential backoff. (Also
  `alertQueue`, `:24-35`.)
- `src/processors/queue.processor.ts` — registers the processors (open it to see how jobs are consumed).
- MongoDB is Atlas (`.env` MONGO_URI is `mongodb+srv://...` → replica set → transactions supported).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `cd telegram-premium-server && npx tsc --noEmit` | exit 0 |
| Tests | `cd telegram-premium-server && npm test -- scrape` | pass |

## Scope
**In scope:** `src/services/bookmark.service.ts` (`processScrapeJob` and the writes it calls),
the repository methods involved, optionally a small `processedScrape` guard. **Out of scope:**
re-architecting the queue; changing scrape scheduling logic beyond idempotency.

## Steps

### Step 1: make the job idempotent on a stable key
Derive a stable idempotency key per scrape run (e.g. `bookmarkId + scrapeWindowStart` or the S3
key already used). At the start of `processScrapeJob`, check whether a scrapeData record for that
key already exists; if so, skip the upload + stats and return early (the retry is a no-op).
**Verify**: `npx tsc --noEmit` → 0.

### Step 2: wrap the multi-write in a transaction
Use a Mongoose session: `const session = await mongoose.startSession(); session.startTransaction();`
Pass `{ session }` to the create + statistics-update + `nextScrapeAt` update so they commit
atomically; `commitTransaction` on success, `abortTransaction` in `catch`, `endSession` in `finally`.
The S3 upload (non-transactional) should happen **before** the DB writes and be made idempotent
by Step 1 (same key overwrites harmlessly), or be compensated on abort.
**Verify**: `npx tsc --noEmit` → 0.

### Step 3: confirm queue retry now converges
With Steps 1–2, a retried job either finds the work already done (skips) or re-runs the
transaction cleanly. Confirm the processor surfaces failures (so Bull retries) rather than
swallowing them.
**Verify**: read `queue.processor.ts` — the processor rethrows on failure.

## Test plan
(Uses Plan 006 + in-memory Mongo with replica-set support, or mock the session.)
- running `processScrapeJob` twice for the same window adds stats **once** (idempotent).
- a thrown error mid-write leaves the bookmark stats unchanged (transaction rolled back).
Verify: `npm test -- scrape` → pass.

## Done criteria
- [ ] `processScrapeJob` is idempotent: a repeat run for the same scrape window does not double-count stats or re-upload duplicate data.
- [ ] The create + stats + schedule writes commit in one transaction (or are otherwise made atomic).
- [ ] Queue retries converge to correct state (verified by test).
- [ ] `npx tsc --noEmit` exits 0; scrape tests pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- The target Mongo deployment is **not** a replica set (transactions unavailable) → STOP; fall
  back to the idempotency guard (Step 1) alone and document that atomicity is best-effort.
- `updateBookmarkAggregateStatistics` reads-then-writes in a way that can't be made
  session-aware without a larger refactor → STOP and report; ship Step 1 only.
- A "Current state" file doesn't match its excerpt → STOP.

## Maintenance notes
- Any new write added to `processScrapeJob` must join the same session.
- The idempotency key choice is load-bearing — document it; a reviewer should confirm retries
  can't pick a different key for the same logical scrape.
- Pairs with Plan 004's payment idempotency (same pattern, different collection).

# Plan 013: Database performance — N+1, compound indexes, lean reads

> **Executor instructions**: Follow step by step; run each verification. Honor STOP conditions.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**: open the files in "Current state" and confirm they match. Not a
> git repo — no SHA diff. On mismatch, STOP.

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: MED — query/aggregation changes can alter results if the new query isn't equivalent.
  Verify the dashboard returns the same data. Index additions are low risk.
- **Depends on**: 006 (soft — write the equivalence test here if 006 isn't done)
- **Category**: performance / database
- **Planned at**: working tree, 2026-06-24 (no VCS)
- **Findings**: M7 (N+1 in dashboard), M8 (missing compound indexes)

## Why this matters

`getUserBookmarks` issues one `getLatestScrapeData` query per bookmark — a 1+N pattern on the
dashboard's hottest endpoint. And the queries that drive list/scan paths lack the compound
indexes their filters imply, so they degrade to collection scans as data grows. Both are pure
wins (same results, less load) and matter directly at the "millions of users" target.

## Current state

- `src/services/bookmark.service.ts:156-176` — `getUserBookmarks` fetches bookmarks then
  `await Promise.all(bookmarks.map(b => this._bookmarkRepository.getLatestScrapeData(b._id...)))`
  — N queries.
- `src/repository/bookmark.repository.ts:93-95` — `getUserBookmarks` = `find({ userId, isActive: true }).sort({ createdAt: -1 })`.
- `src/repository/bookmark.repository.ts:239-250` — `getLatestScrapeData` = `findOne({ bookmarkId }).sort({ firstMessageTimestamp: -1 })`.
- `src/models/bookmark.model.ts:104-106` — indexes: `{userId, channelId}`(unique), `{nextScrapeAt, isActive}`, `{alertTime, isActive}`. **No** `{userId, isActive, createdAt}`.
- `src/models/scrapeData.model.ts` — open it; confirm whether `{ bookmarkId, firstMessageTimestamp }` index exists (the `getLatestScrapeData` sort needs it).
- `src/models/user.model.ts:45` — `userSchema.index({ email: 1 })` is **non-unique** though email is the login key.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `cd telegram-premium-server && npx tsc --noEmit` | exit 0 |

## Scope
**In scope:** `src/services/bookmark.service.ts` (fix N+1), `src/repository/bookmark.repository.ts`
(add a batch method), `src/models/bookmark.model.ts`, `src/models/scrapeData.model.ts`,
`src/models/user.model.ts` (indexes).
**Out of scope:** unbounded-array fixes (Plan 014), transactions (Plan 015). Don't change the
dashboard's response shape.

## Steps

### Step 1: replace the N+1 with one batched query
Add a repository method `getLatestScrapeDataForBookmarks(bookmarkIds: string[])` that returns the
newest scrapeData per bookmark in a single call — e.g. an aggregation:
`match {bookmarkId in ids}` → `sort {bookmarkId, firstMessageTimestamp:-1}` → `group {_id:'$bookmarkId', doc:{$first:'$$ROOT'}}`.
In `bookmark.service.ts:getUserBookmarks`, call it once and join in memory (Map keyed by
bookmarkId) instead of mapping per-bookmark queries. Preserve the exact output fields
(`lastScrapedAt`, `nextScrapeAt`, `messageCount`).
**Verify**: `npx tsc --noEmit` → 0; the returned objects have identical keys to before (diff against the excerpt).

### Step 2: add the compound index for the dashboard list
`bookmark.model.ts`: add `bookmarkSchema.index({ userId: 1, isActive: 1, createdAt: -1 });`
(covers `find({userId,isActive}).sort({createdAt:-1})`).
**Verify**: `npx tsc --noEmit` → 0.

### Step 3: add the scrapeData index for the latest-scrape sort
In `scrapeData.model.ts`, ensure `schema.index({ bookmarkId: 1, firstMessageTimestamp: -1 });`
exists (add if missing). This serves both `getLatestScrapeData` and the Step-1 aggregation.
**Verify**: `npx tsc --noEmit` → 0.

### Step 4: make the user email index unique
In `user.model.ts:45`, change to `userSchema.index({ email: 1 }, { unique: true });`
**Verify**: `npx tsc --noEmit` → 0. NOTE: this fails to build the index in production if
duplicate emails already exist — see STOP conditions.

## Test plan
(Uses Plan 006 + an in-memory Mongo such as `mongodb-memory-server`, or mock the repo.)
- `getUserBookmarks` with 3 bookmarks returns the same shape and the correct latest-scrape values,
  and issues a bounded number of queries (assert the batch method is called once, not per item).
Verify: `npm test -- bookmark` → pass.

## Done criteria
- [ ] `getUserBookmarks` no longer calls `getLatestScrapeData` in a per-bookmark loop; one batched query.
- [ ] `{userId,isActive,createdAt}` index on bookmarks; `{bookmarkId,firstMessageTimestamp}` on scrapeData.
- [ ] User email index is unique.
- [ ] Dashboard response shape unchanged; `npx tsc --noEmit` exits 0; bookmark test passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- Duplicate emails already exist in production → the unique index build will fail. STOP, report,
  and propose a dedupe migration before adding the unique constraint.
- The aggregation returns a different "latest" than the per-item query (e.g. ties broken
  differently) → STOP and reconcile the sort keys to match the original.
- A "Current state" file doesn't match its excerpt → STOP.

## Maintenance notes
- If dashboard pagination is added later, push the `limit/skip` into the repository query, not in memory.
- Index changes must be applied in prod (`createIndex`/`syncIndexes`); note this in the deploy steps.
- Reviewer: confirm no behavioral change in the dashboard output.

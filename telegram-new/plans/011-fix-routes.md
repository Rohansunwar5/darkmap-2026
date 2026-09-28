# Plan 011: Fix unauthenticated endpoints & broken route definitions

> **Executor instructions**: Follow step by step; run each verification. Honor STOP conditions.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**: open the route files in "Current state" and confirm they match.
> Not a git repo — no SHA diff. On mismatch, STOP.

## Status
- **Priority**: P2
- **Effort**: S
- **Risk**: LOW — adds auth where missing and fixes two route-definition typos. The only risk is
  if an endpoint was *intentionally* public (verify the darkmap one — see STOP conditions).
- **Depends on**: none
- **Category**: security / correctness
- **Planned at**: working tree, 2026-06-24 (no VCS)
- **Findings**: M5 (unauth endpoints), L1 (malformed resume route), L2 (route shadowing)

## Why this matters

Two endpoints lack auth that their siblings have, allowing free use of expensive
automation/analysis and bypassing credit billing. Two route definitions are broken: the resume
route has a literal `"` instead of `:` (so resume is unreachable — always 404), and
`GET /user-dashboard-stats` is shadowed by an earlier `GET /:bookmarkId` (so it's treated as a
bookmark id lookup).

## Current state

- `src/routes/bkpsch.route.ts:7-8`:
  ```ts
  bkpschRouter.post('/search', bkpschSearchController);            // NO auth
  bkpschRouter.post('/searchNearby', isLoggedIn, bkpschNearbyController);
  ```
- `src/routes/telegram.route.ts:18-19`:
  ```ts
  telegramRouter.post('/analyze-channel', isLoggedIn, asyncHandler(analyzeChannel));
  telegramRouter.post('/analyze-channel-darkmap', asyncHandler(analyzeChannel));   // NO auth, same controller
  ```
  (`analyzeChannel` uses `req.user._id` for credit deduction — on the unauth route `req.user` is undefined.)
- `src/routes/bookmark.route.ts:11-12,18,22`:
  ```ts
  bookmarkRouter.get('/bookmarks', isLoggedIn, asyncHandler(getUserBookmarks));
  bookmarkRouter.get('/:bookmarkId', isLoggedIn, asyncHandler(getBookmarkById));    // line 12 — greedy
  ...
  bookmarkRouter.post('/"bookmarkId/resume', isLoggedIn, asyncHandler(resumeBookmark)); // line 18 — literal quote typo
  ...
  bookmarkRouter.get('/user-dashboard-stats', isLoggedIn, asyncHandler(getAllUserDashboardStats)); // line 22 — shadowed by line 12
  ```

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `cd telegram-premium-server && npx tsc --noEmit` | exit 0 |
| Confirm no bad route | `cd telegram-premium-server && grep -n '"bookmarkId' src/routes/bookmark.route.ts` | no match |

## Scope
**In scope:** `src/routes/bkpsch.route.ts`, `src/routes/telegram.route.ts`, `src/routes/bookmark.route.ts`.
**Out of scope:** the controllers themselves; changing what the endpoints do.

## Steps

### Step 1 (M5): add auth to the two open endpoints
- `bkpsch.route.ts:7` → add `isLoggedIn`: `bkpschRouter.post('/search', isLoggedIn, bkpschSearchController);`
- `telegram.route.ts:19` → add `isLoggedIn`: `telegramRouter.post('/analyze-channel-darkmap', isLoggedIn, asyncHandler(analyzeChannel));`
**Verify**: `grep -n "post('/search'" src/routes/bkpsch.route.ts` shows `isLoggedIn`; same for the darkmap route. `npx tsc --noEmit` → 0.

### Step 2 (L1): fix the resume route typo
`bookmark.route.ts:18` → `bookmarkRouter.post('/:bookmarkId/resume', isLoggedIn, asyncHandler(resumeBookmark));`
**Verify**: `grep -n '"bookmarkId' src/routes/bookmark.route.ts` → no match.

### Step 3 (L2): de-shadow the static GET route
Move the **static** routes (`/bookmarks`, `/user-dashboard-stats`) **above** the parameterized
`/:bookmarkId` GET (line 12) so Express matches them first. Order: static GETs first, then
`/:bookmarkId`.
**Verify**: in `bookmark.route.ts`, the `get('/user-dashboard-stats', ...)` line appears before
`get('/:bookmarkId', ...)`. `npx tsc --noEmit` → 0.

## Test plan
(Uses Plan 006 + supertest.)
- `POST /bkpsch/search` and `POST /telegram/analyze-channel-darkmap` without a token → 401.
- `GET /bookmark/user-dashboard-stats` (with token) reaches `getAllUserDashboardStats`, not `getBookmarkById`.
- `POST /bookmark/:id/resume` reaches `resumeBookmark`.
Verify: `npm test -- routes` → pass.

## Done criteria
- [ ] `/bkpsch/search` and `/analyze-channel-darkmap` require `isLoggedIn`.
- [ ] No `"bookmarkId` literal in any route.
- [ ] `/user-dashboard-stats` is registered before `/:bookmarkId`.
- [ ] `npx tsc --noEmit` exits 0; route tests pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- The `/analyze-channel-darkmap` route is **intentionally public** (e.g. an unauthenticated
  marketing/demo surface that does NOT deduct credits) — if you find evidence of that (a comment,
  a separate controller branch, a frontend calling it without a token), STOP and report rather
  than breaking it. Default assumption: it should be authed like its sibling.
- A route file doesn't match its excerpt → STOP.

## Maintenance notes
- Reviewer: any new route must declare `isLoggedIn`/`isAdminLoggedIn` explicitly; consider an
  ESLint rule or a route-table test asserting every route has an auth middleware.
- Static routes always before parameterized ones in the same router.

# Plan 019: Dependency cleanup & migrations

> **Executor instructions**: Each dependency change is independent; do them one at a time, run
> the verify after each, and only proceed if green. Honor STOP conditions. Update
> `plans/README.md` when done.
>
> **Drift check (run first)**: open both `package.json` files and confirm the listed deps still
> match. Not a git repo — no SHA diff. On mismatch for a given dep, skip and report.

## Status
- **Priority**: P3
- **Effort**: M
- **Risk**: MED — replacing `xss-clean` and migrating `bull`→`bullmq` change runtime behavior;
  do these behind Plan 006's tests. Removing unused deps is low risk.
- **Depends on**: 006 (hard for the behavioral migrations; not needed for pure removals)
- **Category**: dependencies
- **Planned at**: working tree, 2026-06-24 (no VCS)
- **Findings**: M14 (deprecated/abandoned deps), L5 (unused deps)

## Why this matters

The manifests carry abandoned and CVE-bearing packages and several unused ones. `xss-clean` is
unmaintained since ~2017; `xlsx@0.18.5` (npm SheetJS) has known prototype-pollution/ReDoS CVEs;
`multer@1.x` and `bull` are legacy. Unused deps (`moment`, `input`, `hackcheck`,
`react-element-to-jsx-string`) inflate the install and the supply-chain surface. Each is a small,
verifiable cleanup.

## Current state (verified)

- Backend `package.json`: `"crypto"` (handled in Plan 007), `"xss-clean": "^0.1.4"` (used in
  `src/app.ts:5` + `src/middlewares/validators/index.ts`), `"bull": "^4.16.5"` (used in
  `src/config/redis.ts`), `"multer": "^1.4.5-lts.1"` (used in `src/routes/telegram.route.ts:9`),
  `"moment"` and `"input"` — **not imported** anywhere in `src` (verified via grep).
- Frontend `package.json`: `"xlsx": "^0.18.5"` (used in `src/components/Common/utils.jsx`),
  `"hackcheck": "^1.0.1"` — **not imported** (the only `hackcheck` matches are a prop name
  `hackcheckData`, not the package), `"react-element-to-jsx-string"` — **not imported**.
- `"ip": "^2.0.1"` (backend) — used only in `src/utils/system.util.ts:1` for `getLocalIP()` logging.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Backend build | `cd telegram-premium-server && npm run build` | exit 0 |
| Backend tests | `cd telegram-premium-server && npm test` | pass |
| Frontend build | `cd Telegram-premium-2025 && npm run build` | exit 0 |
| Re-confirm "unused" before removing | `grep -rn "<pkg>" <project>/src` | no import |

## Scope
**In scope:** both `package.json` (+ lockfiles via npm), `src/app.ts` and the validators index
(for the `xss-clean` replacement), `src/config/redis.ts` + processors (for bull→bullmq), the
multer call site, and the `xlsx` usage site. **Out of scope:** the `crypto` package (Plan 007).

## Steps (independent — each its own commit/verify)

### Step 1: remove confirmed-unused deps
Re-confirm each is unimported (`grep -rn "from 'moment'\|require('moment')" src`, etc.), then
`npm uninstall moment input` (backend) and `npm uninstall hackcheck react-element-to-jsx-string`
(frontend).
**Verify**: respective `npm run build` exits 0.

### Step 2: replace abandoned `xss-clean`
`xss-clean` predates and overlaps with `helmet` + `express-mongo-sanitize` (both already present).
Remove `app.use(xss())` and the import; rely on output-encoding at render boundaries (the real XSS
risk was client-side — Plan 008) plus a maintained sanitizer only if a server-side need is shown.
If body sanitization is genuinely required, add a maintained package (e.g. `xss`) applied to
specific fields, not a global monkey-patch. Then `npm uninstall xss-clean`.
**Verify**: `npm run build` exits 0; `grep -rn "xss-clean\|xss()" src` → no matches.

### Step 3: upgrade `multer` 1.x → 2.x
The single use is `multer().none()` (parsing multipart form fields, no files). `npm install multer@^2`
and verify the `.none()` usage still compiles/behaves.
**Verify**: `npm run build` exits 0; the `/proxy` routes still parse form bodies (smoke or test).

### Step 4 (optional, behind tests): migrate `bull` → `bullmq`
`bullmq` is the maintained successor with a slightly different API (separate `Queue`/`Worker`).
This touches `src/config/redis.ts` and `src/processors/*`. Do only with Plan 006 queue tests in
place. If risk/effort is too high now, **defer** and record it.
**Verify**: queue processors run; jobs complete (integration smoke); `npm test` passes.

### Step 5: address `xlsx` CVEs
Either pin to SheetJS's official distribution (their CDN/tarball, not the stale npm `0.18.5`) or
migrate the single export site to a maintained lib (`exceljs`). Usage is export-only, so a swap is
contained.
**Verify**: frontend `npm run build` exits 0; export still produces a valid file (manual smoke).

### Step 6: note `ip`
`ip` is used only for `getLocalIP()` logging — not a security decision, so its SSRF CVE is not
reachable. Either leave it or replace `ip.address()` with `os.networkInterfaces()`/`os.hostname()`
and `npm uninstall ip`. Low priority; record the decision.

## Test plan
- After Step 2: a request body with `<script>` reaches handlers without breaking; the XSS defense
  now lives client-side (Plan 008 test) — confirm no behavior regression on a normal POST.
- After Step 4 (if done): queue completion test from Plan 006/015.
- After Step 5: export util test produces a non-empty file.

## Done criteria
- [ ] `moment`, `input`, `hackcheck`, `react-element-to-jsx-string` removed; builds green.
- [ ] `xss-clean` removed; no global `xss()` middleware; builds green.
- [ ] `multer` on 2.x; `/proxy` form parsing works.
- [ ] `xlsx` CVE addressed (pinned to official dist or replaced); export works.
- [ ] `bull`→`bullmq` either migrated (tests pass) or explicitly deferred with a note.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- A "confirmed-unused" dep turns out to be imported dynamically / by a build tool → keep it, report.
- `multer@2` changes the `.none()` API in a way the route relies on → STOP and adapt deliberately.
- `bullmq` migration balloons (event handlers, repeatable jobs differ) → defer it, don't half-migrate.

## Maintenance notes
- Add `npm audit` (or `npm audit --omit=dev`) as a CI gate so new CVE-bearing deps are caught.
- Reviewer: confirm each removal was preceded by a fresh grep, not just the list above (the repo may have drifted).

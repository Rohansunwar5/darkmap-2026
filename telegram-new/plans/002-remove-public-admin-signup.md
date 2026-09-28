# Plan 002: Remove the public admin-signup endpoint

> **Executor instructions**: Follow step by step, run each verification, confirm expected
> output before proceeding. STOP conditions override improvisation. Update `plans/README.md`
> when done.
>
> **Drift check (run first)**: open the files in "Current state" and confirm they match the
> excerpts. Not a git repo — no SHA diff. On mismatch, STOP.

## Status
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — removes an endpoint that should never have shipped; only affects admin onboarding flow.
- **Depends on**: none
- **Category**: security
- **Planned at**: working tree, 2026-06-24 (no VCS)

## Why this matters

`POST /decoy-accounts/auth/signup` is registered with **no authentication** and creates a
fully-privileged admin account. The route comment literally says *"open for testing; restrict
before production."* Anyone on the internet can mint an admin and then manage the decoy
Telegram account pool (which holds real account session strings). This is total admin
compromise independent of every other auth issue.

## Current state

- `telegram-premium-server/src/routes/decoyAdmin.route.ts:14-15`:
  ```ts
  // Public — admin signup (open for testing; restrict before production)
  decoyAdminRouter.post('/auth/signup', loginValidator, asyncHandler(adminSignup));
  ```
- `telegram-premium-server/src/controllers/adminAuth.controller.ts:10-14` — `adminSignup` calls
  `adminAuthService.createAdmin({ email, password })`.
- `telegram-premium-server/src/services/adminAuth.service.ts:33-42` — `createAdmin` (keep this
  method; it will be used by the seed script).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `cd telegram-premium-server && npx tsc --noEmit` | exit 0 |
| Confirm route gone | `cd telegram-premium-server && grep -rn "auth/signup" src/routes` | no matches |

## Scope
**In scope:**
- `telegram-premium-server/src/routes/decoyAdmin.route.ts` (remove the signup route)
- `telegram-premium-server/src/controllers/adminAuth.controller.ts` (remove now-unused `adminSignup` export)
- `telegram-premium-server/src/scripts/seed-admin.ts` (create — a CLI to provision the first admin)

**Out of scope:**
- `adminAuthService.createAdmin` — keep it (reused by the seed script).
- Admin login route — leave unchanged.

## Steps

### Step 1: delete the public signup route
Remove lines 14–15 (the comment + the `post('/auth/signup', ...)` registration) from
`decoyAdmin.route.ts`. Also remove the now-unused `adminSignup` import if it was imported there.
**Verify**: `grep -rn "auth/signup" telegram-premium-server/src/routes` → no matches.

### Step 2: remove the dangling controller export
In `adminAuth.controller.ts`, delete the `adminSignup` export (lines 10–14). Leave `adminLogin`.
**Verify**: `npx tsc --noEmit` → exit 0 (no unused-import / missing-symbol errors).

### Step 3: add a seed script for provisioning admins
Create `telegram-premium-server/src/scripts/seed-admin.ts` that connects to the DB, reads email
and password from CLI args or env (`ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`), and calls
`adminAuthService.createAdmin(...)`, then exits. Model it on the existing one-off script style in
`src/scripts/migrate-telegram-accounts.ts` (same `connectDB()` + run + `process.exit` shape).
Add a `package.json` script: `"seed:admin": "ts-node src/scripts/seed-admin.ts"`.
**Verify**: `npx tsc --noEmit` → exit 0.

## Test plan
- If Plan 006 has landed: add a route test asserting `POST /decoy-accounts/auth/signup` returns
  404 (route no longer exists). Model after the auth route tests created in 006.
- If 006 has not landed: the grep + typecheck gates above suffice for this small change.

## Done criteria
- [ ] `grep -rn "auth/signup" telegram-premium-server/src` returns no matches.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `src/scripts/seed-admin.ts` exists and typechecks; `seed:admin` script added.
- [ ] No files outside the in-scope list modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- The route file doesn't match the excerpt → STOP.
- `createAdmin` is referenced by code other than the controller + the new seed script → STOP and report (don't break a hidden caller).

## Maintenance notes
- First admin is now created via `npm run seed:admin` on the server, not over HTTP.
- A reviewer should confirm no client code (frontend) calls the signup endpoint — search
  `Telegram-premium-2025/src` for `auth/signup`; if found, that UI must be removed too.

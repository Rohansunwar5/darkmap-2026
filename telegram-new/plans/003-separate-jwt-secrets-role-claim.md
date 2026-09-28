# Plan 003: Separate JWT secrets and enforce an admin role claim

> **Executor instructions**: Follow step by step; run each verification before proceeding.
> Honor STOP conditions. Update `plans/README.md` when done.
>
> **Drift check (run first)**: open every file in "Current state" and confirm it matches the
> excerpts. Not a git repo — no SHA diff. On mismatch, STOP.

## Status
- **Priority**: P1
- **Effort**: M
- **Risk**: MED — touches the auth path for both users and admins. A mistake locks out admins
  or (worse) re-opens the escalation. Tests are part of the plan.
- **Depends on**: 001 (the JWT secrets must be rotated to new, distinct values first)
- **Category**: security
- **Planned at**: working tree, 2026-06-24 (no VCS)

## Why this matters

Admin routes verify the JWT with `ADMIN_JWT_SECRET`; user routes use `JWT_SECRET`. In the
leaked `.env` **both hold the same value**, and the token payload (`{_id, sessionId}`) has **no
role**, while `requireAuth` only checks that `req.user` exists. Result: any logged-in user's
token passes admin middleware → full privilege escalation. Even after the secrets are made
distinct (defense #1), a leaked admin secret should not be the only thing standing between a
user and admin access — so we also add an explicit `role` claim and check it (defense #2).

## Current state

- `telegram-premium-server/src/services/auth.service.ts:47-60` — user token:
  ```ts
  const token = jwt.sign({ _id: userId.toString(), sessionId }, config.JWT_SECRET, { expiresIn: '24h' });
  ```
- `telegram-premium-server/src/services/adminAuth.service.ts:44-51` — admin token:
  ```ts
  const token = jwt.sign({ _id: adminId, sessionId }, config.ADMIN_JWT_SECRET, { expiresIn: '24h' });
  ```
- `telegram-premium-server/src/middlewares/auth/verify-token.middleware.ts:9-12,27,42-45` —
  payload typed `{ _id, sessionId }`; sets `req.user = { _id, sessionId }`. No role handling.
- `telegram-premium-server/src/middlewares/auth/require-auth.middleware.ts:9-12` — only checks `!req.user`.
- `telegram-premium-server/src/middlewares/isAdminLoggedIn.middleware.ts:5-8` — `[getAuthMiddlewareByJWTSecret(config.ADMIN_JWT_SECRET), requireAuth]`.
- `telegram-premium-server/src/middlewares/isLoggedIn.middleware.ts:5-8` — `[getAuthMiddlewareByJWTSecret(config.JWT_SECRET), requireAuth]`.
- `req.user` type is declared in `src/@types/custom.d.ts` (open it to see the current shape before editing).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `cd telegram-premium-server && npx tsc --noEmit` | exit 0 |
| Tests (after 006) | `cd telegram-premium-server && npm test -- auth` | all pass |

## Scope
**In scope:**
- `src/services/auth.service.ts`, `src/services/adminAuth.service.ts` (add role to payload)
- `src/middlewares/auth/verify-token.middleware.ts` (carry role onto `req.user`)
- `src/middlewares/isAdminLoggedIn.middleware.ts` (add an admin-role guard)
- `src/middlewares/auth/require-auth.middleware.ts` (optionally add a role-aware variant)
- `src/@types/custom.d.ts` (extend `req.user` type with `role`)
- a new `src/middlewares/auth/require-role.middleware.ts` (the role guard)

**Out of scope:**
- The token *encryption cache* logic in `verify-token.middleware.ts` — leave it as-is.
- Changing token expiry, or the `sessionId` mechanism.

## Steps

### Step 1: add a `role` claim when signing tokens
- In `auth.service.ts:50`, sign `{ _id, sessionId, role: 'user' }`.
- In `adminAuth.service.ts:47`, sign `{ _id, sessionId, role: 'admin' }`.
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: carry the role onto `req.user`
- In `verify-token.middleware.ts`, extend `IJWTVerifyPayload` with `role?: 'user' | 'admin'`
  and set `req.user = { _id, sessionId, role }`.
- In `src/@types/custom.d.ts`, add `role?: 'user' | 'admin'` to the `req.user` type.
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: add a role guard and apply it to admin routes
- Create `src/middlewares/auth/require-role.middleware.ts`:
  ```ts
  import { Request, Response, NextFunction } from 'express';
  import { ForbiddenError } from '../../errors/forbidden.error';
  export const requireRole = (role: 'user' | 'admin') =>
    (req: Request, _res: Response, next: NextFunction) => {
      if (req.user?.role !== role) throw new ForbiddenError();
      next();
    };
  ```
  (Use the existing `ForbiddenError` in `src/errors/forbidden.error.ts`; match its constructor.)
- In `isAdminLoggedIn.middleware.ts`, append `requireRole('admin')` to the array:
  `[getAuthMiddlewareByJWTSecret(config.ADMIN_JWT_SECRET), requireAuth, requireRole('admin')]`.
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: confirm secrets are distinct
Confirm (with the operator from Plan 001) that `JWT_SECRET` and `ADMIN_JWT_SECRET` in the
runtime env now hold **different** values. This plan's defense-in-depth assumes 001 rotated them.
**Verify**: operator confirms; not machine-checkable here without secret values.

## Test plan
(Requires Plan 006's harness; if 006 isn't done, write these as the first backend tests.)
Create `src/middlewares/auth/__tests__/role.test.ts` covering:
- a user-role token is **rejected** (403) by `requireRole('admin')`.
- an admin-role token is **accepted** by `requireRole('admin')`.
- a token missing `role` is rejected (403).
- existing user token still passes `isLoggedIn` (no regression).
Mock `jwt.verify` or sign tokens with a test secret. Verify: `npm test -- role` → all pass.

## Done criteria
- [ ] User tokens carry `role: 'user'`; admin tokens carry `role: 'admin'`.
- [ ] `isAdminLoggedIn` rejects any non-admin-role token (verified by test or manual call → 403).
- [ ] `req.user.role` is typed in `custom.d.ts`; `npx tsc --noEmit` exits 0.
- [ ] (operator) `JWT_SECRET` ≠ `ADMIN_JWT_SECRET` in runtime env.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- Any "Current state" file doesn't match its excerpt → STOP.
- `ForbiddenError`'s constructor signature differs from assumed → adapt, and if unclear, STOP.
- Adding the role guard would break a route that legitimately serves both users and admins → STOP and report (none expected, but verify).

## Maintenance notes
- New protected route? Use `isLoggedIn` for users, `isAdminLoggedIn` for admins — the role
  guard is now baked into the latter.
- If a third role appears, extend the `role` union in one place (`custom.d.ts`) and the guard.
- Reviewer: confirm both token-signing sites set the role and that no other code signs tokens
  (grep `jwt.sign` across `src`).

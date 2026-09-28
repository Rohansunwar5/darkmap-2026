# Plan 010: Backend security hardening (errors, CORS/CSP, mail TLS, request logging)

> **Executor instructions**: Four independent hardening changes; each has its own verify. Do
> them in order, run verifications, honor STOP conditions. Update `plans/README.md` when done.
>
> **Drift check (run first)**: open each file in "Current state" and confirm it matches. Not a
> git repo — no SHA diff. On mismatch for a given sub-change, skip that one and report.

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: MED — CORS/CSP changes can break the real frontend if misconfigured; the error-shape
  change affects client error parsing. Test the live frontend after CORS/CSP.
- **Depends on**: none
- **Category**: security
- **Planned at**: working tree, 2026-06-24 (no VCS)
- **Findings**: M2 (error leak), M3 (mail TLS), M4 (CORS/CSP), M6 (request-body logging)

## Why this matters

Several defense-in-depth gaps: raw internal error messages are returned to clients; the SMTP
transport disables TLS verification; CORS allows any `localhost:*` with credentials and CSP is
turned off; and every request body is logged with incomplete, inconsistent redaction (a Telegram
OSINT app handles phone numbers and session strings). None is individually catastrophic, but
together they leak data and weaken the app's posture.

## Current state

- **M2** `src/middlewares/error-handler.middleware.ts:26-42` — for a plain `Error`, returns
  `message: data.message` and `error: \`route: ... errorMsg: ${data.message} ...\`` to the client.
- **M3** `src/utils/nodemailer.util.ts:12-14` — `tls: { rejectUnauthorized: false }`.
- **M4** `src/app.ts:22-43` — `isLocalhost` allows any `localhost`/`127.0.0.1` origin with
  `credentials: true`; `helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, frameguard: false })`.
- **M6** `src/utils/logger/index.ts:43-68` (`getLogDataInJSONFromReqObject`) logs the full body,
  deleting only `password`, `confirmPassword`, `token`, `g-recaptcha-response` — not `secretKey`,
  `sessionString`, `phone`, `phoneNumber`, `otp`, etc.; called per-request from `src/app.ts:47-56`.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `cd telegram-premium-server && npx tsc --noEmit` | exit 0 |

## Scope
**In scope:** the four files above.
**Out of scope:** rate limiting (Plan 005), removing `xss-clean` (Plan 019). Don't re-enable
frameguard if the app is legitimately embedded somewhere — verify first (likely safe to enable).

## Steps

### Step 1 (M2): stop leaking internal error detail
In `error-handler.middleware.ts`, the `data instanceof Error` branch should keep logging the full
`message` server-side (it already does, with a `rayId`) but return a **generic** client message:
`message: 'Internal server error'` and `error: \`rayId: ${errorId}\`` — keep the `rayId` so support
can correlate, but never echo `data.message`. Leave the `CustomError` branch (which returns
intended, safe messages) unchanged.
**Verify**: `npx tsc --noEmit` → exit 0; `grep -n "data.message" src/middlewares/error-handler.middleware.ts` → only inside the `logger.error` call, not in any `res.send/json`.

### Step 2 (M3): restore SMTP TLS verification
In `nodemailer.util.ts`, delete the `tls: { rejectUnauthorized: false }` block (Gmail on 587 with
STARTTLS validates fine by default).
**Verify**: `grep -n "rejectUnauthorized" src/utils/nodemailer.util.ts` → no match; `npx tsc --noEmit` → 0.

### Step 3 (M4): tighten CORS and enable CSP
- In `app.ts`, gate the `isLocalhost(origin)` allowance behind `config.NODE_ENV !== 'production'`
  so prod only accepts `config.ALLOWED_ORIGIN`.
- Replace `contentSecurityPolicy: false` with a real (initially report-friendly) policy:
  `contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], connectSrc: ["'self'", config.ALLOWED_ORIGIN], imgSrc: ["'self'", 'data:', 'https:'], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"] } }`
  — adjust to what the API actually serves (the API is JSON; CSP mostly matters for any
  HTML/EJS responses like the email templates). Re-enable `frameguard` unless embedding is required.
**Verify**: `npx tsc --noEmit` → 0. Then run the frontend against the API locally and confirm
normal requests still succeed (manual smoke).

### Step 4 (M6): redact sensitive fields from request logs
In `logger/index.ts`, replace the hand-listed `delete` calls with a denylist applied in both
`getLogDataFromReqObject` and `getLogDataInJSONFromReqObject`, covering at least: `password`,
`confirmPassword`, `token`, `secretKey`, `sessionString`, `session`, `phone`, `phoneNumber`,
`otp`, `razorpaySignature`, `g-recaptcha-response`, `authProviderToken`. Better: truncate/skip the
body entirely for routes under `/auth`, `/payment`, `/decoy`. Keep ip/userId/path/method.
**Verify**: `npx tsc --noEmit` → 0.

## Test plan
(Uses Plan 006 harness, optional but recommended.)
- error handler: a thrown `new Error('db connstring xyz')` produces a response whose `message`/`error`
  do **not** contain `db connstring xyz`.
- logger: a body `{ password:'x', phone:'123', name:'ok' }` redacts `password` and `phone`, keeps `name`.
Verify: `npm test -- error-handler logger` → pass.

## Done criteria
- [ ] Non-`CustomError` responses return a generic message + rayId, never the raw error text.
- [ ] `rejectUnauthorized:false` removed from nodemailer.
- [ ] `isLocalhost` CORS allowance disabled in production; CSP enabled with a real policy.
- [ ] Request logger redacts the expanded sensitive-field list.
- [ ] `npx tsc --noEmit` exits 0; frontend smoke against the API still works.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- The frontend breaks under the new CORS/CSP and the fix isn't an obvious directive addition → STOP and report (don't just set CSP back to false).
- Disabling localhost CORS breaks a needed server-to-server caller → STOP and report.

## Maintenance notes
- CSP should tighten over time (remove `'unsafe-inline'` once styles are nonce'd). Track as follow-up.
- New sensitive body field → add it to the logger denylist; reviewer should check this on auth/payment PRs.

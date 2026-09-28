# Plan 001: Rotate every leaked credential and stop baking secrets into builds

> **Executor instructions**: This plan is **part ops runbook, part code change**. The
> credential *rotation* steps (Step 1) must be performed by a human operator with access to
> the cloud consoles — an automated agent cannot do them. The code/config steps (Steps 2–4)
> an agent can do. Run every verification command and confirm the expected result before the
> next step. If a STOP condition occurs, stop and report. When done, update the status row in
> `plans/README.md`.
>
> **Drift check (run first)**: open each file in "Current state" and confirm the live content
> matches the excerpt. This is not a git repo, so there is no SHA to diff against. On a
> mismatch, STOP.
>
> **CRITICAL HANDLING RULE**: Do **not** copy any secret value into commits, logs, PR text,
> or this plan. Reference credentials by location and type only.

## Status
- **Priority**: P1
- **Effort**: M (rotation is mostly console work)
- **Risk**: MED — rotating live credentials can break the running service if the new values
  aren't deployed in lockstep. Coordinate a maintenance window.
- **Depends on**: none (do this first of all)
- **Category**: security
- **Planned at**: working tree, 2026-06-24 (no VCS)

## Why this matters

`telegram-premium-server/.env` contains **live** credentials in plaintext, and the Dockerfile
copies them into every image layer. A second, different live Redis password is hardcoded in
two source files. Anyone with the repo, a built image, or a CI log has full read/write to the
production database, the S3 bucket, the email account, and uncapped spend on the OpenAI key.
These credentials must be treated as already compromised. Rotation + removing the leak paths is
the only remediation — deleting the file is not enough once a secret has been exposed.

## Current state

- `telegram-premium-server/.env` — committed/present plaintext file holding (by **type**, not value):
  MongoDB Atlas URI w/ user+password (line 1), Redis Cloud host w/ embedded password (line 2),
  `JWT_SECRET` (line 5), `JWT_CACHE_ENCRYPTION_KEY` (line 7), Razorpay key id+secret (lines 8–9),
  `TG_DEV_API_KEY` (line 10), AWS access key id + secret (lines 13–14), `OPENAI_API_KEY` (line 17),
  Gmail app password + user (lines 18–19), `ADMIN_JWT_SECRET` (line 33). **Note:** `JWT_SECRET`
  and `ADMIN_JWT_SECRET` currently hold the *same* value — Plan 003 fixes that; here, rotate both.
- `telegram-premium-server/src/check-processors.ts:6-12` — hardcodes a Redis Cloud host + password:
  ```ts
  const scrapeQueue = new Bull('scrape-queue', {
    redis: {
      host: 'redis-...redis-cloud.com',
      port: <port>,
      password: '<HARDCODED SECRET — do not reproduce>'
    }
  });
  ```
- `telegram-premium-server/src/clear-failed-jobs.ts` — same hardcoded Redis credentials pattern.
- `telegram-premium-server/.dockerignore` — currently only:
  ```
  node_modules
  npm-debug.log
  error.log
  ```
  It does **not** exclude `.env` or `auth/`, and `Dockerfile:7` is `COPY . .` → secrets baked in.
- `telegram-premium-server/.gitignore` already lists `.env` and `auth/` (good — but the files
  are present on disk in this working tree regardless).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck (backend) | `cd telegram-premium-server && npx tsc --noEmit` | exit 0, no errors |
| Find any other hardcoded secrets | `cd telegram-premium-server && grep -rnE "redis-cloud\.com|AKIA|sk-proj-|mongodb\+srv" src` | only env-driven refs remain |

## Scope

**In scope:**
- `telegram-premium-server/.dockerignore` (edit)
- `telegram-premium-server/src/check-processors.ts` (edit — remove hardcoded creds)
- `telegram-premium-server/src/clear-failed-jobs.ts` (edit — remove hardcoded creds)
- `telegram-premium-server/.env.example` (create — keys only, no values)
- Cloud-console credential rotation (human operator)

**Out of scope:**
- Do NOT commit any rotated value anywhere. New values live only in the deployment's runtime
  env (PM2 ecosystem env on the server / secrets manager).
- Do NOT change application logic that *reads* `process.env` (that's correct already).
- Razorpay key rotation interaction with payments — see Plan 004; here, just rotate the secret.

## Steps

### Step 1 (human operator): rotate every exposed credential
For each of the following, generate a new secret in its provider console and update the
**server runtime environment** (not a committed file):
- MongoDB Atlas: rotate the DB user's password (or create a new user, delete the old).
- Redis Cloud: rotate the password on **both** Redis instances (the one in `.env` line 2 and the
  different one hardcoded in `check-processors.ts`/`clear-failed-jobs.ts`).
- AWS: deactivate+delete the leaked access key, issue a new one (ideally a scoped IAM user/role).
- OpenAI: revoke the leaked key, issue a new one.
- Gmail: revoke the leaked app password, generate a new one.
- Razorpay: roll the key secret (coordinate with Plan 004).
- `JWT_SECRET`, `ADMIN_JWT_SECRET`, `JWT_CACHE_ENCRYPTION_KEY`, `TG_DEV_API_KEY`: generate new
  random values. (Rotating the JWT secrets invalidates existing sessions — expected; do it in
  the maintenance window.)

**Verify**: old credentials no longer authenticate (e.g. old AWS key returns `InvalidAccessKeyId`).

### Step 2: stop baking secrets into the image
Edit `telegram-premium-server/.dockerignore` to add:
```
.env
.env.*
auth/
*.log
error.log
server_output.log
__pycache__/
```
**Verify**: `cd telegram-premium-server && grep -E "^\.env$|^auth/$" .dockerignore` → both present.

### Step 3: remove hardcoded Redis creds from the two scripts
In `src/check-processors.ts` and `src/clear-failed-jobs.ts`, replace the inline `redis: { host, port, password }` object with the shared config used by the app. Import the existing queues instead of re-creating them:
```ts
// at top:
import { scrapeQueue } from './config/redis';
// delete the local `new Bull(...)` with inline credentials.
```
If a standalone connection is genuinely needed, read from `process.env` (e.g. `process.env.REDIS_LOCAL_HOST`), never literals.
**Verify**: `cd telegram-premium-server && grep -rnE "redis-cloud\.com|password:\s*'" src/check-processors.ts src/clear-failed-jobs.ts` → no matches. Then `npx tsc --noEmit` → exit 0.

### Step 4: add `.env.example` (keys only)
Create `telegram-premium-server/.env.example` listing every key from `src/config/index.ts` with
empty/placeholder values and a one-line comment each. **No real values.** Example shape:
```
MONGO_URI=
JWT_SECRET=
ADMIN_JWT_SECRET=
OPENAI_API_KEY=
# ...one line per key read in src/config/index.ts
```
**Verify**: every `process.env.X` key in `src/config/index.ts` appears in `.env.example`:
`cd telegram-premium-server && comm -23 <(grep -oE "process\.env\.[A-Z_]+" src/config/index.ts | sed 's/process.env.//' | sort -u) <(grep -oE "^[A-Z_]+" .env.example | sort -u)` → empty output.

## Test plan
No unit tests (this is config/ops). The verification commands above are the gates.

## Done criteria
- [ ] (operator-confirmed) every credential in `.env` and the two scripts has been rotated; old ones revoked.
- [ ] `.dockerignore` excludes `.env`, `.env.*`, `auth/`, `*.log`.
- [ ] `grep -rnE "redis-cloud\.com|AKIA|sk-proj-|mongodb\+srv" telegram-premium-server/src` returns no hardcoded secrets.
- [ ] `telegram-premium-server/.env.example` exists with all config keys, no values.
- [ ] `npx tsc --noEmit` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- The live `.env` or the two scripts do not match the "Current state" excerpts → STOP (codebase drifted).
- Rotating a credential would take down production and no maintenance window is authorized → STOP and report.
- You discover additional hardcoded secrets the grep surfaces in files not listed here → STOP and report (expand scope deliberately, don't guess).

## Maintenance notes
- After this, secrets enter the app only via runtime env. Document the deploy-time injection in `DEPLOYMENT.md`.
- A future CI pipeline (Plan 007/024) should add a secret-scanner (e.g. gitleaks) as a gate.
- Plan 003 will set the *new, distinct* JWT secrets; ensure the values chosen in Step 1 for
  `JWT_SECRET` and `ADMIN_JWT_SECRET` are different from each other.

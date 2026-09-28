# Plan 024: DX & tooling — typecheck script, hooks, READMEs, .env.example, CLAUDE.md, CI gate

> **Executor instructions**: Several small independent DX improvements; each has its own verify.
> Honor STOP conditions. Update `plans/README.md` when done.
>
> **Drift check (run first)**: confirm the gaps still exist (no `typecheck` script, empty husky
> hooks, thin READMEs). Not a git repo — no SHA diff.

## Status
- **Priority**: P2
- **Effort**: S
- **Risk**: LOW — adds scripts/hooks/docs. The CI gate change affects deploys — coordinate.
- **Depends on**: none (the CI gate is most useful once Plan 006 tests exist)
- **Category**: DX / docs
- **Planned at**: working tree, 2026-06-24 (no VCS)
- **Findings**: L8 (no typecheck script; empty husky hooks; thin READMEs; no .env.example; no CLAUDE.md; push-to-prod CI with no gate — INFRA-H7)

## Why this matters

Slow/missing feedback loops and onboarding friction compound as the team grows: type errors only
surface at build time, husky is installed but runs nothing, the READMEs are boilerplate, there's
no `.env.example`, and CI deploys every push to `main` with no test/typecheck gate (INFRA-H7).
These are cheap to fix and pay back on every commit.

## Current state

- `telegram-premium-server/package.json` — scripts: `build` (runs `tsc`), `lint:fix`, `dev`,
  `start`, `prepare: husky install`. **No `typecheck`**. `.husky/` exists but has only `_/` (no hooks).
- `Telegram-premium-2025/package.json` — `dev/build/lint/preview`. No typecheck (JS project; lint exists).
- `telegram-premium-server/README.md` (~3 lines, just Docker Redis), `Telegram-premium-2025/README.md` (Vite boilerplate).
- No `.env.example` (Plan 001 adds the backend one — this plan ensures both projects have one and READMEs reference it).
- `.github/workflows/deploy.yml` — SSH `git reset --hard` + `npm install` + `npm run build` + `pm2 reload`, **no tests/typecheck**, uses `npm install` not `npm ci`.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Backend typecheck | `cd telegram-premium-server && npm run typecheck` | exit 0 (after adding the script) |
| Hook smoke | make a trivial change and commit | pre-commit runs lint/typecheck |

## Scope
**In scope:** both `package.json` (scripts), `telegram-premium-server/.husky/pre-commit` (create),
both `README.md`, `.env.example` references, root `CLAUDE.md` (create), `.github/workflows/deploy.yml`
(add a gate + `npm ci`). **Out of scope:** containerizing the deploy / multi-host (bigger infra work — note as follow-up).

## Steps

### Step 1: add a typecheck script
Backend `package.json`: add `"typecheck": "tsc --noEmit"`. (Frontend is JS; skip or add a JSDoc/`tsc`
check only if desired.)
**Verify**: `npm run typecheck` runs and exits 0 (or shows real type errors to fix separately — if so, STOP and report them, don't fix here).

### Step 2: wire a pre-commit hook
Create `telegram-premium-server/.husky/pre-commit` running `npm run lint:fix && npm run typecheck`.
Make it executable. (Frontend: optionally a hook running `npm run lint`.)
**Verify**: a trivial commit triggers the hook and it passes/fails as expected.

### Step 3: write real READMEs
For each project, document: prerequisites (Node version, MongoDB, Redis), `npm install`, dev
(`npm run dev`), build, test (`npm test` once Plan 006 lands), and env setup ("copy `.env.example`
to `.env`"). Keep it accurate to the actual scripts.
**Verify**: every command in the README exists in `package.json`.

### Step 4: ensure `.env.example` in both projects
Backend `.env.example` comes from Plan 001. Add a frontend `.env.example` with `VITE_API_BASE_URL=`.
Reference both from the READMEs.
**Verify**: `.env.example` present in both project roots; no real values.

### Step 5: add a root `CLAUDE.md`
Create a root `CLAUDE.md` summarizing: the two projects + their roles, stack, the dev/build/test/
typecheck/lint commands per project, key conventions (controller→service→repository layering;
`asyncHandler` + global error handler; the decoy single-process constraint), and the critical
paths that lack tests. Keep it concise; it's a map for future agents/engineers.
**Verify**: file exists and the commands in it match `package.json`.

### Step 6: add a CI test/typecheck gate before deploy (INFRA-H7)
In `.github/workflows/deploy.yml`, add a job (or steps) that runs `npm ci && npm run typecheck && npm test`
(once Plan 006 exists) and gate the deploy job on it. Change the on-server `npm install` to `npm ci`
for reproducible installs. (Leave the single-host SSH deploy as-is for now; note multi-host/rollback as follow-up.)
**Verify**: the workflow YAML parses (e.g. `yamllint` or a dry run) and the deploy step `needs:` the test job.

## Test plan
DX changes are verified by the commands above. No unit tests added here (Plan 006 owns that).

## Done criteria
- [ ] `npm run typecheck` exists (backend) and passes.
- [ ] A pre-commit hook runs lint + typecheck.
- [ ] Both READMEs document install/dev/build/test/env accurately.
- [ ] `.env.example` present in both projects; READMEs reference it.
- [ ] Root `CLAUDE.md` exists and is accurate.
- [ ] CI runs typecheck/tests and gates the deploy; on-server install uses `npm ci`.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- `npm run typecheck` surfaces pre-existing type errors → report them as findings; don't fix code in this DX plan.
- The CI change risks breaking the only deploy path and you can't test it safely → land Steps 1–5, and propose the CI change as a reviewed follow-up.

## Maintenance notes
- The CI gate is only as good as the tests (Plan 006) — sequence accordingly.
- Follow-up (not in scope): containerized deploy, a staging environment, and a rollback strategy
  to remove the single-EC2 SPOF (INFRA-H7's larger half).

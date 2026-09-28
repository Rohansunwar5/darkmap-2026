# Plan 023: Repo hygiene — dead code, committed logs, docs sprawl

> **Executor instructions**: Deletion plan. **Before deleting anything, run the "confirm unused"
> grep for that item** — do not delete on the audit's say-so alone (the repo may have drifted).
> Honor STOP conditions. Update `plans/README.md` when done.
>
> **Drift check (run first)**: confirm the dead files listed still exist and are still unreferenced.

## Status
- **Priority**: P3
- **Effort**: S
- **Risk**: LOW — removing genuinely-unused files. The risk is deleting something an external
  process (CI, cron, ops) depends on — hence the per-item confirmation.
- **Depends on**: 001 (rotate the creds the dead scripts contain before touching/removing them)
- **Category**: tech-debt / docs
- **Planned at**: working tree, 2026-06-24 (no VCS)
- **Findings**: L3 (committed logs, dead TS scripts, `__pycache__`), L4 (orphaned Python), L8-docs (doc sprawl)

## Why this matters

The repo carries ~900 lines of dead code and committed artifacts: orphaned Python scripts never
referenced by either app, one-off TS scripts (with hardcoded creds — see Plan 001), committed log
files, compiled `__pycache__`, and unused frontend components. Plus 9 design `.md` files sprawled
at the repo root (with at least one duplicated notification-system doc). This is pure
confusion/onboarding cost for a growing team, and the committed logs may contain sensitive data.

## Current state

- Orphaned Python (no importer in either `src`): `telegram-backup/{additonalchannel,msg,telethondynamo,tg-2,tg}.py`,
  `check_custom_accounts.py`, and `custom_account_status.json` (contains **real phone numbers** — treat as sensitive).
- `__pycache__/` at repo root (compiled bytecode).
- Committed logs: `telegram-premium-server/error.log`, `telegram-premium-server/server_output.log`,
  `telegram-premium-server/src/processors/error.log`.
- One-off TS scripts: `telegram-premium-server/src/check-processors.ts`, `.../clear-failed-jobs.ts`
  (creds scrubbed by Plan 001; decide keep-in-`scripts/` vs delete).
- Frontend possibly-unused: `Telegram-premium-2025/build-trigger`, and components flagged unused
  (`Buttons.jsx`, `Randombutton.jsx` per the audit) — **re-verify** before removing.
- Root docs: `decoychat.md`, `decoy-improvements-plan.md`, `feature.md`, `fixes.md`, `understand.md`,
  `DEPLOYMENT.md`, `NOTIFICATION-SYSTEM-OVERVIEW.md`, `NOTIFICATION-SYSTEM-USER-FLOW.md`,
  `OPERATOR-STEERING-FEATURE.md` + organized `docs/superpowers/*`.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Confirm a component unused | `cd Telegram-premium-2025 && grep -rn "Randombutton\|Buttons" src` | only its own file (→ safe) |
| Confirm a Python file unused | `grep -rn "additonalchannel\|telethondynamo" . --include=*.py --include=*.ts --include=*.json` | no importer |
| Builds still green | `cd Telegram-premium-2025 && npm run build` / `cd telegram-premium-server && npm run build` | exit 0 |

## Scope
**In scope:** deleting confirmed-dead files; relocating one-off scripts into `scripts/`; moving
root design docs into `docs/`. **Out of scope:** rewriting doc *content*; deleting anything that a
grep shows is still referenced.

## Steps

### Step 1: purge committed logs + bytecode and ignore them
Delete `error.log`, `server_output.log`, `src/processors/error.log`, and `__pycache__/`. Confirm
`.gitignore`/`.dockerignore` already exclude `*.log` and `__pycache__` (Plan 001 added the dockerignore entries).
**Verify**: `find . -name "*.log" -not -path "*/node_modules/*"` → none tracked; `find . -name __pycache__` → none.

### Step 2: relocate or remove the one-off TS scripts
After Plan 001 scrubbed their creds, move `check-processors.ts`/`clear-failed-jobs.ts` to a
`telegram-premium-server/scripts/` dir (out of `src/`, so they're not part of the build) or delete
if obsolete. If kept, ensure they read config from env.
**Verify**: `npm run build` (backend) → 0; `grep -rn "check-processors\|clear-failed-jobs" src` → no imports.

### Step 3: handle orphaned Python + sensitive JSON
Confirm `telegram-backup/*.py` and `check_custom_accounts.py` are unreferenced. If they're
genuinely legacy, move them to a clearly-labeled `legacy/` dir or delete. **`custom_account_status.json`
contains real phone numbers** — remove it from the working tree (and confirm it isn't needed at runtime).
**Verify**: `grep -rn "custom_account_status" .` → no code reads it.

### Step 4: remove confirmed-unused frontend files
Re-verify `Buttons.jsx`/`Randombutton.jsx`/`build-trigger` are unused (grep + check CI doesn't
touch `build-trigger`), then remove.
**Verify**: `npm run build` (frontend) → 0.

### Step 5: consolidate docs
Move the 9 root `*.md` design docs into `docs/` (e.g. `docs/design/`), and reconcile the two
notification-system docs against `docs/superpowers/specs/2026-06-05-notification-system-design.md`
(keep one source of truth). Add a `docs/README.md` index. Keep top-level `README`s in place.
**Verify**: repo root no longer has the scattered design `.md`s; `docs/README.md` links them.

## Test plan
No unit tests. The build commands + grep confirmations are the gates. After each deletion batch,
both projects must still build.

## Done criteria
- [ ] No committed `*.log` or `__pycache__` in the tree.
- [ ] One-off TS scripts moved out of `src/` (or removed); backend still builds.
- [ ] Orphaned Python relocated/removed; `custom_account_status.json` (real PII) removed.
- [ ] Confirmed-unused frontend files removed; frontend still builds.
- [ ] Root design docs consolidated under `docs/`; duplicate notification doc reconciled.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- A grep shows a "dead" file is actually imported/referenced → keep it, report.
- `build-trigger` is referenced by the deploy webhook/CI → keep it.
- Any Python script is invoked by an external cron/ops process you can't rule out → STOP and ask before deleting.

## Maintenance notes
- Add `*.log`, `__pycache__/`, `*.pyc` to both `.gitignore`s if not already (Plan 001 covered dockerignore).
- A reviewer should treat any future committed log/credential file as a blocker.

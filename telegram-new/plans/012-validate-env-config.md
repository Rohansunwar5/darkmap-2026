# Plan 012: Validate environment configuration at boot

> **Executor instructions**: Follow step by step; run each verification. Honor STOP conditions.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**: open `src/config/index.ts` and confirm it matches the excerpt
> (non-null `!` assertions). Not a git repo — no SHA diff. On mismatch, STOP.

## Status
- **Priority**: P2
- **Effort**: S
- **Risk**: LOW — adds boot-time validation. The one behavioral change: the server now fails
  fast at startup if a required var is missing (previously it crashed later, deep in a handler).
- **Depends on**: none
- **Category**: architecture / DX
- **Planned at**: working tree, 2026-06-24 (no VCS)

## Why this matters

`src/config/index.ts` reads every env var with a non-null assertion (`process.env.X! as string`).
That assertion is a compile-time lie — at runtime a missing var is `undefined`, and the failure
surfaces far away (e.g. `jwt.verify(token, undefined)` or a Mongo connect error) with a confusing
message. Validating once at boot turns a class of late, cryptic failures into one clear startup
error, and documents exactly which vars are required.

## Current state

- `telegram-premium-server/src/config/index.ts:1-47` — `dotenv.config()` then a `config` object
  built with `process.env.X! as string` for ~20 keys (MONGO_URI, JWT_SECRET, AWS_*, OPENAI_API_KEY,
  ADMIN_JWT_SECRET, etc.), plus a few with `|| default` fallbacks and `Number(...)` coercions.
- No validation library installed. `eslint-disable @typescript-eslint/no-non-null-assertion` at top.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Install | `cd telegram-premium-server && npm install zod` | exit 0 |
| Typecheck | `cd telegram-premium-server && npx tsc --noEmit` | exit 0 |
| Boot-fail smoke | `cd telegram-premium-server && MONGO_URI= node -e "require('ts-node/register'); require('./src/config')"` | throws a clear "MONGO_URI required" error |

## Scope
**In scope:** `src/config/index.ts`, `package.json` (add `zod`).
**Out of scope:** changing how the rest of the app reads `config` (the exported shape stays the
same — same keys, same types). Don't refactor consumers.

## Steps

### Step 1: add zod and a schema
Install `zod`. In `config/index.ts`, after `dotenv.config()`, define a schema that mirrors the
current keys: required strings for the secrets/URIs, optional-with-default for the `|| default`
ones, coerced numbers for the port/timeout vars, and `z.enum`/coerced booleans where applicable.
Parse `process.env` with it and build `config` from the parsed result.
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: fail fast with a readable message
On `schema.safeParse` failure, log the missing/invalid keys (names only — **never** values) and
`process.exit(1)` (or throw). Remove the `no-non-null-assertion` eslint-disable and the `!`
assertions, since the parsed object is now typed and guaranteed.
**Verify**: the boot-fail smoke command above prints a clear error naming the missing var and exits non-zero.

### Step 3: keep the exported shape identical
Ensure `export default config` still exposes the same keys with the same types the rest of the
code already uses (compare against the current object). No consumer should need changes.
**Verify**: `npx tsc --noEmit` → 0 (a changed shape would surface as type errors across consumers).

## Test plan
(Uses Plan 006 harness, optional.) `src/config/__tests__/config.test.ts`:
- parsing a complete env object yields the expected typed config.
- parsing with `JWT_SECRET` removed throws / exits with a message naming `JWT_SECRET`.
(Use `schema.safeParse` directly so the test doesn't `process.exit`.) Verify: `npm test -- config` → pass.

## Done criteria
- [ ] `config/index.ts` validates env via zod at boot and fails fast with a key-named error.
- [ ] No `!` non-null assertions remain in `config/index.ts`; the eslint-disable is removed.
- [ ] Exported `config` shape unchanged; `npx tsc --noEmit` exits 0.
- [ ] No secret values appear in any log/error the validator emits.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- Some config key is read elsewhere with a type the schema would narrow differently → match the
  existing usage; if genuinely ambiguous, STOP and report.
- `src/config/index.ts` doesn't match the excerpt → STOP.

## Maintenance notes
- New env var → add one line to the schema; it's now self-documenting and enforced.
- Pairs with the `.env.example` from Plan 001 — keep them in sync (the schema is the source of truth).

# Plan 007: Remove the `crypto` npm package

> **Executor instructions**: Small, high-value change. Run each verification. Honor STOP
> conditions. Update `plans/README.md` when done.
>
> **Drift check (run first)**: confirm `package.json` still lists `"crypto"`. If absent, STOP — already done.

## Status
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — removes a redundant package; the built-in module is used identically. The only
  risk is a build that somehow relied on the stub (it shouldn't).
- **Depends on**: none
- **Category**: security / dependencies
- **Planned at**: working tree, 2026-06-24 (no VCS)

## Why this matters

`telegram-premium-server/package.json:27` declares `"crypto": "^1.0.1"`. The npm `crypto`
package is a deprecated placeholder of the old userland module; with it installed,
`import crypto from 'crypto'` can resolve to the stub instead of Node's built-in core module in
some toolchains. The built-in is used on **security-critical paths** — JWT-cache encryption
(`crypto.service.ts`) and **Razorpay signature verification** (`payment.service.ts`). A stub
resolving there is a silent correctness/security footgun.

## Current state

- `telegram-premium-server/package.json:27` — `"crypto": "^1.0.1",` in `dependencies`.
- `telegram-premium-server/src/services/crypto.service.ts:1` — `import crypto from 'crypto';`
- `telegram-premium-server/src/services/payment.service.ts:1` — `import crypto from 'crypto';`
- `nanoid` and others also use crypto indirectly. Node core provides `crypto` natively — no package needed.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Remove dep | `cd telegram-premium-server && npm uninstall crypto` | exit 0; removed from package.json |
| Typecheck | `cd telegram-premium-server && npx tsc --noEmit` | exit 0 |
| Build | `cd telegram-premium-server && npm run build` | exit 0 |

## Scope
**In scope:** `telegram-premium-server/package.json`, `package-lock.json` (via npm).
**Out of scope:** the `import crypto from 'crypto'` lines — they stay; they now unambiguously
resolve to the built-in.

## Steps

### Step 1: uninstall the package
`npm uninstall crypto`.
**Verify**: `grep -n '"crypto"' telegram-premium-server/package.json` → no match.

### Step 2: confirm everything still compiles and builds
`npx tsc --noEmit` then `npm run build`.
**Verify**: both exit 0. If Plan 006 is done, also `npm test` → crypto round-trip test still passes.

## Test plan
- Relies on Plan 006's `crypto.test.ts` (encode/decode round-trip) as the regression guard. If
  006 isn't done, the build + a manual `node -e "const c=require('crypto'); console.log(typeof c.createHmac)"` → prints `function`.

## Done criteria
- [ ] `"crypto"` no longer in `package.json` dependencies.
- [ ] `npx tsc --noEmit` and `npm run build` exit 0.
- [ ] (if 006 done) crypto round-trip test passes.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- Removing the package causes a type or build error → STOP and report (would indicate something genuinely imported the stub's typings).

## Maintenance notes
- Node core modules never belong in `dependencies`. A reviewer should reject any future PR
  adding `crypto`, `os`, `path`, etc. as packages.

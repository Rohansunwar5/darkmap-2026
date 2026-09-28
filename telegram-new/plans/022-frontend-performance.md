# Plan 022: Frontend performance — lazy-load heavy exports, fix socket effect deps

> **Executor instructions**: Follow step by step; run each verification. Honor STOP conditions.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**: open the files in "Current state" and confirm they match. Not a
> git repo — no SHA diff. On mismatch, STOP.

## Status
- **Priority**: P3
- **Effort**: S
- **Risk**: LOW — code-splitting and an effect-deps fix; the export features must still work on demand.
- **Depends on**: none
- **Category**: performance / frontend
- **Planned at**: working tree, 2026-06-24 (no VCS)
- **Findings**: L7 (eager heavy deps in bundle; socket effect re-creation)

## Why this matters

`xlsx` (SheetJS, hundreds of KB) and `jspdf` (~1.5 MB) are imported eagerly but only used for
on-demand export, so every user downloads them on first load even if they never export. And
`useDecoySocket` keys its effect on `JSON.stringify(sessionIds)`, which produces a new string each
render — churning the socket connection (teardown/recreate) and risking dropped real-time messages.

## Current state

- `Telegram-premium-2025/src/components/Common/utils.jsx` — top-level `import` of `xlsx` (and the
  export uses `XLSX.utils.book_new()` / `XLSX.write()`).
- `jspdf` imported eagerly where PDF export lives (e.g. `src/components/Results.jsx` export flow).
- `src/hooks/useDecoySocket.jsx:70` — effect dependency `[JSON.stringify(sessionIds)]`.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Build | `cd Telegram-premium-2025 && npm run build` | exit 0 |
| Lint | `cd Telegram-premium-2025 && npm run lint` | exit 0, 0 warnings |

## Scope
**In scope:** the export utility/component (lazy-load `xlsx`/`jspdf`), `src/hooks/useDecoySocket.jsx`.
**Out of scope:** replacing `xlsx` itself (that's Plan 019's CVE work — coordinate, but the
lazy-load here applies to whatever export lib ends up used).

## Steps

### Step 1: lazy-load the export libraries
Convert the top-level `import` of `xlsx`/`jspdf` to dynamic `import()` inside the export handler,
e.g.:
```js
const handleExportXlsx = async (...) => {
  const XLSX = await import('xlsx');
  // ...use XLSX...
};
```
Show a brief loading state while the chunk loads. Vite will split these into separate chunks.
**Verify**: `npm run build` → 0; the build output shows `xlsx`/`jspdf` in separate chunks, not the main bundle.

### Step 2: fix the socket effect dependency
In `useDecoySocket.jsx`, replace `[JSON.stringify(sessionIds)]` with a stable dependency — either
`[sessionIds.join(',')]` or memoize `sessionIds` upstream with `useMemo` and depend on the memo.
Ensure the socket connects/subscribes only when the actual set of session ids changes.
**Verify**: `npm run lint` → 0 warnings (no exhaustive-deps violation); `npm run build` → 0.

## Test plan
- Manual: open the decoy console, switch between sessions, confirm the socket does **not** tear
  down on every render (e.g. via a connection-count log or devtools) and messages keep arriving.
- Manual: trigger an export; confirm the file still downloads correctly after the dynamic import.
- (Optional, Plan 006) a render test asserting `useDecoySocket`'s effect doesn't re-run when
  `sessionIds` is referentially new but value-equal.

## Done criteria
- [ ] `xlsx`/`jspdf` are dynamically imported; they no longer appear in the main entry chunk.
- [ ] `useDecoySocket` effect depends on a value-stable key; no socket churn on unrelated renders.
- [ ] Exports still work; real-time messages still arrive across session switches.
- [ ] `npm run lint` (0 warnings) and `npm run build` exit 0; `plans/README.md` updated.

## STOP conditions
- A file doesn't match its excerpt → STOP.
- The export is used somewhere that can't be made async easily (e.g. a synchronous render path) → STOP and report.

## Maintenance notes
- Pair with Plan 019 Step 5 (xlsx CVE): whichever export lib remains should be the one lazy-loaded.
- Reviewer: check the bundle analyzer output before/after to confirm the split landed.

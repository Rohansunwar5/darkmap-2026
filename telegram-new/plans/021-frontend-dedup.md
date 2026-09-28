# Plan 021: De-duplicate frontend components & add a BaseRepository

> **Executor instructions**: Follow step by step; run each verification. Honor STOP conditions.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**: confirm the 4 MessageBox + 4 IOC components still exist with the
> duplicated patterns. Not a git repo — no SHA diff.

## Status
- **Priority**: P3
- **Effort**: M
- **Risk**: LOW–MED — consolidation must preserve each component's per-source differences (field
  labels, data shapes). Visual regression possible if props aren't mapped carefully.
- **Depends on**: 008 (the safe highlighter must exist first, so dedup consolidates a *correct* helper)
- **Category**: tech-debt
- **Planned at**: working tree, 2026-06-24 (no VCS)
- **Findings**: L6 (duplicated components; no BaseRepository)

## Why this matters

Four `MessageBox` components and four `IOC` components are ~60–70% identical copy-paste; the XSS
bug (Plan 008) existed in four places because of it. Every change to highlighting or IOC layout
is a four-file edit with drift risk. On the backend, each repository re-implements the same CRUD
boilerplate. Consolidating removes ~hundreds of lines and a class of "fixed it in 3 of 4 places" bugs.

## Current state

- `src/components/MessageBox/{BreachForumsBox,DarwebForumsBox,RansomewareBox,TelegramBox}.jsx` —
  each had its own `highlightQueryInText` + `truncateToFirst20Words` (Plan 008 replaces the
  highlight with `src/utils/highlight.jsx`; this plan removes the remaining duplication).
- `src/components/IOC/{TelegramIoc,BreachForumIoc,DarkwebIoc,RansomewareIoc}.jsx` — near-identical
  IOC detail panels differing mainly in field labels.
- `src/repository/*.ts` (backend) — admin/bookmark/decoyAccount/decoySession/notification/
  telegramAccount/user each repeat `findById`/`create`/`update`/`delete` shapes.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Frontend lint+build | `cd Telegram-premium-2025 && npm run lint && npm run build` | exit 0 |
| Backend typecheck | `cd telegram-premium-server && npx tsc --noEmit` | exit 0 |

## Scope
**In scope:** the 8 frontend components + shared helpers/components they extract into; optionally a
backend `repository/base.repository.ts`. **Out of scope:** changing what data is fetched/displayed.
Do the frontend and backend halves as separate increments.

## Steps

### Step 1: finish the MessageBox shared helper (frontend)
After Plan 008, ensure all 4 MessageBox components import `truncateToFirst20Words` and the
`HighlightedText` component from shared utils (`src/utils/highlight.jsx` / a `messageFormat` util)
rather than redefining them. Remove the local copies.
**Verify**: `grep -rn "truncateToFirst20Words\s*=" src/components/MessageBox` → no local definitions; `npm run build` → 0.

### Step 2: extract a shared IOC detail component
Create `src/components/IOC/IocDetailPanel.jsx` accepting `title` + a `fields` array (label/value
pairs) + optional style props. Migrate the 4 IOC components to render it with their source-specific
field mappings. Preserve each one's exact labels/order.
**Verify**: `npm run build` → 0; visual smoke of each IOC view (manual) shows unchanged layout.

### Step 3 (backend, optional increment): BaseRepository
Add `src/repository/base.repository.ts` with generic `findById/findOne/create/update/delete` over
a Mongoose model. Migrate one repository (e.g. `bookmark.repository.ts`) to extend it as a proof,
keeping its specialized query methods. Don't migrate all seven in one pass.
**Verify**: `npx tsc --noEmit` → 0; if Plan 006 done, repository tests still pass.

## Test plan
- (Frontend) the highlight test from Plan 008 now also guards the shared helper used by all 4.
- (Backend) if 006 done: the migrated repository's tests pass unchanged.

## Done criteria
- [ ] No duplicated `highlightQueryInText`/`truncateToFirst20Words` in MessageBox components.
- [ ] 4 IOC components render a shared `IocDetailPanel`; layouts unchanged.
- [ ] (if done) one repository extends `BaseRepository` with no behavior change.
- [ ] Builds/typecheck green; `plans/README.md` updated.

## STOP conditions
- An IOC component has a structural difference that doesn't fit the shared panel cleanly → keep it
  separate and report, rather than contorting the shared component.
- Plan 008 hasn't landed (the highlighter is still the unsafe version) → STOP; do 008 first.

## Maintenance notes
- New result source = one new field mapping, not a new copy-pasted file.
- Reviewer: diff the rendered output of each migrated component against the original.

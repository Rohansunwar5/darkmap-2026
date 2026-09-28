# Plan 014: Bound unbounded document arrays

> **Executor instructions**: Follow step by step; run each verification. Honor STOP conditions.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**: open the files in "Current state" and confirm they match. Not a
> git repo — no SHA diff. On mismatch, STOP.

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: MED — touches how decoy messages are persisted; the chat history must remain
  correct and complete enough for the AI context. Don't drop data users still need.
- **Depends on**: 006 (soft)
- **Category**: database
- **Planned at**: working tree, 2026-06-24 (no VCS)
- **Findings**: M9 (unbounded `decoySession.messages`; `user.clickCount` minor)

## Why this matters

`decoySession.messages` is an embedded array with no cap. A long decoy conversation grows the
document until it approaches MongoDB's 16 MB hard limit, at which point **writes fail** and the
session breaks; every full-document read also loads the entire history into memory. This is the
most likely data-loss/outage path under real usage. (`user.clickCount` grows ~12 entries/year —
low urgency, included for completeness.)

## Current state

- `src/models/decoySession.model.ts:93-96` — `messages: { type: [messageSchema], default: [] }` (unbounded).
- Indexes: `{userId,status}`, `{status}` (`:109-111`).
- `src/repository/decoySession.repository.ts` — `appendMessages` uses `$push`/`$each` (open it to
  confirm the exact method and whether `findForPolling` already uses `$slice`).
- `src/services/decoyBot.service.ts:537` — `await this.sessionRepo.appendMessages(sessionId, targetMessages)`.
- `src/models/user.model.ts:32-40` — `clickCount` array (year/month/count/resetAt), default `[]`.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `cd telegram-premium-server && npx tsc --noEmit` | exit 0 |

## Scope
**In scope:** `src/repository/decoySession.repository.ts` (cap the array on append),
`src/models/decoySession.model.ts` (optional: doc comment on the cap), optionally a small
migration/trim script, and a `clickCount` trim on update in the user repository.
**Out of scope:** moving messages to a separate collection (that's a bigger redesign — note as a
follow-up if the cap proves insufficient). Don't change the AI context-window logic.

## Steps

### Step 1: cap `messages` on append with `$slice`
In `appendMessages`, change the `$push` to `{ $push: { messages: { $each: newMsgs, $slice: -MAX } } }`
with `MAX` set generously (e.g. 1000) so the document keeps the most recent N messages and can
never exceed the 16 MB limit. Confirm the AI context builder reads from the tail (it already
slices recent history in `decoyAI.service.ts`), so capping the head is safe.
**Verify**: `npx tsc --noEmit` → 0; the append query includes `$slice`.

### Step 2: decide on older-message retention
If full transcripts must be retained for evidentiary value, the trimmed-off head should be
archived (out of scope here — note it). If not, the `$slice` cap is sufficient. Document the
decision in a comment on the schema field.
**Verify**: comment present; no behavioral regression in the AI reply path (manual smoke or the decoy AI unit test).

### Step 3: bound `clickCount`
In the user repository method that pushes a monthly `clickCount` entry, apply `$slice: -24`
(keep two years). Low risk; small array.
**Verify**: `npx tsc --noEmit` → 0.

## Test plan
(Uses Plan 006.) Repository test (in-memory Mongo or mock):
- appending messages beyond `MAX` keeps exactly the most recent `MAX`, newest last.
- `clickCount` never exceeds 24 entries after repeated monthly pushes.
Verify: `npm test -- decoySession` → pass.

## Done criteria
- [ ] `appendMessages` caps `messages` via `$slice`; the document can't grow unbounded.
- [ ] `clickCount` capped to the last 24 entries.
- [ ] Decoy AI reply path still has the recent history it needs (smoke/test).
- [ ] `npx tsc --noEmit` exits 0; tests pass.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- The product requires full, immutable transcripts (legal/evidentiary) → STOP and report; the cap
  must be paired with archival to a separate store before trimming, which is a bigger plan.
- `findForPolling`/AI context reads from the **head** of `messages` rather than the tail → STOP
  (capping the head would drop needed context); reconcile the read direction first.
- A "Current state" file doesn't match its excerpt → STOP.

## Maintenance notes
- If sessions routinely hit the cap, promote messages to their own collection keyed by sessionId
  (the proper long-term shape). Track as a follow-up.
- Reviewer: confirm the AI still receives the right window of recent messages after the cap.

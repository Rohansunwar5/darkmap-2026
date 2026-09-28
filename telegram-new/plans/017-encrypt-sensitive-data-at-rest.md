# Plan 017: Encrypt sensitive target-chat data at rest (DESIGN / SPIKE)

> **Executor instructions**: This is a **design/spike plan**, not a build plan. Produce the
> investigation output and a follow-up implementation plan; do **not** implement encryption in
> this pass. Update `plans/README.md` when done.
>
> **Drift check (run first)**: confirm the data model still stores plaintext chat content. Not a
> git repo — no SHA diff.

## Status
- **Priority**: P3
- **Effort**: M (spike) — implementation effort estimated as an output of the spike
- **Risk**: n/a for the spike; the eventual implementation is HIGH (touches read/write of all chat data)
- **Depends on**: none
- **Category**: security
- **Planned at**: working tree, 2026-06-24 (no VCS)
- **Findings**: M12 (sensitive target chat content + PII stored unencrypted)

## Why this matters

The platform stores undercover chat transcripts with targets — content that may include personal
data, contact details, and operational intelligence — as plaintext in MongoDB
(`decoySession.messages`). `custom_account_status.json` at repo root even contains real phone
numbers. On a database breach, all of it is exposed. Beyond breach risk, holding sensitive PII
plaintext carries regulatory exposure. The right response needs a deliberate design decision
(what to encrypt, where keys live, searchability tradeoffs), not an ad-hoc code change — hence a
spike.

## Current state

- `src/models/decoySession.model.ts` — `messages` (array of `{ role, content, ... }`) stored plaintext.
- `src/repository/decoySession.repository.ts` — `appendMessages` / read methods (the encrypt/decrypt boundary if field-level encryption is chosen).
- `src/services/crypto.service.ts` — already implements AES-256-CBC `encode`/`decode` (could be
  reused or upgraded to AES-256-GCM for authenticated encryption).
- Mongo is Atlas — note: Atlas offers encryption-at-rest at the storage layer and Client-Side
  Field Level Encryption (CSFLE) as alternatives to app-level encryption.

## Scope (of the spike)
**In scope:** investigation + a written recommendation + a follow-up implementation plan file.
**Out of scope:** any code change to encryption.

## Steps (investigation)

### Step 1: classify the sensitive fields
List exactly which fields hold sensitive data (decoy message `content`, target identifiers,
phone numbers, any stored session strings) and where they're read/written.

### Step 2: evaluate the options, with tradeoffs
Compare at least: (a) Atlas storage-level encryption-at-rest (cheap, protects disk/backups, not
a logical-breach defense), (b) MongoDB CSFLE / queryable encryption (protects against DB-admin /
logical breach; complicates queries), (c) app-level field encryption at the repository boundary
reusing `crypto.service` upgraded to AES-GCM (full control; loses server-side search on encrypted
fields; key management burden). State what each protects against and what it costs (query
limitations, key rotation, performance).

### Step 3: decide key management
Where does the data key live (KMS / env / Atlas)? How is it rotated? (Note: the previous key
material was in the leaked `.env` — Plan 001; any new keys must be in a managed store.)

### Step 4: write the follow-up implementation plan
Produce `plans/0XX-implement-data-encryption.md` (next free number) using the standard template,
scoped to the chosen option, including a migration approach for existing plaintext documents and
a test plan. Also recommend a retention/purge policy (e.g. auto-delete transcripts older than N days).

## Done criteria
- [ ] A written field classification + options analysis with tradeoffs (in this plan or a sibling doc).
- [ ] A recorded recommendation with rationale.
- [ ] A follow-up implementation plan file created (or a clear "deferred, here's why").
- [ ] `plans/README.md` status row updated (and the new plan added if created).

## STOP conditions
- The team already has an encryption standard/ADR → adopt it; don't re-decide.
- If classification reveals the sensitive data also flows to S3/logs unencrypted → record that as
  a new finding (broader scope than this plan).

## Maintenance notes
- Encryption interacts with the array-cap work (Plan 014) and any search features over messages —
  the spike should note those couplings so they're sequenced correctly.

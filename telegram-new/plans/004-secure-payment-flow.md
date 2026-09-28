# Plan 004: Secure the payment verification flow

> **Executor instructions**: Follow step by step; run each verification. Honor STOP conditions.
> Update `plans/README.md` when done.
>
> **Drift check (run first)**: open the files in "Current state" and confirm they match the
> excerpts. Not a git repo — no SHA diff. On mismatch, STOP.

## Status
- **Priority**: P1
- **Effort**: M
- **Risk**: MED — payment path; a bug here either blocks legitimate payments or re-opens the
  abuse. Tests are mandatory in this plan.
- **Depends on**: 006 (soft — write the payment tests here if 006 isn't done yet)
- **Category**: security
- **Planned at**: working tree, 2026-06-24 (no VCS)

## Why this matters

The Razorpay signature only covers `orderId|paymentId`. The credit amount is decided by a
client-supplied `planType`, and the order `amount` is also client-supplied — neither is bound to
the verified payment. There is **no idempotency record**, so a single valid
`{orderId, paymentId, signature}` can be replayed to add credits repeatedly. Net effect: a user
can pay ₹1, claim the top plan, and replay to accumulate unlimited credits. Direct revenue loss.

## Current state

- `telegram-premium-server/src/services/payment.service.ts:7-35`:
  ```ts
  async verifyAndAddCredits(userId, orderId, paymentId, signature, planType) {
    const generatedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${orderId}|${paymentId}`).digest('hex');
    if (generatedSignature !== signature) return { success: false };   // non-constant-time compare
    const creditsToAdd = planType === 'silver' ? 20 : 50;              // planType is client-controlled
    const updatedUser = await this._userRepository.updateUserCredits(userId, creditsToAdd);
    ...
  }
  ```
- `telegram-premium-server/src/controllers/payment.controller.ts:11-42`:
  - `verifyPayment` reads `{ orderId, razorpayPaymentId, razorpaySignature, planType }` from the
    body and `userId = req.user._id` (good — userId is from the token).
  - `createOrder` reads `{ amount, currency }` from the body and creates the Razorpay order with
    `amount * 100`. The amount is fully client-chosen.
- There is no model recording processed payments.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `cd telegram-premium-server && npx tsc --noEmit` | exit 0 |
| Tests | `cd telegram-premium-server && npm test -- payment` | all pass |

## Scope
**In scope:**
- `src/services/payment.service.ts`
- `src/controllers/payment.controller.ts`
- `src/models/processedPayment.model.ts` (create — idempotency ledger)
- a small server-side plan→price map (in the service or a `src/config/plans.ts`)

**Out of scope:**
- Client UI for plan selection (frontend) — out of scope; the server becomes authoritative.
- Razorpay key rotation — handled in Plan 001.

## Steps

### Step 1: make the server authoritative about plans and prices
Create a server-side map, e.g. `src/config/plans.ts`:
```ts
export const PLANS = {
  silver: { amountPaise: 49900, credits: 20 },
  gold:   { amountPaise: 99900, credits: 50 },
} as const;
export type PlanType = keyof typeof PLANS;
```
In `createOrder`, derive `amount` from `PLANS[planType].amountPaise` instead of the client's
`amount`. Reject unknown `planType` with a 400 (`BadRequestError`).
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: bind credits to the actual paid order
In `verifyAndAddCredits`, after the signature check, **fetch the order from Razorpay**
(`razorpayInstance.orders.fetch(orderId)`) and derive credits from the order's `amount` by
reverse-looking-up `PLANS` (match `amountPaise`), not from the client `planType`. If no plan
matches the paid amount, return `{ success: false }`.
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: add idempotency
Create `src/models/processedPayment.model.ts` with a unique index on `paymentId`
(`{ paymentId: String (unique, required), userId, orderId, credits, createdAt }`). In
`verifyAndAddCredits`, before adding credits, attempt to insert the processed-payment record;
on duplicate-key error, return `{ success: false, alreadyProcessed: true }` and do **not** add
credits. Only add credits after the insert succeeds (or wrap insert+credit in a transaction —
see Plan 015 for the transaction pattern).
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: constant-time signature comparison
Replace `generatedSignature !== signature` with `crypto.timingSafeEqual` over equal-length
buffers (guard against length mismatch first). Remove the `|| ''` / `|| 'default_key_secret'`
fallbacks — if the secret is missing, throw at startup (ties into Plan 012 env validation).
**Verify**: `npx tsc --noEmit` → exit 0.

## Test plan
Create `src/services/__tests__/payment.test.ts`:
- valid signature + amount matching `gold` → adds 50 credits, records payment.
- replaying the same `paymentId` → no additional credits (idempotent).
- valid signature but paid amount matches no plan → `{ success: false }`, no credits.
- tampered signature → `{ success: false }`.
Mock `razorpayInstance.orders.fetch` and the user repository. Verify: `npm test -- payment` passes.

## Done criteria
- [ ] Credits are derived from the **verified order amount**, never from a client `planType`.
- [ ] `createOrder` uses server-side prices, not client `amount`.
- [ ] Replaying a processed `paymentId` adds no credits (unique index + insert-first).
- [ ] Signature compared with `crypto.timingSafeEqual`.
- [ ] Tests in `payment.test.ts` pass; `npx tsc --noEmit` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions
- "Current state" files don't match excerpts → STOP.
- The installed `razorpay` SDK version lacks `orders.fetch` with the expected shape → STOP and report (don't guess the API).
- `updateUserCredits` is not idempotent-safe and you can't wrap it in a transaction without Plan 015 → land the unique-index guard anyway, note the residual race in the status row, and report.

## Maintenance notes
- Adding a plan = one entry in `src/config/plans.ts`; price and credits live server-side only.
- Reviewer: confirm no path adds credits without going through the idempotency insert.
- The frontend (Plan 009 area) should send only `planType`, never amount/credits.

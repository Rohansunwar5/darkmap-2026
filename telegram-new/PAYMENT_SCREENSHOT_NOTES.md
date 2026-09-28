# Payment-screenshot generator — compatibility notes

The generator deployed on AWS Lambda is now **`new-payment-script/payment_screenshot-gen/payment.py`**
(replaces the old `payment-script/payment.py`). The telegram-premium-server talks to it via
`src/services/paymentScreenshot.ts` → `PAYMENT_SS_ENDPOINT`.

## What changed in the new script

1. **New optional param `device_name`** — `"apple"` (default) or `"android"`. Picks the template
   (`input/baseimg/apple.png` vs `android.png`) and renders a full status bar + notification banner.
2. **`to_address` is now crypto-only** — it runs through `validate_and_extract_wallet()`:
   - Ethereum `0x…` (with ENS resolution), BTC (`1`/`3`/`bc1…`), Tron (`T…`).
   - **Anything else — UPI, bank account, a plain name — returns HTTP 400.** The old script drew any string.

## Deployment change REQUIRED on the Lambda side

The new script adds a dependency: **`web3`** (`requirements.txt` now has `Pillow` + `web3`; old was Pillow only).
`validate_and_extract_wallet()` does `from web3 import Web3` for any `0x…` address.
- **The Lambda deployment package/layer MUST bundle `web3`**, or every Ethereum address → ImportError → HTTP 500.
  web3 is large with many transitive deps — it will not be present unless explicitly added to the zip/layer.
- ENS resolution calls `ethereum-rpc.publicnode.com` (3s timeout). No Lambda internet route = non-fatal; it
  falls back to a shortened address. So outbound internet is optional, `web3` being installed is not.

## Why the server has NO code change

- We omit `device_name`, so the Lambda defaults to **apple** — which is what we want. (Decision: always apple.)
- Non-crypto `to_address` now 400s, but that's already handled: `generatePaymentScreenshot` is wrapped in
  a try/catch in `decoyBot.service.ts` (~L862), so a rejected address just falls back to a text-only reply.
  No crash, no garbage image.
- All other params (`amount`, `to_address`, `to_id`, `order_id`, `payment_method`) are unchanged.

## DONE: decoy prompt is now crypto-only

`PAYMENT_SS_ADDENDUM` in `decoyAI.service.ts` now tells the model that `to_address` must be a crypto wallet
(Ethereum `0x…`, Bitcoin `1`/`3`/`bc1…`, or Tron `T…`) and to NOT emit the control line for UPI/bank/name
destinations — matching what the new generator accepts.

### If we later want android (or random) screenshots
Add `device_name` as an optional passthrough — three spots:
- `PaymentScreenshotParams` interface + query-param append in `paymentScreenshot.ts`
- read `o.device_name` in `parseParams` (validate against `"apple"|"android"`)
- (optional) teach the model to emit it in the `SEND_PAYMENT_SS` directive, or set it server-side
  (fixed / random per screenshot).

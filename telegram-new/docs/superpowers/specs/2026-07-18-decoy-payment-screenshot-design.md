# Decoy Bot — Auto-Send Payment Screenshot

**Date:** 2026-07-18
**Status:** Approved design (pending user review)

## Goal

While the AI decoy bot is conversing with a scam target, auto-detect when the
target demands proof of payment, extract the payment parameters from the
conversation, generate a fake payment screenshot via the existing external API,
and send it to the target in Telegram to keep the scammer engaged.

## Non-goals

- No explicit / persona imagery. Only payment-screenshot images.
- No new image-generation service — the generator already exists.
- No operator-approval step (auto-send, per decision).

## Existing pieces reused

- `TelegramService.generatePaymentQr(amount, toAddress, {toId, orderId, paymentMethod})`
  → `{ buffer: Buffer, contentType }`, POSTs to the AWS endpoint and returns a PNG.
  Its axios core is lifted into a standalone helper `services/paymentScreenshot.ts`
  so both the `/generate-payment-ss` controller and the decoy bot call one thing
  (no duplication, no pulling `TelegramService` deps into the bot).
- Decoy send path: `DecoyBotService._doReply` in `services/decoyBot.service.ts`,
  which generates reply `parts: string[]` and sends them via gramJS
  `client.sendMessage(entity, ...)`. gramJS `client.sendFile(entity, { file })`
  sends the PNG over MTProto.
- Operator visibility: existing `emitToSession(sessionId, 'decoy:message', msg)`.

## Detection & extraction — control-token piggyback

The reply model already runs once per target turn with full conversation context.
A system-prompt addendum instructs it: when the target is demanding proof of
payment, output as the FIRST line exactly:

```
SEND_PAYMENT_SS: {"amount":"...","to_address":"...","to_id":"...","order_id":"...","payment_method":"..."}
```

(only `amount` and `to_address` required; omit unknown optionals) followed by its
normal in-character chat text on subsequent lines.

Rationale: extracted values feed a *fake* screenshot for baiting, not a real
transaction, so occasional field imperfection only makes bait less convincing —
never a financial error. Zero extra API calls vs. a dedicated extractor.
Upgrade path if extraction proves flaky: replace the parse step with a dedicated
tool-calling extractor; the send path is unaffected.

## Processing in `_doReply`

1. After `parts` are generated, check `parts[0]` for the `SEND_PAYMENT_SS:` prefix.
2. Parse the JSON. **Strip that line from the outgoing text unconditionally** — it
   must never reach the target even if parsing fails.
3. Validate: `amount` and `to_address` present and non-empty; `amount` looks like a
   number/currency string. If invalid → skip the image, send text parts normally.
4. Dedup: per-session guard (last-sent signature = amount+to_address, short cooldown)
   so a model hiccup can't send duplicate screenshots for one request.
5. Generate: `await generatePaymentScreenshot(amount, to_address, opts)` → buffer.
6. Send: `await client.sendFile(entity, { file: buffer })`, then send remaining text
   parts as usual (reads like "paid ✅" + screenshot).
7. Emit a `decoy:message` event marked as an image so the operator panel shows it.
8. Persist the outbound image marker in session history (role: ai, content: '[Payment screenshot sent]').

## Error handling

- Generator/API failure → log, skip the image, still send the text reply (never
  crash the conversation loop; never leave the target hanging).
- Parse failure → strip line, proceed as a normal text reply.

## Testing

- Unit: control-token parser — valid JSON, missing optionals, malformed JSON
  (returns null + line still stripped), missing required fields (rejected).
- Unit: dedup guard — same signature within cooldown is suppressed, different
  signature passes.
- No live OpenAI/Telegram/AWS calls in tests.

## Files touched

- `services/paymentScreenshot.ts` (new) — extracted generator helper + small parser/validator.
- `services/telegram.service.ts` — `generatePaymentQr` delegates to the helper.
- `services/decoyAI.service.ts` — system-prompt addendum documenting the control token.
- `services/decoyBot.service.ts` — detect/parse/generate/send in `_doReply`.

// LD-290 STRIPE_IDEMPOTENCY_KEY_V1 — client-side idempotency key generator.
//
// Stripe's `Idempotency-Key` request header guarantees that retried API
// calls (network blip, app crash mid-checkout, user double-tap) reach the
// same Stripe-side response without creating duplicate Payment Intents.
//
// We pair this with the server-side dedup ledger in
// `functions/src/lib/stripe/dedupe.ts` (which dedups WEBHOOK delivery, a
// separate concern from idempotent client → Stripe POSTs).
//
// Wiring: when the parent checkout flow lands, call
// `generateIdempotencyKey()` once per checkout attempt (NOT per render —
// the key must be stable across retries within an attempt). Persist it in
// the checkout-session state and re-send on every retry within that
// attempt. A new attempt (parent navigates back to start) generates a
// fresh key.
//
// `crypto.randomUUID()` is available on iOS Safari 15.4+ (covers our
// minimum target) and React Native via the Hermes engine ≥ 0.74. Both
// are above our floor; no polyfill required. If a future build needs to
// support an older runtime, fall back to a deterministic `Math.random()`
// + clock-skewed prefix scheme — but that path is intentionally NOT
// shipped today (Rule 19: don't ship error paths until needed).

/**
 * Generate a Stripe-compatible idempotency key (UUID v4 string).
 *
 * Per Stripe docs: keys must be unique per intended request and ≤ 255
 * characters. UUID v4 (36 chars) sits well under that ceiling. Stripe
 * caches the response for 24 hours per key.
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

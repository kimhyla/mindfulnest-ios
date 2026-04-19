/**
 * Unit tests for the Stripe client wrapper.
 *
 * The wrapper's responsibilities under test (per LD-290 CLAUSE 1 + Phase 0
 * counter-mitigations, preflight 115):
 *   - Strips error.raw.request and error.raw.headers BEFORE re-throw
 *     (closes the secret-leak vector that the Stripe SDK introduces).
 *   - Classifies definitive vs retryable failures correctly so attemptSeq
 *     is incremented only when it should be.
 *
 * createPaymentIntent end-to-end is not unit-tested here (requires
 * firebase-admin/firestore and Stripe SDK both stubbed); the chokepoint
 * invariants — sanitization + failure classification — are pure functions
 * exposed via __testing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __testing } from '../client';

const { sanitizeStripeError, isDefinitiveFailure } = __testing;

test('sanitizeStripeError strips error.raw.request (Phase 0 CRITICAL secret-leak mitigation)', () => {
  const err = {
    message: 'card_declined',
    code: 'card_declined',
    statusCode: 402,
    raw: {
      request: { headers: { authorization: 'Bearer sk_live_REDACTED_LEAK' }, body: 'amount=49900' },
      headers: { 'request-id': 'req_xyz' },
      message: 'card_declined',
    },
  };
  const out = sanitizeStripeError(err);
  assert.equal(out.message, 'card_declined');
  assert.equal(out.stripeCode, 'card_declined');
  assert.equal(out.httpStatus, 402);
  assert.equal((err as { raw?: { request?: unknown } }).raw?.request, undefined, 'raw.request stripped');
  assert.equal((err as { raw?: { headers?: unknown } }).raw?.headers, undefined, 'raw.headers stripped');
});

test('sanitizeStripeError handles error with no raw field', () => {
  const out = sanitizeStripeError({ message: 'network failure' });
  assert.equal(out.message, 'network failure');
  assert.equal(out.stripeCode, undefined);
});

test('sanitizeStripeError handles null/undefined input', () => {
  const out1 = sanitizeStripeError(null);
  const out2 = sanitizeStripeError(undefined);
  assert.equal(out1.message, 'Stripe call failed');
  assert.equal(out2.message, 'Stripe call failed');
});

test('isDefinitiveFailure: 402 card_declined → definitive (attemptSeq must increment)', () => {
  assert.equal(isDefinitiveFailure({ statusCode: 402 }), true);
});

test('isDefinitiveFailure: 5xx → definitive (attemptSeq increments to break out of bad-state loop)', () => {
  assert.equal(isDefinitiveFailure({ statusCode: 500 }), true);
  assert.equal(isDefinitiveFailure({ statusCode: 503 }), true);
});

test('isDefinitiveFailure: 429 rate-limit → NOT definitive (caller retries with same key, idempotent)', () => {
  assert.equal(isDefinitiveFailure({ statusCode: 429 }), false);
});

test('isDefinitiveFailure: network timeout (no statusCode) → NOT definitive', () => {
  assert.equal(isDefinitiveFailure({ message: 'ETIMEDOUT' }), false);
});

test('isDefinitiveFailure: 200/201 should not be passed in but defensive — treats as not-definitive', () => {
  assert.equal(isDefinitiveFailure({ statusCode: 200 }), false);
});

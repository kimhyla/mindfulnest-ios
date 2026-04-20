import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIdempotencyKey, parseIdempotencyKey, IdempotencyKeyError } from '../idempotencyKey';

test('buildIdempotencyKey produces childId:sku:attemptSeq', () => {
  const k = buildIdempotencyKey({ childId: 'child_001abcd', sku: 'program_499', attemptSeq: 0 });
  assert.equal(k, 'child_001abcd:program_499:0');
});

test('buildIdempotencyKey is deterministic — same inputs give identical keys (the idempotency invariant)', () => {
  const a = buildIdempotencyKey({ childId: 'child_X12345', sku: 'program_499', attemptSeq: 7 });
  const b = buildIdempotencyKey({ childId: 'child_X12345', sku: 'program_499', attemptSeq: 7 });
  assert.equal(a, b);
});

test('different attemptSeq produces different key (definitive failure -> fresh charge)', () => {
  const a = buildIdempotencyKey({ childId: 'child_X12345', sku: 'program_499', attemptSeq: 0 });
  const b = buildIdempotencyKey({ childId: 'child_X12345', sku: 'program_499', attemptSeq: 1 });
  assert.notEqual(a, b);
});

test('rejects bad childId format', () => {
  assert.throws(() => buildIdempotencyKey({ childId: 'short', sku: 'program_499', attemptSeq: 0 }), IdempotencyKeyError);
  assert.throws(() => buildIdempotencyKey({ childId: 'has spaces!', sku: 'program_499', attemptSeq: 0 }), IdempotencyKeyError);
});

test('rejects bad sku format', () => {
  assert.throws(() => buildIdempotencyKey({ childId: 'child_001abcd', sku: '499', attemptSeq: 0 }), IdempotencyKeyError);
  assert.throws(() => buildIdempotencyKey({ childId: 'child_001abcd', sku: 'PROGRAM_499', attemptSeq: 0 }), IdempotencyKeyError);
});

test('rejects negative or non-integer attemptSeq', () => {
  assert.throws(() => buildIdempotencyKey({ childId: 'child_001abcd', sku: 'program_499', attemptSeq: -1 }), IdempotencyKeyError);
  assert.throws(() => buildIdempotencyKey({ childId: 'child_001abcd', sku: 'program_499', attemptSeq: 1.5 }), IdempotencyKeyError);
  assert.throws(() => buildIdempotencyKey({ childId: 'child_001abcd', sku: 'program_499', attemptSeq: 1001 }), IdempotencyKeyError);
});

test('parseIdempotencyKey roundtrips', () => {
  const original = { childId: 'child_001abcd', sku: 'program_499', attemptSeq: 3 };
  const k = buildIdempotencyKey(original);
  const back = parseIdempotencyKey(k);
  assert.deepEqual(back, original);
});

test('parseIdempotencyKey rejects malformed key', () => {
  assert.throws(() => parseIdempotencyKey('only_one_part'), IdempotencyKeyError);
  assert.throws(() => parseIdempotencyKey('a:b:c:d'), IdempotencyKeyError);
});

// CONTRACT TEST per Phase 0 mitigation: client double-tap simulation invariant.
// Without real Stripe in CI, the testable invariant is "two simultaneous calls
// for the same {childId, sku, attemptSeq} produce identical keys." That equality
// is what triggers Stripe's idempotency layer to return the cached PaymentIntent.
test('CONTRACT: client double-tap produces identical keys (Stripe idempotency invariant)', () => {
  // Simulate two parallel client paths both initiating checkout on attemptSeq=0
  const ctx = { childId: 'child_dbltap1', sku: 'program_499', attemptSeq: 0 };
  const tap1Key = buildIdempotencyKey(ctx);
  const tap2Key = buildIdempotencyKey(ctx);
  assert.equal(tap1Key, tap2Key, 'Both client taps must produce identical Stripe-Idempotency-Key headers');
});

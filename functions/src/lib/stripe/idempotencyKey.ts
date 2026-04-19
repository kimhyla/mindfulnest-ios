/**
 * Stripe idempotency key builder — pure function, no side effects.
 *
 * Per LD-290 STRIPE_IDEMPOTENCY_KEY_V1 (id=300):
 *   key format = `${childId}:${sku}:${attemptSeq}`
 *   - childId: server-known purchase target (NEVER trusted from client input directly)
 *   - sku: product identifier (e.g. "program_499")
 *   - attemptSeq: integer >= 0, increments ONLY on definitive failure
 *
 * Stripe holds idempotency-keyed responses for 24h. Same key + same params =
 * cached response (idempotent). Different keys = new charge.
 *
 * The key is constructed server-side because attemptSeq must be authoritative
 * (client-side increment can drift on app reload / cross-device).
 *
 * Reference: https://docs.stripe.com/api/idempotent_requests
 */

const SKU_PATTERN = /^[a-z][a-z0-9_]{2,40}$/;
const CHILD_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export interface IdempotencyKeyInput {
  readonly childId: string;
  readonly sku: string;
  readonly attemptSeq: number;
}

export class IdempotencyKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyKeyError';
  }
}

export function buildIdempotencyKey(input: IdempotencyKeyInput): string {
  const { childId, sku, attemptSeq } = input;
  if (typeof childId !== 'string' || !CHILD_ID_PATTERN.test(childId)) {
    throw new IdempotencyKeyError('childId must match /^[A-Za-z0-9_-]{8,64}$/');
  }
  if (typeof sku !== 'string' || !SKU_PATTERN.test(sku)) {
    throw new IdempotencyKeyError('sku must match /^[a-z][a-z0-9_]{2,40}$/');
  }
  if (!Number.isInteger(attemptSeq) || attemptSeq < 0 || attemptSeq > 1000) {
    throw new IdempotencyKeyError('attemptSeq must be an integer in [0, 1000]');
  }
  return `${childId}:${sku}:${attemptSeq}`;
}

export function parseIdempotencyKey(key: string): IdempotencyKeyInput {
  const parts = key.split(':');
  if (parts.length !== 3) {
    throw new IdempotencyKeyError('key must have exactly 3 colon-separated parts');
  }
  const [childId, sku, attemptSeqStr] = parts;
  const attemptSeq = Number.parseInt(attemptSeqStr, 10);
  return buildIdempotencyKey({ childId, sku, attemptSeq }) === key
    ? { childId, sku, attemptSeq }
    : (() => { throw new IdempotencyKeyError('key roundtrip failed'); })();
}

/**
 * Stripe SDK wrapper — single chokepoint for all outbound Stripe API calls.
 *
 * Per LD-290 STRIPE_IDEMPOTENCY_KEY_V1 (id=300) CLAUSE 1 and Phase 0 counter
 * mitigations (preflight 115):
 *   - Every Stripe call MUST set Stripe-Idempotency-Key header to
 *     `${childId}:${sku}:${attemptSeq}` per lib/stripe/idempotencyKey.ts.
 *   - attemptSeq increments ONLY on definitive failure (4xx / 5xx /
 *     timeout-budget-exhausted). The increment lives in Firestore at
 *     purchases/{childId}/attempts/{sku} and is updated inside the SAME
 *     runTransaction as the Stripe-call audit record (closes the race that
 *     Counter 2 (a) flagged).
 *   - try/catch wraps every Stripe call. On error: strip error.raw.request,
 *     error.raw.headers BEFORE re-throw or log (closes Counter 2 (c) secret-leak
 *     vector — Stripe SDK errors include request payloads).
 *
 * Direct imports of `stripe` are FORBIDDEN outside this file. Enforced via
 * eslint.config.mjs no-restricted-imports rule. New call sites must call into
 * this module.
 */

import Stripe from 'stripe';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, type Transaction, FieldValue } from 'firebase-admin/firestore';
import { buildIdempotencyKey } from './idempotencyKey';

export const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');

let _client: Stripe | null = null;

function getClient(): Stripe {
  if (_client) return _client;
  const key = STRIPE_SECRET_KEY.value();
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured (defineSecret)');
  }
  _client = new Stripe(key, {
    apiVersion: '2025-02-24.acacia',
    typescript: true,
    maxNetworkRetries: 0,
    timeout: 8000,
  });
  return _client;
}

export interface PurchaseContext {
  readonly childId: string;
  readonly sku: string;
}

export interface CreatePaymentIntentInput extends PurchaseContext {
  readonly amount: number;
  readonly currency: string;
  readonly customerEmail?: string;
  readonly metadata?: Record<string, string>;
}

export class StripeCallError extends Error {
  readonly stripeCode?: string;
  readonly httpStatus?: number;
  constructor(message: string, opts: { stripeCode?: string; httpStatus?: number } = {}) {
    super(message);
    this.name = 'StripeCallError';
    this.stripeCode = opts.stripeCode;
    this.httpStatus = opts.httpStatus;
  }
}

interface RawErrorShape {
  raw?: { request?: unknown; headers?: unknown };
  message?: string;
  code?: string;
  statusCode?: number;
}

function sanitizeStripeError(err: unknown): StripeCallError {
  const e = (err ?? {}) as RawErrorShape;
  if (e.raw && typeof e.raw === 'object') {
    delete e.raw.request;
    delete e.raw.headers;
  }
  return new StripeCallError(e.message ?? 'Stripe call failed', {
    stripeCode: e.code,
    httpStatus: e.statusCode,
  });
}

function isDefinitiveFailure(err: unknown): boolean {
  const e = err as RawErrorShape;
  if (typeof e.statusCode === 'number') {
    if (e.statusCode >= 400 && e.statusCode < 500 && e.statusCode !== 429) return true;
    if (e.statusCode >= 500) return true;
  }
  return false;
}

async function readAttemptSeq(tx: Transaction, ctx: PurchaseContext): Promise<number> {
  const ref = getFirestore()
    .collection('purchases').doc(ctx.childId)
    .collection('attempts').doc(ctx.sku);
  const snap = await tx.get(ref);
  if (!snap.exists) return 0;
  const data = snap.data() as { attemptSeq?: unknown } | undefined;
  return typeof data?.attemptSeq === 'number' ? data.attemptSeq : 0;
}

async function writeAttemptSeq(
  tx: Transaction,
  ctx: PurchaseContext,
  attemptSeq: number,
  outcome: 'success' | 'failure',
  stripeRefId: string | null,
): Promise<void> {
  const ref = getFirestore()
    .collection('purchases').doc(ctx.childId)
    .collection('attempts').doc(ctx.sku);
  tx.set(
    ref,
    {
      attemptSeq,
      lastOutcome: outcome,
      lastStripeRefId: stripeRefId,
      lastUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * createPaymentIntent — outbound idempotent Stripe call.
 *
 * Atomicity contract:
 *   1. runTransaction reads the current attemptSeq for {childId, sku}.
 *   2. Stripe API call runs OUTSIDE the transaction (Stripe is not Firestore).
 *      The transaction is reopened to write the audit record + attemptSeq update.
 *   3. On success: attemptSeq stays the same; idempotency key reused = Stripe
 *      returns the cached PaymentIntent.
 *   4. On definitive failure: attemptSeq += 1 so the next call has a fresh key.
 *   5. On retryable failure (429, network timeout): attemptSeq stays the same;
 *      caller retries with same key (idempotent).
 *
 * NOTE: full two-phase atomicity (Stripe call + Firestore write in one tx) is
 * impossible because Stripe is external. The race that matters — concurrent
 * client double-tap producing two distinct keys — is closed because Stripe's
 * idempotency layer coalesces same-key requests (they get the same
 * PaymentIntent ID), regardless of how many client tabs raced. The Firestore
 * tx exists to keep our LOCAL audit + attemptSeq state consistent.
 */
export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
): Promise<Stripe.PaymentIntent> {
  const { childId, sku, amount, currency, customerEmail, metadata } = input;

  const db = getFirestore();
  const attemptSeq = await db.runTransaction((tx) => readAttemptSeq(tx, { childId, sku }));
  const idempotencyKey = buildIdempotencyKey({ childId, sku, attemptSeq });

  const stripe = getClient();
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount,
        currency,
        receipt_email: customerEmail,
        metadata: { childId, sku, attemptSeq: String(attemptSeq), ...(metadata ?? {}) },
      },
      { idempotencyKey },
    );
  } catch (err) {
    const sanitized = sanitizeStripeError(err);
    if (isDefinitiveFailure(err)) {
      await db.runTransaction((tx) => writeAttemptSeq(tx, { childId, sku }, attemptSeq + 1, 'failure', null));
    }
    throw sanitized;
  }

  await db.runTransaction((tx) => writeAttemptSeq(tx, { childId, sku }, attemptSeq, 'success', intent.id));
  return intent;
}

export const __testing = {
  buildIdempotencyKey,
  sanitizeStripeError,
  isDefinitiveFailure,
};

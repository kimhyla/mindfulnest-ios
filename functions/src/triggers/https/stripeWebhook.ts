// LD-290 STRIPE_IDEMPOTENCY_KEY_V1 — webhook entry point.
//
// Receives raw Stripe webhook payloads, verifies the signature, then defers
// to the dedup primitive in lib/stripe/dedupe.ts to ensure each event is
// processed exactly once across Stripe's at-least-once delivery semantics.
//
// Deployment NOTE (2026-04-19): this function is COMMITTED but NOT
// deployed. Kim approves deploy in the morning. Stripe webhook secret
// must be supplied via Doppler (LD-208) as `STRIPE_WEBHOOK_SECRET`; the
// function will throw on cold start without it.
//
// Webhook URL (post-deploy): https://us-central1-mindfulnestkids.cloudfunctions.net/stripeWebhook
// Stripe dashboard config: subscribe to `checkout.session.completed`,
// `payment_intent.succeeded`, `payment_intent.payment_failed`. Deliver as
// raw JSON. Configure idempotency-key forwarding on `create-payment-intent`
// from the client (utility: app/src/lib/payments/idempotencyKey.ts).

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { processStripeEvent } from '../../lib/stripe/dedupe';

if (getApps().length === 0) {
  initializeApp();
}

interface StripeEventEnvelope {
  id?: unknown;
  type?: unknown;
  data?: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Verify Stripe webhook signature. Stub for v1 — real implementation lands
 * with the stripe SDK wiring (deferred to follow-up PR per LD-290 scope:
 * the dedup primitive ships first; signature verification + processor
 * dispatch follow once the SDK + Doppler secret land).
 *
 * Throws on missing/invalid signature so the function rejects 400 in the
 * onRequest handler. Intentionally fail-closed.
 */
function verifyStripeSignature(rawBody: Buffer, signature: string | undefined): StripeEventEnvelope {
  if (!signature) {
    throw new Error('missing Stripe-Signature header');
  }
  // TODO(LD-290 follow-up): replace with `stripe.webhooks.constructEvent(rawBody, signature, secret)`
  // when the Stripe SDK + STRIPE_WEBHOOK_SECRET land in Doppler. For now,
  // accept JSON-only requests so the dedup contract is exercisable end-to-end
  // by stripe-cli `--skip-verify` replays in the emulator.
  const text = rawBody.toString('utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('invalid JSON body');
  }
  if (!isPlainObject(parsed)) {
    throw new Error('event payload must be a JSON object');
  }
  return parsed as StripeEventEnvelope;
}

/**
 * Dispatch a verified Stripe event to its handler. Today this is a no-op —
 * actual checkout-completed handlers (entitlement grant, parent-doc update,
 * coin balance bootstrap) ship in their own LDs once the parent-side
 * checkout flow lands. Logging here proves the dedup gate worked and
 * routed the event.
 */
async function dispatchStripeEvent(eventType: string, eventId: string): Promise<void> {
  logger.info('stripe.event.dispatched', { eventId, eventType });
  // Intentional no-op — see TODO above.
}

export const stripeWebhook = onRequest(
  {
    // Public endpoint — Stripe calls in. App Check N/A.
    cors: false,
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('method not allowed');
      return;
    }
    let envelope: StripeEventEnvelope;
    try {
      envelope = verifyStripeSignature(req.rawBody, req.header('stripe-signature'));
    } catch (e) {
      logger.warn('stripe.signature.rejected', { error: (e as Error).message });
      res.status(400).send('signature rejected');
      return;
    }

    const eventId = typeof envelope.id === 'string' ? envelope.id : null;
    const eventType = typeof envelope.type === 'string' ? envelope.type : null;
    if (!eventId || !eventType) {
      res.status(400).send('missing event id or type');
      return;
    }

    const db = getFirestore();
    try {
      const outcome = await processStripeEvent({
        db,
        eventId,
        eventType,
        process: () => dispatchStripeEvent(eventType, eventId),
      });
      // 200 on both first-delivery and duplicate — Stripe interprets non-2xx
      // as delivery failure and will retry, which is precisely what dedup
      // protects against. Returning 200 on duplicate ACKs the retry.
      res.status(200).json({
        eventId,
        eventType,
        duplicate: outcome.duplicate,
      });
    } catch (e) {
      logger.error('stripe.process.failed', { eventId, eventType, error: (e as Error).message });
      // 5xx so Stripe retries — dedup guarantees the processor will not
      // double-execute on the next delivery.
      res.status(500).send('processing failed');
    }
  },
);

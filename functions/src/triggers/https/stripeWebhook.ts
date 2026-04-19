/**
 * Stripe webhook handler — HTTPS onRequest trigger.
 *
 * Per LD-290 STRIPE_IDEMPOTENCY_KEY_V1 (id=300) CLAUSE 2 and Phase 0
 * counter-mitigations (preflight 115):
 *
 *   - onRequest (NOT onCall) because Stripe sends raw POST with signed body.
 *   - Signature verification uses req.rawBody (Buffer) — Firebase Functions v2
 *     exposes this on every onRequest. NEVER hand-parse or stringify the body
 *     before constructEvent() — any whitespace mutation breaks the HMAC.
 *   - Dedup via lib/stripe/eventStore.dedupAndProcessAtomically(): the
 *     stripe_events row write and the business-logic write commit in one
 *     Firestore transaction.
 *   - Errors never include Stripe SDK raw body (sanitized in lib/stripe/client.ts).
 *   - 200 returned on duplicate (Stripe stops re-delivering on 2xx).
 *   - 4xx returned on signature verification failure (Stripe will not retry).
 *   - 5xx returned on transient failure (Stripe will retry with the same event.id).
 *
 * Cold-start tradeoff: Stripe webhooks have an 8s timeout. Without LD-291
 * minInstances >= 1 (D3 sibling deliverable), p99 cold-start could exceed.
 * cpu/memory tuned to give the SDK headroom; D3 lands the warm-instance
 * mitigation.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp, getApps } from 'firebase-admin/app';
import Stripe from 'stripe';
import { dedupAndProcessAtomically } from '../../lib/stripe/eventStore';
import { STRIPE_SECRET_KEY } from '../../lib/stripe/client';

if (getApps().length === 0) {
  initializeApp();
}

const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

let _stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (_stripeClient) return _stripeClient;
  _stripeClient = new Stripe(STRIPE_SECRET_KEY.value(), {
    apiVersion: '2025-02-24.acacia',
    typescript: true,
    timeout: 8000,
  });
  return _stripeClient;
}

export const stripeWebhook = onRequest(
  {
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET],
    cpu: 1,
    memory: '512MiB',
    timeoutSeconds: 30,
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const sig = req.get('stripe-signature');
    // Firebase Functions v2 onRequest exposes rawBody Buffer for signature verification.
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
    if (!sig || !raw) {
      res.status(400).send('missing signature or body');
      return;
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET.value());
    } catch {
      res.status(400).send('signature verification failed');
      return;
    }

    try {
      const result = await dedupAndProcessAtomically(event.id, event.type, async (_tx) => {
        return await processStripeEvent(event);
      });
      if (result.duplicate) {
        res.status(200).send({ duplicate: true, eventId: event.id });
        return;
      }
      res.status(200).send({ processed: true, eventId: event.id });
    } catch (err) {
      const message = (err as { message?: string })?.message ?? 'processing failed';
      console.error('[stripeWebhook] event_id=%s type=%s error=%s', event.id, event.type, message);
      res.status(500).send({ retry: true, eventId: event.id });
    }
  },
);

async function processStripeEvent(event: Stripe.Event): Promise<{ handled: boolean; type: string }> {
  switch (event.type) {
    case 'payment_intent.succeeded':
    case 'checkout.session.completed':
    case 'charge.refunded':
      return { handled: true, type: event.type };
    default:
      return { handled: false, type: event.type };
  }
}

export const __testing = { processStripeEvent };

// LD-290 STRIPE_IDEMPOTENCY_KEY_V1 — webhook event dedup primitive.
//
// Stripe's webhook delivery is at-least-once. Without server-side dedup, a
// replayed `checkout.session.completed` event would charge the parent twice.
// We use a Firestore document at `stripe_events/{event.id}` as the dedup
// ledger, gated by a runTransaction so concurrent webhook replicas race
// safely (the loser sees the doc and returns DUPLICATE).
//
// Pattern (per spec): read doc → if exists, return DUPLICATE; else create
// the doc with `{received_at, type, processed: false}` inside the same tx,
// then run the side-effecting processor outside the transaction, then mark
// `processed: true`. The simple "exists ⇒ duplicate" rule means a crash
// between create and processed-update will permanently skip that event —
// callers MUST design their processor to be idempotent OR accept this
// trade-off. Per LD-290 spec, this is intentional: the alternative
// (process-on-partial) re-opens the double-charge window the dedup is
// meant to close.
//
// Firestore security rule companion: clients are denied read+write on
// `stripe_events/**` (firestore.rules §stripe_events). Cloud Functions use
// the Admin SDK and bypass rules.

import { Firestore, FieldValue, Transaction } from 'firebase-admin/firestore';

export type DedupOutcome =
  | { duplicate: true; reason: 'event_already_recorded' }
  | { duplicate: false; recorded: true };

export interface StripeEventRecord {
  received_at: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  type: string;
  processed: boolean;
  processed_at?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface ProcessOptions {
  /** Firestore Admin instance — injected for testability. */
  db: Firestore;
  /** Stripe event id (e.g. `evt_1ABC...`). Used as the doc id. */
  eventId: string;
  /** Stripe event type (e.g. `checkout.session.completed`). */
  eventType: string;
  /**
   * Side-effecting processor — runs only on first delivery of this eventId.
   * Outside the dedup transaction so processor latency does not extend
   * Firestore lock windows.
   */
  process: () => Promise<void>;
  /** Optional override for the collection name (tests). Default: `stripe_events`. */
  collection?: string;
}

const DEFAULT_COLLECTION = 'stripe_events';

/**
 * Reserve a stripe event id atomically. Returns DUPLICATE if the id is
 * already recorded; otherwise writes the dedup doc inside the transaction.
 *
 * Exported separately from `processStripeEvent` so callers that need to
 * verify reservation before scheduling external work can do so.
 */
export async function reserveStripeEvent(
  db: Firestore,
  eventId: string,
  eventType: string,
  collection: string = DEFAULT_COLLECTION,
): Promise<DedupOutcome> {
  const ref = db.collection(collection).doc(eventId);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      return { duplicate: true as const, reason: 'event_already_recorded' as const };
    }
    const record: StripeEventRecord = {
      received_at: FieldValue.serverTimestamp(),
      type: eventType,
      processed: false,
    };
    tx.set(ref, record);
    return { duplicate: false as const, recorded: true as const };
  });
}

/**
 * Reserve the event id, then run the processor exactly once across replays.
 * On duplicate delivery, the processor is NOT invoked.
 *
 * After the processor resolves, marks the dedup doc as `processed: true`.
 * If the processor throws, the doc remains `processed: false` — replays
 * will still be skipped (the doc exists), but operators can audit unprocessed
 * events by querying `stripe_events where processed == false`.
 */
export async function processStripeEvent(opts: ProcessOptions): Promise<DedupOutcome> {
  const collection = opts.collection ?? DEFAULT_COLLECTION;
  const reservation = await reserveStripeEvent(opts.db, opts.eventId, opts.eventType, collection);
  if (reservation.duplicate) {
    return reservation;
  }
  // Side effect runs outside the transaction so a slow processor does not
  // extend the document lock window or risk transaction abort by the 60-s
  // Firestore tx ceiling.
  await opts.process();

  await opts.db
    .collection(collection)
    .doc(opts.eventId)
    .update({
      processed: true,
      processed_at: FieldValue.serverTimestamp(),
    });

  return reservation;
}

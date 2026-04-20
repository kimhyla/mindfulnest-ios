/**
 * Stripe webhook event store — Firestore-backed dedup table.
 *
 * Per LD-290 STRIPE_IDEMPOTENCY_KEY_V1 (id=300) CLAUSE 2:
 *   Every webhook handler MUST treat event.id as the dedup key. On receipt:
 *   read stripe_events/{event.id}; if exists, return 200 no-op. Else write
 *   {received_at, type, processed:false} → process business logic →
 *   set processed:true. ALL inside one Firestore runTransaction so the
 *   dedup-record write and the business-logic write are atomic.
 *
 * Firestore rule (firestore/firestore.rules) denies all client read/write on
 * /stripe_events. Cloud Functions (Admin SDK) bypass rules.
 *
 * TTL policy: createdAt + Firestore TTL deletion at 30 days. Stripe holds
 * idempotency-keyed responses 24h, so 30d is a safe ceiling well past the
 * window in which redelivery can occur (and gives us 29 days of audit headroom
 * post-window).
 *
 * Counter-mitigation reference (preflight 115):
 *   - safety CRITICAL (a) attemptSeq race: outbound concern, lib/stripe/client.ts
 *   - safety CRITICAL (b) signature bypass: handled in stripeWebhook.ts via req.rawBody
 *   - safety CRITICAL (c) secret leak: lib/stripe/client.ts strips error.raw.* on catch
 *   - maintainability MED unbounded growth: TTL policy documented above
 *
 * Dependency injection design: every exported function accepts an optional
 * Firestore-shaped object so unit tests can pass a fake without depending on
 * `mock.module`. Production callers omit the arg → real Admin SDK is used.
 */

import { getFirestore as adminGetFirestore, FieldValue } from 'firebase-admin/firestore';

const COLLECTION = 'stripe_events';

export interface StripeEventRecord {
  readonly eventId: string;
  readonly type: string;
  readonly receivedAt: unknown;
  readonly processed: boolean;
  readonly processingError?: string | null;
  readonly businessRecordRef?: string | null;
}

export interface DedupCheckResult {
  readonly isDuplicate: boolean;
  readonly existingRecord: StripeEventRecord | null;
}

// Minimal structural types so tests can supply fakes without pulling in the
// full firebase-admin types. Real Admin SDK satisfies these structurally.
// Exported so tests can compose against the same shape.
export interface FakeDocSnap {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}
export interface FakeDocRef {
  get: () => Promise<FakeDocSnap>;
}
export interface FakeTx {
  get: (ref: FakeDocRef) => Promise<FakeDocSnap>;
  set: (ref: FakeDocRef, data: Record<string, unknown>) => void;
}
export interface FirestoreLike {
  collection: (name: string) => { doc: (id: string) => FakeDocRef };
  runTransaction: <T>(work: (tx: FakeTx) => Promise<T>) => Promise<T>;
}

function defaultFirestore(): FirestoreLike {
  return adminGetFirestore() as unknown as FirestoreLike;
}

function eventRef(db: FirestoreLike, eventId: string): FakeDocRef {
  if (typeof eventId !== 'string' || eventId.length === 0 || eventId.length > 256) {
    throw new Error('invalid event.id');
  }
  return db.collection(COLLECTION).doc(eventId);
}

export type ServerTimestampFn = () => unknown;
const defaultServerTimestamp: ServerTimestampFn = () => FieldValue.serverTimestamp();

/**
 * Single-transaction dedup-and-process. Caller passes a `process` callback that
 * runs the business-logic Firestore writes against the SAME transaction so the
 * dedup row and the business-logic writes commit atomically. If the event is
 * already in stripe_events, `process` is NOT called and the result indicates
 * duplicate.
 */
export async function dedupAndProcessAtomically<T>(
  eventId: string,
  type: string,
  process: (tx: FakeTx) => Promise<T>,
  deps: { db?: FirestoreLike; serverTimestamp?: ServerTimestampFn } = {},
): Promise<{ duplicate: true } | { duplicate: false; result: T }> {
  const db = deps.db ?? defaultFirestore();
  const ts = deps.serverTimestamp ?? defaultServerTimestamp;
  const ref = eventRef(db, eventId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      return { duplicate: true } as const;
    }
    const result = await process(tx);
    tx.set(ref, {
      eventId,
      type,
      receivedAt: ts(),
      processed: true,
      processingError: null,
    });
    return { duplicate: false, result } as const;
  });
}

export async function isDuplicateEvent(
  eventId: string,
  deps: { db?: FirestoreLike } = {},
): Promise<DedupCheckResult> {
  const db = deps.db ?? defaultFirestore();
  const snap = await eventRef(db, eventId).get();
  if (!snap.exists) return { isDuplicate: false, existingRecord: null };
  return { isDuplicate: true, existingRecord: snap.data() as unknown as StripeEventRecord };
}

export const __testing = { COLLECTION };

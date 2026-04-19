// LD-290 STRIPE_IDEMPOTENCY_KEY_V1 — dedup unit test.
//
// Uses an in-memory Firestore stub so the test runs without the emulator.
// The stub mimics enough of `runTransaction` + doc set/get/update to verify
// the dedup contract:
//   1. First delivery records the event and runs the processor once.
//   2. Duplicate delivery returns DUPLICATE and does NOT re-run the processor.
//   3. The dedup doc transitions to processed: true after first delivery.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processStripeEvent, reserveStripeEvent } from '../dedupe';

interface DocSnap {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

function makeFirestoreStub() {
  const docs = new Map<string, Record<string, unknown>>();

  const docRef = (path: string) => ({
    async update(payload: Record<string, unknown>) {
      const cur = docs.get(path) ?? {};
      docs.set(path, { ...cur, ...payload });
    },
  });

  const collection = (name: string) => ({
    doc(id: string) {
      const path = `${name}/${id}`;
      return {
        ...docRef(path),
        path,
      };
    },
  });

  const runTransaction = async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
    // Simple per-call transaction: serialize tx state in a closure scoped Map.
    const writes: Array<[string, Record<string, unknown>]> = [];
    const tx = {
      async get(ref: { path: string }): Promise<DocSnap> {
        const data = docs.get(ref.path);
        return {
          exists: data !== undefined,
          data: () => data,
        };
      },
      set(ref: { path: string }, payload: Record<string, unknown>) {
        writes.push([ref.path, payload]);
      },
    };
    const result = await fn(tx);
    for (const [p, payload] of writes) {
      docs.set(p, payload);
    }
    return result;
  };

  return {
    collection,
    runTransaction,
    _docs: docs,
  } as unknown as import('firebase-admin/firestore').Firestore & { _docs: Map<string, Record<string, unknown>> };
}

test('first delivery: reserves event, runs processor, marks processed', async () => {
  const db = makeFirestoreStub();
  let calls = 0;
  const process = async () => {
    calls += 1;
  };
  const out = await processStripeEvent({
    db,
    eventId: 'evt_first',
    eventType: 'checkout.session.completed',
    process,
  });
  assert.equal(out.duplicate, false);
  assert.equal(calls, 1);
  const stored = (db as unknown as { _docs: Map<string, Record<string, unknown>> })._docs.get(
    'stripe_events/evt_first',
  );
  assert.ok(stored, 'dedup doc should exist after first delivery');
  assert.equal(stored.type, 'checkout.session.completed');
  assert.equal(stored.processed, true);
});

test('duplicate delivery: returns DUPLICATE, processor NOT re-invoked', async () => {
  const db = makeFirestoreStub();
  let calls = 0;
  const process = async () => {
    calls += 1;
  };
  // First delivery
  await processStripeEvent({
    db,
    eventId: 'evt_dupe',
    eventType: 'checkout.session.completed',
    process,
  });
  // Second delivery — same event id, simulates Stripe retry
  const second = await processStripeEvent({
    db,
    eventId: 'evt_dupe',
    eventType: 'checkout.session.completed',
    process,
  });
  assert.equal(second.duplicate, true);
  if (second.duplicate) {
    assert.equal(second.reason, 'event_already_recorded');
  }
  assert.equal(calls, 1, 'processor must be invoked exactly once across both deliveries');
});

test('reserveStripeEvent: pure reservation does not run a processor', async () => {
  const db = makeFirestoreStub();
  const out1 = await reserveStripeEvent(db, 'evt_reserve_only', 'invoice.paid');
  assert.equal(out1.duplicate, false);
  const out2 = await reserveStripeEvent(db, 'evt_reserve_only', 'invoice.paid');
  assert.equal(out2.duplicate, true);
});

test('exactly-one-charge contract: 5x replay produces 1 processor invocation', async () => {
  const db = makeFirestoreStub();
  const charges: number[] = [];
  const process = async () => {
    charges.push(499);
  };
  for (let i = 0; i < 5; i += 1) {
    await processStripeEvent({
      db,
      eventId: 'evt_replay_5x',
      eventType: 'checkout.session.completed',
      process,
    });
  }
  assert.deepEqual(charges, [499], 'must record exactly one $499 charge under 5 replays');
});

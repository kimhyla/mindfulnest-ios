/**
 * Unit tests for stripe_events dedup store.
 *
 * Uses dependency injection (deps.db) to substitute a fake Firestore. The
 * security rules covering /stripe_events admin-only access are tested separately
 * in firestore/__tests__/v9-stripe-events.test.js.
 *
 * Per LD-290 CLAUSE 2, the contract under test is:
 *   - First call with a new event.id → process callback runs, dedup row written.
 *   - Second call with the same event.id → process callback NOT called, returns duplicate.
 *   - process callback's writes share the SAME transaction handle as the dedup write.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { dedupAndProcessAtomically, isDuplicateEvent, type FirestoreLike, type FakeTx } from '../eventStore';

let docs: Map<string, Record<string, unknown>>;
let lastTxOps: string[];

interface PathedRef { _path: string; get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }> }

function makeFakeDb(): FirestoreLike {
  return {
    collection: (collName: string) => ({
      doc: (id: string) => {
        const path = `${collName}/${id}`;
        const ref: PathedRef = {
          _path: path,
          get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
        };
        return ref;
      },
    }),
    runTransaction: async <T>(work: (tx: FakeTx) => Promise<T>): Promise<T> => {
      lastTxOps = [];
      const tx: FakeTx = {
        get: async (ref) => {
          const path = (ref as PathedRef)._path;
          lastTxOps.push(`get:${path}`);
          return { exists: docs.has(path), data: () => docs.get(path) };
        },
        set: (ref, data) => {
          const path = (ref as PathedRef)._path;
          lastTxOps.push(`set:${path}`);
          docs.set(path, data);
        },
      };
      return work(tx);
    },
  };
}

beforeEach(() => {
  docs = new Map();
  lastTxOps = [];
});

test('first event.id → process called, dedup row written, not duplicate', async () => {
  const db = makeFakeDb();
  let processCalls = 0;
  const result = await dedupAndProcessAtomically(
    'evt_1',
    'payment_intent.succeeded',
    async () => { processCalls += 1; return 'business_result'; },
    { db, serverTimestamp: () => '__SERVER_TS__' },
  );
  assert.equal(processCalls, 1, 'process callback runs exactly once');
  assert.equal(result.duplicate, false);
  if (!result.duplicate) {
    assert.equal(result.result, 'business_result');
  }
  assert.ok(docs.has('stripe_events/evt_1'), 'dedup row written');
  assert.deepEqual(lastTxOps, ['get:stripe_events/evt_1', 'set:stripe_events/evt_1']);
});

test('second event.id → process NOT called, returns duplicate (LD-290 CLAUSE 2 invariant)', async () => {
  const db = makeFakeDb();
  await dedupAndProcessAtomically(
    'evt_2', 'payment_intent.succeeded',
    async () => 'first',
    { db, serverTimestamp: () => '__SERVER_TS__' },
  );
  let secondProcessCalls = 0;
  const result = await dedupAndProcessAtomically(
    'evt_2', 'payment_intent.succeeded',
    async () => { secondProcessCalls += 1; return 'should_not_run'; },
    { db, serverTimestamp: () => '__SERVER_TS__' },
  );
  assert.equal(secondProcessCalls, 0, 'process callback NOT invoked on duplicate event.id');
  assert.equal(result.duplicate, true);
});

test('CONTRACT: stripe-cli replay (same event.id twice) yields exactly ONE Firestore charge record', async () => {
  const db = makeFakeDb();
  let chargeRecordCount = 0;
  const business = async () => { chargeRecordCount += 1; };
  await dedupAndProcessAtomically('evt_replay_001', 'payment_intent.succeeded', business, { db, serverTimestamp: () => '__SERVER_TS__' });
  await dedupAndProcessAtomically('evt_replay_001', 'payment_intent.succeeded', business, { db, serverTimestamp: () => '__SERVER_TS__' });
  assert.equal(chargeRecordCount, 1, 'exactly ONE charge record despite event being delivered twice');
});

test('CONTRACT: network-retry simulation — different event.ids both processed (dedup is per event.id, not per payment_intent_id)', async () => {
  const db = makeFakeDb();
  let processCalls = 0;
  await dedupAndProcessAtomically('evt_net_retry_a', 'payment_intent.succeeded', async () => { processCalls += 1; }, { db, serverTimestamp: () => '__SERVER_TS__' });
  await dedupAndProcessAtomically('evt_net_retry_b', 'payment_intent.succeeded', async () => { processCalls += 1; }, { db, serverTimestamp: () => '__SERVER_TS__' });
  assert.equal(processCalls, 2);
});

test('isDuplicateEvent returns false for unknown event', async () => {
  const db = makeFakeDb();
  const r = await isDuplicateEvent('evt_unknown', { db });
  assert.equal(r.isDuplicate, false);
  assert.equal(r.existingRecord, null);
});

test('isDuplicateEvent returns true after dedupAndProcessAtomically writes the row', async () => {
  const db = makeFakeDb();
  await dedupAndProcessAtomically('evt_check', 'payment_intent.succeeded', async () => 'ok', { db, serverTimestamp: () => '__SERVER_TS__' });
  const r = await isDuplicateEvent('evt_check', { db });
  assert.equal(r.isDuplicate, true);
});

test('rejects empty event.id', async () => {
  const db = makeFakeDb();
  await assert.rejects(
    () => dedupAndProcessAtomically('', 'payment_intent.succeeded', async () => 'x', { db, serverTimestamp: () => '__SERVER_TS__' }),
    /invalid event.id/,
  );
});

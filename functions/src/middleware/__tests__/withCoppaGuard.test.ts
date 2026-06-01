/**
 * Unit tests for withCoppaGuard (spec §7.2, G0 gate artifact).
 *
 * Coverage (16 tests — all verifiable without Firebase emulator):
 *   assertCoppaTrigger   — 6 tests (rejection, warning, no-warning, happy path)
 *   withCoppaGuardCallable — 10 tests
 *     4 pre-Firestore rejection paths (no db access needed)
 *     6 Firestore-dependent paths via dbOverride DI injection:
 *       parent: childId IN linked_children → PASS
 *       parent: childId NOT IN linked_children → permission-denied
 *       therapist: status !== 'active' → permission-denied
 *       therapist: linkedChildren non-empty, childId NOT in list → permission-denied
 *       therapist: linkedChildren non-empty, childId IN list → PASS
 *       therapist: linkedChildren empty (DEVIATION fallback) + status active → PASS
 *
 * The duck-typed mock AuditCtx works because writeAudit's txn path only calls
 * ctx.db.collection('audit_logs').doc() and ctx.txn.create(ref, payload) —
 * no network, no Firebase initialization required.
 *
 * The Firestore-path tests use dbOverride (DI injection) rather than
 * mock.module() because mock.module() is not available in Node 22.11.0
 * when tsx is used as the loader (tsx uses CJS-style transforms that
 * are incompatible with the ESM-only mock.module() API).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { assertCoppaTrigger, withCoppaGuardCallable } from '../withCoppaGuard';
import type { AuditCtx } from '../../lib/audit/log';
import type { CallableRequest } from 'firebase-functions/v2/https';

// ─── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Duck-typed AuditCtx that satisfies writeAudit's 'txn' path without a live
 * Firestore connection. Captures created payloads for assertion.
 */
function makeAuditCtx(): { ctx: AuditCtx; created: Array<Record<string, unknown>> } {
  const created: Array<Record<string, unknown>> = [];
  const ctx: AuditCtx = {
    kind: 'txn',
    db: {
      collection: (_name: string) => ({
        doc: () => ({ id: 'mock-audit-ref' }),
      }),
    } as unknown as Firestore,
    txn: {
      create: (_ref: unknown, payload: Record<string, unknown>) => {
        created.push(payload);
      },
    } as unknown as Transaction,
  };
  return { ctx, created };
}

/**
 * Minimal mock CallableRequest<{childId?: string}>. Overrides are shallow-merged
 * at the top level only (auth, app, data).
 */
function makeCallableRequest(
  overrides: Partial<{
    app: unknown;
    auth: { uid: string; token: Record<string, unknown> } | undefined;
    data: Record<string, unknown>;
  }> = {},
): CallableRequest<{ childId?: string }> {
  return {
    app: undefined,
    auth: { uid: 'uid-parent-001', token: { role: 'parent' } },
    data: { childId: 'child-001' },
    rawRequest: {} as never,
    acceptsStreaming: false,
    ...overrides,
  } as unknown as CallableRequest<{ childId?: string }>;
}

// ─── assertCoppaTrigger ──────────────────────────────────────────────────────

test('assertCoppaTrigger: throws when childId is a number, not a string', async () => {
  const { ctx } = makeAuditCtx();
  await assert.rejects(
    () => assertCoppaTrigger(ctx, { childId: 42, writeAllowlist: [], documentFields: {} }),
    /childId missing or not a string/,
  );
});

test('assertCoppaTrigger: throws when childId is null', async () => {
  const { ctx } = makeAuditCtx();
  await assert.rejects(
    () => assertCoppaTrigger(ctx, { childId: null, writeAllowlist: [], documentFields: {} }),
    /childId missing or not a string/,
  );
});

test('assertCoppaTrigger: throws when childId is empty string', async () => {
  const { ctx } = makeAuditCtx();
  await assert.rejects(
    () => assertCoppaTrigger(ctx, { childId: '', writeAllowlist: [], documentFields: {} }),
    /childId missing or not a string/,
  );
});

test('assertCoppaTrigger: emits console.warn for fields outside allowlist', async () => {
  const { ctx } = makeAuditCtx();
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
  try {
    await assertCoppaTrigger(ctx, {
      childId: 'child-001',
      writeAllowlist: ['coinBalance'],
      documentFields: { coinBalance: true, dangerousField: 'secret' },
    });
  } finally {
    console.warn = origWarn;
  }
  assert.equal(warnings.length, 1, 'exactly one warning expected');
  assert.ok(
    warnings[0].includes('dangerousField'),
    `warning should name the unexpected field — got: ${warnings[0]}`,
  );
});

test('assertCoppaTrigger: no console.warn when all fields are in allowlist', async () => {
  const { ctx } = makeAuditCtx();
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
  try {
    await assertCoppaTrigger(ctx, {
      childId: 'child-001',
      writeAllowlist: ['coinBalance', 'stones_earned'],
      documentFields: { coinBalance: 100, stones_earned: ['body'] },
    });
  } finally {
    console.warn = origWarn;
  }
  assert.equal(warnings.length, 0, 'no warnings expected when all fields are allowlisted');
});

test('assertCoppaTrigger: happy path resolves and writes exactly one child_data_access audit row', async () => {
  const { ctx, created } = makeAuditCtx();
  await assertCoppaTrigger(ctx, {
    childId: 'child-001',
    writeAllowlist: ['coinBalance', 'stones_earned'],
    documentFields: { coinBalance: 100 },
  });
  assert.equal(created.length, 1, 'should write exactly one audit row via txn');
  assert.equal(created[0].actor, 'system_cf');
  assert.equal(created[0].action, 'child_data_access');
  assert.equal(created[0].collection, 'children');
  assert.equal(created[0].docId, 'child-001');
  assert.equal(created[0].childId, 'child-001');
});

// ─── withCoppaGuardCallable (guard rejection paths — no Firestore needed) ────
// All four tests stay well within the guard's early-exit branches and never
// reach getFirestore(). FUNCTIONS_EMULATOR is managed per-test so tests are
// isolated; the original env value is restored in a finally block.

test('withCoppaGuardCallable: rejects with unauthenticated when App Check token absent and not in emulator', async () => {
  const savedEnv = process.env.FUNCTIONS_EMULATOR;
  delete process.env.FUNCTIONS_EMULATOR;
  try {
    const handler = withCoppaGuardCallable<{ childId?: string }, { ok: boolean }>(
      { writeAllowlist: [], responseProjection: [], resolveChildId: (d) => d.childId },
      async () => ({ ok: true }),
    );
    const req = makeCallableRequest({ app: undefined });
    await assert.rejects(
      () => handler(req),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'should throw an Error');
        assert.equal(
          (err as { code?: string }).code,
          'unauthenticated',
          `expected code=unauthenticated, got: ${(err as { code?: string }).code}`,
        );
        return true;
      },
    );
  } finally {
    if (savedEnv !== undefined) { process.env.FUNCTIONS_EMULATOR = savedEnv; }
    else { delete process.env.FUNCTIONS_EMULATOR; }
  }
});

test('withCoppaGuardCallable: rejects with unauthenticated when auth uid is missing', async () => {
  const savedEnv = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = '1'; // bypass App Check gate
  try {
    const handler = withCoppaGuardCallable<{ childId?: string }, { ok: boolean }>(
      { writeAllowlist: [], responseProjection: [], resolveChildId: (d) => d.childId },
      async () => ({ ok: true }),
    );
    const req = makeCallableRequest({ auth: undefined });
    await assert.rejects(
      () => handler(req),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'unauthenticated');
        return true;
      },
    );
  } finally {
    if (savedEnv !== undefined) { process.env.FUNCTIONS_EMULATOR = savedEnv; }
    else { delete process.env.FUNCTIONS_EMULATOR; }
  }
});

test('withCoppaGuardCallable: rejects with permission-denied when role is not parent or therapist', async () => {
  const savedEnv = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = '1';
  try {
    const handler = withCoppaGuardCallable<{ childId?: string }, { ok: boolean }>(
      { writeAllowlist: [], responseProjection: [], resolveChildId: (d) => d.childId },
      async () => ({ ok: true }),
    );
    const req = makeCallableRequest({
      auth: { uid: 'admin-001', token: { role: 'admin' } },
    });
    await assert.rejects(
      () => handler(req),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'permission-denied');
        return true;
      },
    );
  } finally {
    if (savedEnv !== undefined) { process.env.FUNCTIONS_EMULATOR = savedEnv; }
    else { delete process.env.FUNCTIONS_EMULATOR; }
  }
});

test('withCoppaGuardCallable: rejects with invalid-argument when childId absent from request data', async () => {
  const savedEnv = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = '1';
  try {
    const handler = withCoppaGuardCallable<{ childId?: string }, { ok: boolean }>(
      {
        writeAllowlist: [],
        responseProjection: [],
        resolveChildId: (d) => d.childId, // returns undefined when childId absent
      },
      async () => ({ ok: true }),
    );
    const req = makeCallableRequest({ data: {} }); // no childId
    await assert.rejects(
      () => handler(req),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'invalid-argument');
        return true;
      },
    );
  } finally {
    if (savedEnv !== undefined) { process.env.FUNCTIONS_EMULATOR = savedEnv; }
    else { delete process.env.FUNCTIONS_EMULATOR; }
  }
});

// ─── withCoppaGuardCallable (Firestore-dependent paths via dbOverride DI) ────
//
// These 6 tests cover the guard's Firestore read paths using a duck-typed mock
// db injected via the optional dbOverride option. The mock supports both the
// relationship-check queries (.collection(name).doc(id).get()) and the writeAudit
// 'db' path (.collection('audit_logs').add(payload)).
//
// Why DI over mock.module(): mock.module() requires ESM native module resolution
// which tsx (CJS-style transform) does not support in Node 22.11.0.

/**
 * Build a duck-typed mock Firestore that:
 *  - Returns a configurable snapshot for a single collection/doc pair (the
 *    "primary" collection read — parents or therapists).
 *  - Returns a resolved Promise for collection('audit_logs').add() so writeAudit
 *    'db' path succeeds without a real connection.
 *
 * Shape expected by withCoppaGuard + writeAudit 'db' path:
 *   db.collection(name).doc(id).get() → { exists, data: () => docData }
 *   db.collection('audit_logs').add(payload) → Promise<void>
 */
function makeMockDb(config: {
  primaryCollection: 'parents' | 'therapists';
  docData: Record<string, unknown> | null; // null = document does not exist
}): import('firebase-admin/firestore').Firestore {
  return {
    collection: (name: string) => {
      if (name === 'audit_logs') {
        return {
          add: (_payload: unknown) => Promise.resolve({ id: 'mock-audit-id' }),
        };
      }
      // Primary relationship collection (parents or therapists).
      return {
        doc: (_id: string) => ({
          get: () =>
            Promise.resolve({
              exists: config.docData !== null,
              data: () => config.docData,
            }),
        }),
      };
    },
  } as unknown as import('firebase-admin/firestore').Firestore;
}

// Test 11: parent — childId IN linked_children → PASS (handler runs)
test('withCoppaGuardCallable (Firestore): parent with childId IN linked_children — handler runs', async () => {
  const savedEnv = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = '1';
  try {
    const mockDb = makeMockDb({
      primaryCollection: 'parents',
      docData: { linked_children: ['child-001', 'child-002'] },
    });
    let handlerWasCalled = false;
    const handler = withCoppaGuardCallable<{ childId?: string }, { ok: boolean }>(
      {
        writeAllowlist: [],
        responseProjection: [],
        resolveChildId: (d) => d.childId,
        dbOverride: mockDb,
      },
      async (_req, _childId) => {
        handlerWasCalled = true;
        return { ok: true };
      },
    );
    const req = makeCallableRequest({
      auth: { uid: 'uid-parent-001', token: { role: 'parent' } },
      data: { childId: 'child-001' },
    });
    const result = await handler(req);
    assert.ok(handlerWasCalled, 'inner handler should have been called');
    assert.deepEqual(result, { ok: true });
  } finally {
    if (savedEnv !== undefined) { process.env.FUNCTIONS_EMULATOR = savedEnv; }
    else { delete process.env.FUNCTIONS_EMULATOR; }
  }
});

// Test 12: parent — childId NOT IN linked_children → permission-denied
test('withCoppaGuardCallable (Firestore): parent with childId NOT in linked_children — permission-denied', async () => {
  const savedEnv = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = '1';
  try {
    const mockDb = makeMockDb({
      primaryCollection: 'parents',
      docData: { linked_children: ['child-999'] }, // child-001 not in list
    });
    const handler = withCoppaGuardCallable<{ childId?: string }, { ok: boolean }>(
      {
        writeAllowlist: [],
        responseProjection: [],
        resolveChildId: (d) => d.childId,
        dbOverride: mockDb,
      },
      async () => ({ ok: true }),
    );
    const req = makeCallableRequest({
      auth: { uid: 'uid-parent-001', token: { role: 'parent' } },
      data: { childId: 'child-001' },
    });
    await assert.rejects(
      () => handler(req),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'permission-denied');
        return true;
      },
    );
  } finally {
    if (savedEnv !== undefined) { process.env.FUNCTIONS_EMULATOR = savedEnv; }
    else { delete process.env.FUNCTIONS_EMULATOR; }
  }
});

// Test 13: therapist — status !== 'active' → permission-denied
test('withCoppaGuardCallable (Firestore): therapist with status !== active — permission-denied', async () => {
  const savedEnv = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = '1';
  try {
    const mockDb = makeMockDb({
      primaryCollection: 'therapists',
      docData: { status: 'pending', linked_children: [] },
    });
    const handler = withCoppaGuardCallable<{ childId?: string }, { ok: boolean }>(
      {
        writeAllowlist: [],
        responseProjection: [],
        resolveChildId: (d) => d.childId,
        dbOverride: mockDb,
      },
      async () => ({ ok: true }),
    );
    const req = makeCallableRequest({
      auth: { uid: 'uid-therapist-001', token: { role: 'therapist' } },
      data: { childId: 'child-001' },
    });
    await assert.rejects(
      () => handler(req),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'permission-denied');
        return true;
      },
    );
  } finally {
    if (savedEnv !== undefined) { process.env.FUNCTIONS_EMULATOR = savedEnv; }
    else { delete process.env.FUNCTIONS_EMULATOR; }
  }
});

// Test 14: therapist — linkedChildren non-empty, childId NOT in list → permission-denied
test('withCoppaGuardCallable (Firestore): therapist with linkedChildren populated, childId absent — permission-denied', async () => {
  const savedEnv = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = '1';
  try {
    const mockDb = makeMockDb({
      primaryCollection: 'therapists',
      docData: { status: 'active', linked_children: ['child-999'] }, // child-001 not in list
    });
    const handler = withCoppaGuardCallable<{ childId?: string }, { ok: boolean }>(
      {
        writeAllowlist: [],
        responseProjection: [],
        resolveChildId: (d) => d.childId,
        dbOverride: mockDb,
      },
      async () => ({ ok: true }),
    );
    const req = makeCallableRequest({
      auth: { uid: 'uid-therapist-001', token: { role: 'therapist' } },
      data: { childId: 'child-001' },
    });
    await assert.rejects(
      () => handler(req),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'permission-denied');
        return true;
      },
    );
  } finally {
    if (savedEnv !== undefined) { process.env.FUNCTIONS_EMULATOR = savedEnv; }
    else { delete process.env.FUNCTIONS_EMULATOR; }
  }
});

// Test 15: therapist — linkedChildren non-empty, childId IN list → PASS (handler runs)
test('withCoppaGuardCallable (Firestore): therapist with linkedChildren populated, childId present — handler runs', async () => {
  const savedEnv = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = '1';
  try {
    const mockDb = makeMockDb({
      primaryCollection: 'therapists',
      docData: { status: 'active', linked_children: ['child-001', 'child-002'] },
    });
    let handlerWasCalled = false;
    const handler = withCoppaGuardCallable<{ childId?: string }, { ok: boolean }>(
      {
        writeAllowlist: [],
        responseProjection: [],
        resolveChildId: (d) => d.childId,
        dbOverride: mockDb,
      },
      async (_req, _childId) => {
        handlerWasCalled = true;
        return { ok: true };
      },
    );
    const req = makeCallableRequest({
      auth: { uid: 'uid-therapist-001', token: { role: 'therapist' } },
      data: { childId: 'child-001' },
    });
    const result = await handler(req);
    assert.ok(handlerWasCalled, 'inner handler should have been called');
    assert.deepEqual(result, { ok: true });
  } finally {
    if (savedEnv !== undefined) { process.env.FUNCTIONS_EMULATOR = savedEnv; }
    else { delete process.env.FUNCTIONS_EMULATOR; }
  }
});

// Test 16: therapist — linkedChildren empty (DEVIATION fallback) + status active → PASS (handler runs)
test('withCoppaGuardCallable (Firestore): therapist with empty linkedChildren (DEVIATION fallback) + active status — handler runs', async () => {
  const savedEnv = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = '1';
  try {
    const mockDb = makeMockDb({
      primaryCollection: 'therapists',
      docData: { status: 'active', linked_children: [] }, // empty — triggers fallback per DEVIATION comment
    });
    let handlerWasCalled = false;
    const handler = withCoppaGuardCallable<{ childId?: string }, { ok: boolean }>(
      {
        writeAllowlist: [],
        responseProjection: [],
        resolveChildId: (d) => d.childId,
        dbOverride: mockDb,
      },
      async (_req, _childId) => {
        handlerWasCalled = true;
        return { ok: true };
      },
    );
    const req = makeCallableRequest({
      auth: { uid: 'uid-therapist-001', token: { role: 'therapist' } },
      data: { childId: 'child-001' },
    });
    const result = await handler(req);
    assert.ok(handlerWasCalled, 'inner handler should have been called via DEVIATION fallback');
    assert.deepEqual(result, { ok: true });
  } finally {
    if (savedEnv !== undefined) { process.env.FUNCTIONS_EMULATOR = savedEnv; }
    else { delete process.env.FUNCTIONS_EMULATOR; }
  }
});

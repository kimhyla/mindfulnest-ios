/**
 * v4 Value-Based Comparison Tests
 *
 * Verifies the fieldUnchanged() / anyProtectedFieldChanged() pattern
 * introduced in v4 (BS3-v2 rewrite). These tests specifically cover:
 *
 * 1. Each protected field individually (per-field regression)
 * 2. Array != comparison semantics (C2-1 finding: parentNotifiedSkills is string[])
 * 3. Bars UPDATE still has the check (LD-122 defense-in-depth)
 * 4. Mixed writes (protected + non-protected fields)
 *
 * Preflight review: Directus prod_preflight_reviews id=7
 *   task_id: BS3-firestore-rule-rewrite-v2-20260416
 * Locked decision: PROTECTED_FIELD_IMMUTABILITY_PATTERN (Directus id=125)
 */

const {
  getTestEnv,
  authedDb,
  assertFails,
  assertSucceeds,
} = require('./setup');

const THERAPIST_UID = 'therapist-001';
const PARENT_UID = 'parent-001';
const CHILD_ID = 'child-001';

let testEnv;

beforeAll(async () => {
  testEnv = await getTestEnv();
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`therapists/${THERAPIST_UID}`).set({
      displayName: 'Dr. Test',
    });
    await db.doc(`parents/${PARENT_UID}`).set({
      displayName: 'Test Parent',
      linkedTherapist: THERAPIST_UID,
      coppaChatConsent: false,
    });
    await db.doc(`children/${CHILD_ID}`).set({
      displayName: 'Test Child',
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      chatEnabled: false,
      parentNotifiedSkills: ['M1', 'M2'],
      therapistFirstCompletionNotified: false,
      inactivityNotifiedAt: null,
    });
  });
});

// ─── Per-Field Value Comparison (v4 anyProtectedFieldChanged) ──────

describe('v4: anyProtectedFieldChanged() per-field verification', () => {

  test('BLOCKED: changing parentNotifiedSkills (array)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.doc(`children/${CHILD_ID}`).update({
        parentNotifiedSkills: ['M1', 'M2', 'M3'],
      })
    );
  });

  test('BLOCKED: changing therapistFirstCompletionNotified (boolean)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.doc(`children/${CHILD_ID}`).update({
        therapistFirstCompletionNotified: true,
      })
    );
  });

  test('BLOCKED: changing inactivityNotifiedAt (null → timestamp)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.doc(`children/${CHILD_ID}`).update({
        inactivityNotifiedAt: new Date().toISOString(),
      })
    );
  });

  test('BLOCKED: changing linkedParent', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.doc(`children/${CHILD_ID}`).update({
        linkedParent: 'rogue-parent',
      })
    );
  });

  test('BLOCKED: changing linkedTherapist', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.doc(`children/${CHILD_ID}`).update({
        linkedTherapist: 'rogue-therapist',
      })
    );
  });

  test('ALLOWED: non-protected field update (displayName)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}`).update({
        displayName: 'Updated Name',
      })
    );
  });

  test('BLOCKED: mixed update (protected + non-protected)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.doc(`children/${CHILD_ID}`).update({
        displayName: 'Updated Name',
        linkedTherapist: 'rogue-therapist',
      })
    );
  });
});

// ─── Array != Comparison Semantics (C2-1) ──────────────────────────

describe('v4: array != comparison (C2-1 finding)', () => {

  test('BLOCKED: appending to parentNotifiedSkills array', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    // Original: ['M1', 'M2']. New: ['M1', 'M2', 'M3']
    await assertFails(
      db.doc(`children/${CHILD_ID}`).update({
        parentNotifiedSkills: ['M1', 'M2', 'M3'],
      })
    );
  });

  test('BLOCKED: reordering parentNotifiedSkills array', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    // Same elements, different order — Firestore != treats this as different
    await assertFails(
      db.doc(`children/${CHILD_ID}`).update({
        parentNotifiedSkills: ['M2', 'M1'],
      })
    );
  });

  test('BLOCKED: replacing parentNotifiedSkills with empty array', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.doc(`children/${CHILD_ID}`).update({
        parentNotifiedSkills: [],
      })
    );
  });

  test('ALLOWED: sending identical parentNotifiedSkills array (no change)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    // Sending the same value should NOT trigger the check
    // ['M1', 'M2'] == ['M1', 'M2'] → fieldUnchanged returns true → allowed
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}`).update({
        parentNotifiedSkills: ['M1', 'M2'],
        displayName: 'Updated Name',
      })
    );
  });
});

// ─── Bars UPDATE Defense-in-Depth (LD-122) ─────────────────────────

describe('v4: bars UPDATE retains protected field check (LD-122)', () => {

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`children/${CHILD_ID}/bars/bar-001`).set({
        moduleId: 'M1',
        progress: 50,
      });
    });
  });

  test('bars UPDATE: allowed for normal fields', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}/bars/bar-001`).update({
        progress: 75,
      })
    );
  });

  test('bars UPDATE: blocked if writing a protected-field-named key', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    // Even though bars docs don't have linkedParent, the helper still checks
    // request vs resource for this field name. On UPDATE, resource.data exists
    // and the field won't be present — so get() returns null on both sides
    // → fieldUnchanged → allowed UNLESS the client writes a new value.
    // Writing 'linkedParent' on a bar doc where it didn't exist before:
    // request.get('linkedParent', null) = 'rogue' != resource.get('linkedParent', null) = null → BLOCKED
    await assertFails(
      db.doc(`children/${CHILD_ID}/bars/bar-001`).update({
        linkedParent: 'rogue-value',
      })
    );
  });
});

// ─── Nested Map Mutation (BS1c vulnerability closure) ──────────────

describe('v4: nested map mutations caught by value comparison', () => {

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`children/${CHILD_ID}`).update({
        gameState: { currentArc: 1, currentModule: 'M1' },
      });
    });
  });

  test('ALLOWED: nested write to non-protected map field', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}`).update({
        'gameState.currentModule': 'M2',
      })
    );
  });
});

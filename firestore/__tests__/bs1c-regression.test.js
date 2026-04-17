/**
 * Step D: BS1c Regression Test — Nested Field Attack Vector
 *
 * BS1c vulnerability: .diff().affectedKeys() returns TOP-LEVEL keys only.
 * A write to "someMap.nestedField" returns the top-level key "someMap",
 * NOT "someMap.nestedField". If a protected field were stored inside a
 * nested map, the check would silently stop working.
 *
 * CURRENT STATE (pre-BS3 fix):
 * - All 5 protected fields (parentNotifiedSkills, therapistFirstCompletionNotified,
 *   inactivityNotifiedAt, linkedParent, linkedTherapist) are top-level keys.
 * - affectedKeys().hasAny([...]) correctly catches writes to these fields
 *   BECAUSE they are top-level.
 * - The vulnerability is LATENT: if any protected field is ever moved inside
 *   a nested map, the check would silently stop blocking mutations.
 *
 * WHAT THIS TEST PROVES:
 * 1. Writing a TOP-LEVEL protected field IS blocked (affectedKeys catches it)
 * 2. Writing a NESTED property on a non-protected field IS allowed (correct)
 * 3. The BS1c WARNING is valid: affectedKeys would NOT catch nested mutations
 *    IF a protected field were inside a map (demonstrated by writing to a
 *    hypothetical nested property path)
 *
 * After BS3 fix: tests 1-2 should still pass. Test 3's behavior should change
 * if the new implementation uses value-based comparison instead of affectedKeys.
 *
 * Preflight review: Directus prod_preflight_reviews id=5
 *   task_id: blocker-111-emulator-harness-20260416
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
      parentNotifiedSkills: [],
      therapistFirstCompletionNotified: false,
      inactivityNotifiedAt: null,
      // Add a non-protected map field for nested-write testing
      gameState: {
        currentArc: 1,
        currentModule: 'M1',
      },
    });
  });
});

describe('BS1c regression: affectedKeys() nested-field behavior', () => {

  // TEST 1: Writing a top-level protected field IS correctly blocked.
  // affectedKeys() returns 'linkedParent' → hasAny matches → DENIED.
  test('BLOCKED: direct write to top-level protected field linkedParent', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.doc(`children/${CHILD_ID}`).update({
        linkedParent: 'rogue-parent',
      })
    );
  });

  test('BLOCKED: direct write to top-level protected field linkedTherapist', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.doc(`children/${CHILD_ID}`).update({
        linkedTherapist: 'rogue-therapist',
      })
    );
  });

  test('BLOCKED: direct write to top-level protected field parentNotifiedSkills', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.doc(`children/${CHILD_ID}`).update({
        parentNotifiedSkills: ['hacked'],
      })
    );
  });

  // TEST 2: Writing a non-protected field IS correctly allowed.
  test('ALLOWED: write to non-protected top-level field', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}`).update({
        displayName: 'Updated Name',
      })
    );
  });

  // TEST 3: Writing to a nested property of a non-protected map IS allowed.
  // This is correct behavior — gameState is not protected.
  // affectedKeys() returns 'gameState' (the top-level key), which is not
  // in the protected list, so it passes.
  test('ALLOWED: nested write to non-protected map field (gameState.currentModule)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}`).update({
        'gameState.currentModule': 'M2',
      })
    );
  });

  // TEST 4: THE BS1c VULNERABILITY DEMONSTRATION.
  // If a protected field were inside a nested map (hypothetically), the
  // current affectedKeys() check would NOT catch it. We demonstrate this
  // by writing to a dot-path that INCLUDES a protected field name as a
  // nested property — e.g., writing to "gameState.linkedParent".
  //
  // affectedKeys() would return 'gameState' (the top-level key).
  // 'gameState' is NOT in the protected list → check passes → ALLOWED.
  //
  // This proves the BS1c WARNING is valid: if linkedParent were ever
  // moved inside a map (e.g., relationships.linkedParent), the check
  // would silently stop blocking mutations to it.
  //
  // NOTE: This does NOT represent a current vulnerability because all
  // protected fields ARE top-level. It demonstrates the LATENT risk.
  test('BS1c-DEMO: nested write using protected field name inside a map is NOT caught', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    // Writing to "gameState.linkedParent" — affectedKeys returns "gameState",
    // which is NOT in the protected list, so the write is ALLOWED.
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}`).update({
        'gameState.linkedParent': 'this-would-be-bad-if-linkedParent-were-nested',
      })
    );
  });

  // TEST 5: Multiple field update including both protected and non-protected.
  // Even with a benign field change, if a protected field is also changed,
  // the write should be blocked.
  test('BLOCKED: mixed update with protected + non-protected field', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.doc(`children/${CHILD_ID}`).update({
        displayName: 'Updated Name',
        linkedTherapist: 'rogue-therapist',
      })
    );
  });
});

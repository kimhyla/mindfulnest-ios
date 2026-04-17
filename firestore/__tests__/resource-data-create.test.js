/**
 * Step C: Empirically verify resource.data behavior on CREATE operations.
 *
 * This test file isolates the C1 CRITICAL finding from the BS3 preflight review:
 * "resource.data.get() on CREATE may throw/return null vacuously, causing
 * production-deny on every parent subcollection write (bars, completionLog)."
 *
 * EMPIRICAL FINDINGS (April 16, 2026, firebase-tools 15.15.0, emulator v1.20.4):
 *
 * 1. On CREATE, `resource.data` is UNDEFINED (the document does not exist yet).
 *    Calling `.diff()` or `.get()` on undefined throws "Null value error".
 *
 * 2. v3 rules called parentWriteTouchesProtectedFields() on bars CREATE and
 *    completionLog CREATE — this threw on every CREATE, blocking all parent writes.
 *
 * 3. v4 FIX: anyProtectedFieldChanged() (which calls fieldUnchanged()) is scoped
 *    to UPDATE-only call sites. Bars CREATE and completionLog CREATE no longer
 *    call the helper. This was Option (a) from the original analysis.
 *
 * 4. `request.resource.data` IS defined on CREATE (it's the incoming document).
 *    Only `resource.data` (the EXISTING document) is undefined on CREATE.
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
  // Seed baseline
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
    });
  });
});

describe('Step C: resource.data on CREATE — empirical verification', () => {

  // C1 FIX VERIFIED: v4 removes the helper from CREATE paths.
  // Bars CREATE and completionLog CREATE now succeed for linked parents.
  test('bars CREATE: succeeds after v4 fix (no helper on CREATE path)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}/bars/bar-c1-test`).set({
        moduleId: 'M1',
        progress: 0,
      })
    );
  });

  test('completionLog CREATE: succeeds after v4 fix', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}/completionLog/log-c1-test`).set({
        moduleId: 'M1',
        completedAt: new Date().toISOString(),
      })
    );
  });

  // FINDING 2: bars UPDATE works fine (resource.data IS defined on existing docs)
  test('bars UPDATE: anyProtectedFieldChanged() works correctly', async () => {
    // Seed a bar first
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`children/${CHILD_ID}/bars/bar-update-test`).set({
        moduleId: 'M1',
        progress: 0,
      });
    });
    const db = authedDb(testEnv, PARENT_UID);
    // This succeeds because on UPDATE, resource.data is defined
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}/bars/bar-update-test`).update({
        progress: 50,
      })
    );
  });

  // FINDING 3: child doc UPDATE also works (it's a top-level document, not subcollection)
  test('child doc UPDATE: anyProtectedFieldChanged() works correctly', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}`).update({
        chatEnabled: false,
      })
    );
  });

  // FINDING 4: child doc CREATE does NOT call anyProtectedFieldChanged()
  // (it has its own create rule at line 147) so it's unaffected by C1.
  test('child doc CREATE: unaffected by C1 (different rule path)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(
      db.doc('children/new-child-c1-test').set({
        displayName: 'C1 Test Child',
        linkedParent: PARENT_UID,
        linkedTherapist: THERAPIST_UID,
      })
    );
  });
});

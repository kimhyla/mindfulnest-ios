/**
 * MindfulNest Firestore Rules — Entitlements Smoke Test
 *
 * Overnight deliverable B (2026-04-19).
 *
 * The CI workflow `.github/workflows/firestore-rules-smoke.yml` triggers
 * this suite (and the full rules test set) on every PR that touches
 * `firestore.rules` or `firestore/`. The four scenarios below are the
 * minimum smoke that the rule semantics still hold:
 *
 *   1. Parent without arc_2 entitlement cannot read /modules/M7/assets/*.
 *   2. Parent with arc_2 entitlement CAN read /modules/M7/assets/*.
 *   3. ANY authenticated user is denied write to /stripe_events/*.
 *   4. Parent cannot write to /children/{otherUid}/*.
 *
 * Spec note: the brief named the file `tests/rules/entitlements.test.ts`.
 * The repo's existing rules-test convention is plain JS in
 * `firestore/__tests__/`, wired to the Jest config + the `npm run
 * test:rules` script. We follow the existing convention to stay inside
 * the test runner without a TS overlay; semantics are identical.
 */

const {
  getTestEnv,
  authedDb,
  unauthDb,
  assertFails,
  assertSucceeds,
} = require('./setup');

const PARENT_NO_ENT = 'parent-noent-001';
const PARENT_WITH_ENT = 'parent-arc2-001';
const OTHER_PARENT = 'parent-other-001';
const OTHER_CHILD = 'child-other-001';

let testEnv;

beforeAll(async () => {
  testEnv = await getTestEnv();
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

async function seedParents(testEnv) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Parent without entitlement
    await db.collection('parents').doc(PARENT_NO_ENT).set({
      email: 'noent@example.com',
      displayName: 'Parent No Entitlement',
      coppaChatConsent: false,
      parental_consent_verified: true,
      parental_consent_source: 'kws',
      kws_parent_id: 'kws-noent',
    });
    // Parent with arc_2 entitlement
    await db.collection('parents').doc(PARENT_WITH_ENT).set({
      email: 'arc2@example.com',
      displayName: 'Parent Arc2',
      coppaChatConsent: false,
      parental_consent_verified: true,
      parental_consent_source: 'kws',
      kws_parent_id: 'kws-arc2',
      entitlements: { arc_1: true, arc_2: true },
    });
    // Other parent + child for the cross-tenant deny test
    await db.collection('parents').doc(OTHER_PARENT).set({
      email: 'other@example.com',
      displayName: 'Other Parent',
      coppaChatConsent: false,
      parental_consent_verified: true,
      parental_consent_source: 'kws',
      kws_parent_id: 'kws-other',
    });
    await db.collection('children').doc(OTHER_CHILD).set({
      linkedParent: OTHER_PARENT,
      linkedTherapist: 'therapist-001',
      displayName: 'Other Child',
      parental_consent_verified: true,
      parental_consent_source: 'kws',
      kws_parent_id: 'kws-other',
    });
    // Seed a published M7 + an asset under it so the read path has data.
    await db.collection('modules').doc('M7').set({ status: 'published' });
    await db
      .collection('modules')
      .doc('M7')
      .collection('assets')
      .doc('asset-001')
      .set({ kind: 'video', url: 'https://example.invalid/m7-clip.mp4' });
  });
}

describe('arc entitlement gate on /modules/{moduleId}/assets/*', () => {
  test('parent WITHOUT arc_2 entitlement is DENIED reading modules/M7/assets/*', async () => {
    await seedParents(testEnv);
    const db = authedDb(testEnv, PARENT_NO_ENT);
    await assertFails(db.collection('modules').doc('M7').collection('assets').doc('asset-001').get());
  });

  test('parent WITH arc_2 entitlement is ALLOWED reading modules/M7/assets/*', async () => {
    await seedParents(testEnv);
    const db = authedDb(testEnv, PARENT_WITH_ENT);
    await assertSucceeds(db.collection('modules').doc('M7').collection('assets').doc('asset-001').get());
  });
});

describe('stripe_events client write deny (any authenticated user)', () => {
  test('authenticated parent is DENIED writing to /stripe_events/*', async () => {
    await seedParents(testEnv);
    const db = authedDb(testEnv, PARENT_NO_ENT);
    await assertFails(
      db.collection('stripe_events').doc('evt_test').set({
        type: 'checkout.session.completed',
        processed: true,
      }),
    );
  });

  test('unauthenticated user is DENIED writing to /stripe_events/*', async () => {
    const db = unauthDb(testEnv);
    await assertFails(
      db.collection('stripe_events').doc('evt_test').set({
        type: 'checkout.session.completed',
        processed: true,
      }),
    );
  });
});

describe('cross-tenant child deny', () => {
  test('parent is DENIED writing to /children/{otherUid}/* (a child not linked to them)', async () => {
    await seedParents(testEnv);
    const db = authedDb(testEnv, PARENT_NO_ENT);
    // Try to update a child belonging to OTHER_PARENT.
    await assertFails(
      db.collection('children').doc(OTHER_CHILD).update({ displayName: 'Hijacked Name' }),
    );
  });

  test('parent is DENIED writing to /children/{otherUid}/bars/* under another parent\'s child', async () => {
    await seedParents(testEnv);
    const db = authedDb(testEnv, PARENT_NO_ENT);
    await assertFails(
      db
        .collection('children')
        .doc(OTHER_CHILD)
        .collection('bars')
        .doc('bar-001')
        .set({ created: true }),
    );
  });
});

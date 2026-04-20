/**
 * firestore.rules v9 — /stripe_events + /purchases/.../attempts admin-SDK-only.
 *
 * Per LD-290 STRIPE_IDEMPOTENCY_KEY_V1 (id=300):
 *   - stripe_events stores webhook dedup rows. NO client reads/writes — leaking
 *     event payloads exposes Stripe metadata + customer email.
 *   - purchases/{childId}/attempts/{sku} stores server-authored attempt counters.
 *     NO client reads/writes — clients must not be able to bump attemptSeq
 *     (the entire LD-290 outbound idempotency contract depends on the server
 *     being the sole authority on attemptSeq).
 *
 * Cloud Functions use Admin SDK which bypasses these rules. The tests below
 * verify that authenticated parents AND therapists are denied from both paths.
 *
 * Preflight: prod_preflight_reviews id=115.
 */

const { getTestEnv, authedDb, assertFails } = require('./setup');

const PARENT_UID = 'parent-v9-001';
const THERAPIST_UID = 'therapist-v9-001';
const CHILD_ID = 'child-v9-001';

let testEnv;

beforeAll(async () => {
  testEnv = await getTestEnv();
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection('parents').doc(PARENT_UID).set({
      displayName: 'P', email: 'p@x.test', kws_parent_id: 'kws-v9-001',
    });
    await db.collection('therapists').doc(THERAPIST_UID).set({
      displayName: 'T', email: 't@x.test',
    });
    await db.collection('children').doc(CHILD_ID).set({
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      displayName: 'Kid',
      parental_consent_verified: true,
      parental_consent_source: 'kws',
      kws_parent_id: 'kws-v9-001',
    });
    // Seed a stripe_events row + an attempt counter so READ tests have something to be denied on
    await db.collection('stripe_events').doc('evt_test_001').set({
      eventId: 'evt_test_001',
      type: 'payment_intent.succeeded',
      receivedAt: new Date(),
      processed: true,
    });
    await db.collection('purchases').doc(CHILD_ID).collection('attempts').doc('program_499').set({
      attemptSeq: 0,
      lastOutcome: 'success',
    });
  });
});

describe('LD-290 stripe_events admin-only', () => {
  test('parent CANNOT read stripe_events', async () => {
    const db = await authedDb(testEnv, PARENT_UID, { role: 'parent' });
    await assertFails(db.collection('stripe_events').doc('evt_test_001').get());
  });

  test('parent CANNOT write stripe_events', async () => {
    const db = await authedDb(testEnv, PARENT_UID, { role: 'parent' });
    await assertFails(
      db.collection('stripe_events').doc('evt_attack_001').set({ type: 'fake' })
    );
  });

  test('therapist CANNOT read stripe_events', async () => {
    const db = await authedDb(testEnv, THERAPIST_UID, { role: 'therapist' });
    await assertFails(db.collection('stripe_events').doc('evt_test_001').get());
  });

  test('therapist CANNOT write stripe_events', async () => {
    const db = await authedDb(testEnv, THERAPIST_UID, { role: 'therapist' });
    await assertFails(
      db.collection('stripe_events').doc('evt_attack_002').set({ type: 'fake' })
    );
  });

  test('unauthenticated CANNOT read stripe_events', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('stripe_events').doc('evt_test_001').get());
  });
});

describe('LD-290 purchases/{childId}/attempts admin-only', () => {
  test('parent CANNOT read attempts (would leak attemptSeq for client-side spoofing)', async () => {
    const db = await authedDb(testEnv, PARENT_UID, { role: 'parent' });
    await assertFails(
      db.collection('purchases').doc(CHILD_ID).collection('attempts').doc('program_499').get()
    );
  });

  test('parent CANNOT write attempts (the entire LD-290 invariant — server-only attemptSeq authority)', async () => {
    const db = await authedDb(testEnv, PARENT_UID, { role: 'parent' });
    await assertFails(
      db.collection('purchases').doc(CHILD_ID).collection('attempts').doc('program_499')
        .set({ attemptSeq: 999 })
    );
  });

  test('therapist CANNOT read attempts', async () => {
    const db = await authedDb(testEnv, THERAPIST_UID, { role: 'therapist' });
    await assertFails(
      db.collection('purchases').doc(CHILD_ID).collection('attempts').doc('program_499').get()
    );
  });
});

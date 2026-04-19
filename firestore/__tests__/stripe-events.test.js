/**
 * MindfulNest Firestore Rules — stripe_events Deny Tests
 *
 * LD-290 STRIPE_IDEMPOTENCY_KEY_V1 (overnight 2026-04-19).
 *
 * The /stripe_events/{eventId} collection is the dedup ledger written
 * exclusively by the Cloud Function `stripeWebhook` via the Admin SDK.
 * Clients must not read or write — that would leak payment-event timing
 * and risk poisoning the dedup gate.
 *
 * These tests cover the failing-closed contract for ALL client identities
 * (unauth + parent + therapist).
 *
 * Tests run against the Firebase Emulator (127.0.0.1:8080).
 * Start emulator: firebase emulators:start --only firestore
 * Run tests: npm run test:rules
 */

const {
  getTestEnv,
  authedDb,
  unauthDb,
  assertFails,
} = require('./setup');

const PARENT_UID = 'parent-stripe-001';
const THERAPIST_UID = 'therapist-stripe-001';
const EVENT_ID = 'evt_test_dedup_001';

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

describe('stripe_events client deny', () => {
  test('unauthenticated read is denied', async () => {
    const db = unauthDb(testEnv);
    await assertFails(db.collection('stripe_events').doc(EVENT_ID).get());
  });

  test('unauthenticated write is denied', async () => {
    const db = unauthDb(testEnv);
    await assertFails(
      db.collection('stripe_events').doc(EVENT_ID).set({
        type: 'checkout.session.completed',
        processed: false,
      }),
    );
  });

  test('parent-authenticated read is denied', async () => {
    // Bootstrap parent doc via security-bypass context so the parent IS a parent.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection('parents')
        .doc(PARENT_UID)
        .set({
          email: 'p@example.com',
          displayName: 'Parent Stripe Test',
          coppaChatConsent: false,
          parental_consent_verified: true,
          parental_consent_source: 'kws',
          kws_parent_id: 'kws-test',
        });
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('stripe_events').doc(EVENT_ID).get());
  });

  test('parent-authenticated write is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection('parents')
        .doc(PARENT_UID)
        .set({
          email: 'p@example.com',
          displayName: 'Parent Stripe Test',
          coppaChatConsent: false,
          parental_consent_verified: true,
          parental_consent_source: 'kws',
          kws_parent_id: 'kws-test',
        });
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.collection('stripe_events').doc(EVENT_ID).set({
        type: 'checkout.session.completed',
        processed: true,
      }),
    );
  });

  test('therapist-authenticated read is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection('therapists')
        .doc(THERAPIST_UID)
        .set({
          email: 't@example.com',
          displayName: 'Therapist Stripe Test',
        });
    });
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertFails(db.collection('stripe_events').doc(EVENT_ID).get());
  });

  test('therapist-authenticated write is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection('therapists')
        .doc(THERAPIST_UID)
        .set({
          email: 't@example.com',
          displayName: 'Therapist Stripe Test',
        });
    });
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertFails(
      db.collection('stripe_events').doc(EVENT_ID).set({
        type: 'checkout.session.completed',
        processed: true,
      }),
    );
  });

  test('parent-authenticated update is denied', async () => {
    // Seed the doc via admin/disabled-rules so the update target exists.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection('stripe_events')
        .doc(EVENT_ID)
        .set({
          type: 'checkout.session.completed',
          processed: false,
        });
      await ctx
        .firestore()
        .collection('parents')
        .doc(PARENT_UID)
        .set({
          email: 'p@example.com',
          displayName: 'Parent Stripe Test',
          coppaChatConsent: false,
          parental_consent_verified: true,
          parental_consent_source: 'kws',
          kws_parent_id: 'kws-test',
        });
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.collection('stripe_events').doc(EVENT_ID).update({ processed: true }),
    );
  });

  test('parent-authenticated delete is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection('stripe_events')
        .doc(EVENT_ID)
        .set({
          type: 'checkout.session.completed',
          processed: true,
        });
      await ctx
        .firestore()
        .collection('parents')
        .doc(PARENT_UID)
        .set({
          email: 'p@example.com',
          displayName: 'Parent Stripe Test',
          coppaChatConsent: false,
          parental_consent_verified: true,
          parental_consent_source: 'kws',
          kws_parent_id: 'kws-test',
        });
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('stripe_events').doc(EVENT_ID).delete());
  });
});

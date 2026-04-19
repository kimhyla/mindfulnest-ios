/**
 * firestore.rules v8 — /audit_logs parent + therapist read rules.
 *
 * Preflight: prod_preflight_reviews id=74.
 * Invariants:
 *   - CF-only writes retained (all client writes denied)
 *   - Parent reads rows where resource.data.childId is their linked child
 *   - Therapist reads rows where resource.data.childId is their linked child
 *   - Orphan rows (childId == null) stay admin-only
 *   - Other parent / other therapist cannot read
 */

const { getTestEnv, authedDb, assertFails, assertSucceeds } = require('./setup');

const PARENT_UID = 'parent-v8-001';
const OTHER_PARENT_UID = 'parent-v8-other';
const THERAPIST_UID = 'therapist-v8-001';
const OTHER_THERAPIST_UID = 'therapist-v8-other';
const CHILD_ID = 'child-v8-001';
const OTHER_CHILD_ID = 'child-v8-other';

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
    await db.collection('parents').doc(PARENT_UID).set({ displayName: 'P', email: 'p@x.test', kws_parent_id: 'kws-v8-001' });
    await db.collection('parents').doc(OTHER_PARENT_UID).set({ displayName: 'O', email: 'o@x.test', kws_parent_id: 'kws-v8-002' });
    await db.collection('therapists').doc(THERAPIST_UID).set({ displayName: 'T', email: 't@x.test' });
    await db.collection('therapists').doc(OTHER_THERAPIST_UID).set({ displayName: 'T2', email: 't2@x.test' });
    await db.collection('children').doc(CHILD_ID).set({
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      displayName: 'Kid',
      parental_consent_verified: true,
      parental_consent_source: 'kws',
      kws_parent_id: 'kws-v8-001',
    });
    await db.collection('children').doc(OTHER_CHILD_ID).set({
      linkedParent: OTHER_PARENT_UID,
      linkedTherapist: OTHER_THERAPIST_UID,
      displayName: 'OtherKid',
      parental_consent_verified: true,
      parental_consent_source: 'kws',
      kws_parent_id: 'kws-v8-002',
    });
  });
});

async function seedAuditRow(id, overrides) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('audit_logs').doc(id).set({
      ts: new Date(),
      actor: 'system_cf',
      action: 'coin_awarded',
      collection: 'coin_ledger',
      docId: 'session-123',
      childId: CHILD_ID,
      ...overrides,
    });
  });
}

describe('audit_logs reads', () => {
  test('linked parent CAN read audit row for their child', async () => {
    await seedAuditRow('a1');
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.collection('audit_logs').doc('a1').get());
  });

  test('linked therapist CAN read audit row for their linked child', async () => {
    await seedAuditRow('a2');
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertSucceeds(db.collection('audit_logs').doc('a2').get());
  });

  test('unrelated parent CANNOT read audit row for another child', async () => {
    await seedAuditRow('a3');
    const db = authedDb(testEnv, OTHER_PARENT_UID);
    await assertFails(db.collection('audit_logs').doc('a3').get());
  });

  test('unrelated therapist CANNOT read audit row', async () => {
    await seedAuditRow('a4');
    const db = authedDb(testEnv, OTHER_THERAPIST_UID);
    await assertFails(db.collection('audit_logs').doc('a4').get());
  });

  test('orphan row (childId == null) hidden from all clients', async () => {
    await seedAuditRow('a5', { childId: null, action: 'parent_signup', collection: 'parents', docId: PARENT_UID });
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('audit_logs').doc('a5').get());
  });
});

describe('audit_logs writes', () => {
  test('parent CANNOT write to audit_logs', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('audit_logs').doc('w1').set({
      ts: new Date(),
      actor: PARENT_UID,
      action: 'forged',
      collection: 'zaps',
      docId: 'z1',
      childId: CHILD_ID,
    }));
  });

  test('therapist CANNOT write to audit_logs', async () => {
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertFails(db.collection('audit_logs').doc('w2').set({
      ts: new Date(),
      actor: THERAPIST_UID,
      action: 'forged',
      collection: 'zaps',
      docId: 'z1',
      childId: CHILD_ID,
    }));
  });

  test('parent CANNOT update an existing audit row', async () => {
    await seedAuditRow('w3');
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('audit_logs').doc('w3').update({ action: 'tampered' }));
  });

  test('parent CANNOT delete an audit row', async () => {
    await seedAuditRow('w4');
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('audit_logs').doc('w4').delete());
  });
});

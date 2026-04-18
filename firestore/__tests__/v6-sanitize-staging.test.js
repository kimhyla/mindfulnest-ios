/**
 * firestore.rules v6 — S3-CF-sanitize Pattern C staging-relay
 *
 * Governs: /zap_staging, /wishing_garden_staging, /zaps, /wishing_garden_entries, /audit_logs
 * Preflight: prod_preflight_reviews id=61.
 *
 * Invariants under test:
 *   - Parent can CREATE in _staging collections for their linked child (LD-226).
 *   - Parent cannot CREATE in _staging for a child that is not theirs.
 *   - Clients cannot UPDATE or DELETE staging docs (CF-only).
 *   - Canonical /zaps + /wishing_garden_entries are client-write-blocked
 *     (admin-SDK-only — path IS the trust boundary, per Counter-Agent #4 synthesis).
 *   - /audit_logs is fully opaque to clients (read + write both denied).
 *   - Canonical read is scoped to linked parent + linked therapist.
 */

const { getTestEnv, authedDb, assertFails, assertSucceeds } = require('./setup');

const PARENT_UID = 'parent-sanitize-001';
const OTHER_PARENT_UID = 'parent-sanitize-other';
const THERAPIST_UID = 'therapist-sanitize-001';
const CHILD_ID = 'child-sanitize-001';
const OTHER_CHILD_ID = 'child-sanitize-other';

let testEnv;

beforeAll(async () => {
  testEnv = await getTestEnv();
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed child-parent-therapist graph via admin context (bypasses rules).
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection('parents').doc(PARENT_UID).set({ displayName: 'P', email: 'p@x.test', kws_parent_id: 'kws-001' });
    await db.collection('parents').doc(OTHER_PARENT_UID).set({ displayName: 'O', email: 'o@x.test', kws_parent_id: 'kws-002' });
    await db.collection('therapists').doc(THERAPIST_UID).set({ displayName: 'T', email: 't@x.test' });
    await db.collection('children').doc(CHILD_ID).set({
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      displayName: 'Kid',
      parental_consent_verified: true,
      parental_consent_source: 'kws',
      kws_parent_id: 'kws-001',
    });
    await db.collection('children').doc(OTHER_CHILD_ID).set({
      linkedParent: OTHER_PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      displayName: 'OtherKid',
      parental_consent_verified: true,
      parental_consent_source: 'kws',
      kws_parent_id: 'kws-002',
    });
  });
});

describe('zap_staging', () => {
  test('parent CAN create staging doc for their own child', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.collection('zap_staging').doc('s1').set({
      childId: CHILD_ID,
      creatureId: 'M1',
      content: 'hello tessa',
      sent_at: new Date(),
    }));
  });

  test('parent CANNOT create staging doc for a child that is not theirs', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('zap_staging').doc('s2').set({
      childId: OTHER_CHILD_ID,
      creatureId: 'M1',
      content: 'hello',
      sent_at: new Date(),
    }));
  });

  test('parent CANNOT update staging doc after create (CF-only)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('zap_staging').doc('s3').set({
        childId: CHILD_ID,
        creatureId: 'M1',
        content: 'hi',
        sent_at: new Date(),
      });
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('zap_staging').doc('s3').update({ content: 'mutation' }));
  });

  test('parent CANNOT delete staging doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('zap_staging').doc('s4').set({
        childId: CHILD_ID, creatureId: 'M1', content: 'hi', sent_at: new Date(),
      });
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('zap_staging').doc('s4').delete());
  });

  test('parent CAN read their own staging doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('zap_staging').doc('s5').set({
        childId: CHILD_ID, creatureId: 'M1', content: 'hi', sent_at: new Date(),
      });
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.collection('zap_staging').doc('s5').get());
  });

  test('other parent CANNOT read staging doc that isn\'t theirs', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('zap_staging').doc('s6').set({
        childId: CHILD_ID, creatureId: 'M1', content: 'hi', sent_at: new Date(),
      });
    });
    const db = authedDb(testEnv, OTHER_PARENT_UID);
    await assertFails(db.collection('zap_staging').doc('s6').get());
  });
});

describe('canonical /zaps (admin-SDK-write-only)', () => {
  test('parent CANNOT write to canonical /zaps — must use staging path', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('zaps').doc('z1').set({
      childId: CHILD_ID, creatureId: 'M1', content: 'direct write', sent_at: new Date(),
    }));
  });

  test('parent CAN read their child\'s canonical zap (admin SDK seeded)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('zaps').doc('z2').set({
        childId: CHILD_ID, creatureId: 'M1', content: 'clean zap', sent_at: new Date(),
      });
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.collection('zaps').doc('z2').get());
  });

  test('linked therapist CAN read the canonical zap', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('zaps').doc('z3').set({
        childId: CHILD_ID, creatureId: 'M1', content: 'clean zap', sent_at: new Date(),
      });
    });
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertSucceeds(db.collection('zaps').doc('z3').get());
  });

  test('unrelated parent CANNOT read the canonical zap', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('zaps').doc('z4').set({
        childId: CHILD_ID, creatureId: 'M1', content: 'clean zap', sent_at: new Date(),
      });
    });
    const db = authedDb(testEnv, OTHER_PARENT_UID);
    await assertFails(db.collection('zaps').doc('z4').get());
  });
});

describe('wishing_garden_staging + canonical parity', () => {
  test('parent CAN create wishing_garden_staging for their own child', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.collection('wishing_garden_staging').doc('w1').set({
      childId: CHILD_ID,
      prompt: 'what did you learn',
      response: 'courage helps',
      created_at: new Date(),
    }));
  });

  test('parent CANNOT write canonical /wishing_garden_entries', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('wishing_garden_entries').doc('w2').set({
      childId: CHILD_ID, response: 'direct', created_at: new Date(),
    }));
  });
});

describe('/audit_logs (opaque)', () => {
  test('authenticated user CANNOT read audit logs', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('audit_logs').add({
        ts: new Date(), actor: 'x', action: 'x', collection: 'x', docId: 'x',
      });
    });
    const db = authedDb(testEnv, PARENT_UID);
    const snap = await db.collection('audit_logs').get().catch((e) => ({ error: e }));
    expect(snap).toHaveProperty('error');
  });

  test('authenticated user CANNOT write audit logs', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('audit_logs').doc('ax').set({
      ts: new Date(), actor: PARENT_UID, action: 'forged', collection: 'x', docId: 'x',
    }));
  });
});

/**
 * firestore.rules v7 — sessions + clq_responses + gpr_entries + therapist_summaries
 *
 * Preflight: prod_preflight_reviews id=62.
 * Covers 11 CRITICAL + 3 HIGH counter-findings from 4+4 Phase 0:
 *   - sessions hasOnly + type gates + completionStatus enum (coin-fraud defense)
 *   - clq_responses hasOnly top-level (LD-225 PII smuggle defense)
 *   - gpr_entries append-only + progress_delta is-number (no fabricated bounds)
 *   - therapist_summaries direct isChildsTherapist (no denormalized array)
 */

const { getTestEnv, authedDb, assertFails, assertSucceeds } = require('./setup');

const PARENT_UID = 'parent-v7-001';
const OTHER_PARENT_UID = 'parent-v7-other';
const THERAPIST_UID = 'therapist-v7-001';
const OTHER_THERAPIST_UID = 'therapist-v7-other';
const CHILD_ID = 'child-v7-001';
const OTHER_CHILD_ID = 'child-v7-other';

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
    await db.collection('parents').doc(PARENT_UID).set({ displayName: 'P', email: 'p@x.test', kws_parent_id: 'kws-v7-001' });
    await db.collection('parents').doc(OTHER_PARENT_UID).set({ displayName: 'O', email: 'o@x.test', kws_parent_id: 'kws-v7-002' });
    await db.collection('therapists').doc(THERAPIST_UID).set({ displayName: 'T', email: 't@x.test' });
    await db.collection('therapists').doc(OTHER_THERAPIST_UID).set({ displayName: 'T2', email: 't2@x.test' });
    await db.collection('children').doc(CHILD_ID).set({
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      displayName: 'Kid',
      parental_consent_verified: true,
      parental_consent_source: 'kws',
      kws_parent_id: 'kws-v7-001',
    });
    await db.collection('children').doc(OTHER_CHILD_ID).set({
      linkedParent: OTHER_PARENT_UID,
      linkedTherapist: OTHER_THERAPIST_UID,
      displayName: 'OtherKid',
      parental_consent_verified: true,
      parental_consent_source: 'kws',
      kws_parent_id: 'kws-v7-002',
    });
  });
});

describe('sessions', () => {
  const goodSession = () => ({
    childId: CHILD_ID,
    moduleId: 'M1',
    phase: 'phase_b',
    startedAt: new Date('2026-04-18T10:00:00Z'),
    endedAt: new Date('2026-04-18T10:05:00Z'),
    completionStatus: 'completed',
  });

  test('parent CAN create session for their own child', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.collection('sessions').doc('s1').set(goodSession()));
  });

  test('parent CANNOT create session for another child', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('sessions').doc('s2').set({ ...goodSession(), childId: OTHER_CHILD_ID }));
  });

  test('parent CANNOT add unknown field (coin-fraud guard)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('sessions').doc('s3').set({ ...goodSession(), coins_awarded: 999 }));
  });

  test('parent CANNOT set completionStatus to non-enum value', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('sessions').doc('s4').set({ ...goodSession(), completionStatus: 'fraudulent' }));
  });

  test('parent CANNOT set endedAt before startedAt', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('sessions').doc('s5').set({
      ...goodSession(),
      startedAt: new Date('2026-04-18T10:05:00Z'),
      endedAt: new Date('2026-04-18T10:00:00Z'),
    }));
  });

  test('parent CANNOT update a session (append-only)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('sessions').doc('s6').set(goodSession());
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('sessions').doc('s6').update({ completionStatus: 'completed' }));
  });

  test('linked therapist CAN read session', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('sessions').doc('s7').set(goodSession());
    });
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertSucceeds(db.collection('sessions').doc('s7').get());
  });

  test('unrelated parent CANNOT read session', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('sessions').doc('s8').set(goodSession());
    });
    const db = authedDb(testEnv, OTHER_PARENT_UID);
    await assertFails(db.collection('sessions').doc('s8').get());
  });
});

describe('clq_responses', () => {
  const goodClq = () => ({
    childId: CHILD_ID,
    administered_at: new Date(),
    administered_by: THERAPIST_UID,
    responses: { q1: 3, q2: 4 },
    is_baseline: true,
  });

  test('therapist CAN create CLQ for their child', async () => {
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertSucceeds(db.collection('clq_responses').doc('c1').set(goodClq()));
  });

  test('parent CANNOT create CLQ (therapist-only)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('clq_responses').doc('c2').set(goodClq()));
  });

  test('therapist CANNOT forge administered_by (must equal auth.uid)', async () => {
    const db = authedDb(testEnv, OTHER_THERAPIST_UID);
    await assertFails(db.collection('clq_responses').doc('c3').set({ ...goodClq(), administered_by: THERAPIST_UID }));
  });

  test('therapist CANNOT smuggle unknown top-level fields (LD-225 PII defense)', async () => {
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertFails(db.collection('clq_responses').doc('c4').set({ ...goodClq(), child_last_name: 'Smith' }));
  });

  test('parent CAN read their own child\'s CLQ', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('clq_responses').doc('c5').set(goodClq());
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.collection('clq_responses').doc('c5').get());
  });

  test('other therapist CANNOT read unrelated CLQ', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('clq_responses').doc('c6').set(goodClq());
    });
    const db = authedDb(testEnv, OTHER_THERAPIST_UID);
    await assertFails(db.collection('clq_responses').doc('c6').get());
  });

  test('CLQ is immutable after create', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('clq_responses').doc('c7').set(goodClq());
    });
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertFails(db.collection('clq_responses').doc('c7').update({ is_baseline: false }));
  });
});

describe('gpr_entries', () => {
  const goodGpr = () => ({
    childId: CHILD_ID,
    recorded_at: new Date(),
    goal_id: 'goal-self-worth',
    progress_delta: 5,
    notes: 'child verbalized progress',
  });

  test('parent CAN create gpr entry on their child', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.collection('gpr_entries').doc('g1').set(goodGpr()));
  });

  test('therapist CAN create gpr entry on their child', async () => {
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertSucceeds(db.collection('gpr_entries').doc('g2').set(goodGpr()));
  });

  test('parent CANNOT create gpr entry for another child', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('gpr_entries').doc('g3').set({ ...goodGpr(), childId: OTHER_CHILD_ID }));
  });

  test('progress_delta must be a number if present', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('gpr_entries').doc('g4').set({ ...goodGpr(), progress_delta: 'a lot' }));
  });

  test('unknown fields rejected (LD-225 allowlist)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('gpr_entries').doc('g5').set({ ...goodGpr(), hidden: 'evil' }));
  });

  test('gpr entry is append-only (no updates)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('gpr_entries').doc('g6').set(goodGpr());
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('gpr_entries').doc('g6').update({ progress_delta: 10 }));
  });
});

describe('therapist_summaries', () => {
  const summaryDoc = () => ({
    childId: CHILD_ID,
    totalSessions: 12,
    lastSessionAt: new Date(),
  });

  test('linked therapist CAN read their child\'s summary (doc id = childId)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('therapist_summaries').doc(CHILD_ID).set(summaryDoc());
    });
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertSucceeds(db.collection('therapist_summaries').doc(CHILD_ID).get());
  });

  test('other therapist CANNOT read the summary', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('therapist_summaries').doc(CHILD_ID).set(summaryDoc());
    });
    const db = authedDb(testEnv, OTHER_THERAPIST_UID);
    await assertFails(db.collection('therapist_summaries').doc(CHILD_ID).get());
  });

  test('parent CANNOT read therapist summary', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('therapist_summaries').doc(CHILD_ID).set(summaryDoc());
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.collection('therapist_summaries').doc(CHILD_ID).get());
  });

  test('therapist CANNOT write summary (CF-only, admin SDK bypasses rules)', async () => {
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertFails(db.collection('therapist_summaries').doc(CHILD_ID).set(summaryDoc()));
  });
});

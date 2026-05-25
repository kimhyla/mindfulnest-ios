// onDocumentCreated trigger on /sessions/{sessionId}.
//
// Behavior (preflight 71 synthesis):
//   1. If session.completionStatus !== 'completed' → no-op.
//   2. runTransaction: if /coin_ledger/{sessionId} already exists → no-op
//      (idempotent retry via sessionId-keyed .create()-ALREADY_EXISTS guard).
//   3. Read /children/{childId} for priorBalance + priorStonesEarned.
//   4. computeAwards(moduleId, phase, priorStones) → {coinDelta, stoneAwarded}.
//   5. Atomically within the same txn:
//        - create /coin_ledger/{sessionId}
//        - update /children/{childId}.coinBalance (cached projection;
//          ledger remains authoritative source-of-truth)
//        - if stoneAwarded: create /stone_ledger/{childId}_{stoneId}
//          + arrayUnion stoneId into /children/{childId}.stones_earned
//        - create /audit_logs/{auto} entry (LD-221 cross-CF invariant)
//
// No server-side session re-validation (phantom fields per Counter 2 #1 —
// deferred when modules.min_session_duration lands). Ledger is NOT the
// audit trail — audit_logs is, per Counter 2 #2.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { computeAwards } from '../../lib/coins/computeAwards';
import { writeAudit } from '../../lib/audit/log';
import { assertCoppaTrigger } from '../../middleware/withCoppaGuard';
import {
  MODULE_IDS,
  PHASES,
  type ModuleId,
  type Phase,
  type StoneId,
} from '../../config/moduleRewards';

if (getApps().length === 0) {
  initializeApp();
}

const MODULE_SET = new Set<string>(MODULE_IDS);
const PHASE_SET = new Set<string>(PHASES);

export const awardCoinsOnSession = onDocumentCreated(
  { document: 'sessions/{sessionId}' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const sessionId = event.params.sessionId;
    const data = snap.data() as Record<string, unknown>;

    if (data.completionStatus !== 'completed') return;
    const childId = data.childId;
    const moduleId = data.moduleId;
    const phase = data.phase;

    if (typeof childId !== 'string') return;
    if (typeof moduleId !== 'string' || !MODULE_SET.has(moduleId)) return;
    if (typeof phase !== 'string' || !PHASE_SET.has(phase)) return;

    const db = getFirestore();
    const ledgerRef = db.collection('coin_ledger').doc(sessionId);
    const childRef = db.collection('children').doc(childId);

    await db.runTransaction(async (txn) => {
      // COPPA guard — spec §7.2. Validates childId + allowlist + audit inside txn.
      await assertCoppaTrigger(
        { kind: 'txn', db, txn },
        {
          childId,
          writeAllowlist: ['coinBalance', 'stones_earned'],
          documentFields: { coinBalance: true, stones_earned: true },
        },
      );
      const ledgerSnap = await txn.get(ledgerRef);
      if (ledgerSnap.exists) return; // idempotent no-op

      const childSnap = await txn.get(childRef);
      const priorBalance = (childSnap.get('coinBalance') as number | undefined) ?? 0;
      const priorStonesRaw = (childSnap.get('stones_earned') as unknown) ?? [];
      const priorStones: StoneId[] = Array.isArray(priorStonesRaw)
        ? (priorStonesRaw as StoneId[])
        : [];

      const awards = computeAwards({
        moduleId: moduleId as ModuleId,
        phase: phase as Phase,
        priorStonesEarned: priorStones,
      });

      txn.create(ledgerRef, {
        childId,
        moduleId,
        phase,
        sessionId,
        coin_delta: awards.coinDelta,
        stone_awarded: awards.stoneAwarded ?? null,
        rationale: awards.rationale,
        created_at: FieldValue.serverTimestamp(),
        _cf: 'awardCoinsOnSession',
      });

      const childUpdates: Record<string, unknown> = {
        coinBalance: priorBalance + awards.coinDelta,
      };
      if (awards.stoneAwarded) {
        childUpdates.stones_earned = FieldValue.arrayUnion(awards.stoneAwarded);
        const stoneRef = db
          .collection('stone_ledger')
          .doc(`${childId}_${awards.stoneAwarded}`);
        txn.create(stoneRef, {
          childId,
          stone_id: awards.stoneAwarded,
          moduleId,
          sessionId,
          awarded_at: FieldValue.serverTimestamp(),
          _cf: 'awardCoinsOnSession',
        });
      }
      txn.update(childRef, childUpdates);

      await writeAudit(
        { kind: 'txn', db, txn },
        {
          actor: 'system_cf',
          action: awards.stoneAwarded ? 'coin_and_stone_awarded' : 'coin_awarded',
          collection: 'coin_ledger',
          docId: sessionId,
          childId,
          extra: {
            moduleId,
            phase,
            coin_delta: awards.coinDelta,
            stone_awarded: awards.stoneAwarded ?? null,
          },
        },
      );
    });
  },
);

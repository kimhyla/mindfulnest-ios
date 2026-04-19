// Entry point for all 5 source-collection triggers.
// Queries Firestore for the given childId, computes SourceCounts, assembles
// the TherapistSummary, skip-writes if identical to existing.
//
// Full-recompute model (Counters 2/3/4 Phase 0 synthesis): no cursors, no
// eventId ring buffer, no delta math. Every trigger call reads the current
// source state and produces the same output — idempotent by construction.

import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { computeSummaryFromCounts, summariesEqual, type SourceCounts } from './computeSummary';
import { assertSummaryShape, type SummarySource, type TherapistSummary } from './types';
import { writeAudit } from '../audit/log';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

// Read source counts by fetching all docs for this child and filtering in
// memory by timestamp window. Avoids composite-index setup for v1. Volume is
// bounded by child activity (~50 docs / 30d / collection) so reads are cheap.
async function readSourceCounts(db: Firestore, childId: string, nowMs: number): Promise<SourceCounts> {
  const cutoff30d = nowMs - MONTH_MS;
  const cutoff7d = nowMs - WEEK_MS;

  const [zapsSnap, gardenSnap, sessionsSnap, clqSnap, gprSnap] = await Promise.all([
    db.collection('zaps').where('childId', '==', childId).get(),
    db.collection('wishing_garden_entries').where('childId', '==', childId).get(),
    db.collection('sessions').where('childId', '==', childId).get(),
    db.collection('clq_responses').where('childId', '==', childId).get(),
    db.collection('gpr_entries').where('childId', '==', childId).get(),
  ]);

  let zaps_7d = 0;
  let zaps_30d = 0;
  let garden_30d = 0;
  let sessions_30d = 0;
  const latestActivity: number[] = [];

  for (const d of zapsSnap.docs) {
    const ts = extractMs(d.get('sent_at'));
    if (ts == null) continue;
    latestActivity.push(ts);
    if (ts >= cutoff30d) zaps_30d++;
    if (ts >= cutoff7d) zaps_7d++;
  }
  for (const d of gardenSnap.docs) {
    const ts = extractMs(d.get('created_at'));
    if (ts == null) continue;
    latestActivity.push(ts);
    if (ts >= cutoff30d) garden_30d++;
  }
  for (const d of sessionsSnap.docs) {
    const ts = extractMs(d.get('endedAt'));
    if (ts == null) continue;
    latestActivity.push(ts);
    if (ts >= cutoff30d) sessions_30d++;
  }

  let clq_latest_score: number | null = null;
  let clq_latest_at_ms: number | null = null;
  for (const d of clqSnap.docs) {
    const ts = extractMs(d.get('administered_at'));
    if (ts == null) continue;
    if (clq_latest_at_ms == null || ts > clq_latest_at_ms) {
      clq_latest_at_ms = ts;
      const raw = d.get('total_score');
      clq_latest_score = typeof raw === 'number' ? raw : null;
    }
  }

  const gpr_active_goals = new Set<string>();
  const gprDeltas7d: number[] = [];
  for (const d of gprSnap.docs) {
    const ts = extractMs(d.get('recorded_at'));
    if (ts == null) continue;
    const goal = d.get('goal_id');
    if (typeof goal === 'string') gpr_active_goals.add(goal);
    if (ts >= cutoff7d) {
      const delta = d.get('progress_delta');
      if (typeof delta === 'number') gprDeltas7d.push(delta);
    }
  }

  const gpr_avg_7d =
    gprDeltas7d.length > 0
      ? gprDeltas7d.reduce((a, b) => a + b, 0) / gprDeltas7d.length
      : null;

  return {
    zaps_7d,
    zaps_30d,
    garden_30d,
    sessions_30d,
    clq_latest_score,
    clq_latest_at_ms,
    gpr_active_goal_count: gpr_active_goals.size,
    gpr_avg_7d,
    latest_activity_at_ms: latestActivity.length > 0 ? Math.max(...latestActivity) : null,
  };
}

function extractMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'object' && 'toMillis' in value) {
    const ms = (value as { toMillis: () => number }).toMillis();
    return typeof ms === 'number' ? ms : null;
  }
  return null;
}

export async function recomputeSummary(
  childId: string,
  source: SummarySource,
): Promise<{ written: boolean }> {
  const db = getFirestore();
  const nowMs = Date.now();
  const counts = await readSourceCounts(db, childId, nowMs);
  const target = computeSummaryFromCounts(
    childId,
    counts,
    source,
    nowMs,
    FieldValue.serverTimestamp(),
  );

  // Runtime assert: admin SDK bypasses rules + sanitizeAgainstSchema, so this
  // module owns the LD-225 defense (per Counter 3 Phase 0 #2).
  assertSummaryShape(target as unknown as Record<string, unknown>);

  const ref = db.collection('therapist_summaries').doc(childId);
  const existing = await ref.get();
  if (existing.exists) {
    const prev = existing.data() as Partial<TherapistSummary>;
    if (summariesEqual(target, prev)) {
      return { written: false };
    }
  }

  await ref.set(target);
  await writeAudit(
    { kind: 'db', db },
    {
      actor: 'system_cf',
      action: 'therapist_summary_written',
      collection: 'therapist_summaries',
      docId: childId,
      childId,
      extra: { source },
    },
  );
  return { written: true };
}

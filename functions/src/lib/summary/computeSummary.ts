// PURE computation: SourceCounts + nowMs → TherapistSummary payload.
// No Firestore imports, no Date.now() — fully testable via node --test.
//
// LD-225 compliance: only emits bucketed + count fields. Raw event timestamps
// (nanoseconds/millis) are accepted as inputs ONLY to compute buckets; they
// are never returned in the output payload.
//
// Idempotency: given identical inputs, returns byte-identical output. Combined
// with summariesEqual() in recomputeSummary.ts, this lets us skip no-op writes.

import type { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type {
  ActivityBucket,
  ClqBucket,
  SummarySource,
  TherapistSummary,
} from './types';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

export interface SourceCounts {
  readonly zaps_7d: number;
  readonly zaps_30d: number;
  readonly garden_30d: number;
  readonly sessions_30d: number;
  readonly clq_latest_score: number | null;
  readonly clq_latest_at_ms: number | null;
  readonly gpr_active_goal_count: number;
  readonly gpr_avg_7d: number | null;
  readonly latest_activity_at_ms: number | null;
}

export function bucketActivity(atMs: number | null, nowMs: number): ActivityBucket {
  if (atMs == null) return 'never';
  const dt = nowMs - atMs;
  if (dt < DAY_MS) return 'today';
  if (dt < WEEK_MS) return 'this_week';
  return 'older';
}

export function bucketClq(atMs: number | null, nowMs: number): ClqBucket {
  if (atMs == null) return 'never';
  const dt = nowMs - atMs;
  if (dt < WEEK_MS) return 'this_week';
  if (dt < MONTH_MS) return 'this_month';
  return 'older';
}

export function activeThisWeek(atMs: number | null, nowMs: number): boolean {
  if (atMs == null) return false;
  return nowMs - atMs < WEEK_MS;
}

export type ComputedSummary = Omit<TherapistSummary, 'updated_at'> & {
  updated_at: FieldValue | Timestamp;
};

export function computeSummaryFromCounts(
  childId: string,
  counts: SourceCounts,
  source: SummarySource,
  nowMs: number,
  serverTs: FieldValue | Timestamp,
): ComputedSummary {
  return {
    childId,
    updated_at: serverTs,
    zaps_7d: counts.zaps_7d,
    zaps_30d: counts.zaps_30d,
    garden_30d: counts.garden_30d,
    sessions_30d: counts.sessions_30d,
    clq_latest_score: counts.clq_latest_score,
    clq_latest_at_bucket: bucketClq(counts.clq_latest_at_ms, nowMs),
    gpr_active_goal_count: counts.gpr_active_goal_count,
    gpr_avg_7d: counts.gpr_avg_7d,
    active_this_week: activeThisWeek(counts.latest_activity_at_ms, nowMs),
    activity_bucket: bucketActivity(counts.latest_activity_at_ms, nowMs),
    _last_source: source,
  };
}

// Deep-equal comparison across content fields (excludes updated_at which always
// differs). Used by recomputeSummary to skip no-op writes, per Counter 4 Phase 0
// finding (hash-based comparison is net-negative; in-memory compare is cheaper).
export function summariesEqual(
  a: Partial<TherapistSummary>,
  b: Partial<TherapistSummary>,
): boolean {
  const keys: ReadonlyArray<keyof TherapistSummary> = [
    'childId',
    'zaps_7d',
    'zaps_30d',
    'garden_30d',
    'sessions_30d',
    'clq_latest_score',
    'clq_latest_at_bucket',
    'gpr_active_goal_count',
    'gpr_avg_7d',
    'active_this_week',
    'activity_bucket',
  ];
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

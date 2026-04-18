// TherapistSummary shape — aligned with content-lockfiles/firestore_schema.json
// therapist_summaries entry. Enforced at write-time via assertSummaryShape()
// because admin SDK bypasses Firestore rules + sanitizeAgainstSchema.
//
// LD-225 compliance: bucketed counts + booleans + enums only.
// FORBIDDEN: raw event timestamps (reveal sleep/school patterns per
// Counter 1 Phase 0 finding).

import type { Timestamp } from 'firebase-admin/firestore';

export type ActivityBucket = 'today' | 'this_week' | 'older' | 'never';
export type ClqBucket = 'this_week' | 'this_month' | 'older' | 'never';
export type SummarySource =
  | 'trigger_zaps'
  | 'trigger_wishing_garden'
  | 'trigger_sessions'
  | 'trigger_clq'
  | 'trigger_gpr';

export interface TherapistSummary {
  readonly childId: string;
  readonly updated_at: Timestamp | FirebaseFirestore.FieldValue;
  readonly zaps_7d: number;
  readonly zaps_30d: number;
  readonly garden_30d: number;
  readonly sessions_30d: number;
  readonly clq_latest_score: number | null;
  readonly clq_latest_at_bucket: ClqBucket;
  readonly gpr_active_goal_count: number;
  readonly gpr_avg_7d: number | null;
  readonly active_this_week: boolean;
  readonly activity_bucket: ActivityBucket;
  readonly _last_source: SummarySource;
}

export const ALLOWED_KEYS: ReadonlyArray<keyof TherapistSummary> = [
  'childId',
  'updated_at',
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
  '_last_source',
];

export const FORBIDDEN_KEYS: ReadonlyArray<string> = [
  'last_zap_at',
  'last_entry_at',
  'last_session_at',
  'content_preview',
  'message_preview',
  'clq_responses_inline',
  'gpr_deltas_inline',
  'per_day_distribution',
  'per_hour_distribution',
];

export function assertSummaryShape(doc: Record<string, unknown>): void {
  const keys = new Set(Object.keys(doc));
  for (const forbidden of FORBIDDEN_KEYS) {
    if (keys.has(forbidden)) {
      throw new Error(`therapist_summary write blocked: forbidden field "${forbidden}" (LD-225 pattern-reveal defense)`);
    }
  }
  const allowed = new Set<string>(ALLOWED_KEYS as readonly string[]);
  for (const k of keys) {
    if (!allowed.has(k)) {
      throw new Error(`therapist_summary write blocked: unknown field "${k}" (add to types.ts ALLOWED_KEYS if legitimate)`);
    }
  }
}

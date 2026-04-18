// 5 Firestore triggers that invalidate the therapist summary when any of the
// source collections write. Each fires `recomputeSummary(childId, source)` —
// full recompute is idempotent (Counter 2/3/4 Phase 0 synthesis).
//
// No dirty-flag + scheduler (Counter 1 #2 trigger-loop risk rejected).
// Loop invariant: NO trigger on `/therapist_summaries/*` is declared anywhere.

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { recomputeSummary } from '../../lib/summary/recomputeSummary';
import type { SummarySource } from '../../lib/summary/types';

if (getApps().length === 0) {
  initializeApp();
}

function extractChildId(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): string | null {
  const d = after ?? before;
  if (d && typeof d.childId === 'string') return d.childId;
  return null;
}

function makeTrigger(collection: string, source: SummarySource) {
  return onDocumentWritten(`${collection}/{docId}`, async (event) => {
    const before = event.data?.before?.data() as Record<string, unknown> | undefined;
    const after = event.data?.after?.data() as Record<string, unknown> | undefined;
    const childId = extractChildId(before, after);
    if (!childId) return;
    await recomputeSummary(childId, source);
  });
}

export const summaryOnZapsWritten = makeTrigger('zaps', 'trigger_zaps');
export const summaryOnWishingGardenWritten = makeTrigger('wishing_garden_entries', 'trigger_wishing_garden');
export const summaryOnSessionsWritten = makeTrigger('sessions', 'trigger_sessions');
export const summaryOnClqWritten = makeTrigger('clq_responses', 'trigger_clq');
export const summaryOnGprWritten = makeTrigger('gpr_entries', 'trigger_gpr');

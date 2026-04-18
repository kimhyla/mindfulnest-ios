// Pattern C relay for /zap_staging/{id} → /zaps/{id}. See preflight id=61
// synthesis + LD-171 FIRESTORE_FIELD_LEVEL_SANITIZATION_VIA_CLOUD_FUNCTION.
//
// Contract (what clients see):
//   1. Client writes to /zap_staging/{id} (rules allow if authed parent).
//   2. Firebase Functions v2 invokes this handler on onDocumentCreated.
//   3. If sanitize passes: canonical doc written at /zaps/{id}; staging doc
//      gets `_sanitize_status: {ok: true, canonical_id}`. Staging doc is
//      retained until the scheduled purge (LD-237) reaps it — keeps the
//      client's optimistic write traceable.
//   4. If sanitize fails: canonical NOT written; staging doc gets
//      `_sanitize_status: {ok: false, violations: [...]}`. Client listener
//      surfaces "try different words" without losing the child's draft.
//
// Invariants:
//   - Canonical /zaps/* path is admin-SDK-write-only (rules v6 enforce).
//     Path IS the trust boundary — no `_sanitized: true` flag to forge.
//   - No writes to parent /children/{cid} doc (no hot-doc contention with
//     coin-txn, therapist-summary, retention).
//   - Retention is OUT OF SCOPE for this CF (LD-218 semantics owned by
//     S3-POLISH-retention).

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { sanitizeAgainstSchema } from '../../lib/sanitize/sanitizeAgainstSchema';
import { writeAudit } from '../../lib/audit/log';

if (getApps().length === 0) {
  initializeApp();
}

export const sanitizeZapStaging = onDocumentCreated(
  { document: 'zap_staging/{stagingId}' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const stagingId = event.params.stagingId;
    const data = snap.data() as Record<string, unknown> | undefined;

    const db = getFirestore();
    const result = sanitizeAgainstSchema('zaps', data);
    const actor = (data && typeof data.childId === 'string') ? data.childId : 'unknown';

    if (!result.ok) {
      await snap.ref.update({
        _sanitize_status: {
          ok: false,
          at: FieldValue.serverTimestamp(),
          violations: result.violations.map((v) => ({ kind: v.kind, field: v.field, detail: v.detail ?? null })),
        },
      });
      await writeAudit(
        { kind: 'db', db },
        {
          actor,
          action: 'zap_sanitize_rejected',
          collection: 'zaps',
          docId: stagingId,
          childId: actor !== 'unknown' ? actor : null,
          extra: { violation_count: result.violations.length },
        },
      );
      return;
    }

    await db.collection('zaps').doc(stagingId).set(result.clean!);
    await snap.ref.update({
      _sanitize_status: {
        ok: true,
        at: FieldValue.serverTimestamp(),
        canonical_id: stagingId,
      },
    });
    await writeAudit(
      { kind: 'db', db },
      {
        actor,
        action: 'zap_sanitize_ok',
        collection: 'zaps',
        docId: stagingId,
        childId: actor !== 'unknown' ? actor : null,
      },
    );
  },
);

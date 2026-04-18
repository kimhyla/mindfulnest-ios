// Pattern C relay for /wishing_garden_staging/{id} → /wishing_garden_entries/{id}.
// Mirror of sanitizeZapStaging; see that file's header for the full contract.
// LD-171 applies identically: wishing garden entries are child-authored and
// require the same field-allowlist + PII-scan gate before canonical storage.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { sanitizeAgainstSchema } from '../../lib/sanitize/sanitizeAgainstSchema';
import { writeAudit } from '../../lib/audit/log';

if (getApps().length === 0) {
  initializeApp();
}

export const sanitizeWishingGardenStaging = onDocumentCreated(
  { document: 'wishing_garden_staging/{stagingId}' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const stagingId = event.params.stagingId;
    const data = snap.data() as Record<string, unknown> | undefined;

    const db = getFirestore();
    const result = sanitizeAgainstSchema('wishing_garden_entries', data);
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
          action: 'wishing_garden_sanitize_rejected',
          collection: 'wishing_garden_entries',
          docId: stagingId,
          childId: actor !== 'unknown' ? actor : null,
          extra: { violation_count: result.violations.length },
        },
      );
      return;
    }

    await db.collection('wishing_garden_entries').doc(stagingId).set(result.clean!);
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
        action: 'wishing_garden_sanitize_ok',
        collection: 'wishing_garden_entries',
        docId: stagingId,
        childId: actor !== 'unknown' ? actor : null,
      },
    );
  },
);

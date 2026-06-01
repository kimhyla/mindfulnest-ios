// Callable CF: authed parent → (moduleId) → signed Firebase Storage URL.
//
// LD-406: CDN = Firebase Storage mindfulnestkids.firebasestorage.app.
//         Signed URLs from this CF only — app never calls Storage directly.
// LD-329: Entitlement check — parents/{uid}.entitlements.arc_{N} === true.
// LD-221: Audit row on every child-data access, including URL grants.
// LD-222: Signed URL expiry ≤ 1 hour; TLS 1.2+ (enforced by GCP).
// LD-229: onCall, not onRequest.
// LD-277: enforceAppCheck: true — LD-802 gate closed 2026-05-25.
// PHASE_BOUNDARIES_NAMED_OBJECT_V1: phaseBoundaries returned as named objects.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp, getApps } from 'firebase-admin/app';
import { writeAudit } from '../../lib/audit/log';

if (getApps().length === 0) {
  initializeApp();
}

const MODULE_ID_RE = /^m\d+$/i;

// phaseBoundaries coercion: flat float[] → named objects (compatibility shim
// for modules uploaded before PHASE_BOUNDARIES_NAMED_OBJECT_V1).
const PHASE_NAMES = ['intro', 'phase_a', 'phase_b', 'resolution'] as const;

export interface PhaseBoundary {
  name: string;
  start_s: number;
  end_s: number;
}

function coerceBoundaries(raw: unknown): PhaseBoundary[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  // Already named objects
  if (typeof raw[0] === 'object' && raw[0] !== null && 'name' in raw[0]) {
    return raw as PhaseBoundary[];
  }
  // Flat number[] — coerce using stable index convention per PHASE_BOUNDARIES_NAMED_OBJECT_V1
  return (raw as number[]).map((start_s, i) => ({
    name: PHASE_NAMES[i] ?? `phase_${i}`,
    start_s,
    end_s: (raw as number[])[i + 1] ?? start_s,
  }));
}

export const generateModuleDownloadUrl = onCall(
  {
    enforceAppCheck: true, // LD-277 + LD-802 gate closed 2026-05-25
    region: 'us-central1', // LD-222 US data residency
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Authentication required.');

    const { moduleId } = (request.data ?? {}) as { moduleId?: string };
    if (!moduleId || !MODULE_ID_RE.test(moduleId)) {
      throw new HttpsError('invalid-argument', 'moduleId must match /^m\\d+$/i.');
    }

    const id = moduleId.toLowerCase();
    const db = getFirestore();

    // Read module manifest doc (Admin SDK — bypasses client-facing rules)
    const modDoc = await db.collection('modules').doc(id).get();
    if (!modDoc.exists) throw new HttpsError('not-found', 'Module not found.');
    const modData = modDoc.data()!;
    // Canonical field is status (string) per firestore.rules + CDM.
    // NOT modData.published (bool) — that field does not exist in the module schema.
    if (modData.status !== 'published') {
      throw new HttpsError('not-found', 'Module not available.');
    }

    const arcId: string = modData.arcId;
    const contentHash: string = modData.contentHash;
    const sizeBytes: number = modData.sizeBytes;
    const cdnUrl: string = modData.cdnUrl; // gs://bucket/path URI
    const phaseBoundaries = coerceBoundaries(modData.phaseBoundaries);

    // Entitlement check — LD-329: parents/{uid}.entitlements.arc_{N} === true
    // arcId examples: 'arc1' → arcKey: 'arc_1'
    const arcKey = `arc_${arcId.replace(/\D/g, '')}`;
    const parentDoc = await db.collection('parents').doc(uid).get();
    const entitled =
      parentDoc.exists && parentDoc.data()?.entitlements?.[arcKey] === true;
    if (!entitled) {
      throw new HttpsError('permission-denied', 'No entitlement for this arc.');
    }

    // Derive GCS path from cdnUrl (gs://bucket/path → path)
    const storagePath = cdnUrl.replace(/^gs:\/\/[^/]+\//, '');

    // Generate signed URL — 1-hour expiry per LD-406 + LD-222
    const bucket = getStorage().bucket(); // default bucket from initializeApp
    const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
      version: 'v4',
    });

    // Audit row per LD-221 — actor + resource path only, no child PII in log
    await writeAudit(
      { kind: 'db', db },
      {
        actor: uid,
        action: 'module_download_url_granted',
        collection: 'modules',
        docId: id,
        childId: null, // parent-scoped grant — no child context at this layer
      },
    );

    return {
      url: signedUrl,
      contentHash,
      sizeBytes,
      phaseBoundaries,
      arcId,
      moduleId: id,
    };
  },
);

// renderTtsLine HTTPS callable: authed parent → TTS render for own child.
//
// Preflight: prod_preflight_reviews id=82.
// Locked decision: TTS_APP_RENDER_PATTERN_C_ONCALL_ELEVENLABS_20260418.
// Stage 3 inventory: APP-14 (was NOT-SCOPED → BUILT-PENDING-REVIEW).
//
// Contract:
//   request.data = { scriptId, lineId, voiceId, text, childId }
//   → (1) auth required, (2) caller must be isChildsParent(childId),
//     (3) quota <= 100/day/child, (4) idempotent on textHash,
//     (5) mp3 uploaded to Pattern C Storage path, (6) Firestore
//     audio_renders/{lineId} written, (7) audit row written on EVERY
//     attempt (ok | denied | quota_exceeded | upstream_failed | failed).
//   response = { storagePath, downloadUrl, durationMs, cached: boolean }
//
// Ownership + quota atomicity: a single Firestore transaction
//   (a) re-reads /children/{childId} to confirm linkedParent == caller,
//   (b) reads + increments tts_render_quota/{childId}_{YYYYMMDD},
//   (c) reads audio_renders/{lineId} for textHash match — short-circuit
//   if cached; otherwise bumps quota and sets render doc to `rendering`.
// ElevenLabs HTTP happens OUTSIDE the transaction (long-running; Firestore
// transactions must be fast). A second transaction finalizes the render
// doc after Storage upload.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeApp, getApps } from 'firebase-admin/app';
import { buildAudioPath } from '../../lib/audio/storagePath';
import { canonicalizeTextHash } from '../../lib/hash/canonicalize';
import { createElevenLabsClient, ElevenLabsError, type ElevenLabsClient } from '../../lib/elevenlabs/client';
import { writeAuditEntry } from '../../lib/audit/log';

if (getApps().length === 0) {
  initializeApp();
}

const ELEVENLABS_API_KEY = defineSecret('ELEVENLABS_API_KEY');
const DAILY_QUOTA_PER_CHILD = 100;
const SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 1h bound per Phase 0 counter #2 HIGH.

export interface RenderTtsRequest {
  readonly scriptId: string;
  readonly lineId: string;
  readonly voiceId: string;
  readonly text: string;
  readonly childId: string;
}

export interface RenderTtsResponse {
  readonly storagePath: string;
  readonly downloadUrl: string;
  readonly durationMs: number;
  readonly cached: boolean;
}

// Test seam: override the client used for synthesis. Tests inject a
// deterministic fake; production code ignores this parameter.
let clientOverride: ElevenLabsClient | null = null;
export function __setElevenLabsClientForTest(c: ElevenLabsClient | null): void {
  clientOverride = c;
}

export const renderTtsLine = onCall(
  {
    secrets: [ELEVENLABS_API_KEY],
    enforceAppCheck: false,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (request): Promise<RenderTtsResponse> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Must be signed in to render TTS.');
    }

    const { scriptId, lineId, voiceId, text, childId } = validateRequest(request.data);

    const db = getFirestore();
    const childRef = db.collection('children').doc(childId);
    const renderRef = db.collection('audio_renders').doc(lineId);
    const dayKey = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const quotaRef = db.collection('tts_render_quota').doc(`${childId}_${dayKey}`);
    const textHash = canonicalizeTextHash(text, voiceId);

    type GateOutcome =
      | { kind: 'cache_hit'; storagePath: string; durationMs: number }
      | { kind: 'proceed' };

    let outcome: GateOutcome;
    try {
      outcome = await db.runTransaction(async (tx): Promise<GateOutcome> => {
        const childSnap = await tx.get(childRef);
        if (!childSnap.exists) {
          throw new HttpsError('not-found', 'Child not found.');
        }
        const childData = childSnap.data() as { linkedParent?: string };
        if (childData.linkedParent !== uid) {
          throw new HttpsError('permission-denied', 'Not this child\'s parent.');
        }

        const renderSnap = await tx.get(renderRef);
        if (renderSnap.exists) {
          const rd = renderSnap.data() as { status?: string; textHash?: string; storagePath?: string; durationMs?: number };
          if (rd.status === 'rendered' && rd.textHash === textHash && typeof rd.storagePath === 'string') {
            return {
              kind: 'cache_hit',
              storagePath: rd.storagePath,
              durationMs: typeof rd.durationMs === 'number' ? rd.durationMs : 0,
            };
          }
        }

        const quotaSnap = await tx.get(quotaRef);
        const used = quotaSnap.exists ? (quotaSnap.data() as { count?: number }).count ?? 0 : 0;
        if (used >= DAILY_QUOTA_PER_CHILD) {
          throw new HttpsError('resource-exhausted', `Daily TTS render quota (${DAILY_QUOTA_PER_CHILD}) exceeded.`);
        }

        tx.set(
          quotaRef,
          { count: FieldValue.increment(1), childId, dayKey, lastAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        tx.set(
          renderRef,
          {
            scriptId,
            lineId,
            voiceId,
            textHash,
            childId,
            parentUid: uid,
            status: 'rendering',
            startedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        return { kind: 'proceed' };
      });
    } catch (err) {
      await safeAudit(db, {
        actor: uid,
        action: 'tts_render_denied',
        collection: 'audio_renders',
        docId: lineId,
        extra: {
          reason: err instanceof HttpsError ? err.code : 'unknown',
          childId,
          scriptId,
        },
      });
      throw err;
    }

    if (outcome.kind === 'cache_hit') {
      await writeAuditEntry(db, {
        actor: uid,
        action: 'tts_render_cache_hit',
        collection: 'audio_renders',
        docId: lineId,
        extra: { childId, scriptId },
      });
      return {
        storagePath: outcome.storagePath,
        downloadUrl: await signedUrlFor(outcome.storagePath),
        durationMs: outcome.durationMs,
        cached: true,
      };
    }

    const startNs = process.hrtime.bigint();
    let mp3: Uint8Array;
    try {
      const client = clientOverride ?? createElevenLabsClient(ELEVENLABS_API_KEY.value());
      mp3 = await client.synthesize({ voiceId, text });
    } catch (err) {
      await renderRef.set({ status: 'failed', failedAt: FieldValue.serverTimestamp() }, { merge: true });
      await writeAuditEntry(db, {
        actor: uid,
        action: 'tts_render_upstream_failed',
        collection: 'audio_renders',
        docId: lineId,
        extra: {
          childId,
          scriptId,
          httpStatus: err instanceof ElevenLabsError ? err.status : null,
        },
      });
      throw new HttpsError('internal', 'TTS upstream failed.');
    }

    const storagePath = buildAudioPath(uid, childId, lineId);
    try {
      await getStorage().bucket().file(storagePath).save(Buffer.from(mp3), {
        contentType: 'audio/mpeg',
        resumable: false,
        metadata: { cacheControl: 'private, max-age=3600' },
      });
    } catch {
      // Rollback: mark render failed so a re-call can retry cleanly.
      await renderRef.set({ status: 'failed', failedAt: FieldValue.serverTimestamp() }, { merge: true });
      await writeAuditEntry(db, {
        actor: uid,
        action: 'tts_render_storage_failed',
        collection: 'audio_renders',
        docId: lineId,
        extra: { childId, scriptId },
      });
      throw new HttpsError('internal', 'Storage upload failed.');
    }

    const durationMs = Number((process.hrtime.bigint() - startNs) / 1_000_000n);
    await renderRef.set(
      {
        status: 'rendered',
        storagePath,
        durationMs,
        renderedAt: FieldValue.serverTimestamp(),
        byteLength: mp3.byteLength,
      },
      { merge: true },
    );
    await writeAuditEntry(db, {
      actor: uid,
      action: 'tts_render_ok',
      collection: 'audio_renders',
      docId: lineId,
      extra: { childId, scriptId, byteLength: mp3.byteLength },
    });

    return {
      storagePath,
      downloadUrl: await signedUrlFor(storagePath),
      durationMs,
      cached: false,
    };
  },
);

function validateRequest(data: unknown): RenderTtsRequest {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Request body required.');
  }
  const d = data as Record<string, unknown>;
  const scriptId = asNonEmptyString(d.scriptId, 'scriptId');
  const lineId = asNonEmptyString(d.lineId, 'lineId');
  const voiceId = asNonEmptyString(d.voiceId, 'voiceId');
  const childId = asNonEmptyString(d.childId, 'childId');
  const text = asNonEmptyString(d.text, 'text');
  if (text.length > 5000) {
    throw new HttpsError('invalid-argument', 'text exceeds 5000 chars.');
  }
  return { scriptId, lineId, voiceId, text, childId };
}

function asNonEmptyString(v: unknown, name: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new HttpsError('invalid-argument', `${name} must be a non-empty string.`);
  }
  return v;
}

async function signedUrlFor(path: string): Promise<string> {
  const [url] = await getStorage()
    .bucket()
    .file(path)
    .getSignedUrl({ action: 'read', expires: Date.now() + SIGNED_URL_TTL_MS });
  return url;
}

async function safeAudit(db: Firestore, entry: Parameters<typeof writeAuditEntry>[1]): Promise<void> {
  try {
    await writeAuditEntry(db, entry);
  } catch {
    // Never let audit failure mask the primary error.
  }
}

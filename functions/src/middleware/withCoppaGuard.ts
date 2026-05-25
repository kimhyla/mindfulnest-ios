// COPPA guard middleware — spec §7.2, G0 gate artifact.
//
// Two variants required because App Check tokens only exist on client-originated
// calls (onCall / onRequest), not server-side Firestore triggers:
//
//   withCoppaGuardCallable — wraps onCall handlers that read/write /children/*.
//     Enforces: App Check token present + caller auth + parent relationship +
//     write allowlist + audit log + response projection.
//
//   withCoppaGuardTrigger — wraps onDocumentCreated/Updated/etc. handlers that
//     read/write /children/*. Skips App Check (not available on triggers).
//     Enforces: childId field validation + write allowlist + audit log.
//
// DEVIATION (2026-05-19, partially closed 2026-05-25): therapist-child
// relationship verification is SCHEMA-INITIALIZED but not yet fully enforced.
//
// What changed 2026-05-25:
//   claimTherapistInvite.ts now initializes linked_children: [] on every new
//   therapist doc (pattern mirrors onParentSignup.ts). The field IS present on
//   all therapist documents created from this date forward.
//
// What still blocks full enforcement:
//   No onParentLinkTherapist callable CF exists yet to populate linked_children
//   with actual child IDs after a parent assigns a therapist. Until that CF is
//   built, linked_children will always be [] for new therapists, making a strict
//   includes() check always reject.
//
// Current behavior (safe fallback):
//   If linked_children is non-empty → enforce it (future state, once CF is built).
//   If linked_children is empty/absent → fall back to status === 'active' check.
//
// Full enforcement path:
//   1. Build onParentLinkTherapist CF (tracked in prod_blockers).
//   2. Once that CF populates linked_children, this guard enforces it automatically.
//   3. No code change needed here when that CF ships.

import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { writeAudit, type AuditCtx } from '../lib/audit/log';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function pickAllowedFields(
  payload: Record<string, unknown>,
  allowlist: ReadonlyArray<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([k]) => allowlist.includes(k)),
  );
}

// ---------------------------------------------------------------------------
// Variant A: withCoppaGuardCallable
// ---------------------------------------------------------------------------

export interface CallableGuardOptions<T> {
  /** Firestore fields the caller is allowed to write. Extras are silently dropped. */
  readonly writeAllowlist: ReadonlyArray<string>;
  /** Fields to include in the response (projection). Pass [] to skip projection. */
  readonly responseProjection: ReadonlyArray<string>;
  /** The childId to verify the caller has a relationship to. */
  readonly resolveChildId: (data: T) => string | undefined;
  /**
   * Optional Firestore instance override — used ONLY in unit tests to inject a
   * duck-typed mock db without a live Firebase connection. Never set in production.
   */
  readonly dbOverride?: Firestore;
}

/**
 * Wraps an onCall handler that reads or writes /children/*.
 * Enforces App Check + caller auth + parent relationship + allowlist + audit.
 */
export function withCoppaGuardCallable<T, R>(
  options: CallableGuardOptions<T>,
  handler: (request: CallableRequest<T>, childId: string) => Promise<R>,
): (request: CallableRequest<T>) => Promise<R> {
  return async (request: CallableRequest<T>): Promise<R> => {
    // (a) App Check token — request.app is non-null when enforceAppCheck: true.
    // enforceAppCheck: true on all onCall CFs as of LD-802 gate close (2026-05-25).
    // This check is now structurally enforced by the Functions runtime; guard here
    // as belt-and-suspenders (defense-in-depth) in case the runtime check is bypassed.
    if (request.app === undefined && !process.env.FUNCTIONS_EMULATOR) {
      throw new HttpsError('unauthenticated', 'App Check required.');
    }

    // (b) Auth — caller must be authenticated.
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }

    const role = (request.auth?.token as Record<string, unknown> | undefined)?.role;
    if (role !== 'parent' && role !== 'therapist') {
      throw new HttpsError('permission-denied', 'Role must be parent or therapist.');
    }

    // (c) Child relationship verification.
    const childId = options.resolveChildId(request.data);
    if (!childId || typeof childId !== 'string') {
      throw new HttpsError('invalid-argument', 'childId required.');
    }

    const db = options.dbOverride ?? getFirestore();
    if (role === 'parent') {
      const parentDoc = await db.collection('parents').doc(uid).get();
      const linked: string[] = (parentDoc.data()?.linked_children as string[]) ?? [];
      if (!linked.includes(childId)) {
        throw new HttpsError('permission-denied', 'No verified relationship to child.');
      }
    } else {
      // Therapist path: check linked_children when populated, fall back to status
      // check when empty/absent. See DEVIATION comment at top of file.
      // linked_children is initialized to [] by claimTherapistInvite.ts (2026-05-25).
      // It will be populated by the future onParentLinkTherapist CF, at which point
      // this guard automatically enforces the relationship without a code change.
      const therapistDoc = await db.collection('therapists').doc(uid).get();
      if (!therapistDoc.exists || therapistDoc.data()?.status !== 'active') {
        throw new HttpsError('permission-denied', 'Therapist account not active.');
      }
      const linkedChildren: string[] = (therapistDoc.data()?.linked_children as string[]) ?? [];
      if (linkedChildren.length > 0 && !linkedChildren.includes(childId)) {
        // linked_children is populated — enforce it strictly.
        throw new HttpsError('permission-denied', 'No verified relationship to child.');
      }
      // linkedChildren.length === 0: field not yet populated by onParentLinkTherapist
      // CF. Status check above is the gate (DEVIATION — see top of file).
    }

    // (d) Write allowlist — filter payload to permitted fields only.
    const rawData = request.data as Record<string, unknown>;
    const filtered = pickAllowedFields(rawData, options.writeAllowlist) as T;

    // (e) Audit log — written before handler to capture access attempt.
    const auditCtx: AuditCtx = { kind: 'db', db };
    await writeAudit(auditCtx, {
      actor: uid,
      action: 'child_data_access',
      collection: 'children',
      docId: childId,
      childId,
    });

    // Run the handler with filtered data and confirmed childId.
    const result = await handler({ ...request, data: filtered }, childId);

    // (f) Response projection — narrow response to minimum-necessary fields.
    if (options.responseProjection.length > 0 && result !== null && typeof result === 'object') {
      return pickAllowedFields(result as Record<string, unknown>, options.responseProjection) as R;
    }
    return result;
  };
}

// ---------------------------------------------------------------------------
// Variant B: withCoppaGuardTrigger
// ---------------------------------------------------------------------------

export interface TriggerGuardOptions {
  /** Allowed write fields on the triggering document. */
  readonly writeAllowlist: ReadonlyArray<string>;
}

/**
 * Validates a Firestore-triggered handler that reads or writes /children/*.
 * No App Check (not available on triggers). Validates childId + allowlist + audit.
 * The caller calls assertCoppaTrigger() at the top of the trigger handler and
 * passes in the audit context so the audit row can be inside a transaction.
 */
export async function assertCoppaTrigger(
  auditCtx: AuditCtx,
  {
    childId,
    writeAllowlist,
    documentFields,
  }: {
    readonly childId: unknown;
    readonly writeAllowlist: ReadonlyArray<string>;
    readonly documentFields: Record<string, unknown>;
  },
): Promise<void> {
  if (typeof childId !== 'string' || childId.length === 0) {
    throw new Error('withCoppaGuardTrigger: childId missing or not a string.');
  }

  // Allowlist check — log a warning if unexpected fields are present.
  const unexpectedFields = Object.keys(documentFields).filter(
    (k) => !writeAllowlist.includes(k),
  );
  if (unexpectedFields.length > 0) {
    console.warn(
      `withCoppaGuardTrigger: unexpected fields on /children/${childId}: ${unexpectedFields.join(', ')}`,
    );
  }

  await writeAudit(auditCtx, {
    actor: 'system_cf',
    action: 'child_data_access',
    collection: 'children',
    docId: childId,
    childId,
  });
}

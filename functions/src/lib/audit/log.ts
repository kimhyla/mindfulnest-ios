// Audit-log writer. S3-POLISH-audit preflight 74 synthesis:
//  - Unified writeAudit(ctx, event) with tagged ctx (Counter 3 #2 drift fix)
//  - Optional childId field on events (Counter 1 #2 rules-scope fix)
//  - Closed action enum + 20-line assertAudit guard (Counter 3 #1 no-Zod)
//  - Fire-and-forget for post-txn path retained v1 (LD-270 SHORTCUT;
//    compliance-grade retry queue deferred to S3-POLISH-audit-retry).
//
// Callers:
//   await writeAudit({ kind: 'db', db }, { actor, action, childId, ... });
//   await writeAudit({ kind: 'txn', db, txn }, { ... });

import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export type AuditAction =
  | 'zap_sanitize_ok'
  | 'zap_sanitize_rejected'
  | 'wishing_garden_sanitize_ok'
  | 'wishing_garden_sanitize_rejected'
  | 'therapist_summary_written'
  | 'coin_awarded'
  | 'coin_and_stone_awarded'
  | 'parent_signup'
  | 'therapist_invite_claimed';

const VALID_ACTIONS: ReadonlyArray<AuditAction> = [
  'zap_sanitize_ok',
  'zap_sanitize_rejected',
  'wishing_garden_sanitize_ok',
  'wishing_garden_sanitize_rejected',
  'therapist_summary_written',
  'coin_awarded',
  'coin_and_stone_awarded',
  'parent_signup',
  'therapist_invite_claimed',
];

export interface AuditEvent {
  readonly actor: string;
  readonly action: AuditAction;
  readonly collection: string;
  readonly docId: string;
  // childId required for rules v8 read-scoping on child-data events.
  // null = orphan/system event (parent signup before any child, therapist
  // invite claim, etc.). Un-scoped orphan rows remain admin-only.
  readonly childId?: string | null;
  readonly extra?: Record<string, unknown>;
}

export type AuditCtx =
  | { readonly kind: 'db'; readonly db: Firestore }
  | { readonly kind: 'txn'; readonly db: Firestore; readonly txn: Transaction };

export function assertAudit(event: AuditEvent): void {
  if (typeof event.actor !== 'string' || event.actor.length === 0) {
    throw new Error('audit: actor must be non-empty string');
  }
  if (!VALID_ACTIONS.includes(event.action)) {
    throw new Error(`audit: unknown action "${event.action}" (add to AuditAction enum if legitimate)`);
  }
  if (typeof event.collection !== 'string' || event.collection.length === 0) {
    throw new Error('audit: collection must be non-empty string');
  }
  if (typeof event.docId !== 'string' || event.docId.length === 0) {
    throw new Error('audit: docId must be non-empty string');
  }
  if (
    event.childId !== undefined &&
    event.childId !== null &&
    typeof event.childId !== 'string'
  ) {
    throw new Error('audit: childId must be string | null | undefined');
  }
}

export function writeAudit(ctx: AuditCtx, event: AuditEvent): Promise<void> {
  assertAudit(event);
  const payload: Record<string, unknown> = {
    ts: FieldValue.serverTimestamp(),
    actor: event.actor,
    action: event.action,
    collection: event.collection,
    docId: event.docId,
    childId: event.childId ?? null,
  };
  if (event.extra !== undefined) {
    payload.extra = event.extra;
  }

  if (ctx.kind === 'db') {
    return ctx.db
      .collection('audit_logs')
      .add(payload)
      .then(() => undefined);
  }
  // Transactional path: create at a fresh auto-ID ref within the txn.
  const ref = ctx.db.collection('audit_logs').doc();
  ctx.txn.create(ref, payload);
  return Promise.resolve();
}

// Backward-compat shim for existing callers that haven't migrated to
// writeAudit(ctx, event). Delete after all callsites use writeAudit.
export interface AuditEntry {
  readonly actor: string;
  readonly action: string;
  readonly collection: string;
  readonly docId: string;
  readonly extra?: Record<string, unknown>;
}

export async function writeAuditEntry(db: Firestore, entry: AuditEntry): Promise<void> {
  await writeAudit(
    { kind: 'db', db },
    {
      actor: entry.actor,
      action: entry.action as AuditAction,
      collection: entry.collection,
      docId: entry.docId,
      extra: entry.extra,
    },
  );
}

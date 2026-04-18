// Minimal audit-log writer. Full audit schema + rollups are owned by
// S3-POLISH-audit / LD-221. This helper writes a stub shape that the full
// audit row can absorb via migration. Shape chosen to be schema-safe:
// {ts, actor, action, collection, docId, extra?} — all primitives.
//
// Per Phase 0 Counter-Agent #3: DO NOT collapse audit writes and sanitize
// field-strip into one helper. These are different operations with different
// semantics (audit preserves forbidden fields as evidence; sanitize deletes
// them). This module owns ONLY audit writes.

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export interface AuditEntry {
  readonly actor: string;
  readonly action: string;
  readonly collection: string;
  readonly docId: string;
  readonly extra?: Record<string, unknown>;
}

export async function writeAuditEntry(db: Firestore, entry: AuditEntry): Promise<void> {
  await db.collection('audit_logs').add({
    ts: FieldValue.serverTimestamp(),
    actor: entry.actor,
    action: entry.action,
    collection: entry.collection,
    docId: entry.docId,
    ...(entry.extra ? { extra: entry.extra } : {}),
  });
}

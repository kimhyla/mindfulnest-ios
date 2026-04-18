import { FIRESTORE_FIELD_LISTS, type CollectionName } from '../../schema/firestore-allowlists.generated';
import { scanForPii, type PiiViolation } from './pii';

export interface SanitizeViolation {
  readonly kind: 'missing_required' | 'forbidden_field' | 'unknown_field' | 'pii_detected';
  readonly field: string;
  readonly detail?: string;
}

export interface SanitizeResult {
  readonly ok: boolean;
  readonly clean: Record<string, unknown> | null;
  readonly violations: readonly SanitizeViolation[];
}

const TEXT_FIELDS_BY_COLLECTION: Record<CollectionName, readonly string[]> = {
  children: [],
  parents: [],
  therapists: [],
  modules: [],
  sessions: [],
  clq_responses: [],
  gpr_entries: [],
  zaps: ['content'],
  wishing_garden_entries: ['prompt', 'response'],
  coach_conversations: [],
  stripe_customers: [],
  commission_events: [],
  // CF-only write; sanitizeAgainstSchema is never called on it, but keys
  // must exhaustively cover CollectionName.
  therapist_summaries: [],
};

export function sanitizeAgainstSchema(
  collection: CollectionName,
  data: Record<string, unknown> | undefined | null,
): SanitizeResult {
  const violations: SanitizeViolation[] = [];

  if (data == null || typeof data !== 'object') {
    violations.push({ kind: 'missing_required', field: '<root>', detail: 'payload missing or not an object' });
    return { ok: false, clean: null, violations };
  }

  const lists = FIRESTORE_FIELD_LISTS[collection];
  const allow = new Set(lists.allowlist);
  const forbid = new Set(lists.forbidden);
  const required = lists.required;

  for (const f of required) {
    if (!(f in data) || data[f] == null) {
      violations.push({ kind: 'missing_required', field: f });
    }
  }

  for (const key of Object.keys(data)) {
    if (forbid.has(key)) {
      violations.push({ kind: 'forbidden_field', field: key });
    } else if (!allow.has(key)) {
      violations.push({ kind: 'unknown_field', field: key });
    }
  }

  const textFields = TEXT_FIELDS_BY_COLLECTION[collection];
  for (const f of textFields) {
    const value = data[f];
    if (typeof value === 'string') {
      const piiHits: readonly PiiViolation[] = scanForPii(value);
      for (const hit of piiHits) {
        violations.push({ kind: 'pii_detected', field: f, detail: hit.reason });
      }
    }
  }

  if (violations.length > 0) {
    return { ok: false, clean: null, violations };
  }

  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (allow.has(key) && !forbid.has(key)) {
      clean[key] = data[key];
    }
  }
  return { ok: true, clean, violations: [] };
}

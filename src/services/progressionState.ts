// progressionState — LD-316 MODULE_EXIT_AND_PROGRESSION_V1 Layer 1 (on-device).
//
// Records which modules a child has completed within an arc, used to gate
// whether the next module is unlockable. Independent of LD-286 sessionState
// because the two have opposite lifecycles:
//   - sessionState is EPHEMERAL and is CLEARED on natural playToEnd.
//   - progressionState is MONOTONIC and is PRESERVED on playToEnd
//     (in fact, that's exactly when it's written to).
//
// Storing both in a single AsyncStorage key would (a) require partial-clear
// read-modify-write on playToEnd that races with sessionState's 5s save
// ticker (AsyncStorage is not transactional), and (b) couple the schema
// versions of two concerns that evolve independently. Counter-agent A in
// the Phase 0 4+4 review for LD-316 surfaced both issues; the per-arc-keyed
// separate store below resolves them by giving the gate-write a single
// writer (the playToEnd listener) on a key that no other code path touches.
//
// Per-arc keying (`progression_v1:${arcId}`) — one row per arc rather than
// per module — gives the map UI an O(1) read for "which modules in this arc
// has the child completed?" without scanning all module keys. Counter B's
// cross-cutting-query objection drove this choice.
//
// Layer 2 (Firestore mirror for cross-device + therapist visibility) is a
// registered follow-up: FOLLOWUP_LD_316_LAYER_2_PROGRESSION_FIRESTORE_MIRROR.
// Closure prerequisites: Firebase JS SDK on main (PR #13), AuthContext for
// child_id, /progression rules, progressionWrite Cloud Function. Layer 1
// alone discharges the safety contract (gate works fully offline).

import AsyncStorage from '@react-native-async-storage/async-storage';

export const PROGRESSION_KEY_PREFIX = 'progression_v1:';
export const PROGRESSION_SCHEMA_VERSION = 1;

export interface ArcProgression {
  schemaVersion: number;
  arcId: string;
  /** Module IDs the child has played to natural end, in completion order. */
  completedModuleIds: string[];
  /** Unix epoch ms of the most recent module_completed event for this arc. */
  lastCompletedAtMs: number;
}

/** Construct the AsyncStorage key for an arc's progression row. */
export function progressionKey(arcId: string): string {
  return `${PROGRESSION_KEY_PREFIX}${arcId}`;
}

/**
 * Mark a module complete within an arc.
 *
 * Idempotent — replaying onEnd for an already-completed module updates
 * lastCompletedAtMs but does not duplicate the moduleId. Called only from
 * the useModulePlayback playToEnd listener, so this row has a single
 * writer per arc and does not race with any other AsyncStorage path.
 */
export async function markModuleComplete(
  arcId: string,
  moduleId: string,
  nowMs: number = Date.now(),
): Promise<void> {
  const existing = await loadProgression(arcId);
  const completedModuleIds = existing?.completedModuleIds ?? [];
  const next: ArcProgression = {
    schemaVersion: PROGRESSION_SCHEMA_VERSION,
    arcId,
    completedModuleIds: completedModuleIds.includes(moduleId)
      ? completedModuleIds
      : [...completedModuleIds, moduleId],
    lastCompletedAtMs: nowMs,
  };
  await AsyncStorage.setItem(progressionKey(arcId), JSON.stringify(next));
}

/**
 * Load progression for an arc. Returns null when:
 *   - no progression row exists (child has not completed any module in arc)
 *   - the row is malformed (corrupt AsyncStorage write)
 *   - the row is from an unknown schema version
 *
 * Callers should treat null as "no completed modules" — the safe-failure
 * mode is to surface the arc as fresh, never to incorrectly mark modules
 * as completed.
 */
export async function loadProgression(arcId: string): Promise<ArcProgression | null> {
  try {
    const raw = await AsyncStorage.getItem(progressionKey(arcId));
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidArcProgression(parsed)) return null;
    if (parsed.schemaVersion !== PROGRESSION_SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Clear progression for an arc. Reserved for admin/reset flows — the normal
 * playback path NEVER calls this. Exposed so that parent-portal "reset arc"
 * (a follow-up product feature) has a single sanctioned entrypoint.
 */
export async function clearProgression(arcId: string): Promise<void> {
  await AsyncStorage.removeItem(progressionKey(arcId));
}

/**
 * Synchronous unlock check. Pure function over a loaded ArcProgression
 * snapshot plus the canonical module ordering for the arc. The first
 * module in any arc is always unlocked; subsequent modules unlock only
 * when ALL prior modules in the arc appear in completedModuleIds.
 *
 * The all-predecessors check (rather than immediate-predecessor) is
 * deliberate: it prevents a deep-link / URL-injection bypass — e.g. a
 * child who opens `mindfulnest://module/m2` directly and finishes it
 * cannot then walk through to m3 and skip m1 entirely. The storage
 * layer records completion order as-played (see arc-isolation tests)
 * but the gate enforces M1-before-M2-before-M3 strictly.
 *
 * Module order is supplied by the caller (manifest) rather than derived
 * here — this service has no knowledge of the M1-M6/M7-M12 arc partition;
 * that lives in firestore.rules and the content manifest.
 */
export function isModuleUnlocked(
  progression: ArcProgression | null,
  moduleId: string,
  moduleOrder: readonly string[],
): boolean {
  const idx = moduleOrder.indexOf(moduleId);
  if (idx < 0) return false;
  if (idx === 0) return true;
  if (progression == null) return false;
  for (let i = 0; i < idx; i += 1) {
    if (!progression.completedModuleIds.includes(moduleOrder[i])) {
      return false;
    }
  }
  return true;
}

function isValidArcProgression(v: unknown): v is ArcProgression {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.schemaVersion !== 'number') return false;
  if (typeof o.arcId !== 'string') return false;
  if (typeof o.lastCompletedAtMs !== 'number') return false;
  if (!Array.isArray(o.completedModuleIds)) return false;
  for (const m of o.completedModuleIds) {
    if (typeof m !== 'string') return false;
  }
  return true;
}

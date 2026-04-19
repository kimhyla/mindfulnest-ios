// sessionState — LD-286 SESSION_STATE_PERSISTENCE_V1 Layer 1 (on-device).
//
// Saves Phase B progress every 5s so a trauma-background child whose iPad
// crashes mid-session can re-enter with agency ("pick up where we were, or
// start fresh?"). Survives JS-bridge crash, native fault, iOS memory-kill.
//
// Layer 2 (Firestore mirror for cross-device resume) is a registered
// follow-up blocker — requires firebase JS SDK + sessionState CF + auth
// wiring for child_id, none of which are on main at the Track C commit.
// Layer 1 ALONE discharges the CATASTROPHIC safety concern (crash recovery);
// Layer 2 is a UX feature (cross-device resume), not a safety feature.
//
// Per-module keyed storage: `session_state_v1:${moduleId}`. Resolves
// preflight-91 counter H4: a singleton key would clobber when a child
// switches modules mid-Phase-B.
//
// Corrupted-read fallback (preflight-91 counter C1): JSON.parse inside
// try/catch; malformed payload is treated as no-state-saved (drop to zero).
// Lost-write of last 5s is acceptable safety failure mode — kid starts
// fresh instead of resuming. A crash on read would be unacceptable.
//
// Staleness threshold (preflight-91 counter H2): 72 hours, to cover
// bedtime-Friday → weekend-with-other-parent → Sunday-evening (~48h). Kim
// may flip via STALENESS_WINDOW_MS.
//
// Resume mode (preflight-91 counter H1): RESUME_MODE selects behavior —
//   'prompt'        → show ResumePromptModal (CRI agency, default)
//   'silent-resume' → auto-seek to audio_position_ms, no prompt
//   'silent-zero'   → ignore saved state, always start fresh
// Kim owns this clinical decision; flag remains TypeScript-flippable.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const SESSION_STATE_KEY_PREFIX = 'session_state_v1:';
export const STALENESS_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours
export const SESSION_STATE_SCHEMA_VERSION = 1;

export type ResumeMode = 'prompt' | 'silent-resume' | 'silent-zero';

/** Kim-flippable default — see file header. */
export const RESUME_MODE: ResumeMode = 'prompt';

export type ModulePhase = 'phase_a' | 'phase_b' | 'resolution';

export interface SessionState {
  schemaVersion: number;
  moduleId: string;
  phase: ModulePhase;
  /** Unix epoch ms when this tick was saved. */
  timestampMs: number;
  /** Playback position inside the current module's MP4, in ms. */
  audioPositionMs: number;
}

/** Construct the AsyncStorage key for a module. */
export function sessionStateKey(moduleId: string): string {
  return `${SESSION_STATE_KEY_PREFIX}${moduleId}`;
}

/**
 * Save session state for a module. Called every 5s during Phase B by the
 * playback hook. Also called on interruption (flush-before-pause).
 */
export async function saveSessionState(state: Omit<SessionState, 'schemaVersion'>): Promise<void> {
  const payload: SessionState = {
    schemaVersion: SESSION_STATE_SCHEMA_VERSION,
    ...state,
  };
  await AsyncStorage.setItem(sessionStateKey(state.moduleId), JSON.stringify(payload));
}

/**
 * Load session state for a module if any exists and is non-stale.
 *
 * Returns null when:
 *   - no state exists for this moduleId
 *   - state exists but is older than STALENESS_WINDOW_MS
 *   - state is malformed (corrupted AsyncStorage write, unknown schema)
 *
 * Callers should treat null as "start fresh".
 */
export async function loadSessionState(
  moduleId: string,
  nowMs: number = Date.now(),
): Promise<SessionState | null> {
  try {
    const raw = await AsyncStorage.getItem(sessionStateKey(moduleId));
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidSessionState(parsed)) return null;
    if (parsed.schemaVersion !== SESSION_STATE_SCHEMA_VERSION) return null;
    if (nowMs - parsed.timestampMs > STALENESS_WINDOW_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Clear session state for a module. Called on onEnd, explicit "start fresh", or Resume-modal dismiss-to-fresh. */
export async function clearSessionState(moduleId: string): Promise<void> {
  await AsyncStorage.removeItem(sessionStateKey(moduleId));
}

/**
 * Find any in-progress session across all modules.
 *
 * Used at launch-time (before the module screen mounts) to decide whether
 * to show the ResumePromptModal. Scans AsyncStorage.getAllKeys() for the
 * SESSION_STATE_KEY_PREFIX, loads each, returns the most-recent non-stale
 * one.
 *
 * Returns null if nothing in progress (or only stale entries remain).
 */
export async function findInProgressSession(
  nowMs: number = Date.now(),
): Promise<SessionState | null> {
  const allKeys = await AsyncStorage.getAllKeys();
  const stateKeys = allKeys.filter((k) => k.startsWith(SESSION_STATE_KEY_PREFIX));
  if (stateKeys.length === 0) return null;
  let best: SessionState | null = null;
  for (const key of stateKeys) {
    const moduleId = key.slice(SESSION_STATE_KEY_PREFIX.length);
    const state = await loadSessionState(moduleId, nowMs);
    if (state == null) continue;
    if (best == null || state.timestampMs > best.timestampMs) {
      best = state;
    }
  }
  return best;
}

function isValidSessionState(v: unknown): v is SessionState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.schemaVersion === 'number' &&
    typeof o.moduleId === 'string' &&
    (o.phase === 'phase_a' || o.phase === 'phase_b' || o.phase === 'resolution') &&
    typeof o.timestampMs === 'number' &&
    typeof o.audioPositionMs === 'number'
  );
}

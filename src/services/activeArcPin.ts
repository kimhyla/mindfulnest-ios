// activeArcPin — module-global "which arc is currently being played" pin.
//
// Owned by the Delivery-and-caching tier (APP_ARCHITECTURE_MASTER_v1.md §5).
// Resolves the preflight-88 counter-agent CRITICAL "active-arc pin lifetime
// broken when hook unmounts":
//
// Background fetch of the next arc must NOT evict the currently-playing arc.
// The pin therefore cannot live in useModulePlayback — that hook unmounts
// when the user navigates away, but the background fetch continues. The pin
// lives here, module-global, AsyncStorage-backed, with a session UUID guard
// so stale pins from prior sessions don't over-protect.
//
// On app launch, clearStalePin() wipes any pin from a previous session.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'active_arc_pin_v1';

interface PinPayload {
  arcId: string;
  /** UUID regenerated on every cold app launch. */
  sessionId: string;
  /** Unix epoch ms. */
  pinnedAt: number;
}

let currentSessionId: string | null = null;
let inMemoryPin: PinPayload | null = null;

/**
 * Initialize the active-arc pin subsystem. Called once at app startup after
 * initAudioSession. Generates a new sessionId for this cold launch and wipes
 * any prior-session pin that survived a crash.
 *
 * Without this, a crash mid-Phase-B leaves a pin on disk that would
 * over-protect its arc in the next launch's LRU — potentially blocking a
 * legitimate eviction the next session needs.
 */
export async function initActiveArcPin(): Promise<void> {
  currentSessionId = generateSessionId();
  // Wipe any stale pin from a previous session.
  await AsyncStorage.removeItem(STORAGE_KEY);
  inMemoryPin = null;
}

/**
 * Pin an arc as "currently being played". Called at the start of
 * useModulePlayback. The pin survives the hook's unmount so background
 * fetches continue to respect it.
 *
 * Caller should call unpinArc() at session end (onEnd, explicit close).
 */
export async function pinArc(arcId: string): Promise<void> {
  if (!currentSessionId) {
    // initActiveArcPin wasn't called — fail soft rather than throw, since
    // the worst case is eviction protection is weaker this session.
    currentSessionId = generateSessionId();
  }
  const payload: PinPayload = {
    arcId,
    sessionId: currentSessionId,
    pinnedAt: Date.now(),
  };
  inMemoryPin = payload;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/**
 * Remove the active-arc pin. Called at session end.
 */
export async function unpinArc(): Promise<void> {
  inMemoryPin = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/**
 * Get the currently-pinned arcId, or a neutral sentinel if no arc is pinned.
 *
 * The sentinel string is never a real arcId (no arc is named '<no-arc-pinned>')
 * so cacheIndex.evictLru's `e.arcId !== options.pinnedArcId` filter correctly
 * allows eviction across all arcs when nothing is pinned.
 */
export function getActivePin(): string {
  if (inMemoryPin && inMemoryPin.sessionId === currentSessionId) {
    return inMemoryPin.arcId;
  }
  return NO_ACTIVE_PIN_SENTINEL;
}

export const NO_ACTIVE_PIN_SENTINEL = '<no-arc-pinned>';

function generateSessionId(): string {
  // Non-cryptographic UUID-ish — this is a session cookie, not a secret.
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${time}-${rand}`;
}

/** Test-only: reset session + pin state. */
export function __resetForTests(): void {
  currentSessionId = null;
  inMemoryPin = null;
}

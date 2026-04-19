// audioSession — iOS audio session category setup for module playback.
//
// Owned by the Playback tier (APP_ARCHITECTURE_MASTER_v1.md §5). Called once
// at app startup from app/_layout.tsx.
//
// IMPORTANT (preflight 91 synthesis): expo-audio in SDK 54 exposes
// setAudioModeAsync for session configuration but does NOT expose a public
// API to subscribe to audio-session interruption events (phone call, Siri,
// Control Center pause). The originally-planned useAudioSessionInterruption
// React hook cannot be built against expo-audio's public surface.
//
// Consequence: interruption DETECTION moves into src/hooks/useModulePlayback
// via expo-video's `playingChange` event (which fires when iOS pauses the
// player due to interruption). audioSession.ts stays thin — one init call.
//
// Per LD-280 (RENDERING_ARCHITECTURE_SINGLE_MP4_ATOMIC_V1) and Rule 22: this
// file imports expo-audio ONLY for setAudioModeAsync. It does NOT instantiate
// any Audio player. Module playback stays on expo-video.

import { setAudioModeAsync } from 'expo-audio';

let initialized = false;

/**
 * Initialize the iOS audio session for media playback.
 *
 * Settings (per WebFetch of docs.expo.dev/versions/v54.0.0/sdk/audio/, 2026-04-18):
 *   - playsInSilentMode: true — Cedric narration must be audible even if the
 *     child has the ringer toggle off (common on shared family iPads).
 *   - allowsRecording: false — app never captures audio (COPPA + Rule 22).
 *   - interruptionMode: 'duckOthers' — if the child has a music app playing
 *     in the background, lower its volume during Phase B rather than fighting
 *     for the session. NOTE: duckOthers affects OTHER apps during OUR
 *     playback; it does NOT change iOS auto-resume behavior after WE are
 *     interrupted. Post-interruption resume is explicit via useModulePlayback.
 *
 * Idempotent — calling more than once is safe (and a no-op after the first).
 */
export async function initAudioSession(): Promise<void> {
  if (initialized) return;
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: false,
    interruptionMode: 'duckOthers',
  });
  initialized = true;
}

/** Test-only: reset the init guard. */
export function __resetForTests(): void {
  initialized = false;
}

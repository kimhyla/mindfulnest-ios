// useModulePlayback — single expo-video player + save-and-resume +
// interruption flush for a module.
//
// Owned by the Playback tier (APP_ARCHITECTURE_MASTER_v1.md §5). Orchestrates:
//   - expo-video's useVideoPlayer (one player, per LD-280)
//   - AsyncStorage save of playback position every 5s during Phase B (LD-286)
//   - Interruption detection via player.addListener('playingChange') —
//     expo-audio SDK 54 does not expose an interruption listener, so we detect
//     "iOS paused us" by observing playingChange=false when we did not call
//     pause() ourselves AND currentTime < duration - 0.5s (preflight-91
//     counter C2 disambiguation — avoids treating natural end, programmatic
//     seek, or backgrounding as interruption).
//
// The hook does NOT show the ResumePromptModal itself — that lives at the
// route level (app/module/[moduleId].tsx) where it gates mount of this hook.
// By the time this hook runs, the resume choice has already been made and
// the initial seek target is known (or null for fresh start).
//
// Per LD-282 active-arc pin: the hook pins the module's arcId at mount via
// activeArcPin (NOT a local state) so background fetches that start while
// the child plays continue to respect the pin even if the hook unmounts.
//
// Per Rule 22: does NOT import expo-audio, does NOT instantiate any second
// audio surface. One video player, one atomic MP4, stock APIs only.

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';

import {
  pinArc,
  unpinArc,
} from '../services/activeArcPin';
export type { PhaseBoundary } from '../services/cloudFunctions';
import type { PhaseBoundary } from '../services/cloudFunctions';
import {
  clearSessionState,
  saveSessionState,
  type ModulePhase,
} from '../services/sessionState';
import { markModuleComplete } from '../services/progressionState';
import { markPlayed } from '../services/cacheIndex';

/** How often to persist playback position during Phase B. */
export const SAVE_INTERVAL_MS = 5_000;

/**
 * Epsilon (seconds) subtracted from duration when deciding whether a
 * playingChange=false event is an interruption vs a natural end.
 * If currentTime >= duration - EPS, treat as natural end (not interruption).
 */
export const END_OF_TRACK_EPSILON_SEC = 0.5;

export interface UseModulePlaybackOptions {
  moduleId: string;
  arcId: string;
  phase: ModulePhase;
  videoSource: VideoSource;
  /** Seconds — if non-null, player seeks here on mount before playing. */
  initialSeekSeconds: number | null;
  /**
   * LD-316 phaseBoundaries — named phase segments from the module manifest.
   * Used to derive the 'phase_b' seek target for "Start Magic Spell Again".
   * Optional: when absent (e.g. while downloading), the button is disabled.
   */
  phaseBoundaries?: PhaseBoundary[];
}

export interface UseModulePlaybackResult {
  player: VideoPlayer;
  isPlaying: boolean;
  hasEnded: boolean;
  /** Set true while an interruption is in effect (iOS paused us externally). */
  wasInterrupted: boolean;
  /**
   * Ref to a flag the caller sets true immediately before calling
   * player.pause(). Ensures the playingChange listener does not misclassify
   * a user-initiated pause as an interruption.
   */
  userInitiatedPauseRef: RefObject<boolean>;
  /**
   * LD-316: start_s of the 'phase_b' boundary — seek target for
   * "Start Magic Spell Again". Null when phaseBoundaries not yet available.
   */
  phaseBStart: number | null;
}

/**
 * Hook: manages one expo-video player for a module, with LD-286 save-and-resume.
 */
export function useModulePlayback(options: UseModulePlaybackOptions): UseModulePlaybackResult {
  const { moduleId, arcId, phase, videoSource, initialSeekSeconds, phaseBoundaries } = options;

  // LD-316: derive Phase B seek target from named boundaries
  const phaseBStart = phaseBoundaries?.find((b) => b.name === 'phase_b')?.start_s ?? null;

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [wasInterrupted, setWasInterrupted] = useState(false);
  const userInitiatedPauseRef = useRef(false);

  const player = useVideoPlayer(videoSource, (p) => {
    if (initialSeekSeconds != null && initialSeekSeconds > 0) {
      p.currentTime = initialSeekSeconds;
    }
    p.play();
  });

  // Pin the active arc for LRU protection (LD-282). Do this before any
  // eviction pass the background-fetch trigger might run.
  useEffect(() => {
    void pinArc(arcId);
    return () => {
      void unpinArc();
    };
  }, [arcId]);

  useEffect(() => {
    void markPlayed(`${moduleId}_module_v1`);
  }, [moduleId]);

  // Track isPlaying + hasEnded via expo-video's native events. The
  // playingChange listener is also the interruption detector — see
  // disambiguation in the body below.
  useEffect(() => {
    const playingSub = player.addListener('playingChange', (event) => {
      const isPlayingNow = event.isPlaying;
      setIsPlaying(isPlayingNow);

      // Disambiguate a pause event per preflight-91 counter C2:
      //   - user-initiated pause:        userInitiatedPauseRef.current is true
      //   - end of track:                currentTime >= duration - EPSILON
      //   - otherwise:                   treat as interruption
      if (!isPlayingNow) {
        const currentTime = player.currentTime;
        const duration = player.duration;
        const atEnd =
          typeof duration === 'number' &&
          duration > 0 &&
          currentTime >= duration - END_OF_TRACK_EPSILON_SEC;
        if (!userInitiatedPauseRef.current && !atEnd) {
          setWasInterrupted(true);
          // Flush position before iOS/OS tears us down further.
          void saveSessionState({
            moduleId,
            phase,
            timestampMs: Date.now(),
            audioPositionMs: Math.round(currentTime * 1000),
          });
        }
        // Reset the guard — next pause starts fresh.
        userInitiatedPauseRef.current = false;
      } else if (wasInterrupted) {
        // We resumed after an interruption — clear the flag.
        setWasInterrupted(false);
      }
    });
    const endSub = player.addListener('playToEnd', () => {
      setHasEnded(true);
      // LD-316 progression gate: a module unlocks the next one ONLY on
      // expo-video's natural playToEnd. Exit-via-close-button persists
      // position via sessionState but does NOT advance progression.
      // markModuleComplete is the SINGLE writer of the per-arc progression
      // row — colocating it with the playToEnd listener (rather than e.g.
      // the 5s ticker) is what makes per-arc-keyed progression race-free.
      void markModuleComplete(arcId, moduleId);
      void clearSessionState(moduleId);
    });
    return () => {
      playingSub.remove();
      endSub.remove();
    };
    // wasInterrupted is intentionally omitted — the effect wires listeners
    // once per player/moduleId/phase lifetime; the handler reads the current
    // value via closure.
  }, [player, moduleId, phase, wasInterrupted]);

  // LD-286: save session state every SAVE_INTERVAL_MS during active playback
  // in Phase B. Outside Phase B, session state is still saved but the
  // trauma-recovery case is specifically Phase B (the guided-meditation slot
  // where a crash is most disruptive).
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!isPlaying) return;
      const currentTime = player.currentTime;
      void saveSessionState({
        moduleId,
        phase,
        timestampMs: Date.now(),
        audioPositionMs: Math.round(currentTime * 1000),
      });
    }, SAVE_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [player, moduleId, phase, isPlaying]);

  return {
    player,
    isPlaying,
    hasEnded,
    wasInterrupted,
    userInitiatedPauseRef,
    phaseBStart,
  };
}

// app/module/[moduleId].tsx — module playback screen.
//
// LD-280 controls-only chrome: one expo-video instance, one atomic MP4 per
// module, no cue-timed RN overlays, no multi-file playlist, no second audio
// surface. UI chrome is controls only.
//
// LD-286 Layer 1: on mount, check for in-progress session state. If found
// and RESUME_MODE === 'prompt', render ResumePromptModal before the playback
// hook mounts. Child's choice decides the initial seek target.
//
// Stream C (preflight 156, LD-406): module video source is now resolved via
// catalogService (CF signed URL → download → local cache) instead of the
// former PLACEHOLDER_VIDEO_URL stub. LaunchState includes 'downloading' and
// 'error' phases that appear before the existing resume/play flow.

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { VideoView } from 'expo-video';
import { Link, Redirect, useLocalSearchParams, useRouter } from 'expo-router';

import { useModulePlayback, type PhaseBoundary } from '../../src/hooks/useModulePlayback';
import { ResumePromptModal } from '../../src/components/ResumePromptModal';
import { useAuth } from '../../src/hooks/useAuth';
import {
  RESUME_MODE,
  clearSessionState,
  loadSessionState,
  saveSessionState,
  type SessionState,
} from '../../src/services/sessionState';
import { resolveModule, CacheHashMismatchError, LowStorageError } from '../../src/services/catalogService';

// Module title lookup — display only, does not affect routing or catalog logic.
const MODULE_TITLES: Record<string, string> = {
  m1: 'Tessa — Body Stone',
  m2: 'Luna — Watching Stone',
  m3: 'Benson — Courage Stone',
  m4: 'Ember — Heart Stone',
  m5: 'Bork — Grounding Stone',
  m6: 'Bramble — Calm Stone',
};

// Pure discriminated union — all members use { kind } for consistent narrowing.
type LaunchState =
  | { kind: 'downloading' }
  | { kind: 'error'; message: string }
  | { kind: 'resume_prompt'; savedState: SessionState; videoSource: string; phaseBoundaries: PhaseBoundary[]; arcId: string }
  | { kind: 'playing'; initialSeekSeconds: number | null; videoSource: string; phaseBoundaries: PhaseBoundary[]; arcId: string };

export default function ModuleScreen(): ReactElement {
  const params = useLocalSearchParams<{ moduleId: string }>();
  const router = useRouter();
  const { status } = useAuth();
  const moduleId = typeof params.moduleId === 'string' ? params.moduleId.toLowerCase() : '';
  const title = MODULE_TITLES[moduleId] ?? moduleId;

  const [launchState, setLaunchState] = useState<LaunchState>({ kind: 'downloading' });

  // Phase 1: resolve the module from the local cache or CDN (LD-406 / Stream C).
  useEffect(() => {
    if (status !== 'signedIn') return;
    if (!moduleId) {
      setLaunchState({ kind: 'error', message: `Unknown module: ${moduleId}` });
      return;
    }
    let cancelled = false;
    setLaunchState({ kind: 'downloading' });
    resolveModule(moduleId)
      .then((mod) => {
        if (cancelled) return;
        // Phase 2: check for a saved resume position (LD-286).
        void (async () => {
          const saved = await loadSessionState(moduleId);
          if (cancelled) return;
          if (saved == null) {
            setLaunchState({
              kind: 'playing',
              initialSeekSeconds: null,
              videoSource: mod.localPath,
              phaseBoundaries: mod.phaseBoundaries,
              arcId: mod.arcId,
            });
            return;
          }
          if (RESUME_MODE === 'silent-resume') {
            setLaunchState({
              kind: 'playing',
              initialSeekSeconds: saved.audioPositionMs / 1000,
              videoSource: mod.localPath,
              phaseBoundaries: mod.phaseBoundaries,
              arcId: mod.arcId,
            });
            return;
          }
          if (RESUME_MODE === 'silent-zero') {
            await clearSessionState(moduleId);
            setLaunchState({
              kind: 'playing',
              initialSeekSeconds: null,
              videoSource: mod.localPath,
              phaseBoundaries: mod.phaseBoundaries,
              arcId: mod.arcId,
            });
            return;
          }
          // RESUME_MODE === 'prompt'
          setLaunchState({
            kind: 'resume_prompt',
            savedState: saved,
            videoSource: mod.localPath,
            phaseBoundaries: mod.phaseBoundaries,
            arcId: mod.arcId,
          });
        })();
      })
      .catch((err) => {
        if (cancelled) return;
        const message =
          err instanceof CacheHashMismatchError
            ? 'Download corrupted — tap to retry.'
            : err instanceof LowStorageError
              ? 'Not enough storage to download this module. Ask a grown-up to free space.'
            : 'Could not load module. Check your connection.';
        setLaunchState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId, status]);

  const onResume = useCallback(() => {
    setLaunchState((prev) => {
      if (prev.kind !== 'resume_prompt') return prev;
      return {
        kind: 'playing',
        initialSeekSeconds: prev.savedState.audioPositionMs / 1000,
        videoSource: prev.videoSource,
        phaseBoundaries: prev.phaseBoundaries,
        arcId: prev.arcId,
      };
    });
  }, []);

  const onStartFresh = useCallback(() => {
    void clearSessionState(moduleId);
    setLaunchState((prev) => {
      if (prev.kind !== 'resume_prompt') return prev;
      return {
        kind: 'playing',
        initialSeekSeconds: null,
        videoSource: prev.videoSource,
        phaseBoundaries: prev.phaseBoundaries,
        arcId: prev.arcId,
      };
    });
  }, [moduleId]);

  const onRetry = useCallback(() => {
    if (status !== 'signedIn') return;
    setLaunchState({ kind: 'downloading' });
    resolveModule(moduleId)
      .then((mod) => {
        setLaunchState({
          kind: 'playing',
          initialSeekSeconds: null,
          videoSource: mod.localPath,
          phaseBoundaries: mod.phaseBoundaries,
          arcId: mod.arcId,
        });
      })
      .catch((err) => {
        const message =
          err instanceof CacheHashMismatchError
            ? 'Download corrupted — tap to retry.'
            : err instanceof LowStorageError
              ? 'Not enough storage to download this module. Ask a grown-up to free space.'
            : 'Could not load module. Check your connection.';
        setLaunchState({ kind: 'error', message });
      });
  }, [moduleId, status]);

  if (status === 'signedOut') {
    return <Redirect href="/sign-in" />;
  }

  if (status === 'loading') {
    return (
      <View style={styles.container} testID="module_screen_auth_loading">
        <ActivityIndicator size="large" color="#4A6741" testID="module_screen_auth_loading_spinner" />
        <Text style={styles.loadingText} testID="module_screen_auth_loading_text">
          Checking sign-in…
        </Text>
      </View>
    );
  }

  if (launchState.kind === 'downloading') {
    return (
      <View style={styles.container} testID="module_screen_downloading">
        <ActivityIndicator size="large" color="#4A6741" testID="module_screen_downloading_spinner" />
        <Text style={styles.loadingText} testID="module_screen_downloading_text">
          Loading {title}…
        </Text>
      </View>
    );
  }

  if (launchState.kind === 'error') {
    return (
      <View style={styles.container} testID="module_screen_error">
        <Text style={styles.errorText} testID="module_screen_error_text">
          {launchState.message}
        </Text>
        <Pressable style={styles.closeButton} onPress={onRetry} testID="module_screen_retry">
          <Text style={styles.closeButtonText} testID="module_screen_retry_text">
            Retry
          </Text>
        </Pressable>
        <Link href="/" asChild>
          <Pressable style={[styles.closeButton, styles.backButton]} testID="module_screen_error_close">
            <Text style={styles.closeButtonText}>Back to map</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  if (launchState.kind === 'resume_prompt') {
    return (
      <View style={styles.container} testID="module_screen_resume_gate">
        <ResumePromptModal
          visible
          sessionState={launchState.savedState}
          onResume={onResume}
          onStartFresh={onStartFresh}
        />
      </View>
    );
  }

  // launchState.kind === 'playing'
  return (
    <PlayingSurface
      moduleId={moduleId}
      arcId={launchState.arcId}
      title={title}
      videoSource={launchState.videoSource}
      phaseBoundaries={launchState.phaseBoundaries}
      initialSeekSeconds={launchState.initialSeekSeconds}
      onClose={() => router.push('/')}
    />
  );
}

interface PlayingSurfaceProps {
  moduleId: string;
  arcId: string;
  title: string;
  videoSource: string;
  phaseBoundaries: PhaseBoundary[];
  initialSeekSeconds: number | null;
  onClose: () => void;
}

function PlayingSurface(props: PlayingSurfaceProps): ReactElement {
  const { moduleId, arcId, title, videoSource, phaseBoundaries, initialSeekSeconds, onClose } =
    props;

  const { player, userInitiatedPauseRef, hasEnded } = useModulePlayback({
    moduleId,
    arcId,
    phase: 'phase_b',
    videoSource,
    phaseBoundaries,
    initialSeekSeconds,
  });

  useEffect(() => {
    if (hasEnded) {
      onClose();
    }
  }, [hasEnded, onClose]);

  const handleClose = useCallback(() => {
    // LD-316 exit-must-persist: capture the position BEFORE flipping the
    // user-initiated guard. Once the guard is set, the playingChange
    // listener intentionally skips its own auto-save (it can't tell user
    // pause from OS interruption otherwise), so this explicit save is the
    // exit's only chance to persist. saveSessionState is fire-and-forget
    // — a lost-write of the last <5s of position is the LD-286 acceptable
    // safety failure mode.
    void saveSessionState({
      moduleId,
      phase: 'phase_b',
      timestampMs: Date.now(),
      audioPositionMs: Math.round(player.currentTime * 1000),
    });
    userInitiatedPauseRef.current = true;
    player.pause();
    onClose();
  }, [player, userInitiatedPauseRef, onClose, moduleId]);

  return (
    <View style={styles.container} testID="module_screen_playing">
      {/* LD-280: controls only, NO cue-synced overlays over the video. */}
      <VideoView
        style={styles.video}
        player={player}
        contentFit="contain"
        nativeControls={false}
        testID="module_screen_video_view"
      />

      <Pressable
        style={styles.closeButton}
        onPress={handleClose}
        testID="module_screen_close_button"
        accessibilityLabel="Close and return to map"
      >
        <Text style={styles.closeButtonText} testID="module_screen_close_button_text">
          ×
        </Text>
      </Pressable>

      <View style={styles.titleBar} testID="module_screen_title_bar">
        <Text style={styles.titleText} testID="module_screen_title_text">
          {title}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    top: 72,
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginTop: -3,
  },
  titleBar: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 72,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingText: {
    color: '#333',
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: '#D00',
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});

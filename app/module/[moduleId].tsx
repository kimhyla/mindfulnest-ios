// app/module/[moduleId].tsx — module playback screen.
//
// LD-280 controls-only chrome: one expo-video instance, one atomic MP4 per
// module, no cue-timed RN overlays, no multi-file playlist, no second audio
// surface. UI chrome is controls only.
//
// LD-286 Layer 1: on mount, check for in-progress session state. If found
// and RESUME_MODE === 'prompt', render ResumePromptModal before the playback
// hook mounts. Child's choice decides the initial seek target.

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { VideoView } from 'expo-video';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';

import { useModulePlayback } from '../../src/hooks/useModulePlayback';
import { ResumePromptModal } from '../../src/components/ResumePromptModal';
import {
  RESUME_MODE,
  clearSessionState,
  loadSessionState,
  saveSessionState,
  type SessionState,
} from '../../src/services/sessionState';

// STUB: until the module catalog lands (separate PR — see APP-25 offline
// cache in STAGE3_ARCHITECTURE_INVENTORY_v2.md), Track C resolves a module's
// video source from a built-in map. A real catalog lookup against cacheIndex
// replaces this stub when the delivery pipeline lands (LD-282 Layer 2).
const PLACEHOLDER_VIDEO_URL =
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4';

interface ModuleMeta {
  arcId: string;
  title: string;
  videoSource: string;
}

// Minimal directory to make the route navigable for Maestro / local testing.
// Real catalog comes from cacheIndex in a follow-up PR once the manifest
// upload pipeline ships.
const MODULE_DIRECTORY: Record<string, ModuleMeta> = {
  m1: { arcId: 'arc1', title: 'Tessa — Body Stone', videoSource: PLACEHOLDER_VIDEO_URL },
  m2: { arcId: 'arc1', title: 'Luna — Watching Stone', videoSource: PLACEHOLDER_VIDEO_URL },
  m3: { arcId: 'arc1', title: 'Benson — Courage Stone', videoSource: PLACEHOLDER_VIDEO_URL },
  m4: { arcId: 'arc1', title: 'Ember — Heart Stone', videoSource: PLACEHOLDER_VIDEO_URL },
  m5: { arcId: 'arc1', title: 'Bork — Grounding Stone', videoSource: PLACEHOLDER_VIDEO_URL },
  m6: { arcId: 'arc1', title: 'Bramble — Calm Stone', videoSource: PLACEHOLDER_VIDEO_URL },
};

type LaunchState =
  | { kind: 'checking_resume' }
  | { kind: 'resume_prompt'; savedState: SessionState }
  | { kind: 'playing'; initialSeekSeconds: number | null };

export default function ModuleScreen(): ReactElement {
  const params = useLocalSearchParams<{ moduleId: string }>();
  const router = useRouter();
  const moduleId = typeof params.moduleId === 'string' ? params.moduleId : '';
  const meta = MODULE_DIRECTORY[moduleId];

  const [launchState, setLaunchState] = useState<LaunchState>({ kind: 'checking_resume' });

  // Resume check runs once on mount. Only the LD-286 'prompt' mode gates
  // playback behind a UI decision. 'silent-resume' auto-seeks; 'silent-zero'
  // ignores saved state.
  useEffect(() => {
    if (!meta) return;
    let cancelled = false;
    void (async () => {
      const saved = await loadSessionState(moduleId);
      if (cancelled) return;

      if (saved == null) {
        setLaunchState({ kind: 'playing', initialSeekSeconds: null });
        return;
      }

      if (RESUME_MODE === 'silent-resume') {
        setLaunchState({ kind: 'playing', initialSeekSeconds: saved.audioPositionMs / 1000 });
        return;
      }
      if (RESUME_MODE === 'silent-zero') {
        await clearSessionState(moduleId);
        setLaunchState({ kind: 'playing', initialSeekSeconds: null });
        return;
      }
      // RESUME_MODE === 'prompt'
      setLaunchState({ kind: 'resume_prompt', savedState: saved });
    })();
    return () => {
      cancelled = true;
    };
  }, [moduleId, meta]);

  const onResume = useCallback(() => {
    setLaunchState((prev) => {
      if (prev.kind !== 'resume_prompt') return prev;
      return {
        kind: 'playing',
        initialSeekSeconds: prev.savedState.audioPositionMs / 1000,
      };
    });
  }, []);

  const onStartFresh = useCallback(() => {
    void clearSessionState(moduleId);
    setLaunchState({ kind: 'playing', initialSeekSeconds: null });
  }, [moduleId]);

  if (!meta) {
    return (
      <View style={styles.container} testID="module_screen_unknown">
        <Text style={styles.errorText} testID="module_screen_unknown_text">
          Unknown module: {moduleId}
        </Text>
        <Link href="/" asChild>
          <Pressable style={styles.closeButton} testID="module_screen_unknown_close">
            <Text style={styles.closeButtonText}>Back to map</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  if (launchState.kind === 'checking_resume') {
    return (
      <View style={styles.container} testID="module_screen_loading">
        <ActivityIndicator size="large" color="#4A6741" testID="module_screen_loading_spinner" />
        <Text style={styles.loadingText} testID="module_screen_loading_text">
          Loading {meta.title}…
        </Text>
      </View>
    );
  }

  const savedState = launchState.kind === 'resume_prompt' ? launchState.savedState : null;
  // Only mount the playback hook once we're in the 'playing' state. Rendering
  // the video player before the resume choice would start playback at zero
  // and defeat the save-and-resume contract.
  if (launchState.kind === 'resume_prompt') {
    return (
      <View style={styles.container} testID="module_screen_resume_gate">
        <ResumePromptModal
          visible
          sessionState={savedState}
          onResume={onResume}
          onStartFresh={onStartFresh}
        />
      </View>
    );
  }

  return (
    <PlayingSurface
      moduleId={moduleId}
      arcId={meta.arcId}
      title={meta.title}
      videoSource={meta.videoSource}
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
  initialSeekSeconds: number | null;
  onClose: () => void;
}

function PlayingSurface(props: PlayingSurfaceProps): ReactElement {
  const { moduleId, arcId, title, videoSource, initialSeekSeconds, onClose } = props;

  const { player, userInitiatedPauseRef, hasEnded } = useModulePlayback({
    moduleId,
    arcId,
    phase: 'phase_b',
    videoSource,
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
  },
});

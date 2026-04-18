// VideoLoopPlayer — thin wrapper around expo-video for MindfulNest's animation
// stack (LD-128 Path D v2 Animation Stack V1). Preflight 76.
//
// Design decisions (from 1+1 Phase 0 synthesis):
//  - CDN-ready API only: `source` accepts a URI string (remote or local-bundle
//    path). Does NOT accept `require(...)` numeric refs. This prevents
//    accidentally bundling Arc 1's ~300-500MB of MP4s into the app binary
//    (App Store cellular cap = 200MB; OTA cap = 50MB). Per Counter #1
//    synthesis against Rule 19.
//  - Declarative props wrap expo-video's imperative `useVideoPlayer` hook.
//  - `onEnd` fires on loop iteration end too; callers should debounce if they
//    only want "played-through-once" semantics.
//
// No unit tests this row — SHORTCUT LD-273; closure = S3-TEST-rn-component-setup.

import { useEffect, type ReactElement } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

export interface VideoLoopPlayerProps {
  /** URI string — remote (https://...) or local static asset path. No require(). */
  readonly source: string;
  /** Loop video continuously. Default: true (use-case is idle loops). */
  readonly loop?: boolean;
  /** Auto-play on mount. Default: true. */
  readonly autoPlay?: boolean;
  /** Mute audio. Default: true (idle loops are decorative). */
  readonly muted?: boolean;
  /** Fires at the end of each playback (each loop iteration when loop=true). */
  readonly onEnd?: () => void;
  /** Passthrough style for the video container. */
  readonly style?: StyleProp<ViewStyle>;
  /** testID for Maestro / accessibility inspectors. */
  readonly testID?: string;
}

export function VideoLoopPlayer({
  source,
  loop = true,
  autoPlay = true,
  muted = true,
  onEnd,
  style,
  testID,
}: VideoLoopPlayerProps): ReactElement {
  const player = useVideoPlayer(source, (p) => {
    p.loop = loop;
    p.muted = muted;
    if (autoPlay) p.play();
  });

  useEffect(() => {
    if (!onEnd) return undefined;
    const sub = player.addListener('playToEnd', onEnd);
    return () => sub.remove();
  }, [player, onEnd]);

  return (
    <View style={[styles.container, style]} testID={testID}>
      <VideoView
        style={styles.video}
        player={player}
        contentFit="contain"
        nativeControls={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});

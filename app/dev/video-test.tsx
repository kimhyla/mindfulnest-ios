// Dev-only screen for smoke-testing VideoLoopPlayer during development.
// Uses a small public sample video URL (not bundled — per LD-273 / Counter #1
// synthesis: MP4s must stream from CDN, not ship in app binary).
//
// __DEV__ guard makes this screen a no-op on production builds.

import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { VideoLoopPlayer } from '../../src/components/VideoLoopPlayer';

// Google-hosted 15s 720p test clip. Stable public URL; NOT bundled.
const SAMPLE_URI = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

export default function VideoTestScreen(): ReactElement {
  if (!__DEV__) {
    return (
      <View style={styles.notAvailable}>
        <Text style={styles.notAvailableText}>Not available in production.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>VideoLoopPlayer smoke</Text>
      <VideoLoopPlayer
        source={SAMPLE_URI}
        loop
        autoPlay
        muted
        style={styles.video}
        testID="video-loop-player-smoke"
      />
      <Text style={styles.caption}>
        Loops silently. Remote source (not bundled).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
    backgroundColor: '#111',
  },
  heading: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  video: {
    height: 240,
    backgroundColor: '#000',
    borderRadius: 8,
  },
  caption: {
    color: '#aaa',
    fontSize: 13,
  },
  notAvailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  notAvailableText: {
    color: '#fff',
    fontSize: 14,
  },
});

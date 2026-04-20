// Unit tests for LD-286 Layer 1 sessionState — save/load/clear + launch-scan.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  STALENESS_WINDOW_MS,
  clearSessionState,
  findInProgressSession,
  loadSessionState,
  saveSessionState,
  sessionStateKey,
} from '../sessionState';

const asyncStorageMock = AsyncStorage as unknown as { __reset(): void };

beforeEach(() => {
  asyncStorageMock.__reset();
});

describe('sessionState — save + load round-trip', () => {
  test('save + load returns the same state', async () => {
    await saveSessionState({
      moduleId: 'm1',
      phase: 'phase_b',
      timestampMs: 1_000_000,
      audioPositionMs: 42_000,
    });
    const loaded = await loadSessionState('m1', 1_000_001);
    expect(loaded).not.toBeNull();
    expect(loaded?.moduleId).toBe('m1');
    expect(loaded?.phase).toBe('phase_b');
    expect(loaded?.audioPositionMs).toBe(42_000);
  });

  test('uses per-module key (session_state_v1:<moduleId>)', async () => {
    await saveSessionState({ moduleId: 'm2', phase: 'phase_b', timestampMs: 1, audioPositionMs: 0 });
    const raw = await AsyncStorage.getItem(sessionStateKey('m2'));
    expect(raw).not.toBeNull();
    expect(raw).toContain('"moduleId":"m2"');
  });

  test('distinct moduleIds do not clobber each other', async () => {
    await saveSessionState({ moduleId: 'm1', phase: 'phase_b', timestampMs: 1, audioPositionMs: 100 });
    await saveSessionState({ moduleId: 'm2', phase: 'phase_b', timestampMs: 2, audioPositionMs: 200 });
    const m1 = await loadSessionState('m1', 1000);
    const m2 = await loadSessionState('m2', 1000);
    expect(m1?.audioPositionMs).toBe(100);
    expect(m2?.audioPositionMs).toBe(200);
  });
});

describe('sessionState — staleness + corrupted-read fallback', () => {
  test('state older than STALENESS_WINDOW_MS (72h) returns null', async () => {
    const now = 1_000_000_000;
    await saveSessionState({
      moduleId: 'm1',
      phase: 'phase_b',
      timestampMs: now - STALENESS_WINDOW_MS - 1,
      audioPositionMs: 10_000,
    });
    const loaded = await loadSessionState('m1', now);
    expect(loaded).toBeNull();
  });

  test('state within the staleness window returns the state', async () => {
    const now = 1_000_000_000;
    await saveSessionState({
      moduleId: 'm1',
      phase: 'phase_b',
      timestampMs: now - (STALENESS_WINDOW_MS - 1000),
      audioPositionMs: 10_000,
    });
    const loaded = await loadSessionState('m1', now);
    expect(loaded).not.toBeNull();
  });

  test('corrupted JSON returns null (counter-C1 fallback)', async () => {
    await AsyncStorage.setItem(sessionStateKey('m1'), '{not valid json');
    const loaded = await loadSessionState('m1', 1);
    expect(loaded).toBeNull();
  });

  test('unknown schemaVersion returns null', async () => {
    await AsyncStorage.setItem(
      sessionStateKey('m1'),
      JSON.stringify({
        schemaVersion: 999,
        moduleId: 'm1',
        phase: 'phase_b',
        timestampMs: 1,
        audioPositionMs: 0,
      }),
    );
    const loaded = await loadSessionState('m1', 1000);
    expect(loaded).toBeNull();
  });

  test('clearSessionState removes the key', async () => {
    await saveSessionState({ moduleId: 'm1', phase: 'phase_b', timestampMs: 1, audioPositionMs: 0 });
    await clearSessionState('m1');
    const loaded = await loadSessionState('m1', 1000);
    expect(loaded).toBeNull();
  });
});

describe('sessionState — findInProgressSession (launch-time scan)', () => {
  test('returns null when no session state exists', async () => {
    expect(await findInProgressSession(1)).toBeNull();
  });

  test('returns the most-recent non-stale state across multiple modules', async () => {
    const now = 1_000_000_000;
    await saveSessionState({ moduleId: 'm1', phase: 'phase_b', timestampMs: now - 1000, audioPositionMs: 10 });
    await saveSessionState({ moduleId: 'm2', phase: 'phase_b', timestampMs: now - 500, audioPositionMs: 20 });
    await saveSessionState({ moduleId: 'm3', phase: 'phase_b', timestampMs: now - 100, audioPositionMs: 30 });
    const found = await findInProgressSession(now);
    expect(found?.moduleId).toBe('m3');
  });

  test('ignores stale entries during the scan', async () => {
    const now = 1_000_000_000;
    await saveSessionState({
      moduleId: 'stale',
      phase: 'phase_b',
      timestampMs: now - STALENESS_WINDOW_MS - 1,
      audioPositionMs: 10,
    });
    await saveSessionState({
      moduleId: 'fresh',
      phase: 'phase_b',
      timestampMs: now - 100,
      audioPositionMs: 20,
    });
    const found = await findInProgressSession(now);
    expect(found?.moduleId).toBe('fresh');
  });
});

// Unit tests for LD-316 Layer 1 progressionState — markComplete/load/clear
// + idempotence + arc isolation + corrupted-read fallback.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PROGRESSION_KEY_PREFIX,
  clearProgression,
  isModuleUnlocked,
  loadProgression,
  markModuleComplete,
  progressionKey,
} from '../progressionState';

const asyncStorageMock = AsyncStorage as unknown as { __reset(): void };

beforeEach(() => {
  asyncStorageMock.__reset();
});

describe('progressionState — markModuleComplete + loadProgression round-trip', () => {
  test('first completion creates the arc row and records the moduleId', async () => {
    await markModuleComplete('arc1', 'm1', 1_000_000);
    const loaded = await loadProgression('arc1');
    expect(loaded).not.toBeNull();
    expect(loaded?.arcId).toBe('arc1');
    expect(loaded?.completedModuleIds).toEqual(['m1']);
    expect(loaded?.lastCompletedAtMs).toBe(1_000_000);
    expect(loaded?.schemaVersion).toBe(1);
  });

  test('uses per-arc key (progression_v1:<arcId>)', async () => {
    await markModuleComplete('arc1', 'm1', 1);
    const raw = await AsyncStorage.getItem(progressionKey('arc1'));
    expect(raw).not.toBeNull();
    expect(raw).toContain('"arcId":"arc1"');
    expect(progressionKey('arc1')).toBe(`${PROGRESSION_KEY_PREFIX}arc1`);
  });

  test('returns null when no progression exists for the arc', async () => {
    const loaded = await loadProgression('arc_never_played');
    expect(loaded).toBeNull();
  });
});

describe('progressionState — idempotence', () => {
  test('replaying playToEnd for the same module does not duplicate', async () => {
    await markModuleComplete('arc1', 'm1', 1_000_000);
    await markModuleComplete('arc1', 'm1', 2_000_000);
    const loaded = await loadProgression('arc1');
    expect(loaded?.completedModuleIds).toEqual(['m1']);
    // lastCompletedAtMs DOES update so the row's freshness reflects the
    // most recent natural-end event — this is intentional.
    expect(loaded?.lastCompletedAtMs).toBe(2_000_000);
  });

  test('subsequent distinct modules append in completion order', async () => {
    await markModuleComplete('arc1', 'm1', 1);
    await markModuleComplete('arc1', 'm2', 2);
    await markModuleComplete('arc1', 'm3', 3);
    const loaded = await loadProgression('arc1');
    expect(loaded?.completedModuleIds).toEqual(['m1', 'm2', 'm3']);
  });

  test('out-of-order completion (m3 then m1) is recorded as-played, not as-canon', async () => {
    // The progression store records the actual completion order, not the
    // canonical M1→M6 order. A child who skips ahead via dev-mode would
    // see ['m3', 'm1']. The unlock-gate (isModuleUnlocked) is what actually
    // enforces M1-before-M2-before-M3, not the storage layer.
    await markModuleComplete('arc1', 'm3', 1);
    await markModuleComplete('arc1', 'm1', 2);
    const loaded = await loadProgression('arc1');
    expect(loaded?.completedModuleIds).toEqual(['m3', 'm1']);
  });
});

describe('progressionState — arc isolation', () => {
  test('completing m1 in arc1 does not affect arc2 progression', async () => {
    await markModuleComplete('arc1', 'm1', 1);
    const arc1 = await loadProgression('arc1');
    const arc2 = await loadProgression('arc2');
    expect(arc1?.completedModuleIds).toEqual(['m1']);
    expect(arc2).toBeNull();
  });

  test('two arcs progress independently', async () => {
    await markModuleComplete('arc1', 'm1', 1);
    await markModuleComplete('arc1', 'm2', 2);
    await markModuleComplete('arc2', 'm7', 3);
    const arc1 = await loadProgression('arc1');
    const arc2 = await loadProgression('arc2');
    expect(arc1?.completedModuleIds).toEqual(['m1', 'm2']);
    expect(arc2?.completedModuleIds).toEqual(['m7']);
  });
});

describe('progressionState — clearProgression', () => {
  test('clear removes the arc row entirely', async () => {
    await markModuleComplete('arc1', 'm1', 1);
    await markModuleComplete('arc1', 'm2', 2);
    await clearProgression('arc1');
    const loaded = await loadProgression('arc1');
    expect(loaded).toBeNull();
  });

  test('clearing one arc leaves another arc untouched', async () => {
    await markModuleComplete('arc1', 'm1', 1);
    await markModuleComplete('arc2', 'm7', 2);
    await clearProgression('arc1');
    const arc1 = await loadProgression('arc1');
    const arc2 = await loadProgression('arc2');
    expect(arc1).toBeNull();
    expect(arc2?.completedModuleIds).toEqual(['m7']);
  });
});

describe('progressionState — corrupted-read fallback', () => {
  test('malformed JSON returns null (does not throw)', async () => {
    await AsyncStorage.setItem(progressionKey('arc1'), '{ this is not valid json');
    const loaded = await loadProgression('arc1');
    expect(loaded).toBeNull();
  });

  test('valid JSON but wrong shape returns null', async () => {
    await AsyncStorage.setItem(progressionKey('arc1'), JSON.stringify({ unrelated: 'shape' }));
    const loaded = await loadProgression('arc1');
    expect(loaded).toBeNull();
  });

  test('unknown schemaVersion returns null', async () => {
    await AsyncStorage.setItem(
      progressionKey('arc1'),
      JSON.stringify({
        schemaVersion: 99,
        arcId: 'arc1',
        completedModuleIds: ['m1'],
        lastCompletedAtMs: 1,
      }),
    );
    const loaded = await loadProgression('arc1');
    expect(loaded).toBeNull();
  });

  test('completedModuleIds containing a non-string is rejected', async () => {
    await AsyncStorage.setItem(
      progressionKey('arc1'),
      JSON.stringify({
        schemaVersion: 1,
        arcId: 'arc1',
        completedModuleIds: ['m1', 42],
        lastCompletedAtMs: 1,
      }),
    );
    const loaded = await loadProgression('arc1');
    expect(loaded).toBeNull();
  });
});

describe('progressionState — isModuleUnlocked gate', () => {
  const ARC1_ORDER = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];

  test('first module is always unlocked, even without progression', () => {
    expect(isModuleUnlocked(null, 'm1', ARC1_ORDER)).toBe(true);
  });

  test('non-first module is locked when no progression exists', () => {
    expect(isModuleUnlocked(null, 'm2', ARC1_ORDER)).toBe(false);
  });

  test('m2 unlocks once m1 is completed', async () => {
    await markModuleComplete('arc1', 'm1', 1);
    const progression = await loadProgression('arc1');
    expect(isModuleUnlocked(progression, 'm2', ARC1_ORDER)).toBe(true);
    expect(isModuleUnlocked(progression, 'm3', ARC1_ORDER)).toBe(false);
  });

  test('completing m2 without m1 does NOT unlock m3 (gate is sequential)', async () => {
    // Out-of-order completion is recorded by the storage layer (see arc
    // isolation tests) but the gate enforces sequential unlock.
    await markModuleComplete('arc1', 'm2', 1);
    const progression = await loadProgression('arc1');
    expect(isModuleUnlocked(progression, 'm3', ARC1_ORDER)).toBe(false);
  });

  test('module not in the supplied order is treated as locked', () => {
    expect(isModuleUnlocked(null, 'm99', ARC1_ORDER)).toBe(false);
  });
});

// Unit tests for cacheIndex LRU eviction + AsyncStorage persistence.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CACHE_INDEX_STORAGE_KEY,
  MIN_AGE_BEFORE_EVICT_MS,
  __resetForTests,
  allEntries,
  evictLru,
  get,
  loadFromStorage,
  markPlayed,
  register,
  saveToStorage,
  totalSizeBytes,
  type CacheEntry,
} from '../cacheIndex';

const asyncStorageMock = AsyncStorage as unknown as { __reset(): void };

function makeEntry(overrides: Partial<CacheEntry>): CacheEntry {
  return {
    assetId: 'a1',
    arcId: 'arc1',
    localPath: 'file:///mock/assets/arc1/a1.mp4',
    sizeBytes: 50 * 1024 * 1024,
    contentHash: 'abc123',
    lastPlayedAt: 1_000,
    downloadedAt: 1_000,
    ...overrides,
  };
}

beforeEach(() => {
  __resetForTests();
  asyncStorageMock.__reset();
});

describe('cacheIndex — LRU sort + pin + 24h floor', () => {
  test('evicts oldest-first by lastPlayedAt', () => {
    const now = 1_000_000_000;
    // All entries are >24h old (downloadedAt = 0).
    register(makeEntry({ assetId: 'old', lastPlayedAt: 100, downloadedAt: 0, sizeBytes: 10 }));
    register(makeEntry({ assetId: 'mid', lastPlayedAt: 500, downloadedAt: 0, sizeBytes: 10 }));
    register(makeEntry({ assetId: 'new', lastPlayedAt: 900, downloadedAt: 0, sizeBytes: 10 }));
    const { freedBytes, evictedAssetIds } = evictLru(15, { pinnedArcId: 'arc-other', nowMs: now });
    expect(evictedAssetIds).toEqual(['old', 'mid']);
    expect(freedBytes).toBe(20);
  });

  test('NEVER evicts entries in the pinned arc', () => {
    const now = 1_000_000_000;
    register(makeEntry({ assetId: 'a1', arcId: 'arc1', lastPlayedAt: 100, downloadedAt: 0, sizeBytes: 10 }));
    register(makeEntry({ assetId: 'a2', arcId: 'arc2', lastPlayedAt: 500, downloadedAt: 0, sizeBytes: 10 }));
    const { evictedAssetIds } = evictLru(100, { pinnedArcId: 'arc1', nowMs: now });
    expect(evictedAssetIds).toEqual(['a2']);
    // a1 (pinned) remains.
    expect(get('a1')).toBeDefined();
    expect(get('a2')).toBeUndefined();
  });

  test('NEVER evicts entries younger than MIN_AGE_BEFORE_EVICT_MS (24h)', () => {
    const now = 1_000_000_000;
    register(makeEntry({ assetId: 'fresh', downloadedAt: now - (MIN_AGE_BEFORE_EVICT_MS - 1000), sizeBytes: 10 }));
    register(makeEntry({ assetId: 'old', downloadedAt: now - (2 * MIN_AGE_BEFORE_EVICT_MS), sizeBytes: 10 }));
    const { evictedAssetIds } = evictLru(100, { pinnedArcId: 'arc-none', nowMs: now });
    expect(evictedAssetIds).toEqual(['old']);
    expect(get('fresh')).toBeDefined();
  });

  test('returns freedBytes = sum of evicted entry sizes, even on partial eviction', () => {
    const now = 1_000_000_000;
    register(makeEntry({ assetId: 'a', downloadedAt: 0, lastPlayedAt: 100, sizeBytes: 7 }));
    register(makeEntry({ assetId: 'b', downloadedAt: 0, lastPlayedAt: 200, sizeBytes: 11 }));
    register(makeEntry({ assetId: 'c', downloadedAt: 0, lastPlayedAt: 300, sizeBytes: 13 }));
    // Need 10 bytes — first entry (7) alone isn't enough, must also evict b.
    const { freedBytes, evictedAssetIds } = evictLru(10, { pinnedArcId: 'arc-none', nowMs: now });
    expect(evictedAssetIds).toEqual(['a', 'b']);
    expect(freedBytes).toBe(18);
  });

  test('returns partial freedBytes when not enough evictable entries to satisfy bytesNeeded', () => {
    const now = 1_000_000_000;
    register(makeEntry({ assetId: 'small', downloadedAt: 0, sizeBytes: 5 }));
    const { freedBytes, evictedAssetIds } = evictLru(100, { pinnedArcId: 'arc-none', nowMs: now });
    expect(evictedAssetIds).toEqual(['small']);
    expect(freedBytes).toBe(5);
  });
});

describe('cacheIndex — persistence + corrupted-read fallback', () => {
  test('save + load round-trip preserves entries', async () => {
    register(makeEntry({ assetId: 'a', lastPlayedAt: 100, downloadedAt: 100 }));
    register(makeEntry({ assetId: 'b', lastPlayedAt: 200, downloadedAt: 200 }));
    await saveToStorage();
    __resetForTests();
    await loadFromStorage();
    expect(get('a')).toBeDefined();
    expect(get('b')).toBeDefined();
    expect(totalSizeBytes()).toBeGreaterThan(0);
  });

  test('corrupted JSON in AsyncStorage drops to empty index (no throw)', async () => {
    await AsyncStorage.setItem(CACHE_INDEX_STORAGE_KEY, '{not valid json');
    await expect(loadFromStorage()).resolves.toBeUndefined();
    expect(allEntries()).toHaveLength(0);
  });

  test('wrong schemaVersion drops to empty index', async () => {
    await AsyncStorage.setItem(
      CACHE_INDEX_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 999, entries: [makeEntry({})] }),
    );
    await loadFromStorage();
    expect(allEntries()).toHaveLength(0);
  });

  test('markPlayed updates lastPlayedAt + persists', async () => {
    register(makeEntry({ assetId: 'x', lastPlayedAt: 0 }));
    const before = get('x')?.lastPlayedAt ?? -1;
    await markPlayed('x');
    const after = get('x')?.lastPlayedAt ?? -1;
    expect(after).toBeGreaterThan(before);
    const raw = await AsyncStorage.getItem(CACHE_INDEX_STORAGE_KEY);
    expect(raw).toContain('"lastPlayedAt":');
  });
});

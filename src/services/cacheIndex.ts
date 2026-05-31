// cacheIndex — in-memory map of cached assets, mirrored to AsyncStorage.
//
// Owned by the Delivery-and-caching tier (APP_ARCHITECTURE_MASTER_v1.md §5).
// Per LD-282 CATALOG_DELIVERY_ARC_AT_A_TIME_V1:
//   - 3 GB cache ceiling
//   - LRU eviction sorted by lastPlayedAt ASC
//   - Active arc is PINNED (pinnedArcId never evicts)
//   - Entries <24h old are never evicted (prevents churn-after-install)
//
// Persistence:
//   - AsyncStorage key `cache_index_v1`
//   - In-payload schemaVersion (resolves preflight-88 counter finding: filename
//     version suffix alone is insufficient for migration)
//   - Corrupted-read fallback: drop-to-empty-index then rebuild lazily on next
//     downloadAsset call (never readmit partial files without hash verification).

import AsyncStorage from '@react-native-async-storage/async-storage';

export const CACHE_CEILING_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB
export const MIN_AGE_BEFORE_EVICT_MS = 24 * 60 * 60 * 1000; // 24 hours
export const CACHE_INDEX_STORAGE_KEY = 'cache_index_v1';
// Schema v2: added contentHash (lowercase hex SHA-256 of base64-encoded file
// content, matching downloadManager's expo-crypto computation). Entries from
// v1 fail isValidEntry and are dropped — they will be re-downloaded lazily.
export const CACHE_INDEX_SCHEMA_VERSION = 2;

export interface CacheEntry {
  assetId: string;
  arcId: string;
  localPath: string;
  sizeBytes: number;
  /** Lowercase hex SHA-256 of base64(file bytes) — matches downloadManager hash. */
  contentHash: string;
  /** Unix-epoch ms when the asset was last played to any degree. */
  lastPlayedAt: number;
  /** Unix-epoch ms when the asset was downloaded (for <24h evict floor). */
  downloadedAt: number;
}

interface CacheIndexPayload {
  schemaVersion: number;
  entries: CacheEntry[];
}

let memoryIndex: Map<string, CacheEntry> = new Map();
let hasLoaded = false;

/**
 * Load the index from AsyncStorage into memory.
 *
 * Safe to call multiple times (idempotent). On parse failure, logs a warning
 * and resets to empty — partial files are NOT readmitted from disk without
 * hash verification (see preflight-91 counter C1 fix).
 */
export async function loadFromStorage(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_INDEX_STORAGE_KEY);
    if (raw == null) {
      memoryIndex = new Map();
      hasLoaded = true;
      return;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('schemaVersion' in parsed) ||
      (parsed as CacheIndexPayload).schemaVersion !== CACHE_INDEX_SCHEMA_VERSION ||
      !Array.isArray((parsed as CacheIndexPayload).entries)
    ) {
      // Unknown schema or malformed shape — drop and rebuild on next write.
      memoryIndex = new Map();
      hasLoaded = true;
      return;
    }
    const next = new Map<string, CacheEntry>();
    for (const entry of (parsed as CacheIndexPayload).entries) {
      if (isValidEntry(entry)) {
        next.set(entry.assetId, entry);
      }
    }
    memoryIndex = next;
    hasLoaded = true;
  } catch {
    // Malformed JSON / AsyncStorage failure — treat as empty index.
    memoryIndex = new Map();
    hasLoaded = true;
  }
}

/** Persist the in-memory index to AsyncStorage. */
export async function saveToStorage(): Promise<void> {
  const payload: CacheIndexPayload = {
    schemaVersion: CACHE_INDEX_SCHEMA_VERSION,
    entries: Array.from(memoryIndex.values()),
  };
  await AsyncStorage.setItem(CACHE_INDEX_STORAGE_KEY, JSON.stringify(payload));
}

/** Register a newly-downloaded entry. Caller persists via saveToStorage(). */
export function register(entry: CacheEntry): void {
  memoryIndex.set(entry.assetId, entry);
}

/** Lookup a cached entry by assetId. */
export function get(assetId: string): CacheEntry | undefined {
  return memoryIndex.get(assetId);
}

/** Remove an entry from the in-memory index (caller persists separately). */
export function unregister(assetId: string): void {
  memoryIndex.delete(assetId);
}

/** Mark an asset as played now. Updates lastPlayedAt + persists. */
export async function markPlayed(assetId: string): Promise<void> {
  const entry = memoryIndex.get(assetId);
  if (!entry) return;
  entry.lastPlayedAt = Date.now();
  await saveToStorage();
}

/** Total size of all currently-cached assets. */
export function totalSizeBytes(): number {
  let total = 0;
  for (const entry of memoryIndex.values()) {
    total += entry.sizeBytes;
  }
  return total;
}

/** All entries, for enumeration by other services (e.g., storageCheck). */
export function allEntries(): readonly CacheEntry[] {
  return Array.from(memoryIndex.values());
}

export interface EvictOptions {
  /** The currently-active arc. Entries with this arcId are PINNED. */
  pinnedArcId: string;
  /** `Date.now()` override for tests. */
  nowMs?: number;
}

/**
 * Evict least-recently-played entries until `bytesNeeded` bytes are freed.
 *
 * Sorts eligible entries by lastPlayedAt ASC (oldest first). Skips:
 *   - Entries whose arcId === pinnedArcId (active-arc pin per LD-282).
 *   - Entries younger than MIN_AGE_BEFORE_EVICT_MS (<24h floor).
 *
 * Returns the number of bytes actually freed (may be less than bytesNeeded if
 * there aren't enough evictable entries — caller decides whether to block the
 * new download).
 *
 * NOTE: This function only removes entries from the in-memory index. Disk
 * cleanup (FileSystem.deleteAsync) is the caller's responsibility — usually
 * downloadManager does this as a pre-download step.
 */
export function evictLru(bytesNeeded: number, options: EvictOptions): {
  freedBytes: number;
  evictedAssetIds: string[];
} {
  const now = options.nowMs ?? Date.now();
  const eligible = Array.from(memoryIndex.values())
    .filter((e) => e.arcId !== options.pinnedArcId)
    .filter((e) => now - e.downloadedAt >= MIN_AGE_BEFORE_EVICT_MS)
    .sort((a, b) => a.lastPlayedAt - b.lastPlayedAt);

  let freedBytes = 0;
  const evictedAssetIds: string[] = [];
  for (const entry of eligible) {
    if (freedBytes >= bytesNeeded) break;
    memoryIndex.delete(entry.assetId);
    freedBytes += entry.sizeBytes;
    evictedAssetIds.push(entry.assetId);
  }
  return { freedBytes, evictedAssetIds };
}

/**
 * Force-evict every cached entry outside the active arc, ignoring the normal
 * 24h floor. Used only under the <200 MB emergency storage policy.
 */
export function evictAllExceptArc(pinnedArcId: string): {
  freedBytes: number;
  evictedAssetIds: string[];
} {
  let freedBytes = 0;
  const evictedAssetIds: string[] = [];

  for (const entry of Array.from(memoryIndex.values())) {
    if (entry.arcId === pinnedArcId) continue;
    memoryIndex.delete(entry.assetId);
    freedBytes += entry.sizeBytes;
    evictedAssetIds.push(entry.assetId);
  }

  return { freedBytes, evictedAssetIds };
}

/** Test-only: reset in-memory state without touching AsyncStorage. */
export function __resetForTests(): void {
  memoryIndex = new Map();
  hasLoaded = false;
}

/** Test-only: inspect whether the index has been loaded from storage. */
export function __hasLoadedForTests(): boolean {
  return hasLoaded;
}

function isValidEntry(e: unknown): e is CacheEntry {
  if (!e || typeof e !== 'object') return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.assetId === 'string' &&
    typeof o.arcId === 'string' &&
    typeof o.localPath === 'string' &&
    typeof o.sizeBytes === 'number' &&
    typeof o.contentHash === 'string' &&
    typeof o.lastPlayedAt === 'number' &&
    typeof o.downloadedAt === 'number'
  );
}

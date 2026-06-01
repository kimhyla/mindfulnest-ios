// catalogService — resolves a moduleId to a local cached file URI.
//
// LD-282: arc-at-a-time delivery; documentDirectory cache; LRU 3 GB ceiling;
//         active arc pinned (never evicted during playback).
// LD-406: signed URLs from generateModuleDownloadUrl CF only; app never calls
//         Firebase Storage directly.
// LD-283: 60 MB target / 80 MB hard ceiling per module.
// PHASE_BOUNDARIES_NAMED_OBJECT_V1: phaseBoundaries returned as named objects.
//
// SHORTCUT_PHASE_BOUNDARIES_CACHE_HIT_CF_V1 (LD registered in Directus):
//   On cache HIT, the CF is still called to retrieve phaseBoundaries because
//   they are not stored in cacheIndex V1. This adds ~200ms warm-CF latency per
//   play even when the file is local. Closure plan: store phaseBoundaries in
//   cacheIndex in V1.1, eliminating the CF call on cache hits.

import * as FileSystem from 'expo-file-system/legacy';

import { arcIdForModule } from '../data/arcManifest';
import {
  loadFromStorage,
  get as getCacheEntry,
  evictAllExceptArc,
  evictLru,
  unregister,
  register,
  saveToStorage,
} from './cacheIndex';
import { pathFor } from './cachePaths';
import { downloadAsset, verifyCachedFile, CacheHashMismatchError } from './downloadManager';
import { getModuleDownloadUrl, type PhaseBoundary } from './cloudFunctions';
import { ensureAppCheckReady } from './appCheckService';
import { checkDeviceFreeSpace, type StoragePolicy } from './storageCheck';

export { CacheHashMismatchError };

export class LowStorageError extends Error {
  readonly policy: StoragePolicy;
  readonly freeBytes: number;

  constructor(policy: StoragePolicy, freeBytes: number) {
    super(`Low storage: ${policy} (${freeBytes} bytes free).`);
    this.name = 'LowStorageError';
    this.policy = policy;
    this.freeBytes = freeBytes;
  }
}

export interface ResolvedModule {
  localPath: string;
  phaseBoundaries: PhaseBoundary[];
  arcId: string;
  contentHash: string;
}

let cacheBootstrapped = false;

async function ensureCacheBootstrapped(): Promise<void> {
  if (cacheBootstrapped) return;
  await loadFromStorage();
  cacheBootstrapped = true;
}

export async function resolveModule(moduleId: string): Promise<ResolvedModule> {
  const id = moduleId.toLowerCase();
  await ensureCacheBootstrapped();

  const arcId = arcIdForModule(id);
  if (!arcId) throw new Error(`resolveModule: unknown moduleId '${id}'`);

  const assetId = `${id}_module_v1`;
  const localPath = pathFor(arcId, assetId);

  // Cache hit: verify integrity before using
  const cached = getCacheEntry(assetId);
  if (cached) {
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists) {
      const valid = await verifyCachedFile(localPath, cached.contentHash);
      if (valid) {
        // SHORTCUT_PHASE_BOUNDARIES_CACHE_HIT_CF_V1: call CF to retrieve
        // phaseBoundaries — not stored in cacheIndex V1 (see header comment).
        await ensureAppCheckReady();
        const cfResult = await getModuleDownloadUrl({ moduleId: id });
        return {
          localPath,
          phaseBoundaries: cfResult.data.phaseBoundaries,
          arcId,
          contentHash: cached.contentHash,
        };
      }
      // Hash mismatch — delete and re-download
      await FileSystem.deleteAsync(localPath, { idempotent: true });
      unregister(assetId);
      await saveToStorage();
    } else {
      // File missing from disk — remove stale index entry
      unregister(assetId);
      await saveToStorage();
    }
  }

  // Cache miss: fetch signed URL from CF
  await ensureAppCheckReady();
  const cfResult = await getModuleDownloadUrl({ moduleId: id });
  const { url, contentHash, sizeBytes, phaseBoundaries } = cfResult.data;

  const storage = await checkDeviceFreeSpace();
  if (storage.policy === 'force_evict_all_but_active_arc') {
    const { evictedAssetIds } = evictAllExceptArc(arcId);
    await deleteEvictedAssets(evictedAssetIds);
    if (evictedAssetIds.length > 0) await saveToStorage();
    throw new LowStorageError(storage.policy, storage.freeBytes);
  }
  if (storage.policy === 'block_new_downloads') {
    throw new LowStorageError(storage.policy, storage.freeBytes);
  }

  // LRU eviction if needed before download (LD-282).
  // Pin the active arc so it is never evicted while the child is playing.
  const { evictedAssetIds } = evictLru(sizeBytes, { pinnedArcId: arcId });
  await deleteEvictedAssets(evictedAssetIds);
  if (evictedAssetIds.length > 0) await saveToStorage();

  // Download + SHA-256 integrity verify (throws CacheHashMismatchError on mismatch)
  const result = await downloadAsset({ assetId, arcId, url, sizeBytes, contentHash });

  // Register in cacheIndex using the live CacheEntry interface fields
  register({
    assetId,
    arcId,
    localPath: result.localPath,
    sizeBytes: result.sizeBytes,
    contentHash,
    lastPlayedAt: Date.now(),
    downloadedAt: Date.now(),
  });
  await saveToStorage();

  return { localPath: result.localPath, phaseBoundaries, arcId, contentHash };
}

async function deleteEvictedAssets(evictedAssetIds: readonly string[]): Promise<void> {
  for (const evictedId of evictedAssetIds) {
    const evictedArcId = arcIdForModule(evictedId.replace(/_module_v\d+$/, '')) ?? 'unknown';
    await FileSystem.deleteAsync(pathFor(evictedArcId, evictedId), { idempotent: true });
  }
}

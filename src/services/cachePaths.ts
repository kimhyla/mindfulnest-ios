// cachePaths — single source of truth for on-disk asset paths.
//
// Owned by the Delivery-and-caching tier (APP_ARCHITECTURE_MASTER_v1.md §5).
// Imported by downloadManager (writes bytes) and cacheIndex (records entries)
// so neither duplicates the path convention. Resolves the counter-agent
// CRITICAL from preflight 88 synthesis ("zero cross-imports collapses without
// a shared path builder").
//
// Per LD-282 (CATALOG_DELIVERY_ARC_AT_A_TIME_V1): documentDirectory ONLY.
// cacheDirectory is forbidden — iOS may silently purge it under memory
// pressure (Apple dev forum thread 107071), which would destroy mid-session
// progress.
//
// Uses expo-file-system's legacy module namespace because this Track C
// feature needs createDownloadResumable (resumable downloads) which is only
// in the legacy surface as of expo-file-system 19.0.21. The modern
// Paths/File/Directory API is intentionally unused here for consistency.

import * as FileSystem from 'expo-file-system/legacy';

/** Root directory for cached atomic MP4 assets under documentDirectory. */
export const ASSETS_ROOT_DIRNAME = 'assets';

function requireDocumentDirectory(): string {
  const d = FileSystem.documentDirectory;
  if (!d) {
    throw new Error(
      'expo-file-system documentDirectory unavailable — Track C cache cannot ' +
        'initialize on a platform without a persistent document directory.',
    );
  }
  return d;
}

/**
 * Compute the on-disk path for an asset.
 *
 * Layout: `${documentDirectory}assets/${arcId}/${assetId}.mp4`
 *
 * Per APP_ARCHITECTURE_MASTER_v1.md §2.3: one atomic MP4 per asset; the arcId
 * subdirectory lets LRU eviction delete a whole arc directory in one op.
 */
export function pathFor(arcId: string, assetId: string): string {
  return `${requireDocumentDirectory()}${ASSETS_ROOT_DIRNAME}/${arcId}/${assetId}.mp4`;
}

/** Directory URI for an arc. */
export function dirFor(arcId: string): string {
  return `${requireDocumentDirectory()}${ASSETS_ROOT_DIRNAME}/${arcId}/`;
}

/** Root assets directory URI (used by cache rebuild-from-disk fallback). */
export function assetsRootDir(): string {
  return `${requireDocumentDirectory()}${ASSETS_ROOT_DIRNAME}/`;
}

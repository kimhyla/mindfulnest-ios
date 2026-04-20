// downloadManager — fetch an atomic MP4 from a CDN and land it on disk, verified.
//
// Owned by the Delivery-and-caching + Integrity tiers
// (APP_ARCHITECTURE_MASTER_v1.md §5). Per LD-282:
//   - Writes to documentDirectory (NOT cacheDirectory — iOS silent-purge risk)
//   - Resumable download (expo-file-system createDownloadResumable)
// Per §5 Integrity:
//   - SHA-256 content_hash verify against the Directus-sourced manifest BEFORE
//     the file is exposed to the caller. Mismatch → delete + throw.
//
// Scope: integrity boundary only. This is an INTEGRITY check (catches bitrot,
// partial downloads, truncation), NOT an authenticity boundary — manifest
// signing is an out-of-scope follow-up (see PR body residual-risk section).

import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

import { pathFor } from './cachePaths';

export interface AssetManifest {
  /** Stable asset identifier (e.g., 'm1_module_v1'). */
  assetId: string;
  /** Arc this asset belongs to (used for directory layout + LRU pinning). */
  arcId: string;
  /** HTTPS URL from which to fetch the MP4. */
  url: string;
  /** Expected byte size — used for pre-flight LRU/storage math, not verified. */
  sizeBytes: number;
  /** Lowercase hex SHA-256 of the final file bytes. */
  contentHash: string;
}

export interface DownloadResult {
  assetId: string;
  arcId: string;
  localPath: string;
  sizeBytes: number;
}

/**
 * Thrown when the downloaded file's SHA-256 does not match the manifest.
 * Caller should treat this as a corrupted-download / MITM-rejected signal.
 */
export class CacheHashMismatchError extends Error {
  readonly assetId: string;
  readonly expectedHash: string;
  readonly actualHash: string;
  constructor(assetId: string, expectedHash: string, actualHash: string) {
    super(
      `SHA-256 mismatch for asset ${assetId}: expected ${expectedHash}, got ${actualHash}. ` +
        `File has been deleted from cache.`,
    );
    this.name = 'CacheHashMismatchError';
    this.assetId = assetId;
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
  }
}

/**
 * Download an asset to documentDirectory with content_hash verify.
 *
 * Pipeline:
 *   1. Ensure arcId directory exists.
 *   2. Resumable download manifest.url -> `${documentDirectory}assets/${arcId}/${assetId}.mp4`.
 *   3. Read file bytes, compute SHA-256 via expo-crypto.
 *   4. Compare against manifest.contentHash (case-insensitive hex).
 *   5. On mismatch: FileSystem.deleteAsync (idempotent) + throw CacheHashMismatchError.
 *   6. On match: return {assetId, arcId, localPath, sizeBytes}.
 *
 * The caller is responsible for registering the result in cacheIndex.
 * Separating these concerns keeps downloadManager pure (bytes-to-disk) and
 * cacheIndex pure (bookkeeping).
 */
export async function downloadAsset(manifest: AssetManifest): Promise<DownloadResult> {
  const localPath = pathFor(manifest.arcId, manifest.assetId);

  // Ensure parent directory exists (idempotent).
  const dirUri = localPath.substring(0, localPath.lastIndexOf('/') + 1);
  await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });

  // Resumable download — robust to network hiccups on large MP4s.
  const resumable = FileSystem.createDownloadResumable(manifest.url, localPath);
  const result = await resumable.downloadAsync();
  if (!result || result.status !== 200) {
    // Clean up any partial file before surfacing the error.
    await FileSystem.deleteAsync(localPath, { idempotent: true });
    throw new Error(
      `downloadAsset: network failure for ${manifest.assetId} (status=${result?.status ?? 'unknown'})`,
    );
  }

  // Read bytes as base64, hash via expo-crypto. digestStringAsync with
  // encoding=base64 on input + hex output returns lowercase hex.
  const base64 = await FileSystem.readAsStringAsync(localPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const actualHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    base64,
    { encoding: Crypto.CryptoEncoding.HEX },
  );

  const expected = manifest.contentHash.toLowerCase();
  const actual = actualHash.toLowerCase();
  if (expected !== actual) {
    await FileSystem.deleteAsync(localPath, { idempotent: true });
    throw new CacheHashMismatchError(manifest.assetId, expected, actual);
  }

  // Resolve the real on-disk size for the cacheIndex entry the caller will
  // write — manifest.sizeBytes is advisory (from Directus at manifest time).
  const info = await FileSystem.getInfoAsync(localPath);
  const sizeBytes = info.exists ? info.size : manifest.sizeBytes;

  return {
    assetId: manifest.assetId,
    arcId: manifest.arcId,
    localPath,
    sizeBytes,
  };
}

/**
 * Hash an existing file and compare to an expected content_hash. Used by the
 * launch-time integrity gate before playback to catch corruption that may have
 * accumulated while a cached file sat on disk between sessions.
 */
export async function verifyCachedFile(
  localPath: string,
  expectedHash: string,
): Promise<boolean> {
  const base64 = await FileSystem.readAsStringAsync(localPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const actual = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    base64,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return actual.toLowerCase() === expectedHash.toLowerCase();
}

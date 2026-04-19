// storageCheck — device free-space policy gate.
//
// Owned by the Delivery-and-caching tier (APP_ARCHITECTURE_MASTER_v1.md §5).
// Per LD-282 CATALOG_DELIVERY_ARC_AT_A_TIME_V1 and SIZE_BUDGET_AUDIT §7:
//   <500 MB free → block_new_downloads
//   <200 MB free → force_evict_all_but_active_arc
//
// Callers (module/[moduleId].tsx + background-fetch trigger) use the returned
// discriminated union to branch exhaustively on policy — TypeScript catches
// any missing case. Pure read of FileSystem.getFreeDiskStorageAsync; never
// mutates state here.

import * as FileSystem from 'expo-file-system/legacy';

export const BLOCK_NEW_DOWNLOADS_THRESHOLD_BYTES = 500 * 1024 * 1024; // 500 MB
export const FORCE_EVICT_THRESHOLD_BYTES = 200 * 1024 * 1024; // 200 MB

export type StoragePolicy =
  | 'ok'
  | 'block_new_downloads'
  | 'force_evict_all_but_active_arc';

export interface StorageCheckResult {
  freeBytes: number;
  policy: StoragePolicy;
}

/**
 * Read iPad free-space and classify it into a policy tier.
 *
 * Thresholds (strictly-less-than):
 *   freeBytes < 200 MB  → 'force_evict_all_but_active_arc'
 *   freeBytes < 500 MB  → 'block_new_downloads'
 *   otherwise           → 'ok'
 *
 * A value of exactly 500 MB is 'ok'; exactly 200 MB is 'block_new_downloads'.
 * See __tests__/storageCheck.test.ts for the boundary cases.
 */
export async function checkDeviceFreeSpace(): Promise<StorageCheckResult> {
  const freeBytes = await FileSystem.getFreeDiskStorageAsync();
  const policy = classifyPolicy(freeBytes);
  return { freeBytes, policy };
}

/** Pure function, exported for tests to avoid stubbing FileSystem. */
export function classifyPolicy(freeBytes: number): StoragePolicy {
  if (freeBytes < FORCE_EVICT_THRESHOLD_BYTES) {
    return 'force_evict_all_but_active_arc';
  }
  if (freeBytes < BLOCK_NEW_DOWNLOADS_THRESHOLD_BYTES) {
    return 'block_new_downloads';
  }
  return 'ok';
}

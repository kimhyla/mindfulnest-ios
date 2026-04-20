// Unit tests for storageCheck policy tiers.

import * as FileSystem from 'expo-file-system/legacy';
import {
  BLOCK_NEW_DOWNLOADS_THRESHOLD_BYTES,
  FORCE_EVICT_THRESHOLD_BYTES,
  checkDeviceFreeSpace,
  classifyPolicy,
} from '../storageCheck';

const getFreeDiskStorageAsyncMock = FileSystem.getFreeDiskStorageAsync as jest.MockedFunction<
  typeof FileSystem.getFreeDiskStorageAsync
>;

describe('storageCheck — tier boundaries', () => {
  test('plenty of free space → ok', () => {
    expect(classifyPolicy(5 * 1024 * 1024 * 1024)).toBe('ok');
  });

  test('exactly 500 MB → ok (strictly-less-than threshold)', () => {
    expect(classifyPolicy(BLOCK_NEW_DOWNLOADS_THRESHOLD_BYTES)).toBe('ok');
  });

  test('499 MB → block_new_downloads', () => {
    expect(classifyPolicy(BLOCK_NEW_DOWNLOADS_THRESHOLD_BYTES - 1)).toBe('block_new_downloads');
  });

  test('300 MB → block_new_downloads (not yet force-evict)', () => {
    expect(classifyPolicy(300 * 1024 * 1024)).toBe('block_new_downloads');
  });

  test('exactly 200 MB → block_new_downloads (strictly-less-than threshold)', () => {
    expect(classifyPolicy(FORCE_EVICT_THRESHOLD_BYTES)).toBe('block_new_downloads');
  });

  test('199 MB → force_evict_all_but_active_arc', () => {
    expect(classifyPolicy(FORCE_EVICT_THRESHOLD_BYTES - 1)).toBe('force_evict_all_but_active_arc');
  });

  test('50 MB → force_evict_all_but_active_arc', () => {
    expect(classifyPolicy(50 * 1024 * 1024)).toBe('force_evict_all_but_active_arc');
  });
});

describe('storageCheck — checkDeviceFreeSpace integrates FileSystem API', () => {
  test('returns both freeBytes and policy from FileSystem reading', async () => {
    getFreeDiskStorageAsyncMock.mockResolvedValueOnce(100 * 1024 * 1024);
    const result = await checkDeviceFreeSpace();
    expect(result.freeBytes).toBe(100 * 1024 * 1024);
    expect(result.policy).toBe('force_evict_all_but_active_arc');
  });

  test('1 GB free → ok', async () => {
    getFreeDiskStorageAsyncMock.mockResolvedValueOnce(1024 * 1024 * 1024);
    const result = await checkDeviceFreeSpace();
    expect(result.policy).toBe('ok');
  });
});

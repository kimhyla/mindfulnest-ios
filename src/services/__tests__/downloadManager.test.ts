// Unit tests for downloadManager — SHA-256 verify + hash-mismatch cleanup.

import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import {
  CacheHashMismatchError,
  downloadAsset,
  verifyCachedFile,
  type AssetManifest,
} from '../downloadManager';

const deleteAsyncMock = FileSystem.deleteAsync as jest.MockedFunction<typeof FileSystem.deleteAsync>;
const createDownloadResumableMock = FileSystem.createDownloadResumable as jest.MockedFunction<
  typeof FileSystem.createDownloadResumable
>;
const digestStringAsyncMock = Crypto.digestStringAsync as jest.MockedFunction<
  typeof Crypto.digestStringAsync
>;

function makeManifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return {
    assetId: 'a1',
    arcId: 'arc1',
    url: 'https://cdn.example.com/a1.mp4',
    sizeBytes: 1_000_000,
    contentHash: 'aaaa'.repeat(16),
    ...overrides,
  };
}

describe('downloadManager — happy path', () => {
  test('downloads, verifies matching hash, returns DownloadResult', async () => {
    digestStringAsyncMock.mockResolvedValueOnce('aaaa'.repeat(16));
    const result = await downloadAsset(makeManifest());
    expect(result.assetId).toBe('a1');
    expect(result.arcId).toBe('arc1');
    expect(result.localPath).toContain('assets/arc1/a1.mp4');
    expect(deleteAsyncMock).not.toHaveBeenCalled();
  });

  test('hash comparison is case-insensitive', async () => {
    digestStringAsyncMock.mockResolvedValueOnce('AAAA'.repeat(16));
    const result = await downloadAsset(makeManifest({ contentHash: 'aaaa'.repeat(16) }));
    expect(result.assetId).toBe('a1');
  });
});

describe('downloadManager — SHA-256 mismatch path (CRITICAL safety contract)', () => {
  test('hash mismatch throws CacheHashMismatchError AND unlinks the file', async () => {
    digestStringAsyncMock.mockResolvedValueOnce('cafe'.repeat(16));
    await expect(downloadAsset(makeManifest({ contentHash: 'face'.repeat(16) }))).rejects.toBeInstanceOf(
      CacheHashMismatchError,
    );
    expect(deleteAsyncMock).toHaveBeenCalledWith(
      expect.stringContaining('assets/arc1/a1.mp4'),
      expect.objectContaining({ idempotent: true }),
    );
  });

  test('CacheHashMismatchError carries assetId, expectedHash, actualHash', async () => {
    digestStringAsyncMock.mockResolvedValueOnce('cafe'.repeat(16));
    try {
      await downloadAsset(makeManifest({ contentHash: 'face'.repeat(16) }));
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CacheHashMismatchError);
      const hashErr = err as CacheHashMismatchError;
      expect(hashErr.assetId).toBe('a1');
      expect(hashErr.expectedHash).toBe('face'.repeat(16));
      expect(hashErr.actualHash).toBe('cafe'.repeat(16));
    }
  });
});

describe('downloadManager — network failure path', () => {
  test('non-200 download status throws and unlinks any partial file', async () => {
    // Override the default resumable to return a 404.
    createDownloadResumableMock.mockImplementationOnce((_url, path) => {
      return {
        downloadAsync: jest.fn(async () => ({
          status: 404,
          uri: path,
          headers: {},
          md5: undefined,
        })),
        pauseAsync: jest.fn(async () => undefined),
        resumeAsync: jest.fn(async () => undefined),
        cancelAsync: jest.fn(async () => undefined),
        savable: () => ({ url: _url, fileUri: path, options: {}, resumeData: undefined }),
      } as unknown as ReturnType<typeof FileSystem.createDownloadResumable>;
    });
    await expect(downloadAsset(makeManifest())).rejects.toThrow(/network failure/);
    expect(deleteAsyncMock).toHaveBeenCalled();
  });
});

describe('verifyCachedFile — launch-time integrity gate', () => {
  test('returns true when stored hash matches expected', async () => {
    digestStringAsyncMock.mockResolvedValueOnce('1234'.repeat(16));
    expect(await verifyCachedFile('file:///mock/a1.mp4', '1234'.repeat(16))).toBe(true);
  });
  test('returns false when stored hash mismatches expected', async () => {
    digestStringAsyncMock.mockResolvedValueOnce('1234'.repeat(16));
    expect(await verifyCachedFile('file:///mock/a1.mp4', '5678'.repeat(16))).toBe(false);
  });
});

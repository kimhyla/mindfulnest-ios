// Test-only mock of expo-file-system/legacy for Track C service tests.
//
// Provides jest.fn() shims for every function the services use. Tests set
// behavior via `.mockImplementation` / `.mockResolvedValue` / `.mockRejectedValue`.

import { jest } from '@jest/globals';

type Opts = Record<string, unknown> | undefined;

export const documentDirectory = 'file:///mock/document/';
export const cacheDirectory = 'file:///mock/cache/';

export const EncodingType = {
  UTF8: 'utf8',
  Base64: 'base64',
} as const;

export const getInfoAsync = jest.fn(async (_uri: string) => ({
  exists: true,
  uri: _uri,
  size: 0,
  isDirectory: false,
  modificationTime: 0,
}));

export const makeDirectoryAsync = jest.fn(async (_uri: string, _opts?: Opts) => undefined);
export const deleteAsync = jest.fn(async (_uri: string, _opts?: Opts) => undefined);
export const readAsStringAsync = jest.fn(async (_uri: string, _opts?: Opts) => '');
export const writeAsStringAsync = jest.fn(async (_uri: string, _content: string, _opts?: Opts) => undefined);
export const readDirectoryAsync = jest.fn(async (_uri: string) => [] as string[]);
export const getFreeDiskStorageAsync = jest.fn(async () => 10 * 1024 * 1024 * 1024);
export const getTotalDiskCapacityAsync = jest.fn(async () => 64 * 1024 * 1024 * 1024);

export const downloadAsync = jest.fn(async (_url: string, _path: string) => ({
  status: 200,
  uri: _path,
  headers: {} as Record<string, string>,
  md5: undefined as string | undefined,
}));

export const createDownloadResumable = jest.fn((_url: string, _path: string) => {
  const mockTask = {
    downloadAsync: jest.fn(async () => ({
      status: 200,
      uri: _path,
      headers: {} as Record<string, string>,
      md5: undefined as string | undefined,
    })),
    pauseAsync: jest.fn(async () => undefined),
    resumeAsync: jest.fn(async () => undefined),
    cancelAsync: jest.fn(async () => undefined),
    savable: () => ({ url: _url, fileUri: _path, options: {}, resumeData: undefined }),
  };
  return mockTask;
});

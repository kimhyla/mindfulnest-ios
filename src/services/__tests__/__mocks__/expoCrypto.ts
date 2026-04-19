// Test-only mock of expo-crypto. digestStringAsync returns a stubbed value
// controlled per-test via `mockImplementation` or `mockResolvedValue`.
import { jest } from '@jest/globals';

export const CryptoDigestAlgorithm = {
  SHA256: 'SHA-256',
} as const;

export const CryptoEncoding = {
  HEX: 'hex',
  BASE64: 'base64',
} as const;

export const digestStringAsync = jest.fn(
  async (_alg: string, _data: string, _opts?: { encoding?: string }) => {
    // Default: a distinctive stub hash. Tests override via mockResolvedValueOnce.
    return 'deadbeef'.repeat(8); // 64-char hex
  },
);

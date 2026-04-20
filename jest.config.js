// Jest config for Track C service unit tests.
//
// Isolated from firestore/jest.config.firestore.js (the emulator-backed
// rules tests) — those still run via `npm run test:rules`. This config
// covers the Track C pure-logic tests under src/services/__tests__/.
//
// Node environment: these tests mock expo-file-system, expo-crypto, and
// @react-native-async-storage/async-storage at the module boundary and
// never import React, so jsdom is unnecessary.

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', strict: false } }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Explicit mocks for native modules — these paths resolve via jest's module
  // resolver before hitting node_modules.
  moduleNameMapper: {
    '^expo-file-system/legacy$': '<rootDir>/src/services/__tests__/__mocks__/expoFileSystemLegacy.ts',
    '^expo-crypto$': '<rootDir>/src/services/__tests__/__mocks__/expoCrypto.ts',
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/src/services/__tests__/__mocks__/asyncStorage.ts',
  },
  clearMocks: true,
};

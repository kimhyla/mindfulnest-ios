/** @type {import('jest').Config} */
module.exports = {
  // Pure Node.js environment — NOT the Expo/React Native jsdom preset.
  // This config is isolated from the app's jest-expo setup to avoid
  // transform conflicts between RN modules and Firebase server SDKs.
  testEnvironment: 'node',
  transform: {},
  testMatch: ['<rootDir>/__tests__/**/*.test.js'],
  // Run test files sequentially — parallel execution causes emulator
  // state interference (multiple initializeTestEnvironment calls on
  // the same emulator instance conflict).
  maxWorkers: 1,
  // firebase-tools 15.15.0 pinned at setup time (April 16, 2026).
  // @firebase/rules-unit-testing v5. Emulator requires Java 21+.
};

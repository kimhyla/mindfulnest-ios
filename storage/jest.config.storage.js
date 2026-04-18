/** @type {import('jest').Config} */
module.exports = {
  // Mirrors firestore/jest.config.firestore.js. Node env, no transforms,
  // sequential workers. @firebase/rules-unit-testing v5 emulator driver.
  testEnvironment: 'node',
  transform: {},
  testMatch: ['<rootDir>/__tests__/**/*.test.js'],
  maxWorkers: 1,
};

/**
 * MindfulNest Firestore Rules Test Harness — Shared Setup
 *
 * Uses @firebase/rules-unit-testing v5 with the Firebase Emulator.
 * Requires: firebase emulators running on 127.0.0.1:8080
 *   Start with: firebase emulators:start --only firestore
 *
 * KNOWN LIMITATIONS (from Phase 0 review, preflight row id=5):
 * - Mock auth contexts do NOT replicate the full COPPA consent chain.
 *   Auth flow integrity (consent → claim issuance → token propagation)
 *   requires integration tests, not rules unit tests.
 * - Emulator resource.data behavior on CREATE may differ from production.
 *   Step C tests verify this empirically. If divergence is found, it will
 *   be documented here and in prod_locked_decisions.
 * - Emulator version may lag production Firestore CEL engine updates.
 *   firebase-tools version pinned: 15.15.0 (April 16, 2026).
 *
 * COVERAGE MANIFEST — CDM Security Decisions:
 *   COVERED:
 *     [ ] LD-103: Parent cannot read therapist docs
 *     [ ] LD-105: Parent cannot write notification tracking fields
 *     [ ] LD-122: Subcollection protected field checks (bars, completionLog)
 *     [ ] LD-123: Bar no-delete
 *     [ ] BS1a: Invite claim requires status == 'active'
 *     [ ] BS1b: Child create requires linkedParent, linkedTherapist, displayName
 *     [ ] BS1c: affectedKeys() nested-field bypass (REGRESSION TEST)
 *     [ ] BS4: Invite UUID v4 format validation
 *   NOT COVERED (auth flow / integration scope):
 *     - COPPA chatEnabled consent chain (requires real Auth + Cloud Functions)
 *     - Therapist account deactivation (Cloud Functions only)
 *     - Rate limiting / DoS vectors (emulator doesn't enforce quotas)
 */

const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'mindfulnest-rules-test';
const FIRESTORE_EMULATOR_HOST = '127.0.0.1';
const FIRESTORE_EMULATOR_PORT = 8080;

/**
 * Initialize the test environment with the current firestore.rules file.
 * Call once per test file in beforeAll().
 */
async function getTestEnv() {
  const rulesPath = path.resolve(__dirname, '..', 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: FIRESTORE_EMULATOR_HOST,
      port: FIRESTORE_EMULATOR_PORT,
    },
  });

  return testEnv;
}

/**
 * Create an authenticated Firestore context for a given user.
 * @param {import('@firebase/rules-unit-testing').RulesTestEnvironment} testEnv
 * @param {string} uid - Firebase Auth UID
 * @returns Firestore instance authenticated as uid
 */
function authedDb(testEnv, uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

/**
 * Create an unauthenticated Firestore context.
 * @param {import('@firebase/rules-unit-testing').RulesTestEnvironment} testEnv
 * @returns Firestore instance with no auth
 */
function unauthDb(testEnv) {
  return testEnv.unauthenticatedContext().firestore();
}

module.exports = {
  getTestEnv,
  authedDb,
  unauthDb,
  assertFails,
  assertSucceeds,
  PROJECT_ID,
};

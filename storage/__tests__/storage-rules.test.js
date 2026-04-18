/**
 * storage.rules v1 tests — Pattern C path-auth for /audio/{parentUid}/...
 *
 * Preflight: prod_preflight_reviews id=77.
 * Uses @firebase/rules-unit-testing v5 Storage emulator support.
 */

const path = require('path');
const fs = require('fs');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'mindfulnest-storage-test';
const STORAGE_EMULATOR_HOST = '127.0.0.1';
const STORAGE_EMULATOR_PORT = 9199;

const PARENT_A = 'parent-a-001';
const PARENT_B = 'parent-b-002';
const THERAPIST = 'therapist-001';
const CHILD_A = 'child-of-A';

let testEnv;

beforeAll(async () => {
  const rulesPath = path.resolve(__dirname, '..', 'storage.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      rules,
      host: STORAGE_EMULATOR_HOST,
      port: STORAGE_EMULATOR_PORT,
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearStorage();
});

function storageFor(uid) {
  return testEnv.authenticatedContext(uid).storage();
}

function unauthStorage() {
  return testEnv.unauthenticatedContext().storage();
}

async function seedFile(pathString, content = 'test') {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const ref = ctx.storage().ref(pathString);
    await ref.putString(content);
  });
}

describe('/audio/{parentUid}/{childId}/*', () => {
  test('parent CAN read their own child\'s audio', async () => {
    await seedFile(`audio/${PARENT_A}/${CHILD_A}/m1_intro.mp3`);
    const ref = storageFor(PARENT_A).ref(`audio/${PARENT_A}/${CHILD_A}/m1_intro.mp3`);
    await assertSucceeds(ref.getDownloadURL());
  });

  test('other parent CANNOT read someone else\'s child audio', async () => {
    await seedFile(`audio/${PARENT_A}/${CHILD_A}/m1_intro.mp3`);
    const ref = storageFor(PARENT_B).ref(`audio/${PARENT_A}/${CHILD_A}/m1_intro.mp3`);
    await assertFails(ref.getDownloadURL());
  });

  test('therapist CANNOT read parent-path audio (v1 Pattern C limitation)', async () => {
    // LD-275 defers therapist audio access to follow-up row.
    await seedFile(`audio/${PARENT_A}/${CHILD_A}/m1_intro.mp3`);
    const ref = storageFor(THERAPIST).ref(`audio/${PARENT_A}/${CHILD_A}/m1_intro.mp3`);
    await assertFails(ref.getDownloadURL());
  });

  test('unauthenticated user CANNOT read child audio', async () => {
    await seedFile(`audio/${PARENT_A}/${CHILD_A}/m1_intro.mp3`);
    const ref = unauthStorage().ref(`audio/${PARENT_A}/${CHILD_A}/m1_intro.mp3`);
    await assertFails(ref.getDownloadURL());
  });

  test('parent CANNOT write to audio path (admin-SDK only)', async () => {
    const ref = storageFor(PARENT_A).ref(`audio/${PARENT_A}/${CHILD_A}/evil.mp3`);
    await assertFails(ref.putString('evil'));
  });
});

describe('/public/*', () => {
  test('any authed user CAN read public assets', async () => {
    await seedFile('public/module_music.mp3');
    const ref = storageFor(PARENT_A).ref('public/module_music.mp3');
    await assertSucceeds(ref.getDownloadURL());
  });

  test('unauth CANNOT read public (authed-only per rules)', async () => {
    await seedFile('public/module_music.mp3');
    const ref = unauthStorage().ref('public/module_music.mp3');
    await assertFails(ref.getDownloadURL());
  });

  test('authed user CANNOT write to public', async () => {
    const ref = storageFor(PARENT_A).ref('public/pirate.mp3');
    await assertFails(ref.putString('pirate'));
  });
});

describe('/visuals/{module}/*', () => {
  test('any authed user CAN read visuals', async () => {
    await seedFile('visuals/M1/still_001.jpg');
    const ref = storageFor(PARENT_A).ref('visuals/M1/still_001.jpg');
    await assertSucceeds(ref.getDownloadURL());
  });

  test('authed user CANNOT write to visuals', async () => {
    const ref = storageFor(PARENT_A).ref('visuals/M1/injected.jpg');
    await assertFails(ref.putString('inject'));
  });
});

describe('unmatched paths', () => {
  test('default-deny: authed user CANNOT read arbitrary path', async () => {
    await seedFile('random/secret.txt');
    const ref = storageFor(PARENT_A).ref('random/secret.txt');
    await assertFails(ref.getDownloadURL());
  });

  test('default-deny: authed user CANNOT write to arbitrary path', async () => {
    const ref = storageFor(PARENT_A).ref('evil/path.txt');
    await assertFails(ref.putString('evil'));
  });
});

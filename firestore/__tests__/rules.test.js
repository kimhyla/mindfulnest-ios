/**
 * MindfulNest Firestore Security Rules — Unit Tests
 *
 * Tests run against the Firebase Emulator (127.0.0.1:8080).
 * Start emulator before running: firebase emulators:start --only firestore
 * Run tests: npm run test:rules
 *
 * Preflight review: Directus prod_preflight_reviews id=5
 *   task_id: blocker-111-emulator-harness-20260416
 */

const {
  getTestEnv,
  authedDb,
  unauthDb,
  assertFails,
  assertSucceeds,
} = require('./setup');

// Test UIDs — these are arbitrary strings, not real Firebase Auth users.
// The emulator treats them as authenticated contexts with these UIDs.
const THERAPIST_UID = 'therapist-001';
const PARENT_UID = 'parent-001';
const OTHER_PARENT_UID = 'parent-002';
const CHILD_ID = 'child-001';

let testEnv;

beforeAll(async () => {
  testEnv = await getTestEnv();
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  // Clear Firestore data between tests for isolation
  await testEnv.clearFirestore();
});

/**
 * Seed the emulator with baseline documents that many tests need.
 * Uses the admin context (bypasses rules) to set up the data.
 */
async function seedBaseline() {
  const admin = testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    // Therapist doc (required for isTherapist() checks)
    await db.doc(`therapists/${THERAPIST_UID}`).set({
      displayName: 'Dr. Test',
      email: 'therapist@test.com',
    });
    // Parent doc (required for isParent() checks)
    await db.doc(`parents/${PARENT_UID}`).set({
      displayName: 'Test Parent',
      email: 'parent@test.com',
      linkedTherapist: THERAPIST_UID,
      coppaChatConsent: false,
    });
    // Other parent doc
    await db.doc(`parents/${OTHER_PARENT_UID}`).set({
      displayName: 'Other Parent',
      email: 'other@test.com',
      linkedTherapist: THERAPIST_UID,
      coppaChatConsent: false,
    });
    // Child doc linked to PARENT_UID and THERAPIST_UID
    await db.doc(`children/${CHILD_ID}`).set({
      displayName: 'Test Child',
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      chatEnabled: false,
      parentNotifiedSkills: [],
      therapistFirstCompletionNotified: false,
      inactivityNotifiedAt: null,
    });
  });
  return admin;
}

// ─── Emulator Connectivity ───────────────────────────────────────

describe('Emulator connectivity', () => {
  test('can connect to emulator and read rules', async () => {
    // If this fails, the emulator is not running or rules file is invalid
    expect(testEnv).toBeDefined();
  });
});

// ─── Therapist Rules (LD-103) ──────────���─────────────────────────

describe('Therapist document rules', () => {
  beforeEach(async () => { await seedBaseline(); });

  test('therapist can read own doc', async () => {
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertSucceeds(db.doc(`therapists/${THERAPIST_UID}`).get());
  });

  test('therapist can update own doc', async () => {
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertSucceeds(db.doc(`therapists/${THERAPIST_UID}`).update({
      displayName: 'Dr. Updated',
    }));
  });

  test('LD-103: parent CANNOT read therapist doc', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc(`therapists/${THERAPIST_UID}`).get());
  });

  test('unauthenticated CANNOT read therapist doc', async () => {
    const db = unauthDb(testEnv);
    await assertFails(db.doc(`therapists/${THERAPIST_UID}`).get());
  });
});

// ─── Parent Rules ────────────────────────────────────────────────

describe('Parent document rules', () => {
  beforeEach(async () => { await seedBaseline(); });

  test('parent can read own doc', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.doc(`parents/${PARENT_UID}`).get());
  });

  test('parent CANNOT read other parent doc', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc(`parents/${OTHER_PARENT_UID}`).get());
  });

  test('linked therapist can read parent doc', async () => {
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertSucceeds(db.doc(`parents/${PARENT_UID}`).get());
  });
});

// ─── Child Document Rules (LD-105) ──────────��───────────────────

describe('Child document rules', () => {
  beforeEach(async () => { await seedBaseline(); });

  test('parent can read linked child', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.doc(`children/${CHILD_ID}`).get());
  });

  test('other parent CANNOT read unlinked child', async () => {
    const db = authedDb(testEnv, OTHER_PARENT_UID);
    await assertFails(db.doc(`children/${CHILD_ID}`).get());
  });

  test('parent can update game state on linked child', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.doc(`children/${CHILD_ID}`).update({
      chatEnabled: false,
    }));
  });

  test('LD-105: parent CANNOT write parentNotifiedSkills', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc(`children/${CHILD_ID}`).update({
      parentNotifiedSkills: ['breathing'],
    }));
  });

  test('LD-105: parent CANNOT write therapistFirstCompletionNotified', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc(`children/${CHILD_ID}`).update({
      therapistFirstCompletionNotified: true,
    }));
  });

  test('LD-105: parent CANNOT write inactivityNotifiedAt', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc(`children/${CHILD_ID}`).update({
      inactivityNotifiedAt: new Date().toISOString(),
    }));
  });

  test('LD-105: parent CANNOT write linkedParent (immutable after creation)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc(`children/${CHILD_ID}`).update({
      linkedParent: OTHER_PARENT_UID,
    }));
  });

  test('LD-105: parent CANNOT write linkedTherapist (immutable after creation)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc(`children/${CHILD_ID}`).update({
      linkedTherapist: 'rogue-therapist',
    }));
  });

  test('therapist can read linked child', async () => {
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertSucceeds(db.doc(`children/${CHILD_ID}`).get());
  });

  test('therapist can write ONLY preferredTechniques', async () => {
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertSucceeds(db.doc(`children/${CHILD_ID}`).update({
      preferredTechniques: ['breathing', 'grounding'],
    }));
  });

  test('therapist CANNOT write displayName on child', async () => {
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertFails(db.doc(`children/${CHILD_ID}`).update({
      displayName: 'Renamed Child',
    }));
  });
});

// ─── Child Create Rules (BS1b) ──────────────────────────────────

// Minimal valid KWS consent payload for child CREATE.
// Added in v5 — all three fields required by LD-216 COPPA_VPC_VIA_KWS_ONLY.
const KWS_CONSENT = {
  parental_consent_verified: true,
  parental_consent_source: 'kws',
  kws_parent_id: 'kws-abc-123',
};

describe('Child create rules (BS1b + v5 COPPA)', () => {
  beforeEach(async () => { await seedBaseline(); });

  test('BS1b: parent can create child with required fields + KWS consent (v5)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.doc('children/new-child-001').set({
      displayName: 'New Child',
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      ...KWS_CONSENT,
    }));
  });

  test('BS1b: parent CANNOT create child without displayName', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc('children/new-child-002').set({
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      ...KWS_CONSENT,
    }));
  });

  test('BS1b: parent CANNOT create child linked to different parent', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc('children/new-child-003').set({
      displayName: 'Spoofed Child',
      linkedParent: OTHER_PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      ...KWS_CONSENT,
    }));
  });

  test('BS1b: parent CANNOT create child without linkedTherapist', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc('children/new-child-004').set({
      displayName: 'No Therapist Child',
      linkedParent: PARENT_UID,
      ...KWS_CONSENT,
    }));
  });

  // ─── v5 COPPA hardening (Wave B1 WB-C7-T1-rules) ──────────────

  test('COPPA-1 (LD-216): child CREATE fails without KWS consent triad', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc('children/new-child-coppa-1a').set({
      displayName: 'No Consent Child',
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      // No KWS_CONSENT fields
    }));
  });

  test('COPPA-1: child CREATE fails with parental_consent_verified=false', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc('children/new-child-coppa-1b').set({
      displayName: 'Unverified Consent Child',
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      parental_consent_verified: false,
      parental_consent_source: 'kws',
      kws_parent_id: 'kws-x',
    }));
  });

  test('COPPA-1: child CREATE fails with consent_source != "kws"', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc('children/new-child-coppa-1c').set({
      displayName: 'Wrong Source Child',
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      parental_consent_verified: true,
      parental_consent_source: 'custom',  // Only 'kws' allowed
      kws_parent_id: 'kws-x',
    }));
  });

  test('COPPA-1: child CREATE fails with empty kws_parent_id', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc('children/new-child-coppa-1d').set({
      displayName: 'Empty KWS ID Child',
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      parental_consent_verified: true,
      parental_consent_source: 'kws',
      kws_parent_id: '',
    }));
  });

  test('COPPA-3 (LD-225): child CREATE fails with forbidden field "last_name"', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc('children/new-child-coppa-3a').set({
      displayName: 'PII Bloat Child',
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      ...KWS_CONSENT,
      last_name: 'Smith',  // NOT in allowlist
    }));
  });

  test('COPPA-3: child CREATE fails with forbidden field "school"', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc('children/new-child-coppa-3b').set({
      displayName: 'School Field Child',
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      ...KWS_CONSENT,
      school: 'Lincoln Elementary',  // NOT in allowlist
    }));
  });

  test('COPPA-3: child CREATE fails with forbidden field "chosen_guide_name"', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc('children/new-child-coppa-3c').set({
      displayName: 'Custom Guide Child',
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      ...KWS_CONSENT,
      chosen_guide_name: 'Friendbird',  // Guide Bird permanently 'Chipper'
    }));
  });

  test('COPPA-3: child CREATE succeeds with allowlist-only fields', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.doc('children/new-child-coppa-3d').set({
      displayName: 'Allowlist-Clean Child',
      linkedParent: PARENT_UID,
      linkedTherapist: THERAPIST_UID,
      ...KWS_CONSENT,
      date_of_birth: '2018-05-15',
      gender: 'girl',
      current_module_id: 'M1',
      current_phase: 'intro',
      consent_scope: ['therapist_progress_view'],  // 'elevenlabs_tts' removed 2026-04-18 per LD-281 NO_RUNTIME_TTS_PERSONALIZATION_V1
    }));
  });

  test('COPPA-4 (LD-218): parent CANNOT update retention_clock_started_at', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc(`children/${CHILD_ID}`).update({
      retention_clock_started_at: new Date().toISOString(),
    }));
  });

  test('COPPA-1: parent CANNOT flip parental_consent_verified=false post-creation', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc(`children/${CHILD_ID}`).update({
      parental_consent_verified: false,
    }));
  });

  test('COPPA-1: parent CANNOT change kws_parent_id post-creation', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc(`children/${CHILD_ID}`).update({
      kws_parent_id: 'kws-different',
    }));
  });
});

// ─── Bars Subcollection (LD-122, LD-123) ────────────────────────

describe('Bars subcollection rules', () => {
  beforeEach(async () => { await seedBaseline(); });

  // C1 FIX (v4): bars CREATE no longer calls anyProtectedFieldChanged().
  // resource.data is null on CREATE, so the old helper threw. v4 scopes to UPDATE-only.
  test('parent can create a bar on linked child', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}/bars/bar-001`).set({
        moduleId: 'M1',
        progress: 0,
      })
    );
  });

  // INTENTIONAL: No protected-field check on bars CREATE.
  // This test documents that bars CREATE does NOT block writes containing
  // field names that happen to match protected fields on the child doc.
  // Protected fields don't exist on bars subcollection — the check is absent by design.
  test('bars_create_has_no_protected_field_check_intentional', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    // Even setting a field named 'linkedParent' on a bar doc is allowed —
    // bars are not children, and the guard is intentionally absent on CREATE.
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}/bars/bar-intent-test`).set({
        moduleId: 'M1',
        progress: 0,
        linkedParent: 'this-is-a-bar-field-not-a-child-field',
      })
    );
  });

  test('parent can update a bar on linked child', async () => {
    // Seed a bar first
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`children/${CHILD_ID}/bars/bar-001`).set({
        moduleId: 'M1',
        progress: 0,
      });
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}/bars/bar-001`).update({
        progress: 50,
      })
    );
  });

  test('LD-123: parent CANNOT delete a bar', async () => {
    // Seed a bar first
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`children/${CHILD_ID}/bars/bar-001`).set({
        moduleId: 'M1',
        progress: 0,
      });
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.doc(`children/${CHILD_ID}/bars/bar-001`).delete()
    );
  });

  test('other parent CANNOT access bars on unlinked child', async () => {
    const db = authedDb(testEnv, OTHER_PARENT_UID);
    await assertFails(
      db.doc(`children/${CHILD_ID}/bars/bar-001`).set({
        moduleId: 'M1',
        progress: 0,
      })
    );
  });

  test('therapist can read bars on linked child', async () => {
    // Seed a bar first
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`children/${CHILD_ID}/bars/bar-001`).set({
        moduleId: 'M1',
        progress: 0,
      });
    });
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}/bars/bar-001`).get()
    );
  });
});

// ─── CompletionLog Subcollection (LD-122) ───────────────────────

describe('CompletionLog subcollection rules', () => {
  beforeEach(async () => { await seedBaseline(); });

  // C1 FIX (v4): completionLog CREATE no longer calls anyProtectedFieldChanged().
  test('parent can create completionLog entry', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}/completionLog/log-001`).set({
        moduleId: 'M1',
        completedAt: new Date().toISOString(),
      })
    );
  });

  test('therapist can read completionLog', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`children/${CHILD_ID}/completionLog/log-001`).set({
        moduleId: 'M1',
        completedAt: new Date().toISOString(),
      });
    });
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertSucceeds(
      db.doc(`children/${CHILD_ID}/completionLog/log-001`).get()
    );
  });

  test('other parent CANNOT create completionLog on unlinked child', async () => {
    const db = authedDb(testEnv, OTHER_PARENT_UID);
    await assertFails(
      db.doc(`children/${CHILD_ID}/completionLog/log-002`).set({
        moduleId: 'M1',
        completedAt: new Date().toISOString(),
      })
    );
  });
});

// ─── Modules (public read) ────────���─────────────────────────────

describe('Modules collection rules', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('modules/M1').set({
        status: 'published',
        name: 'Magic Hands',
      });
      await context.firestore().doc('modules/M-draft').set({
        status: 'draft',
        name: 'Unpublished Module',
      });
    });
  });

  test('authenticated user can read published module', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.doc('modules/M1').get());
  });

  test('authenticated user CANNOT read draft module', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc('modules/M-draft').get());
  });

  test('unauthenticated CANNOT read any module', async () => {
    const db = unauthDb(testEnv);
    await assertFails(db.doc('modules/M1').get());
  });
});

// ─── Store Items (public read) ──────���───────────────────────────

describe('Store items collection rules', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc('storeItems/item-001').set({
        name: 'Cool Hat',
        price: 10,
      });
    });
  });

  test('authenticated user can read store items', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.doc('storeItems/item-001').get());
  });

  test('unauthenticated CANNOT read store items', async () => {
    const db = unauthDb(testEnv);
    await assertFails(db.doc('storeItems/item-001').get());
  });

  test('authenticated user CANNOT write store items', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(db.doc('storeItems/item-002').set({
      name: 'Hacked Item',
      price: 0,
    }));
  });
});

// ─── Therapist Invites (BS1a, BS4) ─────���────────────────────────

describe('Therapist invite rules', () => {
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
  const INVALID_UUID = 'not-a-uuid';

  beforeEach(async () => {
    await seedBaseline();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`therapistInvites/${VALID_UUID}`).set({
        therapistId: THERAPIST_UID,
        status: 'active',
      });
    });
  });

  test('BS4: therapist can create invite with valid UUID', async () => {
    const newUuid = '660e8400-e29b-41d4-a716-446655440001';
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertSucceeds(
      db.doc(`therapistInvites/${newUuid}`).set({
        therapistId: THERAPIST_UID,
        status: 'active',
      })
    );
  });

  test('BS4: therapist CANNOT create invite with invalid UUID', async () => {
    const db = authedDb(testEnv, THERAPIST_UID);
    await assertFails(
      db.doc(`therapistInvites/${INVALID_UUID}`).set({
        therapistId: THERAPIST_UID,
        status: 'active',
      })
    );
  });

  test('BS1a: parent can claim active invite', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(
      db.doc(`therapistInvites/${VALID_UUID}`).update({
        status: 'claimed',
        claimedByParent: PARENT_UID,
        childId: CHILD_ID,
        claimedAt: new Date().toISOString(),
      })
    );
  });

  test('BS1a: parent CANNOT claim already-claimed invite', async () => {
    // Mark invite as claimed first
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`therapistInvites/${VALID_UUID}`).update({
        status: 'claimed',
        claimedByParent: OTHER_PARENT_UID,
      });
    });
    const db = authedDb(testEnv, PARENT_UID);
    await assertFails(
      db.doc(`therapistInvites/${VALID_UUID}`).update({
        status: 'claimed',
        claimedByParent: PARENT_UID,
        childId: CHILD_ID,
        claimedAt: new Date().toISOString(),
      })
    );
  });

  test('parent can read any invite (for code lookup)', async () => {
    const db = authedDb(testEnv, PARENT_UID);
    await assertSucceeds(db.doc(`therapistInvites/${VALID_UUID}`).get());
  });
});

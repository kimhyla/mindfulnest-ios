// Firebase Auth onCreate trigger: fires when a new user signs up via Email/Password.
//
// Per preflight 66 synthesis (S3-AUTH-firebase): we use the v1 auth.user().onCreate
// trigger because the v2 identity.beforeUserCreated blocking trigger requires
// Google Cloud Identity Platform (paid tier). LD-249 SHORTCUT_IDENTITY_PLATFORM_EVALUATION
// covers the deferred decision.
//
// Behavior:
//   1. Set custom claim {role: 'parent'} (default; therapist upgrade is a separate
//      callable `claimTherapistInvite`).
//   2. Create minimal /parents/{uid} Firestore profile doc. Fields use snake_case
//      to match firestore_schema.json convention. consent_status='pending' until
//      S3-AUTH-consent (KWS callback) verifies — rules block child-data writes
//      until verified (LD-216 COPPA_VPC_VIA_KWS_ONLY).
//
// Race note: onCreate is async. Between `admin.auth().createUser()` and this
// trigger completing, the new user's ID token has role=undefined. Client MUST
// call getIdToken(true) with retry polling until claims.role appears. 5s timeout
// + explicit fallback UI per Counter 2 Phase 0 finding.

import { auth as v1Auth } from 'firebase-functions/v1';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { writeAudit } from '../../lib/audit/log';

if (getApps().length === 0) {
  initializeApp();
}

export const onParentSignup = v1Auth
  .user()
  .onCreate(async (user) => {
    const uid = user.uid;
    const email = user.email ?? '';

    // 1. Custom claim — default to parent.
    await getAuth().setCustomUserClaims(uid, { role: 'parent' });

    // 2. Profile doc via set-merge. Client self-create remains allowed in rules
    // v7 as a fallback if the trigger fires late; set-merge preserves either
    // order safely.
    const db = getFirestore();
    await db
      .collection('parents')
      .doc(uid)
      .set(
        {
          displayName: user.displayName ?? '',
          email,
          consent_status: 'pending',
          kws_parent_id: null,
          linked_children: [],
          current_child_id: null,
          created_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

    await writeAudit(
      { kind: 'db', db },
      {
        actor: uid,
        action: 'parent_signup',
        collection: 'parents',
        docId: uid,
        childId: null, // orphan event — no child yet
      },
    );
  });

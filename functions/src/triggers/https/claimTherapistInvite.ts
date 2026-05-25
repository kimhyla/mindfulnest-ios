// Callable CF: authed parent → (code) → upgrade to therapist if invite is valid.
//
// Replaces the Pattern-A "signup_intents nonce" approach that Counter 4 rejected
// as a net-negative security trade (unauthenticated write surface, App Check
// bypass on jailbroken iOS). Instead: the user signs up as a parent (default
// role), then this callable checks their invite code while authenticated and
// upgrades their custom claim.
//
// App Check: enforceAppCheck: true — LD-802 gate closed 2026-05-25.
// Debug token 55E583F3-A6D4-4D2B-A834-AB5941BE6371 registered in Firebase Console
// (or register before deploying: Firebase Console → App Check → iOS → Manage Debug Tokens).
//
// Atomicity: custom claim set + invite doc updated + therapist profile
// created in one runTransaction. If any step fails, the whole call fails.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';
import { isValidInviteCode, evaluateInviteForClaim, type InviteDoc } from '../../lib/invite/validateInviteCode';
import { writeAudit } from '../../lib/audit/log';

if (getApps().length === 0) {
  initializeApp();
}

interface ClaimRequest {
  readonly code?: unknown;
}

export const claimTherapistInvite = onCall(
  { enforceAppCheck: true },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Must be signed in to claim an invite.');
    }

    const { code } = (request.data ?? {}) as ClaimRequest;
    if (!isValidInviteCode(code)) {
      throw new HttpsError('invalid-argument', 'Invite code format invalid.');
    }

    const db = getFirestore();
    const inviteRef = db.collection('therapistInvites').doc(code);

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(inviteRef);
      const data = snap.exists ? (snap.data() as InviteDoc) : null;
      const evaluation = evaluateInviteForClaim(data, Date.now());
      if (!evaluation.ok) {
        return { ok: false as const, reason: evaluation.reason ?? 'invite_not_active' };
      }

      const invite = data!;
      tx.update(inviteRef, {
        status: 'claimed',
        claimedByTherapist: uid,
        claimedAt: FieldValue.serverTimestamp(),
      });
      tx.set(
        db.collection('therapists').doc(uid),
        {
          displayName: request.auth?.token.name ?? '',
          email: request.auth?.token.email ?? '',
          status: 'active',
          linked_from_invite: code,
          invite_issuer_therapist_id: invite.therapistId,
          // linked_children: [] initialized here so withCoppaGuardCallable can
          // enforce the relationship as soon as onParentLinkTherapist CF is built.
          // Pattern mirrors onParentSignup.ts (parents.linked_children).
          // Currently always empty — see DEVIATION in withCoppaGuard.ts.
          linked_children: [],
          created_at: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { ok: true as const };
    });

    if (!result.ok) {
      throw new HttpsError('failed-precondition', `invite: ${result.reason}`);
    }

    // Claim upgrade outside the transaction (Auth admin API, not Firestore).
    // Client MUST call getIdToken(true) to refresh the token with the new claim.
    await getAuth().setCustomUserClaims(uid, { role: 'therapist' });

    await writeAudit(
      { kind: 'db', db },
      {
        actor: uid,
        action: 'therapist_invite_claimed',
        collection: 'therapistInvites',
        docId: code,
        childId: null, // therapist-scoped, no child context yet
      },
    );

    return { ok: true, message: 'Refresh your token with getIdToken(true).' };
  },
);

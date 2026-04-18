// Pure helpers for /therapistInvites/{code} validation. Isolated from
// Firestore/Admin SDK so they can be unit-tested with node --test.
//
// Invite code format: UUID v4 (matches existing rules v5 validation in
// firestore.rules — "allow create" on therapistInvites requires the code
// to match the UUID v4 regex before a therapist can create it).

export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isValidInviteCode(code: unknown): code is string {
  return typeof code === 'string' && UUID_V4_REGEX.test(code);
}

export type InviteStatus = 'active' | 'claimed' | 'revoked' | 'expired';

export interface InviteDoc {
  readonly status: InviteStatus;
  readonly therapistId: string;
  readonly claimedByParent?: string | null;
  readonly childId?: string | null;
  readonly claimedAt?: unknown;
  readonly expiresAt?: unknown;
}

export interface InviteEvaluation {
  readonly ok: boolean;
  readonly reason?:
    | 'invite_not_found'
    | 'invite_not_active'
    | 'invite_already_claimed'
    | 'invite_revoked'
    | 'invite_expired';
}

export function evaluateInviteForClaim(
  invite: InviteDoc | null | undefined,
  nowMs: number,
): InviteEvaluation {
  if (!invite) return { ok: false, reason: 'invite_not_found' };
  if (invite.status === 'claimed') return { ok: false, reason: 'invite_already_claimed' };
  if (invite.status === 'revoked') return { ok: false, reason: 'invite_revoked' };
  if (invite.status !== 'active') return { ok: false, reason: 'invite_not_active' };

  const expiresAt = invite.expiresAt;
  if (expiresAt && typeof expiresAt === 'object' && expiresAt !== null) {
    const asDate = expiresAt as { toMillis?: () => number };
    if (typeof asDate.toMillis === 'function') {
      if (asDate.toMillis() <= nowMs) {
        return { ok: false, reason: 'invite_expired' };
      }
    }
  }
  return { ok: true };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidInviteCode,
  evaluateInviteForClaim,
  type InviteDoc,
} from '../validateInviteCode';

test('invite code: valid UUID v4 accepted', () => {
  assert.equal(isValidInviteCode('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(isValidInviteCode('f47ac10b-58cc-4372-a567-0e02b2c3d479'), true);
});

test('invite code: non-string rejected', () => {
  assert.equal(isValidInviteCode(null), false);
  assert.equal(isValidInviteCode(undefined), false);
  assert.equal(isValidInviteCode(42), false);
  assert.equal(isValidInviteCode({}), false);
});

test('invite code: malformed UUID rejected', () => {
  assert.equal(isValidInviteCode('not-a-uuid'), false);
  assert.equal(isValidInviteCode(''), false);
  // v1 UUID (time-based) — not v4
  assert.equal(isValidInviteCode('d90f5130-5f3b-11eb-8b1e-0242ac120002'), false);
  // Wrong length
  assert.equal(isValidInviteCode('550e8400-e29b-41d4-a716-44665544'), false);
});

test('invite eval: not found → invite_not_found', () => {
  const e = evaluateInviteForClaim(null, 0);
  assert.equal(e.ok, false);
  assert.equal(e.reason, 'invite_not_found');
});

test('invite eval: active + unexpired → ok', () => {
  const invite: InviteDoc = { status: 'active', therapistId: 'T1' };
  assert.equal(evaluateInviteForClaim(invite, 0).ok, true);
});

test('invite eval: claimed → invite_already_claimed', () => {
  const invite: InviteDoc = { status: 'claimed', therapistId: 'T1' };
  const e = evaluateInviteForClaim(invite, 0);
  assert.equal(e.ok, false);
  assert.equal(e.reason, 'invite_already_claimed');
});

test('invite eval: revoked → invite_revoked', () => {
  const invite: InviteDoc = { status: 'revoked', therapistId: 'T1' };
  const e = evaluateInviteForClaim(invite, 0);
  assert.equal(e.ok, false);
  assert.equal(e.reason, 'invite_revoked');
});

test('invite eval: expired by Firestore Timestamp in past', () => {
  const invite: InviteDoc = {
    status: 'active',
    therapistId: 'T1',
    expiresAt: { toMillis: () => 1000 },
  };
  const e = evaluateInviteForClaim(invite, 2000);
  assert.equal(e.ok, false);
  assert.equal(e.reason, 'invite_expired');
});

test('invite eval: future expiry → ok', () => {
  const invite: InviteDoc = {
    status: 'active',
    therapistId: 'T1',
    expiresAt: { toMillis: () => 10_000 },
  };
  assert.equal(evaluateInviteForClaim(invite, 5000).ok, true);
});

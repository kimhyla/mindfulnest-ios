import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertAudit, type AuditEvent } from '../log';

function validEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    actor: 'system_cf',
    action: 'coin_awarded',
    collection: 'coin_ledger',
    docId: 'session-123',
    childId: 'child-001',
    ...overrides,
  };
}

test('assertAudit: valid event passes', () => {
  assert.doesNotThrow(() => assertAudit(validEvent()));
});

test('assertAudit: null childId accepted (orphan event)', () => {
  assert.doesNotThrow(() => assertAudit(validEvent({ childId: null })));
});

test('assertAudit: missing childId accepted (defaults to null)', () => {
  const event = validEvent();
  const { childId: _childId, ...rest } = event;
  assert.doesNotThrow(() => assertAudit(rest as AuditEvent));
});

test('assertAudit: empty actor rejected', () => {
  assert.throws(() => assertAudit(validEvent({ actor: '' })), /actor/);
});

test('assertAudit: non-enum action rejected', () => {
  assert.throws(
    () => assertAudit(validEvent({ action: 'made_up_action' as unknown as AuditEvent['action'] })),
    /unknown action/,
  );
});

test('assertAudit: empty collection rejected', () => {
  assert.throws(() => assertAudit(validEvent({ collection: '' })), /collection/);
});

test('assertAudit: empty docId rejected', () => {
  assert.throws(() => assertAudit(validEvent({ docId: '' })), /docId/);
});

test('assertAudit: non-string childId rejected', () => {
  assert.throws(
    () => assertAudit(validEvent({ childId: 123 as unknown as string })),
    /childId/,
  );
});

test('assertAudit: all 9 AuditAction values accepted', () => {
  const actions: AuditEvent['action'][] = [
    'zap_sanitize_ok',
    'zap_sanitize_rejected',
    'wishing_garden_sanitize_ok',
    'wishing_garden_sanitize_rejected',
    'therapist_summary_written',
    'coin_awarded',
    'coin_and_stone_awarded',
    'parent_signup',
    'therapist_invite_claimed',
  ];
  for (const action of actions) {
    assert.doesNotThrow(() => assertAudit(validEvent({ action })));
  }
});

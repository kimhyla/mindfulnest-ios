import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAgainstSchema } from '../sanitizeAgainstSchema';

function validZap(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    childId: 'child_abc',
    creatureId: 'M1',
    content: 'hi tessa, thank you for helping',
    sent_at: new Date('2026-04-18T00:00:00Z'),
    ...overrides,
  };
}

test('zaps: clean input passes with all 4 fields preserved', () => {
  const result = sanitizeAgainstSchema('zaps', validZap());
  assert.equal(result.ok, true);
  assert.ok(result.clean);
  assert.equal(Object.keys(result.clean!).length, 4);
  assert.equal(result.violations.length, 0);
});

test('zaps: missing required field (childId) → violation', () => {
  const { childId: _childId, ...noChild } = validZap();
  const result = sanitizeAgainstSchema('zaps', noChild);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.kind === 'missing_required' && v.field === 'childId'));
});

test('zaps: unknown field → violation (reject not strip)', () => {
  const result = sanitizeAgainstSchema('zaps', validZap({ evil_field: 'oops' }));
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.kind === 'unknown_field' && v.field === 'evil_field'));
});

test('zaps: email in content → pii_detected violation', () => {
  const result = sanitizeAgainstSchema('zaps', validZap({ content: 'email me at kid@example.com' }));
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.kind === 'pii_detected' && v.field === 'content'));
});

test('zaps: content over 280 chars → pii_detected violation', () => {
  const result = sanitizeAgainstSchema('zaps', validZap({ content: 'a'.repeat(300) }));
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.kind === 'pii_detected' && v.field === 'content'));
});

test('zaps: null payload → missing_required<root>', () => {
  const result = sanitizeAgainstSchema('zaps', null);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.field === '<root>'));
});

test('wishing_garden_entries: pii detected in both prompt and response', () => {
  const result = sanitizeAgainstSchema('wishing_garden_entries', {
    childId: 'child_abc',
    prompt: 'my email is test@example.com',
    response: 'call 555-123-4567',
    created_at: new Date(),
  });
  assert.equal(result.ok, false);
  const fields = new Set(result.violations.filter((v) => v.kind === 'pii_detected').map((v) => v.field));
  assert.ok(fields.has('prompt'));
  assert.ok(fields.has('response'));
});

test('wishing_garden_entries: clean input passes', () => {
  const result = sanitizeAgainstSchema('wishing_garden_entries', {
    childId: 'child_abc',
    prompt: 'What did you learn today?',
    response: 'That bramble and tessa both help',
    created_at: new Date(),
  });
  assert.equal(result.ok, true);
});

test('clean output only contains allowlist fields (defense-in-depth)', () => {
  // Even though unknown fields would have caused a rejection above, verify the
  // clean payload never includes keys outside the allowlist — belt-and-suspenders
  // against a future code path that skips the violation check.
  const result = sanitizeAgainstSchema('zaps', validZap());
  assert.ok(result.clean);
  const known = new Set(['childId', 'content', 'creatureId', 'sent_at']);
  for (const k of Object.keys(result.clean!)) {
    assert.ok(known.has(k), `Unexpected field in clean output: ${k}`);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanForPii } from '../pii';

test('pii: empty + short clean text → no violations', () => {
  assert.deepEqual(scanForPii(''), []);
  assert.deepEqual(scanForPii('hello everdale'), []);
  assert.deepEqual(scanForPii('I helped tessa today!'), []);
});

test('pii: email detected', () => {
  const hits = scanForPii('contact me at foo@example.com for more');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].reason, 'pattern_email');
});

test('pii: US phone detected (multiple formats)', () => {
  assert.equal(scanForPii('call me at 555-123-4567')[0].reason, 'pattern_phone_us');
  assert.equal(scanForPii('my number is (555) 123-4567')[0].reason, 'pattern_phone_us');
  assert.equal(scanForPii('text 5551234567')[0].reason, 'pattern_phone_us');
});

test('pii: SSN pattern detected', () => {
  const hits = scanForPii('my ssn is 123-45-6789');
  assert.ok(hits.some((h) => h.reason === 'pattern_ssn'));
});

test('pii: street-address number pattern detected', () => {
  const hits = scanForPii('I live at 42 Oak Street in the forest');
  assert.ok(hits.some((h) => h.reason === 'pattern_street_number'));
});

test('pii: length > 280 rejected', () => {
  const long = 'a'.repeat(290);
  const hits = scanForPii(long);
  assert.ok(hits.some((h) => h.reason.startsWith('length_')));
});

test('pii: zip code pattern detected', () => {
  const hits = scanForPii('mailing address is 94102');
  assert.ok(hits.some((h) => h.reason === 'pattern_zip_code'));
});

test('pii: non-string input returns empty array', () => {
  assert.deepEqual(scanForPii(null), []);
  assert.deepEqual(scanForPii(undefined), []);
  assert.deepEqual(scanForPii(42), []);
  assert.deepEqual(scanForPii({ foo: 'bar' }), []);
});

test('pii: canonical lore names pass (false-positive guard)', () => {
  // Character + place names from Bible — should NOT trigger the patterns.
  assert.deepEqual(scanForPii('Chipper and Tessa met Cedric at Hopegrove'), []);
  assert.deepEqual(scanForPii('The Great Storm swept through Everdale'), []);
});

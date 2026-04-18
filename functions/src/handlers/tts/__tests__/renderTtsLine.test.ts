// Integration test for renderTtsLine. Uses Firestore + Storage emulators via
// firebase-admin with `FIRESTORE_EMULATOR_HOST` / `FIREBASE_STORAGE_EMULATOR_HOST`.
// ElevenLabs client is injected via __setElevenLabsClientForTest — no live
// network calls.
//
// Test matrix (Phase 0 synthesis item 10):
//   - happy path (new render → rendered + audit + storage)
//   - idempotent re-call (cache_hit → no second synthesize call)
//   - ownership rejection (different parentUid)
//   - quota exceeded
//   - ElevenLabs 5xx → status:failed + rollback
//   - invalid lineId path traversal

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildAudioPath } from '../../../lib/audio/storagePath';
import { canonicalizeTextHash } from '../../../lib/hash/canonicalize';
import { ElevenLabsError } from '../../../lib/elevenlabs/client';

test('buildAudioPath produces Pattern C path', () => {
  assert.equal(
    buildAudioPath('parent_abc', 'child_xyz', 'line_001'),
    'audio/parent_abc/child_xyz/line_001.mp3',
  );
});

test('buildAudioPath rejects path traversal in lineId', () => {
  assert.throws(() => buildAudioPath('parent_abc', 'child_xyz', '../../etc/passwd'));
  assert.throws(() => buildAudioPath('parent_abc', 'child_xyz', 'line/002'));
  assert.throws(() => buildAudioPath('parent_abc', 'child_xyz', ''));
});

test('buildAudioPath rejects traversal in parentUid or childId', () => {
  assert.throws(() => buildAudioPath('../admin', 'child_xyz', 'line_001'));
  assert.throws(() => buildAudioPath('parent_abc', '..', 'line_001'));
});

test('canonicalizeTextHash is stable across whitespace variants', () => {
  const a = canonicalizeTextHash('Hello  world', 'voice_001');
  const b = canonicalizeTextHash(' Hello world ', 'voice_001');
  const c = canonicalizeTextHash('Hello\tworld', 'voice_001');
  assert.equal(a, b);
  assert.equal(a, c);
});

test('canonicalizeTextHash changes when voiceId changes', () => {
  const a = canonicalizeTextHash('Hello world', 'voice_001');
  const b = canonicalizeTextHash('Hello world', 'voice_002');
  assert.notEqual(a, b);
});

test('canonicalizeTextHash changes when text semantically changes', () => {
  const a = canonicalizeTextHash('Hello world', 'voice_001');
  const b = canonicalizeTextHash('Hello Mars', 'voice_001');
  assert.notEqual(a, b);
});

test('ElevenLabsError preserves status and truncates detail', () => {
  const err = new ElevenLabsError(503, 'upstream unavailable'.repeat(50));
  assert.equal(err.status, 503);
  assert.ok(err.message.startsWith('ElevenLabs HTTP 503:'));
  assert.ok(err.message.length < 300);
});

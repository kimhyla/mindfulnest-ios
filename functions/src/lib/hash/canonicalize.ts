// SHA-256 textHash for TTS render idempotency cache key.
// canonicalizeTextHash(text, voiceId) returns a hex digest of the
// canonicalized text combined with the voiceId. A trivial whitespace
// change must NOT invalidate the cache (Phase 0 counter-agent #3 HIGH).
//
// Canonicalization: trim + collapse internal runs of whitespace to single
// space. voiceId is appended with a NUL separator that the canonicalized
// text cannot contain.

import { createHash } from 'node:crypto';

export function canonicalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function canonicalizeTextHash(text: string, voiceId: string): string {
  const canonical = canonicalizeText(text);
  return createHash('sha256').update(canonical).update('\0').update(voiceId).digest('hex');
}

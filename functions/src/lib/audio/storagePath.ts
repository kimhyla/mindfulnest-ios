// Pattern C Storage path builder for TTS-rendered audio.
// Path: /audio/{parentUid}/{childId}/{lineId}.mp3
//
// Rejects path traversal attempts: any segment containing `/`, `..`, or
// leading/trailing whitespace is invalid. Per Phase 0 counter-agent #3
// (MED finding). Server MUST resolve parentUid from request.auth.uid;
// never accept client-supplied parentUid (Phase 0 counter #2 CRITICAL).

const SEGMENT_RE = /^[A-Za-z0-9_-]+$/;

export function buildAudioPath(parentUid: string, childId: string, lineId: string): string {
  for (const [name, value] of [
    ['parentUid', parentUid],
    ['childId', childId],
    ['lineId', lineId],
  ] as const) {
    if (!value || !SEGMENT_RE.test(value)) {
      throw new Error(`invalid ${name} segment for Storage path`);
    }
  }
  return `audio/${parentUid}/${childId}/${lineId}.mp3`;
}

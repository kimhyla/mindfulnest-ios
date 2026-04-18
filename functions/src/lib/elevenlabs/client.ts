// ElevenLabs REST API wrapper. Node 22 native fetch — no `node-fetch`,
// no axios. DI-friendly: renderTtsLine takes an ElevenLabsClient
// interface so integration tests can mock without live API calls.
//
// LD-205-212 family: RENT locked (ElevenLabs is the TTS provider, not
// an in-house model). LD-208 Doppler handles secret rotation at deploy
// time; runtime code reads from `defineSecret` bound value.

export interface ElevenLabsClient {
  synthesize(input: { voiceId: string; text: string }): Promise<Uint8Array>;
}

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

export function createElevenLabsClient(apiKey: string): ElevenLabsClient {
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY unresolved at cold start');
  }
  return {
    async synthesize({ voiceId, text }) {
      const res = await fetch(`${ELEVENLABS_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'content-type': 'application/json',
          'accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_v3',
          output_format: 'mp3_44100_128',
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '<no body>');
        throw new ElevenLabsError(res.status, detail);
      }
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    },
  };
}

export class ElevenLabsError extends Error {
  constructor(readonly status: number, readonly detail: string) {
    super(`ElevenLabs HTTP ${status}: ${detail.slice(0, 200)}`);
    this.name = 'ElevenLabsError';
  }
}

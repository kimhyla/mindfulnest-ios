// Bundled arc manifest — static moduleId → arcId mapping for V1.
// Updated when new arcs enter production. Never contains content hashes or URLs.
// Consumed by catalogService to avoid a Firestore SDK dependency in the app bundle.
export const MODULE_ARC_MAP: Record<string, string> = {
  m1: 'arc1', m2: 'arc1', m3: 'arc1', m4: 'arc1', m5: 'arc1', m6: 'arc1',
};

export function arcIdForModule(moduleId: string): string | undefined {
  return MODULE_ARC_MAP[moduleId.toLowerCase()];
}

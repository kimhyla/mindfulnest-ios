// Hardcoded Arc 1 reward table. Closure via LD-269 SHORTCUT_COIN_REWARDS_HARDCODED_ARC1:
// migrate to Firestore /config/module_rewards/ when (a) Kim tunes 3+ times,
// (b) Arc 2 begins, or (c) A/B testing on rewards becomes scope.
//
// Arc 1 module → stone-domain map comes from CLAUDE.md Arc 1 table:
//   M1 Tessa    Body-Sensing       Body Stone
//   M2 Luna     Now-Watching       Watching Stone
//   M3 Benson   Courage            Courage Stone
//   M4 Ember    Kindness           Heart Stone
//   M5 Bork     Self-Grounding     Grounding Stone
//   M6 Bramble  Calm-Breathing     Calm Stone

export type ModuleId = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6';
export type Phase = 'intro' | 'phase_a' | 'phase_b' | 'resolution' | 'win' | 'decoration';
export type StoneId = 'body' | 'watching' | 'courage' | 'heart' | 'grounding' | 'calm';

export const PHASE_COIN_REWARDS: Readonly<Record<Phase, number>> = {
  intro: 5,
  phase_a: 10,
  phase_b: 15,
  resolution: 10,
  win: 20,
  decoration: 5,
};

// In Arc 1 each module maps 1:1 to a domain and thus one stone. Stone awards
// fire on the 'win' phase of that module (first-time only — idempotent via
// /stone_ledger/{childId}_{stoneId} create-only).
export const MODULE_TO_STONE: Readonly<Record<ModuleId, StoneId>> = {
  M1: 'body',
  M2: 'watching',
  M3: 'courage',
  M4: 'heart',
  M5: 'grounding',
  M6: 'calm',
};

export const MODULE_IDS: readonly ModuleId[] = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'];
export const PHASES: readonly Phase[] = ['intro', 'phase_a', 'phase_b', 'resolution', 'win', 'decoration'];
export const STONE_IDS: readonly StoneId[] = ['body', 'watching', 'courage', 'heart', 'grounding', 'calm'];

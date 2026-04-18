// Pure award-computation. Given a completed session + prior state, returns
// what coin delta + optional stone to write. No Firestore imports — testable
// via node --test without emulator.
//
// Idempotency is enforced by the CALLER via /coin_ledger/{sessionId} create-only
// precondition (Counter 2 synthesis, preflight 71). This function does not
// track state; it's a pure pricing function.

import {
  MODULE_TO_STONE,
  PHASE_COIN_REWARDS,
  type ModuleId,
  type Phase,
  type StoneId,
} from '../../config/moduleRewards';

export interface AwardInputs {
  readonly moduleId: ModuleId;
  readonly phase: Phase;
  readonly priorStonesEarned: readonly StoneId[];
}

export interface AwardPayload {
  readonly coinDelta: number;
  readonly stoneAwarded: StoneId | null;
  readonly rationale: 'phase_complete' | 'stone_first_award' | 'stone_already_earned' | 'unknown';
}

export function computeAwards(inputs: AwardInputs): AwardPayload {
  const { moduleId, phase, priorStonesEarned } = inputs;

  const baseCoin = PHASE_COIN_REWARDS[phase];
  if (baseCoin == null) {
    return { coinDelta: 0, stoneAwarded: null, rationale: 'unknown' };
  }

  // Stone candidate — Arc 1 maps each module 1:1 to a stone, awarded on 'win'.
  const stoneForModule = MODULE_TO_STONE[moduleId];
  const isStoneFiring = phase === 'win' && stoneForModule != null;
  const alreadyEarned = isStoneFiring && priorStonesEarned.includes(stoneForModule);

  if (isStoneFiring && !alreadyEarned) {
    return {
      coinDelta: baseCoin,
      stoneAwarded: stoneForModule,
      rationale: 'stone_first_award',
    };
  }
  if (isStoneFiring && alreadyEarned) {
    // Win replay — phase coins still apply (session was completed), but no
    // duplicate stone. Idempotency note: the ledger-exists guard in the CF
    // prevents this path from firing twice for the same session; this branch
    // handles the legitimate replay case where a child re-wins the module.
    return {
      coinDelta: baseCoin,
      stoneAwarded: null,
      rationale: 'stone_already_earned',
    };
  }

  return {
    coinDelta: baseCoin,
    stoneAwarded: null,
    rationale: 'phase_complete',
  };
}

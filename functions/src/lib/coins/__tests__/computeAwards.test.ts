import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAwards } from '../computeAwards';
import { PHASE_COIN_REWARDS, MODULE_TO_STONE } from '../../../config/moduleRewards';

test('phase_a completion → coin delta, no stone', () => {
  const r = computeAwards({ moduleId: 'M1', phase: 'phase_a', priorStonesEarned: [] });
  assert.equal(r.coinDelta, PHASE_COIN_REWARDS.phase_a);
  assert.equal(r.stoneAwarded, null);
  assert.equal(r.rationale, 'phase_complete');
});

test('win on M1 with no prior stones → body stone awarded', () => {
  const r = computeAwards({ moduleId: 'M1', phase: 'win', priorStonesEarned: [] });
  assert.equal(r.stoneAwarded, 'body');
  assert.equal(r.coinDelta, PHASE_COIN_REWARDS.win);
  assert.equal(r.rationale, 'stone_first_award');
});

test('win on M1 when body already earned → coins only, no duplicate stone', () => {
  const r = computeAwards({ moduleId: 'M1', phase: 'win', priorStonesEarned: ['body'] });
  assert.equal(r.stoneAwarded, null);
  assert.equal(r.coinDelta, PHASE_COIN_REWARDS.win);
  assert.equal(r.rationale, 'stone_already_earned');
});

test('win on M3 grants courage stone (module→stone map)', () => {
  assert.equal(computeAwards({ moduleId: 'M3', phase: 'win', priorStonesEarned: [] }).stoneAwarded, 'courage');
});

test('win on M4 grants heart stone', () => {
  assert.equal(computeAwards({ moduleId: 'M4', phase: 'win', priorStonesEarned: [] }).stoneAwarded, 'heart');
});

test('all 6 modules map to distinct stones', () => {
  const stones = new Set(Object.values(MODULE_TO_STONE));
  assert.equal(stones.size, 6);
});

test('intro phase awards minimum coins, never a stone', () => {
  const r = computeAwards({ moduleId: 'M6', phase: 'intro', priorStonesEarned: [] });
  assert.equal(r.coinDelta, PHASE_COIN_REWARDS.intro);
  assert.equal(r.stoneAwarded, null);
});

test('decoration phase (post-win victory lap) awards coins, no stone', () => {
  const r = computeAwards({ moduleId: 'M2', phase: 'decoration', priorStonesEarned: ['watching'] });
  assert.equal(r.coinDelta, PHASE_COIN_REWARDS.decoration);
  assert.equal(r.stoneAwarded, null);
});

test('resolution phase coin amount distinct from phase_b', () => {
  const r = computeAwards({ moduleId: 'M2', phase: 'resolution', priorStonesEarned: [] });
  assert.equal(r.coinDelta, PHASE_COIN_REWARDS.resolution);
  assert.notEqual(PHASE_COIN_REWARDS.resolution, PHASE_COIN_REWARDS.phase_b);
});

test('all phases have positive coin deltas', () => {
  for (const phase of Object.keys(PHASE_COIN_REWARDS) as Array<keyof typeof PHASE_COIN_REWARDS>) {
    assert.ok(PHASE_COIN_REWARDS[phase] > 0, `phase ${phase} should award > 0 coins`);
  }
});

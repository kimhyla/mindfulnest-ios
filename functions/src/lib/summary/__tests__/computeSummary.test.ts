import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bucketActivity,
  bucketClq,
  activeThisWeek,
  computeSummaryFromCounts,
  summariesEqual,
  type SourceCounts,
} from '../computeSummary';
import { assertSummaryShape } from '../types';

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test('bucketActivity: null → never', () => {
  assert.equal(bucketActivity(null, NOW), 'never');
});

test('bucketActivity: <1d → today', () => {
  assert.equal(bucketActivity(NOW - 2 * HOUR, NOW), 'today');
});

test('bucketActivity: 1-7d → this_week', () => {
  assert.equal(bucketActivity(NOW - 3 * DAY, NOW), 'this_week');
});

test('bucketActivity: >7d → older', () => {
  assert.equal(bucketActivity(NOW - 14 * DAY, NOW), 'older');
});

test('bucketClq: null → never', () => {
  assert.equal(bucketClq(null, NOW), 'never');
});

test('bucketClq: this_week / this_month / older', () => {
  assert.equal(bucketClq(NOW - 2 * DAY, NOW), 'this_week');
  assert.equal(bucketClq(NOW - 14 * DAY, NOW), 'this_month');
  assert.equal(bucketClq(NOW - 60 * DAY, NOW), 'older');
});

test('activeThisWeek: null false, <7d true, >7d false', () => {
  assert.equal(activeThisWeek(null, NOW), false);
  assert.equal(activeThisWeek(NOW - 3 * DAY, NOW), true);
  assert.equal(activeThisWeek(NOW - 8 * DAY, NOW), false);
});

function counts(partial: Partial<SourceCounts> = {}): SourceCounts {
  return {
    zaps_7d: 0,
    zaps_30d: 0,
    garden_30d: 0,
    sessions_30d: 0,
    clq_latest_score: null,
    clq_latest_at_ms: null,
    gpr_active_goal_count: 0,
    gpr_avg_7d: null,
    latest_activity_at_ms: null,
    ...partial,
  };
}

test('computeSummary: empty child → zero counts + never buckets + inactive', () => {
  const s = computeSummaryFromCounts('c1', counts(), 'trigger_zaps', NOW, 'STAMP' as unknown as never);
  assert.equal(s.childId, 'c1');
  assert.equal(s.zaps_7d, 0);
  assert.equal(s.activity_bucket, 'never');
  assert.equal(s.active_this_week, false);
  assert.equal(s.clq_latest_at_bucket, 'never');
  assert.equal(s._last_source, 'trigger_zaps');
});

test('computeSummary: active child → today bucket + true active + passes shape assert', () => {
  const s = computeSummaryFromCounts(
    'c1',
    counts({
      zaps_7d: 5,
      zaps_30d: 12,
      garden_30d: 3,
      sessions_30d: 7,
      clq_latest_score: 42,
      clq_latest_at_ms: NOW - 2 * DAY,
      gpr_active_goal_count: 2,
      gpr_avg_7d: 3.5,
      latest_activity_at_ms: NOW - 2 * HOUR,
    }),
    'trigger_gpr',
    NOW,
    'STAMP' as unknown as never,
  );
  assert.equal(s.zaps_7d, 5);
  assert.equal(s.activity_bucket, 'today');
  assert.equal(s.active_this_week, true);
  assert.equal(s.clq_latest_at_bucket, 'this_week');
  assert.equal(s.gpr_avg_7d, 3.5);
  // Shape assert: must not throw.
  assertSummaryShape(s as unknown as Record<string, unknown>);
});

test('assertSummaryShape: rejects forbidden lastZapAt field (LD-225 defense)', () => {
  const bad = {
    childId: 'c1',
    updated_at: 'STAMP',
    zaps_7d: 1,
    zaps_30d: 1,
    garden_30d: 0,
    sessions_30d: 0,
    clq_latest_score: null,
    clq_latest_at_bucket: 'never',
    gpr_active_goal_count: 0,
    gpr_avg_7d: null,
    active_this_week: true,
    activity_bucket: 'today',
    _last_source: 'trigger_zaps',
    last_zap_at: 1_700_000_000, // forbidden
  };
  assert.throws(() => assertSummaryShape(bad as Record<string, unknown>), /last_zap_at/);
});

test('assertSummaryShape: rejects unknown field (defense-in-depth)', () => {
  const bad = {
    childId: 'c1',
    updated_at: 'STAMP',
    zaps_7d: 0,
    zaps_30d: 0,
    garden_30d: 0,
    sessions_30d: 0,
    clq_latest_score: null,
    clq_latest_at_bucket: 'never',
    gpr_active_goal_count: 0,
    gpr_avg_7d: null,
    active_this_week: false,
    activity_bucket: 'never',
    _last_source: 'trigger_zaps',
    secret_metadata: 'exfil',
  };
  assert.throws(() => assertSummaryShape(bad as Record<string, unknown>), /secret_metadata/);
});

test('summariesEqual: ignores updated_at + matching content returns true', () => {
  const a = computeSummaryFromCounts('c1', counts({ zaps_7d: 3 }), 'trigger_zaps', NOW, 'A' as unknown as never);
  const b = computeSummaryFromCounts('c1', counts({ zaps_7d: 3 }), 'trigger_gpr', NOW, 'B' as unknown as never);
  assert.equal(summariesEqual(a, b), true);
});

test('summariesEqual: returns false on content diff', () => {
  const a = computeSummaryFromCounts('c1', counts({ zaps_7d: 3 }), 'trigger_zaps', NOW, 'A' as unknown as never);
  const b = computeSummaryFromCounts('c1', counts({ zaps_7d: 4 }), 'trigger_zaps', NOW, 'A' as unknown as never);
  assert.equal(summariesEqual(a, b), false);
});

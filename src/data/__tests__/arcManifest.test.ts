import { ARC_MODULE_ORDER, arcIdForModule, moduleOrderForArc } from '../arcManifest';

describe('arcManifest', () => {
  test('maps Arc 1 modules to arc1 case-insensitively', () => {
    expect(arcIdForModule('m1')).toBe('arc1');
    expect(arcIdForModule('M6')).toBe('arc1');
  });

  test('returns undefined for unknown module ids', () => {
    expect(arcIdForModule('m99')).toBeUndefined();
  });

  test('exposes canonical Arc 1 module order for progression gating', () => {
    expect(moduleOrderForArc('arc1')).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
    expect(ARC_MODULE_ORDER.arc1).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  });

  test('returns undefined for unknown arcs', () => {
    expect(moduleOrderForArc('arc99')).toBeUndefined();
  });
});

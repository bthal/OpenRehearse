import { clampTargetBpm, isValidTargetBpm, MAX_TARGET_BPM, MIN_TARGET_BPM } from '../tempo';

describe('isValidTargetBpm', () => {
  test('accepts the inclusive bounds', () => {
    expect(isValidTargetBpm(MIN_TARGET_BPM)).toBe(true);
    expect(isValidTargetBpm(MAX_TARGET_BPM)).toBe(true);
  });

  test('accepts a whole number inside the range', () => {
    expect(isValidTargetBpm(100)).toBe(true);
  });

  test('rejects values outside the range', () => {
    expect(isValidTargetBpm(MIN_TARGET_BPM - 1)).toBe(false);
    expect(isValidTargetBpm(MAX_TARGET_BPM + 1)).toBe(false);
    expect(isValidTargetBpm(1000)).toBe(false);
  });

  test('rejects non-integers and non-finite values', () => {
    expect(isValidTargetBpm(100.5)).toBe(false);
    expect(isValidTargetBpm(NaN)).toBe(false);
    expect(isValidTargetBpm(Infinity)).toBe(false);
  });
});

describe('clampTargetBpm', () => {
  test('clamps below/above the range to the bounds', () => {
    expect(clampTargetBpm(10)).toBe(MIN_TARGET_BPM);
    expect(clampTargetBpm(500)).toBe(MAX_TARGET_BPM);
  });

  test('rounds to the nearest whole BPM', () => {
    expect(clampTargetBpm(92.4)).toBe(92);
    expect(clampTargetBpm(92.6)).toBe(93);
  });

  test('leaves an in-range whole number unchanged', () => {
    expect(clampTargetBpm(120)).toBe(120);
  });
});

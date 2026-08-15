import { resolveSections, toInputIndex } from '../sectionResolve';

/** A score where every printed measure resolves to a tick 100 apart. */
const everyMeasure = (i: number) => i * 100;

/** A score where `missing` was never visited by the cursor, so it has no tick. */
const withoutMeasure =
  (...missing: number[]) =>
  (i: number) =>
    missing.includes(i) ? null : i * 100;

const COLORS = ['#111111', '#222222', '#333333', '#444444'];

describe('resolveSections', () => {
  it('passes a well-formed list straight through', () => {
    const resolved = resolveSections([0, 4, 8], COLORS, everyMeasure);
    expect(resolved).toEqual([
      { ticks: 0, color: '#111111', inputIndex: 0 },
      { ticks: 400, color: '#222222', inputIndex: 1 },
      { ticks: 800, color: '#333333', inputIndex: 2 },
    ]);
  });

  it('sorts into playback order and carries the input position along', () => {
    const resolved = resolveSections([8, 0, 4], COLORS, everyMeasure);
    expect(resolved.map((s) => s.ticks)).toEqual([0, 400, 800]);
    expect(resolved.map((s) => s.inputIndex)).toEqual([1, 2, 0]);
    // The color has to travel with its own section, not with its new position.
    expect(resolved.map((s) => s.color)).toEqual(['#222222', '#333333', '#111111']);
  });

  it('drops a measure the cursor never reached', () => {
    const resolved = resolveSections([0, 4, 8], COLORS, withoutMeasure(4));
    expect(resolved.map((s) => s.ticks)).toEqual([0, 800]);
  });

  it('drops a duplicate tick, keeping the first', () => {
    const resolved = resolveSections([2, 2, 8], COLORS, everyMeasure);
    expect(resolved.map((s) => s.inputIndex)).toEqual([0, 2]);
  });

  it('drops an entry with no color rather than painting undefined', () => {
    const resolved = resolveSections([0, 4, 8], ['#111111'], everyMeasure);
    expect(resolved.map((s) => s.inputIndex)).toEqual([0]);
  });

  it.each([
    ['an empty list', [] as number[]],
    ['a single section', [0]],
  ])('handles %s', (_label, indices) => {
    expect(() => resolveSections(indices, COLORS, everyMeasure)).not.toThrow();
  });
});

describe('toInputIndex', () => {
  it('is the identity when nothing was dropped or reordered', () => {
    const resolved = resolveSections([0, 4, 8], COLORS, everyMeasure);
    expect([0, 1, 2].map((i) => toInputIndex(resolved, i))).toEqual([0, 1, 2]);
  });

  it('survives a dropped boundary without shifting everything after it', () => {
    // THE regression this module exists for. Section 1 cannot be placed, so the
    // WebView's list is [section 0, section 2]. Reporting the raw web-side index would
    // tell native "you are in section 1" while the playhead is in section 2 — the
    // label would name the wrong section and the swipe would land in the wrong place.
    const resolved = resolveSections([0, 4, 8], COLORS, withoutMeasure(4));
    expect(toInputIndex(resolved, 0)).toBe(0);
    expect(toInputIndex(resolved, 1)).toBe(2);
  });

  it('survives several drops', () => {
    const resolved = resolveSections([0, 2, 4, 6], COLORS, withoutMeasure(2, 4));
    expect(toInputIndex(resolved, 0)).toBe(0);
    expect(toInputIndex(resolved, 1)).toBe(3);
  });

  it('reports null rather than guessing when there is no counterpart', () => {
    const resolved = resolveSections([0], COLORS, everyMeasure);
    expect(toInputIndex(resolved, 5)).toBeNull();
    expect(toInputIndex(resolved, null)).toBeNull();
    expect(toInputIndex([], 0)).toBeNull();
  });

  it('maps back through a re-sort', () => {
    const resolved = resolveSections([8, 0, 4], COLORS, everyMeasure);
    // Playing from the top is web-index 0, which was native's index 1.
    expect(toInputIndex(resolved, 0)).toBe(1);
    expect(toInputIndex(resolved, 2)).toBe(0);
  });
});

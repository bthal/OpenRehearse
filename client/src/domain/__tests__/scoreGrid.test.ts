import {
  anchorToBarlines,
  buildSnapGrid,
  clampLoopIndices,
  LOOP_MIN_QUARTERS,
  motionPxLeft,
  nearestGridIndex,
  type AnchorableStep,
  type GridPoint,
  type MotionStep,
  nearestIndexByQuarters,
} from '../scoreGrid';

// Four quarter notes plus the terminal target. The terminal always sits exactly
// LOOP_MIN_QUARTERS past the final onset, mirroring `totalQuarters` in playback.ts.
const QUARTERS: GridPoint[] = [
  { quarters: 0, pxLeft: 100 },
  { quarters: 1, pxLeft: 200 },
  { quarters: 2, pxLeft: 300 },
  { quarters: 3, pxLeft: 400 },
  { quarters: 4, pxLeft: 500 }, // terminal
];

// A bar of semiquavers: four onsets inside a single quarter, engraved close together.
const SEMIQUAVERS: GridPoint[] = [
  { quarters: 0, pxLeft: 100 },
  { quarters: 0.25, pxLeft: 120 },
  { quarters: 0.5, pxLeft: 140 },
  { quarters: 0.75, pxLeft: 160 },
  { quarters: 1, pxLeft: 180 },
  { quarters: 2, pxLeft: 280 }, // terminal
];

describe('buildSnapGrid', () => {
  const ONSETS: GridPoint[] = [
    { quarters: 0, pxLeft: 100 },
    { quarters: 1, pxLeft: 200 },
  ];

  it('appends the terminal after the final onset', () => {
    const grid = buildSnapGrid({ onsets: ONSETS, terminalQuarters: 2, terminalPxLeft: 300 });
    expect(grid).toHaveLength(3);
    expect(grid[2]).toEqual({ quarters: 2, pxLeft: 300 });
  });

  it('pushes a terminal that is too close forward to the minimum', () => {
    const grid = buildSnapGrid({ onsets: ONSETS, terminalQuarters: 1.25, terminalPxLeft: 300 });
    expect(grid[2]?.quarters).toBe(1 + LOOP_MIN_QUARTERS);
  });

  it('keeps the terminal strictly right of the final onset', () => {
    const grid = buildSnapGrid({ onsets: ONSETS, terminalQuarters: 2, terminalPxLeft: 150 });
    expect(grid[2]?.pxLeft).toBeGreaterThan(200);
  });

  it('guarantees the final note is always loopable', () => {
    const grid = buildSnapGrid({ onsets: ONSETS, terminalQuarters: 0, terminalPxLeft: 0 });
    expect(clampLoopIndices({ grid, aIndex: 1, bIndex: 2, moved: 'b' })).toEqual({
      aIndex: 1,
      bIndex: 2,
    });
  });

  it('returns an empty grid when the score has no onsets', () => {
    expect(buildSnapGrid({ onsets: [], terminalQuarters: 4, terminalPxLeft: 500 })).toEqual([]);
  });
});

describe('nearestGridIndex', () => {
  it('returns the index of an exact hit', () => {
    expect(nearestGridIndex(QUARTERS, 300)).toBe(2);
  });

  it('rounds to the closer of two neighbours', () => {
    expect(nearestGridIndex(QUARTERS, 220)).toBe(1);
    expect(nearestGridIndex(QUARTERS, 280)).toBe(2);
  });

  it('resolves an exact midpoint forward', () => {
    expect(nearestGridIndex(QUARTERS, 250)).toBe(2);
  });

  it('clamps to the first point below the start of the score', () => {
    expect(nearestGridIndex(QUARTERS, -500)).toBe(0);
  });

  it('clamps to the last point beyond the end of the score', () => {
    expect(nearestGridIndex(QUARTERS, 9999)).toBe(QUARTERS.length - 1);
  });

  it('picks the right onset in a dense passage', () => {
    expect(nearestGridIndex(SEMIQUAVERS, 131)).toBe(2);
    expect(nearestGridIndex(SEMIQUAVERS, 128)).toBe(1);
  });

  it('survives degenerate grids', () => {
    expect(nearestGridIndex([], 400)).toBe(0);
    expect(nearestGridIndex([{ quarters: 0, pxLeft: 100 }], 400)).toBe(0);
  });
});

describe('clampLoopIndices', () => {
  it('leaves a loop that already satisfies the minimum alone', () => {
    expect(clampLoopIndices({ grid: QUARTERS, aIndex: 1, bIndex: 3, moved: 'b' })).toEqual({
      aIndex: 1,
      bIndex: 3,
    });
  });

  it('allows the smallest legal loop — exactly one quarter', () => {
    const { aIndex, bIndex } = clampLoopIndices({
      grid: QUARTERS,
      aIndex: 1,
      bIndex: 2,
      moved: 'b',
    });
    expect(QUARTERS[bIndex]!.quarters - QUARTERS[aIndex]!.quarters).toBe(LOOP_MIN_QUARTERS);
  });

  it('pushes B forward when it is dragged onto A', () => {
    expect(clampLoopIndices({ grid: QUARTERS, aIndex: 2, bIndex: 2, moved: 'b' })).toEqual({
      aIndex: 2,
      bIndex: 3,
    });
  });

  it('pushes B forward when it is dragged behind A', () => {
    expect(clampLoopIndices({ grid: QUARTERS, aIndex: 2, bIndex: 0, moved: 'b' })).toEqual({
      aIndex: 2,
      bIndex: 3,
    });
  });

  it('skips past several onsets in a dense passage to reach the minimum', () => {
    // A on the downbeat, B dragged onto the second semiquaver: only 0.25 quarters.
    expect(clampLoopIndices({ grid: SEMIQUAVERS, aIndex: 0, bIndex: 1, moved: 'b' })).toEqual({
      aIndex: 0,
      bIndex: 4, // the first onset a full quarter after A
    });
  });

  it('pushes A backwards when A is dragged too close to B', () => {
    expect(clampLoopIndices({ grid: SEMIQUAVERS, aIndex: 3, bIndex: 4, moved: 'a' })).toEqual({
      aIndex: 0,
      bIndex: 4,
    });
  });

  it('pushes B forward when A is already at the first onset and cannot retreat', () => {
    expect(clampLoopIndices({ grid: SEMIQUAVERS, aIndex: 0, bIndex: 2, moved: 'a' })).toEqual({
      aIndex: 0,
      bIndex: 4,
    });
  });

  it('loops the final note alone: A on the last onset, B on the terminal', () => {
    expect(clampLoopIndices({ grid: QUARTERS, aIndex: 3, bIndex: 4, moved: 'b' })).toEqual({
      aIndex: 3,
      bIndex: 4,
    });
  });

  it('pushes A backwards when the tail is shorter than the minimum', () => {
    // Defensive: playback.ts always places the terminal exactly one quarter past the
    // final onset, so this cannot arise there — but the rule must not depend on that.
    const shortTail: GridPoint[] = [
      { quarters: 0, pxLeft: 100 },
      { quarters: 1, pxLeft: 200 },
      { quarters: 1.5, pxLeft: 250 },
      { quarters: 1.75, pxLeft: 275 }, // terminal, less than a quarter past the last onset
    ];
    expect(clampLoopIndices({ grid: shortTail, aIndex: 2, bIndex: 3, moved: 'b' })).toEqual({
      aIndex: 0,
      bIndex: 3,
    });
  });

  it('clamps indices that fall outside the grid', () => {
    expect(clampLoopIndices({ grid: QUARTERS, aIndex: -5, bIndex: 99, moved: 'b' })).toEqual({
      aIndex: 0,
      bIndex: 4,
    });
  });

  it('falls back to spanning the whole grid when nothing else is legal', () => {
    const tiny: GridPoint[] = [
      { quarters: 0, pxLeft: 100 },
      { quarters: 0.5, pxLeft: 150 },
    ];
    expect(clampLoopIndices({ grid: tiny, aIndex: 0, bIndex: 1, moved: 'b' })).toEqual({
      aIndex: 0,
      bIndex: 1,
    });
  });

  it('survives degenerate grids', () => {
    expect(clampLoopIndices({ grid: [], aIndex: 0, bIndex: 0, moved: 'b' })).toEqual({
      aIndex: 0,
      bIndex: 0,
    });
    expect(
      clampLoopIndices({ grid: [{ quarters: 0, pxLeft: 100 }], aIndex: 0, bIndex: 0, moved: 'a' }),
    ).toEqual({ aIndex: 0, bIndex: 0 });
  });
});

describe('anchorToBarlines', () => {
  // Distances taken from a real render of Bach BWV 846 at zoom 1: onsets a
  // sixteenth apart sit 28 px apart, and a measure's first notehead sits about
  // 22 px right of its barline.
  const SPAN = 28;
  const GAP = 22;

  it('leaves onsets that do not open a measure untouched', () => {
    const steps: AnchorableStep[] = [{ pxLeft: 100 }, { pxLeft: 128 }, { pxLeft: 156 }];
    expect(anchorToBarlines(steps)).toEqual([100, 128, 156]);
  });

  it('pulls the onset that opens a measure onto its barline', () => {
    const steps: AnchorableStep[] = [
      { pxLeft: 100 },
      { pxLeft: 128 },
      { pxLeft: 156, barPxLeft: 156 - GAP },
      { pxLeft: 184 },
    ];
    expect(anchorToBarlines(steps)).toEqual([100, 128, 134, 184]);
  });

  it('never moves an onset to the right', () => {
    const steps: AnchorableStep[] = [{ pxLeft: 100 }, { pxLeft: 128, barPxLeft: 140 }];
    expect(anchorToBarlines(steps)).toEqual([100, 128]);
  });

  it('keeps a pixel of daylight between an anchor and the previous onset', () => {
    // A wide inset against a narrow preceding step: the barline lies left of the
    // previous notehead, so the anchor is held back rather than crossing it.
    const steps: AnchorableStep[] = [{ pxLeft: 170 }, { pxLeft: 172, barPxLeft: 150 }];
    expect(anchorToBarlines(steps)).toEqual([170, 171]);
  });

  it('prefers staying put over being pushed right by that clamp', () => {
    const steps: AnchorableStep[] = [{ pxLeft: 172 }, { pxLeft: 172.5, barPxLeft: 150 }];
    expect(anchorToBarlines(steps)).toEqual([172, 172.5]);
  });

  it('still anchors across a repeat back-jump', () => {
    // The iterator unrolls the repeat while the engraving draws it once, so the
    // pixel sequence drops. Clamping against the previous step here would refuse
    // to anchor the measure at all.
    const steps: AnchorableStep[] = [{ pxLeft: 500 }, { pxLeft: 200, barPxLeft: 178 }];
    expect(anchorToBarlines(steps)).toEqual([500, 178]);
  });

  it('anchors a first step, which has no predecessor to clamp against', () => {
    expect(anchorToBarlines([{ pxLeft: 100, barPxLeft: 78 }])).toEqual([78]);
  });

  it('returns one pixel per step and keeps them ascending', () => {
    const steps: AnchorableStep[] = [];
    for (let measure = 0; measure < 4; measure++) {
      for (let onset = 0; onset < 4; onset++) {
        const pxLeft = 100 + (measure * 4 + onset) * SPAN;
        steps.push(onset === 0 && measure > 0 ? { pxLeft, barPxLeft: pxLeft - GAP } : { pxLeft });
      }
    }
    const out = anchorToBarlines(steps);
    expect(out).toHaveLength(steps.length);
    for (let i = 1; i < out.length; i++) {
      expect(out[i] ?? 0).toBeGreaterThan(out[i - 1] ?? 0);
    }
  });

  it('survives a score with no onsets', () => {
    expect(anchorToBarlines([])).toEqual([]);
  });
});

describe('motionPxLeft', () => {
  // Same BWV 846 geometry as above: a measure's first notehead sits 22 px right of the
  // barline it was anchored onto, and successive onsets are 28 px apart. Steps 0 and 3
  // open measures, so their two pixels differ; steps 1, 2 and 4 do not, so theirs agree.
  const STEPS: MotionStep[] = [
    { pxLeft: 100, notePxLeft: 122 },
    { pxLeft: 150, notePxLeft: 150 },
    { pxLeft: 178, notePxLeft: 178 },
    { pxLeft: 206, notePxLeft: 228 },
    { pxLeft: 256, notePxLeft: 256 },
  ];

  it('puts a measure-start step on its notehead when it is not an anchor', () => {
    expect(motionPxLeft(STEPS, 3, null, null)).toBe(228);
  });

  it('leaves the two tracks identical away from a measure start', () => {
    expect(motionPxLeft(STEPS, 1, null, null)).toBe(150);
    expect(motionPxLeft(STEPS, 2, 2, null)).toBe(178);
  });

  it('holds the loop A step on its barline, which is where the wrap lands', () => {
    expect(motionPxLeft(STEPS, 3, null, 3)).toBe(206);
  });

  it('holds the step a fresh start began on, so the first note does not yank', () => {
    expect(motionPxLeft(STEPS, 3, 3, null)).toBe(206);
  });

  it('anchors nothing once both anchors are spent', () => {
    expect(STEPS.map((_, i) => motionPxLeft(STEPS, i, null, null))).toEqual([
      122, 150, 178, 228, 256,
    ]);
  });

  // Starting playback at a loop's A handle sets both anchors to the same index.
  it('treats the two anchors landing on one step as a single anchor', () => {
    expect(motionPxLeft(STEPS, 0, 0, 0)).toBe(100);
  });

  it('anchors only the named steps, never their neighbours', () => {
    expect(motionPxLeft(STEPS, 0, 3, 3)).toBe(122);
    expect(motionPxLeft(STEPS, 4, 3, 3)).toBe(256);
  });

  // The interpolation reads index + 1 every frame and falls back to the current pixel,
  // so the final step must report a miss rather than a zero.
  it('returns undefined past the end of the grid', () => {
    expect(motionPxLeft(STEPS, 5, null, null)).toBeUndefined();
    expect(motionPxLeft([], 0, 0, 0)).toBeUndefined();
  });
});

describe('nearestIndexByQuarters', () => {
  // The musical-time counterpart of nearestGridIndex, used to place a saved bit back on
  // the grid: bits persist in ticks because pixels do not survive a reload.
  const grid = [
    { quarters: 0, pxLeft: 0 },
    { quarters: 1, pxLeft: 100 },
    { quarters: 2, pxLeft: 200 },
  ];

  it('returns the exact index for a position on a grid point', () => {
    expect(nearestIndexByQuarters(grid, 0)).toBe(0);
    expect(nearestIndexByQuarters(grid, 1)).toBe(1);
    expect(nearestIndexByQuarters(grid, 2)).toBe(2);
  });

  it('picks the nearer neighbour, not the preceding one', () => {
    expect(nearestIndexByQuarters(grid, 0.4)).toBe(0);
    expect(nearestIndexByQuarters(grid, 0.6)).toBe(1);
  });

  // Matches nearestGridIndex, so a position resolved either way lands on one point.
  it('resolves an exact midpoint forward', () => {
    expect(nearestIndexByQuarters(grid, 0.5)).toBe(1);
  });

  it('clamps outside the grid', () => {
    expect(nearestIndexByQuarters(grid, -5)).toBe(0);
    expect(nearestIndexByQuarters(grid, 99)).toBe(2);
  });

  it('returns 0 for an empty grid, like its pixel counterpart', () => {
    expect(nearestIndexByQuarters([], 3)).toBe(0);
  });
});

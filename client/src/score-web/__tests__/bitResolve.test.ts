import type { Bit } from '@domain/bits';
import type { GridPoint } from '@domain/scoreGrid';
import { findBitByPixelSpan, resolveBits, type ResolvedBit } from '../bitResolve';

const PPQ = 192;

function bit(startQuarters: number, endQuarters: number, id = 'b1'): Bit {
  return {
    id,
    startTicks: startQuarters * PPQ,
    endTicks: endQuarters * PPQ,
    hand: 'both',
    tempoMultiplier: 1.0,
    metronome: false,
  };
}

/** Four quarter-note onsets at 100 px each, plus a terminal on the closing barline. */
const ONSETS: GridPoint[] = [
  { quarters: 0, pxLeft: 0 },
  { quarters: 1, pxLeft: 100 },
  { quarters: 2, pxLeft: 200 },
  { quarters: 3, pxLeft: 300 },
];
const SNAP_GRID: GridPoint[] = [...ONSETS, { quarters: 4, pxLeft: 420 }];

describe('resolveBits', () => {
  it('places a bit on the onsets it was saved over', () => {
    expect(resolveBits([bit(1, 3)], ONSETS, SNAP_GRID)).toEqual<ResolvedBit[]>([
      { id: 'b1', aStep: 1, bStep: 3, aPx: 100, bPx: 300 },
    ]);
  });

  // A bit saved with the final note inside it ends on the terminal, which only exists
  // in the snap grid — resolving B against the onsets would bring it back short.
  it('lets the end land on the terminal target', () => {
    const [resolved] = resolveBits([bit(2, 4)], ONSETS, SNAP_GRID);
    expect(resolved?.bStep).toBe(4);
    expect(resolved?.bPx).toBe(420);
  });

  it('never lets the start land on the terminal', () => {
    const [resolved] = resolveBits([bit(4, 5)], ONSETS, SNAP_GRID);
    // Clamped back onto the last real onset rather than parked past the last note.
    expect(resolved?.aStep).toBe(3);
  });

  it('snaps a position between onsets to the nearest one', () => {
    // 1.6 quarters is closer to onset 2 than to onset 1.
    expect(resolveBits([bit(1.6, 3)], ONSETS, SNAP_GRID)[0]?.aStep).toBe(2);
    expect(resolveBits([bit(1.4, 3)], ONSETS, SNAP_GRID)[0]?.aStep).toBe(1);
  });

  // The XML behind a bit is immutable after import, so an out-of-range tick means the
  // grid was rebuilt slightly differently — not that the passage is gone.
  it('clamps a bit whose ticks run past the end rather than dropping it', () => {
    const [resolved] = resolveBits([bit(50, 99)], ONSETS, SNAP_GRID);
    expect(resolved).toBeDefined();
    expect(resolved?.bStep).toBe(4);
  });

  it('drops a bit that resolves to no width at all', () => {
    // Both bounds land on the same onset, so there is nothing to draw or loop.
    expect(resolveBits([bit(1, 1.1)], ONSETS, SNAP_GRID)).toEqual([]);
  });

  it('drops a second bit that resolves onto a span already taken', () => {
    const resolved = resolveBits([bit(1, 3, 'first'), bit(1.1, 2.9, 'second')], ONSETS, SNAP_GRID);
    expect(resolved.map((r) => r.id)).toEqual(['first']);
  });

  it('returns nothing when there is no grid yet', () => {
    expect(resolveBits([bit(0, 2)], [], [])).toEqual([]);
    expect(resolveBits([bit(0, 2)], ONSETS, [])).toEqual([]);
  });

  it('returns nothing for no bits', () => {
    expect(resolveBits([], ONSETS, SNAP_GRID)).toEqual([]);
  });
});

describe('findBitByPixelSpan', () => {
  const resolved = resolveBits([bit(1, 3)], ONSETS, SNAP_GRID);

  it('finds a bit covering exactly that span', () => {
    expect(findBitByPixelSpan(resolved, 100, 300)?.id).toBe('b1');
  });

  it('finds nothing for a different span', () => {
    expect(findBitByPixelSpan(resolved, 100, 200)).toBeUndefined();
    expect(findBitByPixelSpan(resolved, 0, 300)).toBeUndefined();
  });

  // The heart of the repeat rule: repeated bars are engraved once, so a loop over the
  // second pass has different ticks but the same pixels. One passage, one bit.
  it('matches a loop over the other pass of a repeat', () => {
    // A grid that visits the same engraving twice, as an unrolled repeat does.
    const repeated: GridPoint[] = [
      { quarters: 0, pxLeft: 0 },
      { quarters: 1, pxLeft: 100 },
      { quarters: 2, pxLeft: 0 },
      { quarters: 3, pxLeft: 100 },
    ];
    const grid: GridPoint[] = [...repeated, { quarters: 4, pxLeft: 200 }];
    const firstPass = resolveBits([bit(0, 1, 'pass-one')], repeated, grid);
    expect(firstPass).toHaveLength(1);

    // The second pass resolves to the same two pixels...
    const secondPass = resolveBits([bit(2, 3, 'pass-two')], repeated, grid);
    expect(secondPass[0]?.aPx).toBe(firstPass[0]?.aPx);
    expect(secondPass[0]?.bPx).toBe(firstPass[0]?.bPx);
    // ...so creating over it finds the bit that is already there.
    expect(findBitByPixelSpan(firstPass, secondPass[0]!.aPx, secondPass[0]!.bPx)?.id).toBe(
      'pass-one',
    );
  });
});

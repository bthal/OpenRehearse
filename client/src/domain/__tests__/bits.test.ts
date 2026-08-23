import {
  BIT_MAX_ROWS,
  bitsEqual,
  exceedsRowBudget,
  normaliseBits,
  packBitRows,
  type Bit,
  type BitSpan,
} from '../bits';

function bit(overrides: Partial<Bit> = {}): Bit {
  return {
    id: 'b1',
    startTicks: 0,
    endTicks: 768,
    hand: 'both',
    tempoMultiplier: 1.0,
    metronome: false,
    ...overrides,
  };
}

function span(aPx: number, bPx: number): BitSpan {
  return { aPx, bPx };
}

describe('normaliseBits', () => {
  it('returns an empty list for anything that is not an array', () => {
    expect(normaliseBits(undefined)).toEqual([]);
    expect(normaliseBits(null)).toEqual([]);
    expect(normaliseBits('[]')).toEqual([]);
    expect(normaliseBits({ bits: [] })).toEqual([]);
  });

  it('keeps a well-formed bit unchanged', () => {
    const input = bit({ hand: 'left', tempoMultiplier: 0.5, metronome: true });
    expect(normaliseBits([input])).toEqual([input]);
  });

  it('drops entries with no usable region', () => {
    expect(
      normaliseBits([
        { startTicks: 0, endTicks: 100 }, // no id
        bit({ id: '' }), // empty id
        { id: 'x', startTicks: 'nope', endTicks: 100 },
        { id: 'y', startTicks: 0, endTicks: Number.NaN },
        { id: 'z', startTicks: Number.POSITIVE_INFINITY, endTicks: 100 },
        'not an object',
        null,
      ]),
    ).toEqual([]);
  });

  it('drops a range that does not move forward', () => {
    expect(normaliseBits([bit({ startTicks: 500, endTicks: 500 })])).toEqual([]);
    expect(normaliseBits([bit({ startTicks: 700, endTicks: 200 })])).toEqual([]);
  });

  it('keeps the first of two bits sharing an id', () => {
    const result = normaliseBits([bit({ startTicks: 0 }), bit({ startTicks: 960 })]);
    expect(result).toHaveLength(1);
    expect(result[0]?.startTicks).toBe(0);
  });

  // The region is what cost the user something to place; a rotted setting is repaired
  // rather than taking the whole bit down with it.
  it('repairs unreadable settings instead of dropping the bit', () => {
    const result = normaliseBits([
      { id: 'b1', startTicks: 0, endTicks: 768, hand: 'BOTH', tempoMultiplier: 0.9 },
    ]);
    expect(result).toEqual([
      {
        id: 'b1',
        startTicks: 0,
        endTicks: 768,
        hand: 'both',
        tempoMultiplier: 1.0,
        metronome: false,
      },
    ]);
  });

  it('treats a missing metronome flag as off, and only true as on', () => {
    expect(normaliseBits([{ ...bit(), metronome: 'yes' }])[0]?.metronome).toBe(false);
    expect(normaliseBits([{ ...bit(), metronome: 1 }])[0]?.metronome).toBe(false);
    expect(normaliseBits([{ ...bit(), metronome: true }])[0]?.metronome).toBe(true);
  });
});

describe('bitsEqual', () => {
  it('is true for the same bits', () => {
    expect(bitsEqual([bit()], [bit()])).toBe(true);
    expect(bitsEqual([], [])).toBe(true);
  });

  it('is false when any field differs', () => {
    expect(bitsEqual([bit()], [bit({ endTicks: 769 })])).toBe(false);
    expect(bitsEqual([bit()], [bit({ hand: 'right' })])).toBe(false);
    expect(bitsEqual([bit()], [bit({ tempoMultiplier: 0.75 })])).toBe(false);
    expect(bitsEqual([bit()], [bit({ metronome: true })])).toBe(false);
    expect(bitsEqual([bit()], [])).toBe(false);
  });

  it('is order-sensitive, since the stored list has an order', () => {
    const a = bit({ id: 'a' });
    const b = bit({ id: 'b' });
    expect(bitsEqual([a, b], [b, a])).toBe(false);
  });
});

describe('packBitRows', () => {
  it('puts a lone bit on the top row', () => {
    expect(packBitRows([span(0, 100)])).toEqual([0]);
  });

  it('lets bits at opposite ends of the piece share a row', () => {
    expect(packBitRows([span(0, 100), span(400, 500)])).toEqual([0, 0]);
  });

  // Adjacency is the common case: two consecutive practice passages meeting at a
  // barline should not cost a second row.
  it('lets bits that only touch share a row', () => {
    expect(packBitRows([span(0, 100), span(100, 200)])).toEqual([0, 0]);
  });

  it('stacks a nested bit above the one containing it', () => {
    // Longer span placed second in the input, to prove the order is by width.
    const rows = packBitRows([span(0, 400), span(100, 200)]);
    expect(rows[1]).toBe(0); // the short one is nearest the score
    expect(rows[0]).toBe(1);
  });

  it('stacks three levels of nesting in width order', () => {
    const rows = packBitRows([span(0, 900), span(0, 300), span(0, 100)]);
    expect(rows).toEqual([2, 1, 0]);
  });

  it('separates partially overlapping bits', () => {
    const rows = packBitRows([span(0, 200), span(100, 300)]);
    expect(new Set(rows).size).toBe(2);
  });

  it('collapses nesting deeper than the cap onto the last row', () => {
    const rows = packBitRows([span(0, 100), span(0, 200), span(0, 300), span(0, 400)], 3);
    expect(rows).toEqual([0, 1, 2, 2]);
  });

  it('never exceeds the cap however deep the nesting goes', () => {
    const spans = Array.from({ length: 12 }, (_, i) => span(0, (i + 1) * 100));
    for (const row of packBitRows(spans)) {
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(BIT_MAX_ROWS);
    }
  });

  it('returns rows positionally, not in the order it placed them', () => {
    // Input order: long, short. Output must answer for input position 0 first.
    expect(packBitRows([span(0, 500), span(10, 20)])).toEqual([1, 0]);
  });

  it('is stable for identical spans rather than depending on input order', () => {
    expect(packBitRows([span(0, 100), span(0, 100)])).toEqual([0, 1]);
  });

  it('handles an empty list', () => {
    expect(packBitRows([])).toEqual([]);
  });

  it('degrades to a single row when the cap leaves no room', () => {
    expect(packBitRows([span(0, 100), span(0, 200)], 1)).toEqual([0, 0]);
  });
});

describe('exceedsRowBudget', () => {
  // The gate that turns the fourth overlapping bit into a refusal the user sees, rather
  // than a fourth marker collapsed onto the third row and drawn over its neighbour.
  it('allows a bit when the strip has room', () => {
    expect(exceedsRowBudget([], span(0, 100))).toBe(false);
    expect(exceedsRowBudget([span(0, 300)], span(50, 150))).toBe(false);
    expect(exceedsRowBudget([span(0, 300), span(50, 150)], span(60, 100))).toBe(false);
  });

  it('refuses the fourth bit stacked at one point in the piece', () => {
    const existing = [span(0, 400), span(0, 300), span(0, 200)];
    expect(exceedsRowBudget(existing, span(0, 100))).toBe(true);
  });

  it('allows a fourth bit that does not overlap the other three', () => {
    const existing = [span(0, 400), span(0, 300), span(0, 200)];
    expect(exceedsRowBudget(existing, span(900, 1000))).toBe(false);
  });

  // Adding a short span pushes the longer ones down, so the candidate cannot be judged
  // on its own row — the whole set has to be repacked.
  it('accounts for the candidate displacing longer spans', () => {
    const existing = [span(0, 400), span(100, 300)];
    // A third span nested inside both makes the outermost one row 2 — still legal.
    expect(exceedsRowBudget(existing, span(150, 250))).toBe(false);
    // A fourth would make it row 3.
    expect(exceedsRowBudget([...existing, span(150, 250)], span(180, 220))).toBe(true);
  });

  it('honours a custom budget', () => {
    expect(exceedsRowBudget([span(0, 300)], span(50, 150), 1)).toBe(true);
    expect(exceedsRowBudget([span(0, 300)], span(50, 150), 2)).toBe(false);
  });
});

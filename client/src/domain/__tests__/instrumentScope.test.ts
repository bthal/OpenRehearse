import {
  ALL_INSTRUMENTS,
  filterByInstrument,
  normaliseInstrumentScope,
  scopeIncludes,
  scopeInstrument,
  warmUpRowsForScope,
} from '../instrumentScope';

describe('normaliseInstrumentScope', () => {
  it('keeps a real scope', () => {
    expect(normaliseInstrumentScope('clarinetBb')).toBe('clarinetBb');
    expect(normaliseInstrumentScope('all')).toBe('all');
  });

  it('shows everything on a fresh install or a rotted setting', () => {
    // The default has to be the state that hides nothing.
    expect(normaliseInstrumentScope(undefined)).toBe(ALL_INSTRUMENTS);
    expect(normaliseInstrumentScope('trombone')).toBe(ALL_INSTRUMENTS);
    expect(normaliseInstrumentScope(3)).toBe(ALL_INSTRUMENTS);
  });
});

describe('scopeIncludes', () => {
  it('shows every instrument under All', () => {
    expect(scopeIncludes('all', 'piano')).toBe(true);
    expect(scopeIncludes('all', 'clarinetBb')).toBe(true);
  });

  it('shows only the named instrument otherwise', () => {
    expect(scopeIncludes('clarinetBb', 'clarinetBb')).toBe(true);
    expect(scopeIncludes('clarinetBb', 'piano')).toBe(false);
  });
});

describe('scopeInstrument', () => {
  it('names nothing under All, so a new routine still has to be told', () => {
    expect(scopeInstrument('all')).toBeNull();
    expect(scopeInstrument('piano')).toBe('piano');
  });
});

describe('filterByInstrument', () => {
  const rows = [
    { id: 'a', instrument: 'piano' as const },
    { id: 'b', instrument: 'clarinetBb' as const },
    { id: 'c', instrument: 'piano' as const },
  ];

  it('keeps order', () => {
    expect(filterByInstrument(rows, 'piano').map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('keeps everything under All', () => {
    expect(filterByInstrument(rows, 'all')).toHaveLength(3);
  });
});

describe('warmUpRowsForScope', () => {
  it('offers one instrument’s own exercises when the scope names one', () => {
    expect(warmUpRowsForScope('clarinetBb')).toEqual([
      { type: 'scales', instrument: 'clarinetBb' },
      { type: 'chromatic', instrument: 'clarinetBb' },
      { type: 'longNote', instrument: 'clarinetBb' },
    ]);
  });

  it('groups the All list by exercise, not by instrument', () => {
    // "Where are my scales" is the question a warming-up player asks; grouping by
    // instrument would bury the second Scales row far below the first.
    const rows = warmUpRowsForScope('all');
    const scales = rows.findIndex((r) => r.type === 'scales' && r.instrument === 'piano');
    const clarinetScales = rows.findIndex(
      (r) => r.type === 'scales' && r.instrument === 'clarinetBb',
    );
    const arpeggio = rows.findIndex((r) => r.type === 'arpeggio');
    expect(clarinetScales).toBe(scales + 1);
    expect(arpeggio).toBeGreaterThan(clarinetScales);
  });

  it('never lists an exercise for an instrument that cannot do it', () => {
    for (const row of warmUpRowsForScope('all')) {
      if (row.instrument === 'clarinetBb') {
        expect(['scales', 'chromatic', 'longNote']).toContain(row.type);
      }
    }
  });

  it('lists every piano exercise exactly once under All', () => {
    const piano = warmUpRowsForScope('all').filter((r) => r.instrument === 'piano');
    expect(piano).toEqual(warmUpRowsForScope('piano'));
  });
});

import { soundingLengthWholes, type TieDurationNote } from '../ties';

/** A note with no tie. `wholes` is the note's own length in whole notes. */
function plain(wholes: number): TieDurationNote {
  return { Length: { RealValue: wholes } };
}

/**
 * Builds a tie chain and returns its notes in order, wired the way OSMD wires
 * them: every note in the chain shares one `Tie`, whose `Duration` is the
 * combined length and whose `StartNote` is the first note.
 */
function tieChain(first: number, ...rest: number[]): [TieDurationNote, ...TieDurationNote[]] {
  const wholes = [first, ...rest];
  const start: TieDurationNote = { Length: { RealValue: first } };
  const notes: [TieDurationNote, ...TieDurationNote[]] = [
    start,
    ...rest.map((w) => ({ Length: { RealValue: w } })),
  ];
  const tie = {
    StartNote: start,
    Duration: { RealValue: wholes.reduce((a, b) => a + b, 0) },
  };
  for (const note of notes) note.NoteTie = tie;
  return notes;
}

describe('soundingLengthWholes', () => {
  test('an untied note sounds its own length', () => {
    expect(soundingLengthWholes(plain(0.25))).toBe(0.25);
    expect(soundingLengthWholes(plain(1))).toBe(1);
  });

  test('a tie start sounds the whole chain, not just its own note', () => {
    // Two tied whole notes: the drill case — 8 quarters, not 4.
    const [start] = tieChain(1, 1);
    expect(soundingLengthWholes(start)).toBe(2);
  });

  test('chains of three and four whole notes sum correctly', () => {
    expect(soundingLengthWholes(tieChain(1, 1, 1)[0])).toBe(3);
    expect(soundingLengthWholes(tieChain(1, 1, 1, 1)[0])).toBe(4);
  });

  test('a chain of unequal note values sums correctly', () => {
    // Quarter tied to an eighth = a dotted quarter.
    expect(soundingLengthWholes(tieChain(0.25, 0.125)[0])).toBe(0.375);
    // Half tied across a barline to a quarter.
    expect(soundingLengthWholes(tieChain(0.5, 0.25)[0])).toBe(0.75);
  });

  test('continuation notes are silent — the start note already holds them', () => {
    const [, ...continuations] = tieChain(1, 1, 1);
    expect(continuations).toHaveLength(2);
    for (const note of continuations) expect(soundingLengthWholes(note)).toBe(0);
  });

  test('falls back to the note’s own length when the tie has no usable duration', () => {
    const note: TieDurationNote = { Length: { RealValue: 0.5 } };
    note.NoteTie = { StartNote: note };
    expect(soundingLengthWholes(note)).toBe(0.5);

    const zeroed: TieDurationNote = { Length: { RealValue: 0.5 } };
    zeroed.NoteTie = { StartNote: zeroed, Duration: { RealValue: 0 } };
    expect(soundingLengthWholes(zeroed)).toBe(0.5);
  });
});

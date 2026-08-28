import { engravedTranspose, hasPracticeTranspose, isPieceComplete, type Piece } from '../piece';

function makePiece(overrides: Partial<Piece> = {}): Piece {
  return {
    id: 'p1',
    instrument: 'piano' as const,
    title: 'Prelude',
    composer: 'Bach',
    xmlFilename: 'p1.xml',
    importedAt: '2026-01-01T00:00:00.000Z',
    importedBpm: 100,
    ...overrides,
  };
}

describe('isPieceComplete', () => {
  test('complete piece (title + composer + imported speed)', () => {
    expect(isPieceComplete(makePiece())).toBe(true);
  });

  test('speed via targetBpm counts even without importedBpm', () => {
    expect(isPieceComplete(makePiece({ importedBpm: undefined, targetBpm: 80 }))).toBe(true);
  });

  test('missing speed (no imported and no target) → incomplete', () => {
    expect(isPieceComplete(makePiece({ importedBpm: undefined, targetBpm: undefined }))).toBe(
      false,
    );
  });

  test('missing composer (null) → incomplete', () => {
    expect(isPieceComplete(makePiece({ composer: null }))).toBe(false);
  });

  test('blank/whitespace composer → incomplete', () => {
    expect(isPieceComplete(makePiece({ composer: '   ' }))).toBe(false);
  });

  test('blank title → incomplete', () => {
    expect(isPieceComplete(makePiece({ title: '  ' }))).toBe(false);
  });
});

describe('engravedTranspose', () => {
  it('is 0 for a piece with neither field, as every existing piece has', () => {
    expect(engravedTranspose(makePiece())).toBe(0);
  });

  it('sums the reading transposition and the user’s own shift', () => {
    expect(
      engravedTranspose(makePiece({ transposeBaseSemitones: 2, transposePracticeSemitones: 3 })),
    ).toBe(5);
  });

  it('keeps the base when the practice offset is cleared', () => {
    // Reset on a clarinet piece must mean "back to how I read this", not "back to
    // concert pitch" — which is the whole reason these are two fields.
    const reset = makePiece({ transposeBaseSemitones: 2, transposePracticeSemitones: 0 });
    expect(engravedTranspose(reset)).toBe(2);
    expect(hasPracticeTranspose(reset)).toBe(false);
  });

  it('reports a shifted piece as having something to reset', () => {
    expect(hasPracticeTranspose(makePiece({ transposePracticeSemitones: -1 }))).toBe(true);
  });
});

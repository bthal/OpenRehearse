import { isPieceComplete, type Piece } from '../piece';

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

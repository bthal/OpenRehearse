import { detectInstrument, guessImportInstrument, readingTransposeFor } from '../instrumentDetect';

const scorePart = (id: string, name: string, extra = '') =>
  `<score-part id="${id}"><part-name>${name}</part-name>${extra}</score-part>`;
const midi = (program: number) =>
  `<midi-instrument><midi-program>${program}</midi-program></midi-instrument>`;
const score = (parts: string, body = '') =>
  `<score-partwise version="4.0"><part-list>${parts}</part-list>${body}</score-partwise>`;

describe('detectInstrument', () => {
  it('trusts the part name first', () => {
    const xml = score(scorePart('P1', 'Clarinet in B♭', midi(1)));
    // The GM program says piano; plenty of exporters emit that for everything, so the
    // name has to win or every clarinet part from those tools imports wrong.
    expect(detectInstrument(xml, { id: 'P1', name: 'Clarinet in B♭' })).toBe('clarinetBb');
  });

  it('recognises the part name in other languages', () => {
    expect(detectInstrument(score(''), { name: 'Klarinette' })).toBe('clarinetBb');
    expect(detectInstrument(score(''), { name: 'Klavier' })).toBe('piano');
  });

  it('falls back to the GM program when the name says nothing', () => {
    const xml = score(scorePart('P1', 'Voice 1', midi(72)));
    expect(detectInstrument(xml, { id: 'P1', name: 'Voice 1' })).toBe('clarinetBb');
  });

  it('reads the named part’s program, not another part’s', () => {
    const xml = score(scorePart('P1', 'A', midi(1)) + scorePart('P2', 'B', midi(72)));
    expect(detectInstrument(xml, { id: 'P2', name: 'B' })).toBe('clarinetBb');
    expect(detectInstrument(xml, { id: 'P1', name: 'A' })).toBe('piano');
  });

  it('returns null rather than guessing when nothing says', () => {
    // The import flow turns null into a question. A confident wrong guess is worse.
    expect(
      detectInstrument(score(scorePart('P1', 'Part 1')), { id: 'P1', name: 'Part 1' }),
    ).toBeNull();
  });

  it('never infers an instrument from <transpose> alone', () => {
    // A chromatic of -2 is a Bb clarinet, a Bb trumpet and a soprano sax alike.
    const xml = score(scorePart('P1', 'Part 1'));
    const withTranspose = xml.replace(
      '</score-partwise>',
      '<part id="P1"><measure><attributes><transpose><chromatic>-2</chromatic></transpose></attributes></measure></part></score-partwise>',
    );
    expect(detectInstrument(withTranspose, { id: 'P1', name: 'Part 1' })).toBeNull();
  });
});

describe('guessImportInstrument', () => {
  it('always asks which part on a multi-part score', () => {
    const xml = score(scorePart('P1', 'Clarinet') + scorePart('P2', 'Piano'));
    const guess = guessImportInstrument(xml, [
      { id: 'P1', name: 'Clarinet' },
      { id: 'P2', name: 'Piano' },
    ]);
    // Even though both parts are individually recognisable, the app cannot know which
    // line the user practises — guessing "the first" hands a clarinettist the wrong one.
    expect(guess.mustAskPart).toBe(true);
    expect(guess.instrument).toBeNull();
    expect(guess.mustAskInstrument).toBe(true);
  });

  it('imports a recognisable single-part score without asking anything', () => {
    const xml = score(scorePart('P1', 'Piano', midi(1)));
    const guess = guessImportInstrument(xml, [{ id: 'P1', name: 'Piano' }]);
    expect(guess).toMatchObject({
      instrument: 'piano',
      mustAskPart: false,
      mustAskInstrument: false,
    });
    // One part means nothing to choose, so no partId is stored.
    expect(guess.partId).toBeUndefined();
  });

  it('asks about the instrument when a single part is unrecognisable', () => {
    const xml = score(scorePart('P1', 'Part 1'));
    const guess = guessImportInstrument(xml, [{ id: 'P1', name: 'Part 1' }]);
    expect(guess.mustAskInstrument).toBe(true);
    expect(guess.mustAskPart).toBe(false);
  });
});

describe('readingTransposeFor', () => {
  const withTranspose = (semitones: number) =>
    `<score-partwise><part-list><score-part id="P1"><part-name>Cl</part-name></score-part></part-list><part id="P1"><measure><attributes><transpose><chromatic>${semitones}</chromatic></transpose></attributes></measure></part></score-partwise>`;
  const plain = `<score-partwise><part id="P1"><measure><attributes><divisions>1</divisions></attributes></measure></part></score-partwise>`;

  it('leaves an already-transposed clarinet part where it is', () => {
    expect(readingTransposeFor(withTranspose(-2), 'clarinetBb', 'P1')).toBe(0);
  });

  it('raises a concert-pitch score into the clarinet’s reading key', () => {
    expect(readingTransposeFor(plain, 'clarinetBb', 'P1')).toBe(2);
  });

  it('never transposes a piano piece', () => {
    expect(readingTransposeFor(plain, 'piano', 'P1')).toBe(0);
  });
});

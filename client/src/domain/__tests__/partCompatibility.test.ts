import {
  instrumentAllowsPart,
  legalInstrumentsForPart,
  partRefusalReason,
  practisedPart,
  repairPieceInstrument,
} from '../partCompatibility';
import type { ScorePart } from '../musicxml';

const mono = (id = 'P1'): ScorePart => ({ id, name: null, monophonic: true });
const poly = (id = 'P1', reason: ScorePart['polyphonyReason'] = 'chords'): ScorePart => ({
  id,
  name: null,
  monophonic: false,
  polyphonyReason: reason,
});
/** A part stored before the check existed: the flag is genuinely absent. */
const legacy = (id = 'P1'): ScorePart => ({ id, name: null });

describe('instrumentAllowsPart', () => {
  it('lets the piano practise anything', () => {
    expect(instrumentAllowsPart('piano', poly())).toBe(true);
    expect(instrumentAllowsPart('piano', mono())).toBe(true);
    expect(instrumentAllowsPart('piano', undefined)).toBe(true);
  });

  it('refuses a polyphonic part for a one-line instrument', () => {
    expect(instrumentAllowsPart('clarinetBb', poly('P1', 'staves'))).toBe(false);
    expect(instrumentAllowsPart('clarinetBb', poly('P1', 'chords'))).toBe(false);
    expect(instrumentAllowsPart('clarinetBb', poly('P1', 'voices'))).toBe(false);
  });

  it('allows a monophonic part for a one-line instrument', () => {
    expect(instrumentAllowsPart('clarinetBb', mono())).toBe(true);
  });

  it('treats an absent flag as "nobody looked", not as polyphony', () => {
    // Demoting a piece that has been working, on no evidence, is worse than trusting it.
    expect(instrumentAllowsPart('clarinetBb', legacy())).toBe(true);
    expect(instrumentAllowsPart('clarinetBb', undefined)).toBe(true);
  });
});

describe('partRefusalReason', () => {
  it('names what makes the part more than one line', () => {
    expect(partRefusalReason('clarinetBb', poly('P1', 'staves'))).toBe('staves');
    expect(partRefusalReason('clarinetBb', poly('P1', 'voices'))).toBe('voices');
  });

  it('is null whenever the instrument is allowed', () => {
    expect(partRefusalReason('piano', poly())).toBeNull();
    expect(partRefusalReason('clarinetBb', mono())).toBeNull();
  });

  it('does not invent a reason it never observed', () => {
    expect(partRefusalReason('clarinetBb', { monophonic: false })).toBeNull();
  });
});

describe('legalInstrumentsForPart', () => {
  it('leaves the piano as the only answer for a polyphonic part', () => {
    expect(legalInstrumentsForPart(poly())).toEqual(['piano']);
  });

  it('offers every instrument for a single line', () => {
    expect(legalInstrumentsForPart(mono())).toEqual(['piano', 'clarinetBb']);
  });

  it('never returns nothing, so the import flow cannot dead-end', () => {
    for (const part of [mono(), poly(), legacy(), undefined]) {
      expect(legalInstrumentsForPart(part).length).toBeGreaterThan(0);
    }
  });
});

describe('practisedPart', () => {
  it('takes the only part when the piece names none', () => {
    expect(practisedPart([mono('P1')], undefined)?.id).toBe('P1');
  });

  it('resolves the named part by id, not by position', () => {
    expect(practisedPart([poly('P1'), mono('P2')], 'P2')?.id).toBe('P2');
  });

  it('resolves to nothing when the id is no longer in the list', () => {
    expect(practisedPart([mono('P1')], 'P9')).toBeUndefined();
  });

  it('refuses to guess which line a multi-part score means', () => {
    expect(practisedPart([mono('P1'), mono('P2')], undefined)).toBeUndefined();
  });
});

describe('repairPieceInstrument', () => {
  it('falls back to piano when a one-line instrument sits on a polyphonic part', () => {
    expect(repairPieceInstrument('clarinetBb', [poly('P1', 'staves')], undefined)).toBe('piano');
  });

  it('leaves a legitimate clarinet piece alone', () => {
    expect(repairPieceInstrument('clarinetBb', [mono('P1')], undefined)).toBe('clarinetBb');
  });

  it('leaves a piece with no stored flag alone rather than guessing', () => {
    expect(repairPieceInstrument('clarinetBb', [legacy('P1')], undefined)).toBe('clarinetBb');
    expect(repairPieceInstrument('clarinetBb', undefined, undefined)).toBe('clarinetBb');
  });

  it('judges the practised part, not the first one', () => {
    const parts = [poly('P1', 'chords'), mono('P2')];
    expect(repairPieceInstrument('clarinetBb', parts, 'P2')).toBe('clarinetBb');
    expect(repairPieceInstrument('clarinetBb', parts, 'P1')).toBe('piano');
  });

  it('never touches a piano piece', () => {
    expect(repairPieceInstrument('piano', [poly()], undefined)).toBe('piano');
  });
});

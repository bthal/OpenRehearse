import {
  DEFAULT_INSTRUMENT,
  INSTRUMENT_IDS,
  INSTRUMENT_REGISTRY,
  defaultBaseTranspose,
  exercisesFor,
  instrumentDescriptor,
  isInWrittenRange,
  isInstrumentId,
  normaliseInstrumentId,
  soundingMidi,
  supportsExercise,
} from '../instrumentRegistry';

describe('instrument registry', () => {
  it('derives ids from the registry keys, in registry order', () => {
    expect(INSTRUMENT_IDS).toEqual(['piano', 'clarinetBb']);
  });

  it('recognises known ids and rejects everything else', () => {
    expect(isInstrumentId('piano')).toBe(true);
    expect(isInstrumentId('clarinetBb')).toBe(true);
    expect(isInstrumentId('trumpet')).toBe(false);
    expect(isInstrumentId(undefined)).toBe(false);
    expect(isInstrumentId(null)).toBe(false);
    expect(isInstrumentId(7)).toBe(false);
    // Guards against `hasOwnProperty` on the prototype chain answering for us.
    expect(isInstrumentId('toString')).toBe(false);
  });

  it('gives every instrument a sample for its whole written range', () => {
    for (const id of INSTRUMENT_IDS) {
      const d = INSTRUMENT_REGISTRY[id];
      expect(d.sampleNotes.length).toBeGreaterThan(0);
      expect(d.writtenRange.lowMidi).toBeLessThan(d.writtenRange.highMidi);
      expect(d.exercises.length).toBeGreaterThan(0);
    }
  });
});

describe('normaliseInstrumentId', () => {
  it('passes known ids through', () => {
    expect(normaliseInstrumentId('clarinetBb')).toBe('clarinetBb');
  });

  it('treats anything stored before instruments existed as piano', () => {
    // The whole point of the normalise-on-read contract: no migration, and no
    // consumer past the repository has to handle a missing instrument.
    expect(normaliseInstrumentId(undefined)).toBe(DEFAULT_INSTRUMENT);
    expect(normaliseInstrumentId(null)).toBe('piano');
    expect(normaliseInstrumentId('')).toBe('piano');
    expect(normaliseInstrumentId({ id: 'clarinetBb' })).toBe('piano');
  });
});

describe('instrumentDescriptor', () => {
  it('tolerates unknown input from disk', () => {
    expect(instrumentDescriptor('trumpet')).toBeNull();
    expect(instrumentDescriptor('piano')).toBe(INSTRUMENT_REGISTRY.piano);
  });
});

describe('exercise availability', () => {
  it('gives the piano every exercise', () => {
    expect(supportsExercise('piano', 'hanon')).toBe(true);
    expect(supportsExercise('piano', 'drill45')).toBe(true);
  });

  it('gives the clarinet only the monophonic exercises it is meant to have', () => {
    expect(exercisesFor('clarinetBb')).toEqual(['scales', 'chromatic']);
    // drill45 is two simultaneous voices per hand — structurally impossible.
    expect(supportsExercise('clarinetBb', 'drill45')).toBe(false);
    // Hanon would render as one line, but trains piano fingers and prints piano
    // fingerings. Excluded on purpose, not by accident.
    expect(supportsExercise('clarinetBb', 'hanon')).toBe(false);
  });
});

describe('soundingMidi', () => {
  it('leaves a concert-pitch instrument alone', () => {
    expect(soundingMidi(60, 'piano')).toBe(60);
  });

  it('sounds a Bb clarinet a major 2nd below what it reads', () => {
    // Written C4 (60) sounds Bb3 (58) — this is what lets the app play in unison
    // with someone reading the same notes off the same screen.
    expect(soundingMidi(60, 'clarinetBb')).toBe(58);
  });
});

describe('defaultBaseTranspose', () => {
  it('leaves an already-transposed clarinet part alone', () => {
    // The part carries <transpose>, so the engraver already wrote it in the key the
    // clarinettist reads. Moving it again would be a whole tone wrong.
    expect(defaultBaseTranspose('clarinetBb', -2)).toBe(0);
  });

  it('raises a concert-pitch score into the clarinet’s reading key', () => {
    expect(defaultBaseTranspose('clarinetBb', null)).toBe(2);
  });

  it('distinguishes an explicit <transpose> of 0 from no element at all', () => {
    // An explicit 0 is still the engraver declaring the pitch relationship; only a
    // missing element means "nobody said, assume concert pitch".
    expect(defaultBaseTranspose('clarinetBb', 0)).toBe(0);
    expect(defaultBaseTranspose('clarinetBb', null)).toBe(2);
  });

  it('is always 0 for the piano, whatever the file says', () => {
    expect(defaultBaseTranspose('piano', null)).toBe(0);
    expect(defaultBaseTranspose('piano', -2)).toBe(0);
  });
});

describe('isInWrittenRange', () => {
  it('bounds the clarinet at written E3 and C7 inclusive', () => {
    expect(isInWrittenRange('clarinetBb', 52)).toBe(true); // E3
    expect(isInWrittenRange('clarinetBb', 96)).toBe(true); // C7
    expect(isInWrittenRange('clarinetBb', 51)).toBe(false);
    expect(isInWrittenRange('clarinetBb', 97)).toBe(false);
  });

  it('bounds the piano at the standard 88', () => {
    expect(isInWrittenRange('piano', 21)).toBe(true); // A0
    expect(isInWrittenRange('piano', 108)).toBe(true); // C8
    expect(isInWrittenRange('piano', 20)).toBe(false);
  });
});

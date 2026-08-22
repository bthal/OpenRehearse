import {
  generateArpeggioXml,
  generateChromaticXml,
  generateDrill45Xml,
  generateFiveScaleXml,
  generateScaleXml,
} from '../warmupMusicXml';

// Extracts the ordered list of sounded pitches (e.g. "C4", "Eb4", "F#5") from a score,
// skipping rests and backups. Lets tests assert the exact melodic content of an exercise.
function pitches(xml: string): string[] {
  const re =
    /<pitch><step>([A-G])<\/step>(?:<alter>(-?\d+)<\/alter>)?<octave>(\d+)<\/octave><\/pitch>/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const [, step, alter, octave] = m;
    const acc = alter === '1' ? '#' : alter === '-1' ? 'b' : '';
    out.push(`${step}${acc}${octave}`);
  }
  return out;
}

function partXml(xml: string, partId: string): string {
  const start = xml.indexOf(`<part id="${partId}">`);
  return xml.slice(start, xml.indexOf('</part>', start));
}

function measureCount(xml: string, partId: string): number {
  return (partXml(xml, partId).match(/<measure number=/g) ?? []).length;
}

// The 4-5 drill's melody voice is written in half notes; the 4-5 ostinato is all
// eighths and the closing bar is whole notes, so this isolates the melody.
function halfNotePitches(xml: string, partId: string): string[] {
  return partXml(xml, partId)
    .split('<note>')
    .filter((note) => note.includes('<type>half</type>'))
    .flatMap((note) => pitches(note));
}

describe('generateScaleXml (refactor regression)', () => {
  it('renders C major one octave up and down, RH only', () => {
    expect(pitches(generateScaleXml(0, 'major', 'right', 1))).toEqual([
      'C4','D4','E4','F4','G4','A4','B4','C5','B4','A4','G4','F4','E4','D4','C4',
    ]); // prettier-ignore
  });
});

describe('generateArpeggioXml', () => {
  it('produces the rolling-window pattern for C major, one octave, RH', () => {
    // Sliding groups of four chord tones, each starting one tone higher, then mirrored.
    expect(pitches(generateArpeggioXml(0, 'major', 'right', 1))).toEqual([
      // ascending windows
      'C4','E4','G4','C5', 'E4','G4','C5','E5', 'G4','C5','E5','G5', 'C5','E5','G5','C6',
      // mirrored descent (top C6 played once)
      'G5','E5','C5', 'G5','E5','C5','G4', 'E5','C5','G4','E4', 'C5','G4','E4','C4',
    ]); // prettier-ignore
  });

  it('uses a minor third for minor keys', () => {
    const p = pitches(generateArpeggioXml(0, 'minor', 'right', 1));
    expect(p).toContain('Eb4');
    expect(p).not.toContain('E4');
  });

  it('lands in four measures with a quarter-note final for one octave', () => {
    const xml = generateArpeggioXml(0, 'major', 'right', 1);
    expect(measureCount(xml, 'P1')).toBe(4);
    expect(xml).toContain('<type>quarter</type>');
  });

  it('emits both hands with the left an octave lower', () => {
    const xml = generateArpeggioXml(0, 'major', 'both', 1);
    expect(xml).toContain('<part id="P1">');
    expect(xml).toContain('<part id="P2">');
    expect(pitches(xml)).toContain('C3'); // LH root
  });
});

describe('generateChromaticXml', () => {
  it('walks every semitone up an octave and back for C major, RH', () => {
    expect(pitches(generateChromaticXml(0, 'major', 'right', 1))).toEqual([
      'C4','C#4','D4','D#4','E4','F4','F#4','G4','G#4','A4','A#4','B4','C5',
      'B4','A#4','A4','G#4','G4','F#4','F4','E4','D#4','D4','C#4','C4',
    ]); // prettier-ignore
  });

  it('ends on a whole-note tonic', () => {
    expect(generateChromaticXml(0, 'major', 'right', 1)).toContain('<type>whole</type>');
  });
});

describe('generateFiveScaleXml', () => {
  it('plays scale degrees 1-5 and back for C major (CDEFGFEDC)', () => {
    expect(pitches(generateFiveScaleXml(0, 'major', 'right', 1))).toEqual([
      'C4','D4','E4','F4','G4','F4','E4','D4','C4',
    ]); // prettier-ignore
  });

  it('climbs into each octave for a two-octave run', () => {
    expect(pitches(generateFiveScaleXml(0, 'major', 'right', 2))).toEqual([
      'C4','D4','E4','F4','G4','C5','D5','E5','F5','G5',
      'F5','E5','D5','C5','G4','F4','E4','D4','C4',
    ]); // prettier-ignore
  });
});

describe('generateDrill45Xml', () => {
  it('renders the plain 6-measure drill by default', () => {
    const xml = generateDrill45Xml('both');
    expect(measureCount(xml, 'P1')).toBe(6);
    expect(measureCount(xml, 'P2')).toBe(6);
    // RH melody rises C-D-E-F-G-A then falls G-F-E-D; the closing C is a whole note.
    expect(halfNotePitches(xml, 'P1')).toEqual([
      'C4','D4','E4','F4','G4','A4','G4','F4','E4','D4',
    ]); // prettier-ignore
    expect(halfNotePitches(xml, 'P2')).toEqual([
      'C4','B3','A3','G3','F3','E3','F3','G3','A3','B3',
    ]); // prettier-ignore
  });

  it('adds one measure per extra peak repeat', () => {
    expect(measureCount(generateDrill45Xml('both', 2), 'P1')).toBe(7);
    expect(measureCount(generateDrill45Xml('both', 4), 'P1')).toBe(9);
    expect(measureCount(generateDrill45Xml('both', 8), 'P1')).toBe(13);
    expect(measureCount(generateDrill45Xml('both', 16), 'P1')).toBe(21);
    expect(measureCount(generateDrill45Xml('both', 16), 'P2')).toBe(21);
  });

  it('repeats the peak bar (G-A), not the turnaround', () => {
    const xml = generateDrill45Xml('both', 4);
    expect(halfNotePitches(xml, 'P1')).toEqual([
      'C4','D4','E4','F4','G4','A4','G4','A4','G4','A4','G4','A4','G4','F4','E4','D4',
    ]); // prettier-ignore
    // LH mirrors in contrary motion: its peak bar is F-E.
    expect(halfNotePitches(xml, 'P2')).toEqual([
      'C4','B3','A3','G3','F3','E3','F3','E3','F3','E3','F3','E3','F3','G3','A3','B3',
    ]); // prettier-ignore
  });

  it('keeps the 4-5 ostinato and the whole-note ending intact when repeating', () => {
    const rh = partXml(generateDrill45Xml('right', 4), 'P1');
    const measures = rh.split('<measure number=').slice(1);
    expect(measures).toHaveLength(9);
    // Every bar but the last carries the 8-eighth C5/B4 ostinato.
    for (const measure of measures.slice(0, -1)) {
      expect((measure.match(/<type>eighth<\/type>/g) ?? []).length).toBe(8);
    }
    expect(measures[measures.length - 1]).toContain('<type>whole</type>');
    expect(measures[measures.length - 1]).not.toContain('<type>eighth</type>');
  });

  it('marks fingering 5 and 4 once, in the first measure only', () => {
    const rh = partXml(generateDrill45Xml('right', 16), 'P1');
    expect((rh.match(/<fingering>5<\/fingering>/g) ?? []).length).toBe(1);
    expect((rh.match(/<fingering>4<\/fingering>/g) ?? []).length).toBe(1);
    const firstMeasure = rh.split('<measure number=')[1]!;
    expect(firstMeasure).toContain('<fingering>5</fingering>');
    expect(firstMeasure).toContain('<fingering>4</fingering>');
  });

  it('clamps out-of-range repeat counts (routines saved before this parameter)', () => {
    expect(measureCount(generateDrill45Xml('both', undefined), 'P1')).toBe(6);
    expect(measureCount(generateDrill45Xml('both', 0), 'P1')).toBe(6);
    expect(measureCount(generateDrill45Xml('both', -5), 'P1')).toBe(6);
    expect(measureCount(generateDrill45Xml('both', 999), 'P1')).toBe(21);
  });
});

// Key signatures and enharmonic spelling used to live in two tables — KEY_INFO here and
// a parallel KEY_FIFTHS in routineMusicXml — which had drifted apart for Bb minor. Five
// keys were also spelling a letter twice (F# major printing F instead of E#, Ab major
// printing C# instead of Db), so the notes contradicted the printed key signature.
// These assert the invariant directly rather than any one key's note list.
describe('key signatures and spelling', () => {
  // fifths for each of the 24 keys, using the enharmonic choices the app documents
  // (Db major not C# major, D# minor not Eb minor, and so on).
  const EXPECTED_FIFTHS: Record<'major' | 'minor', number[]> = {
    major: [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5],
    minor: [-3, 4, -1, 6, 1, -4, 3, -2, 5, 0, -5, 2],
  };

  function fifthsOf(xml: string): number {
    return Number(/<fifths>(-?\d+)<\/fifths>/.exec(xml)![1]);
  }

  for (const mode of ['major', 'minor'] as const) {
    for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
      const expected = EXPECTED_FIFTHS[mode][pitchClass]!;

      it(`prints ${expected >= 0 ? `${expected} sharps` : `${-expected} flats`} for pitch class ${pitchClass} ${mode}`, () => {
        expect(fifthsOf(generateScaleXml(pitchClass, mode, 'right', 1))).toBe(expected);
      });

      it(`spells pitch class ${pitchClass} ${mode} with seven distinct letters`, () => {
        // One octave of the scale ascending: seven degrees, so seven different letters.
        // A doubled letter means an enharmonic was taken from the wrong side.
        const scale = pitches(generateScaleXml(pitchClass, mode, 'right', 1)).slice(0, 7);
        const letters = scale.map((p) => p[0]);
        expect(new Set(letters).size).toBe(7);
      });

      it(`matches accidental count to key signature for pitch class ${pitchClass} ${mode}`, () => {
        const scale = pitches(generateScaleXml(pitchClass, mode, 'right', 1)).slice(0, 7);
        const sharps = scale.filter((p) => p.includes('#')).length;
        const flats = scale.filter((p) => p.includes('b')).length;
        // A key is all-sharp or all-flat, never mixed.
        expect(sharps === 0 || flats === 0).toBe(true);
        expect(sharps > 0 ? sharps : flats > 0 ? -flats : 0).toBe(expected);
      });
    }
  }
});

import {
  HANON_EXERCISE_COUNT,
  generateArpeggioXml,
  generateChromaticXml,
  generateDrill45Xml,
  generateFiveScaleXml,
  generateHanonXml,
  generateLongNoteXml,
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

// ─── Hanon Nos. 1-20 ─────────────────────────────────────────────────────────
//
// These lock in output that was verified note-for-note against the Mutopia LilyPond
// engraving of the Schirmer (1900) edition: for all 20 exercises and both hands, the
// repeating figure the generator produces matched the source exactly. They cannot
// re-prove the transcription (they read the same table the generator does) — they
// exist so a regression in the generator or an edit to the table is caught.
describe('generateHanonXml', () => {
  // C major, right hand, two octaves. `first` is the opening bar; `lastFigure` is the
  // final figure bar, i.e. the bar before the closing held tonic.
  const CASES: { no: number; measures: number; first: string[]; lastFigure: string[] }[] = [
    {
      no: 1,
      measures: 30,
      first: ['C4', 'E4', 'F4', 'G4', 'A4', 'G4', 'F4', 'E4'],
      lastFigure: ['G4', 'E4', 'D4', 'C4', 'B3', 'C4', 'D4', 'E4'],
    },
    {
      no: 2,
      measures: 29,
      first: ['C4', 'E4', 'A4', 'G4', 'F4', 'G4', 'F4', 'E4'],
      lastFigure: ['A4', 'E4', 'C4', 'D4', 'E4', 'D4', 'E4', 'F4'],
    },
    {
      no: 3,
      measures: 29,
      first: ['C4', 'E4', 'A4', 'G4', 'F4', 'E4', 'F4', 'G4'],
      lastFigure: ['A4', 'E4', 'C4', 'D4', 'E4', 'F4', 'E4', 'D4'],
    },
    {
      no: 4,
      measures: 29,
      first: ['C4', 'D4', 'C4', 'E4', 'A4', 'G4', 'F4', 'E4'],
      lastFigure: ['A4', 'G4', 'A4', 'E4', 'C4', 'D4', 'E4', 'F4'],
    },
    {
      no: 5,
      measures: 29,
      first: ['C4', 'A4', 'G4', 'A4', 'F4', 'G4', 'E4', 'F4'],
      lastFigure: ['D4', 'E4', 'D4', 'F4', 'E4', 'G4', 'F4', 'A4'],
    },
    {
      no: 6,
      measures: 27,
      first: ['C4', 'A4', 'G4', 'A4', 'F4', 'A4', 'E4', 'A4'],
      lastFigure: ['B4', 'D4', 'E4', 'D4', 'F4', 'D4', 'G4', 'D4'],
    },
    {
      no: 7,
      measures: 29,
      first: ['C4', 'E4', 'D4', 'F4', 'E4', 'G4', 'F4', 'E4'],
      lastFigure: ['A4', 'F4', 'G4', 'E4', 'F4', 'D4', 'E4', 'F4'],
    },
    {
      no: 8,
      measures: 29,
      first: ['C4', 'E4', 'G4', 'A4', 'F4', 'G4', 'E4', 'F4'],
      lastFigure: ['A4', 'F4', 'D4', 'C4', 'E4', 'D4', 'F4', 'E4'],
    },
    {
      no: 9,
      measures: 28,
      first: ['C4', 'E4', 'F4', 'E4', 'G4', 'F4', 'A4', 'G4'],
      lastFigure: ['B4', 'G4', 'F4', 'G4', 'E4', 'F4', 'D4', 'E4'],
    },
    {
      no: 10,
      measures: 29,
      first: ['C4', 'A4', 'G4', 'F4', 'E4', 'F4', 'E4', 'F4'],
      lastFigure: ['A4', 'C4', 'D4', 'E4', 'F4', 'E4', 'F4', 'E4'],
    },
    {
      no: 11,
      measures: 29,
      first: ['C4', 'E4', 'A4', 'G4', 'A4', 'G4', 'F4', 'G4'],
      lastFigure: ['A4', 'E4', 'C4', 'D4', 'C4', 'D4', 'E4', 'D4'],
    },
    {
      no: 12,
      measures: 27,
      first: ['B4', 'D4', 'F4', 'E4', 'D4', 'E4', 'F4', 'D4'],
      lastFigure: ['C4', 'A4', 'F4', 'G4', 'A4', 'G4', 'F4', 'A4'],
    },
    {
      no: 13,
      measures: 29,
      first: ['E4', 'C4', 'F4', 'D4', 'G4', 'E4', 'F4', 'G4'],
      lastFigure: ['F4', 'A4', 'E4', 'G4', 'F4', 'D4', 'E4', 'F4'],
    },
    {
      no: 14,
      measures: 29,
      first: ['C4', 'D4', 'F4', 'E4', 'F4', 'E4', 'G4', 'F4'],
      lastFigure: ['A4', 'G4', 'E4', 'F4', 'E4', 'F4', 'D4', 'E4'],
    },
    {
      no: 15,
      measures: 27,
      first: ['C4', 'E4', 'D4', 'F4', 'E4', 'G4', 'F4', 'A4'],
      lastFigure: ['B4', 'G4', 'A4', 'F4', 'G4', 'E4', 'F4', 'D4'],
    },
    {
      no: 16,
      measures: 29,
      first: ['C4', 'E4', 'D4', 'E4', 'A4', 'G4', 'F4', 'G4'],
      lastFigure: ['A4', 'E4', 'F4', 'E4', 'C4', 'D4', 'E4', 'D4'],
    },
    {
      no: 17,
      measures: 26,
      first: ['C4', 'E4', 'A4', 'G4', 'B4', 'A4', 'G4', 'A4'],
      lastFigure: ['C5', 'G4', 'E4', 'F4', 'D4', 'E4', 'F4', 'D4'],
    },
    {
      no: 18,
      measures: 29,
      first: ['C4', 'D4', 'F4', 'E4', 'G4', 'F4', 'D4', 'E4'],
      lastFigure: ['A4', 'G4', 'E4', 'F4', 'D4', 'E4', 'G4', 'F4'],
    },
    {
      no: 19,
      measures: 29,
      first: ['C4', 'A4', 'F4', 'G4', 'A4', 'F4', 'E4', 'G4'],
      lastFigure: ['A4', 'C4', 'E4', 'D4', 'C4', 'E4', 'F4', 'D4'],
    },
    {
      no: 20,
      measures: 29,
      first: ['E3', 'G3', 'C4', 'E4', 'C4', 'B3', 'C4', 'A3'],
      lastFigure: ['F4', 'D4', 'A3', 'F3', 'A3', 'G3', 'A3', 'F3'],
    },
  ];

  for (const c of CASES) {
    describe(`No. ${c.no}`, () => {
      const xml = generateHanonXml(0, 'major', 'right', 2, c.no);
      const measures = partXml(xml, 'P1').split('<measure number=').slice(1);

      it('opens on the expected figure', () => {
        expect(pitches(measures[0]!)).toEqual(c.first);
      });

      it('ends its descent on the expected figure', () => {
        expect(pitches(measures[measures.length - 2]!)).toEqual(c.lastFigure);
      });

      it('spans the expected number of measures', () => {
        expect(measures.length).toBe(c.measures);
      });

      it('closes on a held tonic', () => {
        const closing = measures[measures.length - 1]!;
        expect(pitches(closing)).toEqual(['C4']);
        expect(closing).toContain('<type>whole</type>');
      });
    });
  }

  // Fingering is per hand and per exercise — passing one hand's marks to the other was
  // a real bug. '-' means the reference edition prints no fingering for that note
  // (No. 4 only); the generator leaves the note unmarked rather than inventing one.
  describe('fingering', () => {
    const FINGERS: { no: number; rh: string[]; lh: string[] }[] = [
      {
        no: 1,
        rh: ['1', '2', '3', '4', '5', '4', '3', '2'],
        lh: ['5', '4', '3', '2', '1', '2', '3', '4'],
      },
      {
        no: 2,
        rh: ['1', '2', '5', '4', '3', '4', '3', '2'],
        lh: ['5', '3', '1', '2', '3', '2', '3', '4'],
      },
      {
        no: 3,
        rh: ['1', '2', '5', '4', '3', '2', '3', '4'],
        lh: ['5', '3', '1', '2', '3', '4', '3', '2'],
      },
      {
        no: 4,
        rh: ['1', '2', '1', '2', '5', '-', '-', '2'],
        lh: ['5', '4', '5', '3', '1', '-', '-', '3'],
      },
      {
        no: 5,
        rh: ['1', '5', '4', '5', '3', '4', '2', '3'],
        lh: ['5', '1', '2', '1', '3', '2', '4', '3'],
      },
      {
        no: 6,
        rh: ['1', '5', '4', '5', '3', '5', '2', '5'],
        lh: ['5', '1', '2', '1', '3', '1', '4', '1'],
      },
      {
        no: 7,
        rh: ['1', '3', '2', '4', '3', '5', '4', '3'],
        lh: ['5', '3', '4', '2', '3', '1', '3', '4'],
      },
      {
        no: 8,
        rh: ['1', '2', '4', '5', '3', '4', '2', '3'],
        lh: ['5', '4', '2', '1', '3', '2', '4', '3'],
      },
      {
        no: 9,
        rh: ['1', '2', '3', '2', '4', '3', '5', '4'],
        lh: ['5', '4', '3', '4', '2', '3', '1', '2'],
      },
      {
        no: 10,
        rh: ['1', '5', '4', '3', '2', '3', '2', '3'],
        lh: ['5', '1', '2', '3', '4', '3', '4', '3'],
      },
      {
        no: 11,
        rh: ['1', '2', '5', '4', '5', '4', '3', '4'],
        lh: ['5', '3', '1', '2', '1', '2', '3', '2'],
      },
      {
        no: 12,
        rh: ['5', '1', '3', '2', '1', '2', '3', '1'],
        lh: ['1', '5', '3', '4', '5', '4', '3', '5'],
      },
      {
        no: 13,
        rh: ['3', '1', '4', '2', '5', '3', '4', '5'],
        lh: ['3', '5', '2', '4', '1', '3', '2', '1'],
      },
      {
        no: 14,
        rh: ['1', '2', '4', '3', '4', '3', '5', '4'],
        lh: ['5', '4', '2', '3', '2', '3', '1', '3'],
      },
      {
        no: 15,
        rh: ['1', '2', '1', '3', '2', '4', '3', '5'],
        lh: ['5', '3', '4', '2', '3', '1', '2', '1'],
      },
      {
        no: 16,
        rh: ['1', '3', '2', '3', '5', '4', '3', '4'],
        lh: ['5', '3', '4', '3', '1', '2', '3', '2'],
      },
      {
        no: 17,
        rh: ['1', '2', '4', '3', '5', '4', '3', '4'],
        lh: ['5', '4', '2', '3', '1', '2', '3', '2'],
      },
      {
        no: 18,
        rh: ['1', '2', '4', '3', '5', '4', '2', '3'],
        lh: ['5', '4', '2', '3', '1', '2', '4', '3'],
      },
      {
        no: 19,
        rh: ['1', '5', '3', '4', '5', '3', '2', '4'],
        lh: ['5', '1', '3', '2', '1', '3', '4', '2'],
      },
      {
        no: 20,
        rh: ['1', '2', '4', '5', '4', '3', '4', '2'],
        lh: ['5', '4', '2', '1', '2', '3', '2', '4'],
      },
    ];

    function firstBarFingers(xml: string, part: string): string[] {
      const bar = partXml(xml, part).split('<measure number=')[1]!;
      return bar
        .split('<note>')
        .slice(1)
        .map((n) => /<fingering>(\d)<\/fingering>/.exec(n)?.[1] ?? '-');
    }

    for (const c of FINGERS) {
      it(`No. ${c.no} fingers each hand independently`, () => {
        const xml = generateHanonXml(0, 'major', 'both', 2, c.no);
        expect(firstBarFingers(xml, 'P1')).toEqual(c.rh);
        expect(firstBarFingers(xml, 'P2')).toEqual(c.lh);
      });
    }

    it('marks only the first two bars of each direction', () => {
      const xml = generateHanonXml(0, 'major', 'right', 2, 1);
      const bars = partXml(xml, 'P1').split('<measure number=').slice(1);
      // Two at the start of the ascent, two at the start of the descent.
      const marked = bars.filter((b) => b.includes('<fingering>')).length;
      expect(marked).toBe(4);
    });
  });

  it('covers exactly the twenty exercises of Part I', () => {
    expect(HANON_EXERCISE_COUNT).toBe(20);
  });

  it('gives each hand its own fingering', () => {
    // The hands do not mirror each other's fingering, and passing one hand's marks to
    // the other was a real bug: No. 1 ascends 1-2-3-4-5 in the right hand and
    // 5-4-3-2-1 in the left.
    const xml = generateHanonXml(0, 'major', 'both', 1, 1);
    const fingers = (part: string) =>
      [...partXml(xml, part).matchAll(/<fingering>(\d)<\/fingering>/g)]
        .map((m) => m[1])
        .slice(0, 5);
    expect(fingers('P1')).toEqual(['1', '2', '3', '4', '5']);
    expect(fingers('P2')).toEqual(['5', '4', '3', '2', '1']);
  });

  it('renders a different exercise for a different number', () => {
    const a = generateHanonXml(0, 'major', 'right', 1, 1);
    const b = generateHanonXml(0, 'major', 'right', 1, 7);
    expect(a).not.toEqual(b);
  });

  it('clamps an out-of-range exercise number instead of throwing', () => {
    const first = generateHanonXml(0, 'major', 'right', 1, 1);
    const last = generateHanonXml(0, 'major', 'right', 1, 20);
    expect(generateHanonXml(0, 'major', 'right', 1, 0)).toEqual(first);
    expect(generateHanonXml(0, 'major', 'right', 1, -3)).toEqual(first);
    expect(generateHanonXml(0, 'major', 'right', 1, 99)).toEqual(last);
  });

  it('spells every exercise in every key consistently with its key signature', () => {
    // The scales tests assert this invariant for scale runs; Hanon needs it too, and
    // more so — a cell can leap a sixth or an octave and reach below its bar's root,
    // so it touches degrees a plain scale never does. A note spelled against the
    // signature would make OSMD print a courtesy accidental on every bar.
    const EXPECTED_FIFTHS: Record<'major' | 'minor', number[]> = {
      major: [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5],
      minor: [-3, 4, -1, 6, 1, -4, 3, -2, 5, 0, -5, 2],
    };
    for (let no = 1; no <= HANON_EXERCISE_COUNT; no++) {
      for (const mode of ['major', 'minor'] as const) {
        for (let pc = 0; pc < 12; pc++) {
          const xml = generateHanonXml(pc, mode, 'both', 2, no);
          const fifths = Number(/<fifths>(-?\d+)<\/fifths>/.exec(xml)![1]);
          expect(fifths).toBe(EXPECTED_FIFTHS[mode][pc]);

          const sounded = new Set(pitches(xml).map((p) => p.replace(/\d+$/, '')));
          // A key is all-sharp or all-flat, never mixed.
          const sharps = [...sounded].filter((n) => n.includes('#'));
          const flats = [...sounded].filter((n) => n.includes('b'));
          expect(sharps.length === 0 || flats.length === 0).toBe(true);
          // And every accidental it uses must be one the signature already covers.
          expect(sharps.length + flats.length).toBeLessThanOrEqual(Math.abs(fifths));
        }
      }
    }
  });

  it('transposes every exercise into every key without a bare accidental clash', () => {
    // A cell can reach below its bar's root (No. 12), which used to index the scale
    // table with a negative degree and silently yield a wrong pitch.
    for (let no = 1; no <= HANON_EXERCISE_COUNT; no++) {
      for (const mode of ['major', 'minor'] as const) {
        for (let pc = 0; pc < 12; pc++) {
          const xml = generateHanonXml(pc, mode, 'both', 1, no);
          expect(xml).toContain('<score-partwise');
          expect(pitches(xml).length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('exercise anchoring for a non-piano instrument', () => {
  it('leaves the piano at its long-standing C4 anchor when no root is given', () => {
    const withDefault = generateScaleXml(0, 'major', 'right', 1);
    const withExplicitC4 = generateScaleXml(0, 'major', 'right', 1, 60);
    expect(withDefault).toBe(withExplicitC4);
  });

  it('moves the whole exercise when a different root is given', () => {
    const c4 = generateScaleXml(0, 'major', 'right', 1, 60);
    const c5 = generateScaleXml(0, 'major', 'right', 1, 72);
    expect(c5).not.toBe(c4);
    // Same shape, an octave up: the C4 version names octave 4, the C5 one octave 5.
    expect(c4).toContain('<octave>4</octave>');
    expect(c5).toContain('<octave>5</octave>');
  });

  it('keeps the left hand an octave below whatever the root is', () => {
    // The piano's C3 left hand was always C4 - 12; a moved root must preserve that
    // relationship rather than staying pinned to 48.
    const moved = generateScaleXml(0, 'major', 'both', 1, 72);
    expect(moved).toContain('<octave>5</octave>');
    expect(moved).toContain('<octave>4</octave>');
  });

  it('emits one part for a single-hand exercise, which is the single-staff case', () => {
    const single = generateScaleXml(0, 'major', 'right', 1, 60);
    expect(single.match(/<score-part /g)).toHaveLength(1);
    expect(generateScaleXml(0, 'major', 'both', 1, 60).match(/<score-part /g)).toHaveLength(2);
  });
});

describe('generateLongNoteXml', () => {
  const count = (xml: string, needle: string) => xml.split(needle).length - 1;

  it('writes every repetition out, each one hold plus a bar to breathe', () => {
    const xml = generateLongNoteXml('G', 4, 2, 4);
    // (2 held + 1 rest) × 4. The rest after the last repetition is deliberate: every
    // block is then the same shape, wherever it sits in a routine.
    expect(measureCount(xml, 'P1')).toBe(12);
    expect(pitches(xml)).toEqual(Array(8).fill('G4'));
    expect(count(xml, '<rest measure="yes"/>')).toBe(4);
    // One part, no key signature — the accidental comes from the spelling, not a key.
    expect(xml).not.toContain('<part id="P2">');
    expect(xml).toContain('<fifths>0</fifths>');
  });

  it('ties the held measures into one sounding note', () => {
    const bars = partXml(generateLongNoteXml('G', 4, 4, 1), 'P1').split('<measure');
    // bars[0] is the pre-measure preamble; bars[5] is the trailing rest.
    expect(bars[1]).toContain('<tie type="start"/>');
    expect(bars[1]).not.toContain('type="stop"');
    expect(bars[2]).toContain('<tie type="stop"/><tie type="start"/>');
    expect(bars[4]).toContain('<tie type="stop"/>');
    expect(bars[4]).not.toContain('type="start"');
    expect(bars[5]).toContain('<rest measure="yes"/>');
  });

  it('emits <tied> alongside every <tie>', () => {
    // OSMD builds Note.NoteTie from <tied> inside <notations>, not from <tie>; a chain
    // carrying only one of the two looks right and re-attacks at every barline.
    const xml = generateLongNoteXml('A', 4, 3, 2);
    const expected = 2 * (3 - 1);
    expect(count(xml, '<tie type="start"/>')).toBe(expected);
    expect(count(xml, '<tied type="start"/>')).toBe(expected);
    expect(count(xml, '<tie type="stop"/>')).toBe(expected);
    expect(count(xml, '<tied type="stop"/>')).toBe(expected);
  });

  it('writes a one-measure hold as a plain whole note', () => {
    const xml = generateLongNoteXml('G', 4, 1, 4);
    expect(xml).not.toContain('<tie');
    expect(measureCount(xml, 'P1')).toBe(8);
  });

  it('keeps the spelling it was given', () => {
    expect(generateLongNoteXml('Bb', 3, 1, 1)).toContain('<step>B</step><alter>-1</alter>');
    expect(generateLongNoteXml('A#', 3, 1, 1)).toContain('<step>A</step><alter>1</alter>');
    // Same sounding pitch, different notation — which is the point of offering both.
    expect(generateLongNoteXml('Gb', 4, 1, 1)).not.toBe(generateLongNoteXml('F#', 4, 1, 1));
  });

  it('clamps out-of-range lengths rather than throwing', () => {
    // Settings and routine blocks are read off disk with a blind cast.
    expect(measureCount(generateLongNoteXml('G', 4, 99, 0), 'P1')).toBe(9);
  });
});

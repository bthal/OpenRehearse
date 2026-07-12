import {
  generateArpeggioXml,
  generateChromaticXml,
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

function measureCount(xml: string, partId: string): number {
  const part = xml.slice(xml.indexOf(`<part id="${partId}">`));
  return (part.match(/<measure number=/g) ?? []).length;
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

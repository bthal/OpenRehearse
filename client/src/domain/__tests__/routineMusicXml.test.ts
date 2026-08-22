import { estimateRoutineSeconds, generateRoutineXml } from '../routineMusicXml';
import type { Routine } from '../routine';

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'test-id',
    title: 'Test Routine',
    createdAt: '2026-01-01T00:00:00Z',
    blocks: [],
    ...overrides,
  };
}

function measureCount(xml: string, partId: string): number {
  const start = xml.indexOf(`<part id="${partId}">`);
  const part = xml.slice(start, xml.indexOf('</part>', start));
  return (part.match(/<measure number=/g) ?? []).length;
}

describe('generateRoutineXml', () => {
  it('produces valid XML declaration and root element', () => {
    const xml = generateRoutineXml(
      makeRoutine({
        blocks: [
          { type: 'hanon', pitchClass: 0, mode: 'major', hand: 'both', bpm: 60, octaves: 1 },
        ],
      }),
    );
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<score-partwise');
    expect(xml).toContain('</score-partwise>');
  });

  it('always emits both parts P1 and P2', () => {
    const xml = generateRoutineXml(
      makeRoutine({
        blocks: [
          { type: 'hanon', pitchClass: 0, mode: 'major', hand: 'right', bpm: 60, octaves: 1 },
        ],
      }),
    );
    expect(xml).toContain('<part id="P1">');
    expect(xml).toContain('<part id="P2">');
  });

  it('emits clef in first exercise block first measure', () => {
    const xml = generateRoutineXml(
      makeRoutine({
        blocks: [
          { type: 'scales', pitchClass: 0, mode: 'major', hand: 'both', bpm: 80, octaves: 1 },
        ],
      }),
    );
    expect(xml).toContain('<clef>');
    expect(xml).toContain('<sign>G</sign>');
    expect(xml).toContain('<sign>F</sign>');
  });

  it('labels arpeggio, chromatic, and five-finger blocks by key', () => {
    const xml = generateRoutineXml(
      makeRoutine({
        blocks: [
          { type: 'arpeggio', pitchClass: 0, mode: 'major', hand: 'both', bpm: 60, octaves: 1 },
          { type: 'chromatic', pitchClass: 7, mode: 'major', hand: 'both', bpm: 80, octaves: 1 },
          { type: 'fiveScale', pitchClass: 2, mode: 'minor', hand: 'both', bpm: 100, octaves: 1 },
        ],
      }),
    );
    expect(xml).toContain('<rehearsal>C Arpeggio</rehearsal>');
    expect(xml).toContain('<rehearsal>G Chromatic</rehearsal>');
    expect(xml).toContain('<rehearsal>Dm 5-Finger</rehearsal>');
  });

  it('includes rehearsal mark for each exercise block', () => {
    const xml = generateRoutineXml(
      makeRoutine({
        blocks: [
          { type: 'hanon', pitchClass: 0, mode: 'major', hand: 'both', bpm: 60, octaves: 1 },
          { type: 'scales', pitchClass: 7, mode: 'major', hand: 'both', bpm: 80, octaves: 1 },
        ],
      }),
    );
    expect(xml).toContain('<rehearsal>Hanon 1 in C</rehearsal>');
    expect(xml).toContain('<rehearsal>G Scale</rehearsal>');
  });

  it('includes sound tempo for each block', () => {
    const xml = generateRoutineXml(
      makeRoutine({
        blocks: [
          { type: 'hanon', pitchClass: 0, mode: 'major', hand: 'both', bpm: 60, octaves: 1 },
          { type: 'scales', pitchClass: 0, mode: 'major', hand: 'both', bpm: 120, octaves: 1 },
        ],
      }),
    );
    expect(xml).toContain('tempo="60"');
    expect(xml).toContain('tempo="120"');
  });

  it('emits pause rehearsal mark and uses next exercise BPM for tempo', () => {
    const xml = generateRoutineXml(
      makeRoutine({
        blocks: [
          { type: 'hanon', pitchClass: 0, mode: 'major', hand: 'both', bpm: 60, octaves: 1 },
          { type: 'pause', measures: 1 },
          { type: 'scales', pitchClass: 0, mode: 'major', hand: 'both', bpm: 100, octaves: 1 },
        ],
      }),
    );
    expect(xml).toContain('<rehearsal>Pause</rehearsal>');
    // Pause should use the next exercise's BPM (100), not the previous one (60)
    const pauseIdx = xml.indexOf('<rehearsal>Pause</rehearsal>');
    const scalesIdx = xml.indexOf('<rehearsal>C Scale</rehearsal>');
    // tempo="100" appears between Pause rehearsal and Scales rehearsal
    const between = xml.slice(pauseIdx, scalesIdx);
    expect(between).toContain('tempo="100"');
  });

  it('2-measure pause generates 2 measures', () => {
    const xml = generateRoutineXml(
      makeRoutine({
        blocks: [
          { type: 'hanon', pitchClass: 0, mode: 'major', hand: 'both', bpm: 60, octaves: 1 },
          { type: 'pause', measures: 2 },
          { type: 'scales', pitchClass: 0, mode: 'major', hand: 'both', bpm: 60, octaves: 1 },
        ],
      }),
    );
    // Rehearsal mark appears once per part (P1 + P2) = 2 total in full xml
    const pauseCount = (xml.match(/<rehearsal>Pause<\/rehearsal>/g) ?? []).length;
    expect(pauseCount).toBe(2);
    expect(xml).toContain('<rehearsal>Pause</rehearsal>');
  });

  it('emits clef in first exercise block even when preceded by a pause', () => {
    const xml = generateRoutineXml(
      makeRoutine({
        blocks: [
          { type: 'pause', measures: 1 },
          { type: 'hanon', pitchClass: 0, mode: 'major', hand: 'both', bpm: 60, octaves: 1 },
        ],
      }),
    );
    expect(xml).toContain('<clef>');
  });

  it('pause always uses 4/4 time signature', () => {
    const xml = generateRoutineXml(
      makeRoutine({
        blocks: [
          { type: 'hanon', pitchClass: 0, mode: 'major', hand: 'both', bpm: 60, octaves: 1 },
          { type: 'pause', measures: 1 },
          { type: 'scales', pitchClass: 0, mode: 'major', hand: 'both', bpm: 60, octaves: 1 },
        ],
      }),
    );
    expect(xml).toContain('<time><beats>4</beats><beat-type>4</beat-type></time>');
  });

  it('honours a drill45 block peak repeats setting', () => {
    const drill = (peakRepeats?: 1 | 2 | 4 | 8 | 16) =>
      makeRoutine({
        blocks: [
          {
            type: 'drill45' as const,
            pitchClass: 0,
            mode: 'major' as const,
            hand: 'both' as const,
            bpm: 60,
            octaves: 1 as const,
            peakRepeats,
          },
        ],
      });

    expect(measureCount(generateRoutineXml(drill()), 'P1')).toBe(6);
    expect(measureCount(generateRoutineXml(drill(2)), 'P1')).toBe(7);
    expect(measureCount(generateRoutineXml(drill(16)), 'P1')).toBe(21);
    // One extra 4/4 bar at 60 BPM = 4 seconds.
    expect(estimateRoutineSeconds(drill(2)) - estimateRoutineSeconds(drill())).toBeCloseTo(4);
  });
});

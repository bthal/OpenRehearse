import en from '../../i18n/locales/en.json';
import {
  estimateRoutineSeconds,
  computeRoutineTempoSchedule,
  generateRoutineXml,
} from '../routineMusicXml';
import type { ExerciseBlock, Routine } from '../routine';
import { WARMUP_KEYS, WARMUP_OCTAVES, type WarmUpHand, type WarmUpOctaves } from '../warmup';
import {
  DEFAULT_EXERCISE_PARAMS,
  WARM_UP_REGISTRY,
  WARM_UP_TYPES,
  hasParam,
  isWarmUpType,
  keyLabel,
  measureCount,
  warmUpDescriptor,
  type WarmUpType,
} from '../warmupRegistry';

function lookup(dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], en);
}

describe('warm-up registry', () => {
  it('derives the type list from the registry keys', () => {
    expect(WARM_UP_TYPES).toEqual(Object.keys(WARM_UP_REGISTRY));
    expect(WARM_UP_TYPES.length).toBeGreaterThan(0);
  });

  it('recognises its own types and rejects anything else', () => {
    for (const t of WARM_UP_TYPES) expect(isWarmUpType(t)).toBe(true);
    expect(isWarmUpType('nope')).toBe(false);
    // Guards against a key inherited from Object.prototype passing the check.
    expect(isWarmUpType('toString')).toBe(false);
    expect(warmUpDescriptor('nope')).toBeNull();
  });

  it('gives every exercise both label keys, and they exist in en.json', () => {
    for (const t of WARM_UP_TYPES) {
      const d = WARM_UP_REGISTRY[t];
      expect(typeof lookup(d.labelKey)).toBe('string');
      expect(typeof lookup(d.shortLabelKey)).toBe('string');
    }
  });

  it('declares at least one parameter per exercise, and only known ones', () => {
    const known = ['exercise', 'key', 'bpm', 'hand', 'octaves', 'peakRepeats'];
    for (const t of WARM_UP_TYPES) {
      const { params } = WARM_UP_REGISTRY[t];
      expect(params.length).toBeGreaterThan(0);
      for (const p of params) expect(known).toContain(p);
    }
  });

  it('only offers a key label to exercises that declare a key', () => {
    // drill45 is fixed in C major; nothing should invite the user to transpose it.
    expect(hasParam('drill45', 'key')).toBe(false);
    expect(hasParam('drill45', 'octaves')).toBe(false);
    expect(hasParam('drill45', 'peakRepeats')).toBe(true);
    expect(hasParam('hanon', 'key')).toBe(true);
    expect(hasParam('hanon', 'peakRepeats')).toBe(false);
  });

  it('labels keys, falling back to C for an unknown pitch class', () => {
    expect(keyLabel(0, 'major')).toBe('C');
    expect(keyLabel(7, 'minor')).toBe('Gm');
    expect(keyLabel(99, 'major')).toBe('C');
  });

  it('reports the same measure count the generator actually produces', () => {
    // The count is memoised; a stale or mis-keyed cache would silently desynchronise
    // the routine tempo schedule from the score it is meant to describe.
    const hands: WarmUpHand[] = ['both', 'right', 'left'];
    for (const t of WARM_UP_TYPES) {
      for (const k of [WARMUP_KEYS[0]!, WARMUP_KEYS[13]!, WARMUP_KEYS[21]!]) {
        for (const hand of hands) {
          for (const octaves of WARMUP_OCTAVES) {
            const p = {
              ...DEFAULT_EXERCISE_PARAMS,
              pitchClass: k.pitchClass,
              mode: k.mode,
              hand,
              octaves: octaves as WarmUpOctaves,
            };
            const { rh, lh } = WARM_UP_REGISTRY[t].measureNotes(p, false);
            expect(measureCount(t, p)).toBe((rh ?? lh)!.length);
          }
        }
      }
    }
  });

  it('varies the memoised count by peak repeats', () => {
    const one = measureCount('drill45', { ...DEFAULT_EXERCISE_PARAMS, peakRepeats: 1 });
    const eight = measureCount('drill45', { ...DEFAULT_EXERCISE_PARAMS, peakRepeats: 8 });
    expect(eight).toBeGreaterThan(one);
  });

  it('generates non-empty MusicXML for every exercise', () => {
    for (const t of WARM_UP_TYPES) {
      const xml = WARM_UP_REGISTRY[t].generateXml(DEFAULT_EXERCISE_PARAMS);
      expect(xml).toContain('<score-partwise');
      expect(xml).toContain('</score-partwise>');
    }
  });
});

describe('routines containing an unrecognised exercise', () => {
  // routines.json is read with a blind `as Routine[]` cast, so a block whose type this
  // build does not know is reachable — previously it reached `(rh ?? lh)!.length` and
  // threw, taking the whole routine down rather than the one block.
  const routine: Routine = {
    id: 'r',
    title: 'r',
    blocks: [
      {
        type: 'ghost' as WarmUpType,
        pitchClass: 0,
        mode: 'major',
        hand: 'both',
        bpm: 60,
        octaves: 1,
      },
      { type: 'hanon', pitchClass: 0, mode: 'major', hand: 'both', bpm: 60, octaves: 1 },
    ] as ExerciseBlock[],
    createdAt: 'x',
  };

  it('does not throw when estimating duration', () => {
    expect(() => estimateRoutineSeconds(routine)).not.toThrow();
  });

  it('does not throw when computing the tempo schedule', () => {
    expect(() => computeRoutineTempoSchedule(routine)).not.toThrow();
  });

  it('still renders the blocks it does understand', () => {
    const xml = generateRoutineXml(routine);
    expect(xml).toContain('<rehearsal>Hanon 1 in C</rehearsal>');
    expect(xml).toContain('</score-partwise>');
  });
});

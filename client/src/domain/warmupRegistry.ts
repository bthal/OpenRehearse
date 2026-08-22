/**
 * The single source of truth for what warm-up exercises exist and what each one is.
 *
 * Before this existed, the list of exercise types was written out by hand in a dozen
 * places — a union type, a store's slices, two switch statements, three nested
 * ternaries in the exercise screen, six copy-pasted dashboard rows — in five different
 * orders. Adding an exercise meant finding all of them. Now `WARM_UP_REGISTRY` is the
 * only enumeration: `WarmUpType` is derived from its keys, display order is its key
 * order, and every consumer reads what it needs off a descriptor.
 *
 * The `params` list is what removes the special-casing. An exercise declares which
 * parameters it takes; screens render controls for exactly those and nothing else.
 * That is why there is no `if (type === 'drill45')` left in the UI — drill45 simply
 * doesn't declare `key` or `octaves`, and does declare `peakRepeats`.
 */
import {
  DEFAULT_PEAK_REPEATS,
  DEFAULT_WARMUP_BPM,
  WARMUP_KEYS,
  type WarmUpBpm,
  type WarmUpHand,
  type WarmUpOctaves,
  type WarmUpPeakRepeats,
  type WarmUpScaleMode,
} from './warmup';
import {
  HANON_EXERCISE_COUNT,
  generateArpeggioXml,
  generateChromaticXml,
  generateDrill45Xml,
  generateFiveScaleXml,
  generateHanonXml,
  generateScaleXml,
  getArpeggioMeasureNotes,
  getChromaticMeasureNotes,
  getDrill45MeasureNotes,
  getFiveScaleMeasureNotes,
  getHanonMeasureNotes,
  getScaleMeasureNotes,
} from './warmupMusicXml';

/** A parameter an exercise can declare. `key` covers pitchClass + mode together. */
export type WarmUpParam = 'exercise' | 'key' | 'bpm' | 'hand' | 'octaves' | 'peakRepeats';

/**
 * The union of every exercise parameter. Exercises carry all fields regardless of
 * which they declare — the same shape `ExerciseBlock` already used — so that settings
 * and routine blocks have one shape and switching exercise never loses a value.
 * Fields not in an exercise's `params` are ignored by its generator.
 */
export interface ExerciseParams {
  /** Which numbered exercise within a family (Hanon 1-20). 1 for everything else. */
  exercise: number;
  pitchClass: number;
  mode: WarmUpScaleMode;
  hand: WarmUpHand;
  bpm: WarmUpBpm;
  octaves: WarmUpOctaves;
  peakRepeats: WarmUpPeakRepeats;
}

/**
 * The parameters that affect which notes exist.
 *
 * `bpm` is deliberately absent. Tempo is applied to the player at runtime
 * (`__rn_set_tempo`) and never baked into generated notes, so a tempo change must not
 * invalidate a generated score. Keeping it out of this type is what stops a caller
 * from re-generating — or a generator from depending on — something purely playback.
 */
export type ScoreParams = Omit<ExerciseParams, 'bpm'>;

export interface MeasureNotes {
  rh: string[][] | null;
  lh: string[][] | null;
}

export interface WarmUpDescriptor {
  /** Which parameter controls this exercise offers, in display order. */
  params: readonly WarmUpParam[];
  /** i18n key for the dashboard row — full/plural naming ("Scales"). */
  labelKey: string;
  /** i18n key for the routine editor — short/singular naming ("Scale"). */
  shortLabelKey: string;
  /**
   * Rehearsal mark printed into generated routine scores.
   *
   * English-only, unlike every other label, and deliberately so: this string is baked
   * into MusicXML by a pure domain function, and routing it through i18n would mean
   * threading a translator into the domain layer, which `AGENTS.md` forbids. It lives
   * here rather than in a switch statement so it is at least declared next to the
   * other labels. Revisit if a second locale ever lands.
   */
  rehearsalLabel: (p: ScoreParams, keyLabel: string) => string;
  /** Complete standalone MusicXML for the exercise screen. */
  generateXml: (p: ScoreParams) => string;
  /** Per-hand measures, for splicing into a multi-exercise routine score. */
  measureNotes: (p: ScoreParams, showFingering: boolean) => MeasureNotes;
}

/** Label shown for a key, e.g. `7`+`minor` → `Gm`. Falls back to `C` as before. */
export function keyLabel(pitchClass: number, mode: WarmUpScaleMode): string {
  return WARMUP_KEYS.find((k) => k.pitchClass === pitchClass && k.mode === mode)?.label ?? 'C';
}

// Every keyed exercise takes the same four parameters and the same generator shape;
// only the pair of functions differs.
const KEYED_PARAMS = ['key', 'bpm', 'hand', 'octaves'] as const;

export { HANON_EXERCISE_COUNT };

export const WARM_UP_REGISTRY = {
  hanon: {
    // The only family with a numbered exercise; 'exercise' leads so its control sits
    // first in the toolbar, before the key.
    params: ['exercise', 'key', 'bpm', 'hand', 'octaves'],
    labelKey: 'dashboard.hanon',
    shortLabelKey: 'routineEdit.addExerciseHanon',
    rehearsalLabel: (p, k) => `Hanon ${p.exercise} in ${k}`,
    generateXml: (p) => generateHanonXml(p.pitchClass, p.mode, p.hand, p.octaves, p.exercise),
    measureNotes: (p, fingering) =>
      getHanonMeasureNotes(p.pitchClass, p.mode, p.hand, p.octaves, fingering, p.exercise),
  },
  scales: {
    params: KEYED_PARAMS,
    labelKey: 'dashboard.scales',
    shortLabelKey: 'routineEdit.addExerciseScales',
    rehearsalLabel: (_p, k) => `${k} Scale`,
    generateXml: (p) => generateScaleXml(p.pitchClass, p.mode, p.hand, p.octaves),
    measureNotes: (p) => getScaleMeasureNotes(p.pitchClass, p.mode, p.hand, p.octaves),
  },
  arpeggio: {
    params: KEYED_PARAMS,
    labelKey: 'dashboard.arpeggio',
    shortLabelKey: 'routineEdit.addExerciseArpeggio',
    rehearsalLabel: (_p, k) => `${k} Arpeggio`,
    generateXml: (p) => generateArpeggioXml(p.pitchClass, p.mode, p.hand, p.octaves),
    measureNotes: (p) => getArpeggioMeasureNotes(p.pitchClass, p.mode, p.hand, p.octaves),
  },
  chromatic: {
    params: KEYED_PARAMS,
    labelKey: 'dashboard.chromatic',
    shortLabelKey: 'routineEdit.addExerciseChromatic',
    rehearsalLabel: (_p, k) => `${k} Chromatic`,
    generateXml: (p) => generateChromaticXml(p.pitchClass, p.mode, p.hand, p.octaves),
    measureNotes: (p) => getChromaticMeasureNotes(p.pitchClass, p.mode, p.hand, p.octaves),
  },
  fiveScale: {
    params: KEYED_PARAMS,
    labelKey: 'dashboard.fiveScale',
    shortLabelKey: 'routineEdit.addExerciseFiveScale',
    rehearsalLabel: (_p, k) => `${k} 5-Finger`,
    generateXml: (p) => generateFiveScaleXml(p.pitchClass, p.mode, p.hand, p.octaves),
    measureNotes: (p) => getFiveScaleMeasureNotes(p.pitchClass, p.mode, p.hand, p.octaves),
  },
  drill45: {
    // Fixed C major, one octave — hence no `key` and no `octaves`.
    params: ['bpm', 'hand', 'peakRepeats'],
    labelKey: 'dashboard.drill45',
    shortLabelKey: 'routineEdit.addExerciseDrill45',
    rehearsalLabel: () => '4-5 Drill',
    generateXml: (p) => generateDrill45Xml(p.hand, p.peakRepeats),
    measureNotes: (p, fingering) => getDrill45MeasureNotes(p.hand, fingering, p.peakRepeats),
  },
} as const satisfies Record<string, WarmUpDescriptor>;

export type WarmUpType = keyof typeof WARM_UP_REGISTRY;

/** Display order for every list of exercises in the app. */
export const WARM_UP_TYPES = Object.keys(WARM_UP_REGISTRY) as WarmUpType[];

export function isWarmUpType(value: string): value is WarmUpType {
  return Object.prototype.hasOwnProperty.call(WARM_UP_REGISTRY, value);
}

/** Descriptor lookup that tolerates unknown input, for data loaded off disk. */
export function warmUpDescriptor(type: string): WarmUpDescriptor | null {
  return isWarmUpType(type) ? WARM_UP_REGISTRY[type] : null;
}

export function hasParam(type: WarmUpType, param: WarmUpParam): boolean {
  // `as const` narrows each params tuple to its own literal union, so widen to compare.
  return (WARM_UP_REGISTRY[type].params as readonly WarmUpParam[]).includes(param);
}

export const DEFAULT_EXERCISE_PARAMS: ExerciseParams = {
  exercise: 1,
  pitchClass: 0,
  mode: 'major',
  hand: 'both',
  bpm: DEFAULT_WARMUP_BPM,
  octaves: 1,
  peakRepeats: DEFAULT_PEAK_REPEATS,
};

/**
 * Measure count for an exercise.
 *
 * Generating the notes is the only way to know the length, and routine playback needs
 * the count three times over (duration estimate, tempo schedule, score assembly) for
 * the same blocks. Memoised so those callers generate each exercise once instead of
 * three times. Bounded because the key space is large (type × 24 keys × 3 hands × 3
 * octaves × 5 peak repeats) and this is a long-lived module.
 */
const measureCountCache = new Map<string, number>();
const MEASURE_COUNT_CACHE_LIMIT = 512;

export function measureCount(type: WarmUpType, p: ScoreParams): number {
  const cacheKey = `${type}|${p.exercise}|${p.pitchClass}|${p.mode}|${p.hand}|${p.octaves}|${p.peakRepeats}`;
  const hit = measureCountCache.get(cacheKey);
  if (hit !== undefined) return hit;

  const { rh, lh } = WARM_UP_REGISTRY[type].measureNotes(p, false);
  const count = (rh ?? lh)?.length ?? 0;
  if (measureCountCache.size >= MEASURE_COUNT_CACHE_LIMIT) measureCountCache.clear();
  measureCountCache.set(cacheKey, count);
  return count;
}

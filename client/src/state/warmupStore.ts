import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';

import {
  WARMUP_BPMS,
  WARMUP_OCTAVES,
  WARMUP_PEAK_REPEATS,
  type WarmUpBpm,
  type WarmUpHand,
  type WarmUpOctaves,
  type WarmUpPeakRepeats,
  type WarmUpScaleMode,
} from '@domain/warmup';
import {
  DEFAULT_EXERCISE_PARAMS,
  HANON_EXERCISE_COUNT,
  WARM_UP_TYPES,
  type ExerciseParams,
  type WarmUpType,
} from '@domain/warmupRegistry';
import { DEFAULT_INSTRUMENT, INSTRUMENT_IDS, type InstrumentId } from '@domain/instrumentRegistry';

/**
 * Remembered parameters for one exercise. Every exercise stores the full parameter
 * set even where it doesn't use all of it — the registry's `params` list decides what
 * is shown and what its generator reads. One shape means one merge, one validator,
 * and no padding at the call site.
 */
export type ExerciseSettings = ExerciseParams;

/** One instrument's remembered parameters, keyed by exercise. */
type WarmUpSettings = Record<WarmUpType, ExerciseSettings>;

/**
 * The whole persisted file: a settings block per instrument.
 *
 * Split by instrument because clarinet scales and piano scales are different
 * exercises in different registers — carrying one octave count between them would
 * offer a value the other instrument may not even support.
 *
 * Which instrument is being *shown* is deliberately not here any more: that is the
 * dashboard's scope, it now filters the whole screen rather than this section, and it
 * lives with the app settings (`settingsRepository`). A file still carrying the old
 * key is read and the key ignored.
 */
interface WarmUpFile {
  byInstrument: Record<InstrumentId, WarmUpSettings>;
}

const DEFAULTS: WarmUpSettings = Object.fromEntries(
  WARM_UP_TYPES.map((t) => [t, { ...DEFAULT_EXERCISE_PARAMS }]),
) as WarmUpSettings;

const DEFAULTS_BY_INSTRUMENT: Record<InstrumentId, WarmUpSettings> = Object.fromEntries(
  INSTRUMENT_IDS.map((id) => [id, DEFAULTS]),
) as Record<InstrumentId, WarmUpSettings>;

const SETTINGS_PATH = (FileSystem.documentDirectory ?? '') + 'warmup-settings.json';

interface WarmUpState {
  /**
   * Persisted per-exercise parameters, keyed by instrument and then by exercise.
   *
   * Indexed by instrument rather than swapped wholesale for a "current" one, because
   * there is no longer a current instrument to swap on: a warm-up screen is opened
   * *for* an instrument, which arrives as a route parameter.
   */
  exercisesByInstrument: Record<InstrumentId, WarmUpSettings>;

  webViewReady: boolean;
  isLoadingScore: boolean;
  scoreError: string | null;
  isPlaying: boolean;
  loopActive: boolean;
  metronomeOn: boolean;
  /**
   * Whether the score is moving under the cursor — panned, coasting or gliding.
   * Driven by SCORE_MOTION from the WebView; the centred play button hides while it
   * is true. See `playViewStore`, which carries the same slice.
   */
  scoreMoving: boolean;

  initSettings: () => Promise<void>;
  updateExercise: (
    instrument: InstrumentId,
    type: WarmUpType,
    patch: Partial<ExerciseSettings>,
  ) => void;
  setWebViewReady: (v: boolean) => void;
  setLoadingScore: (v: boolean) => void;
  setScoreError: (v: string | null) => void;
  setPlaying: (v: boolean) => void;
  setLoopActive: (v: boolean) => void;
  setMetronomeOn: (v: boolean) => void;
  setScoreMoving: (v: boolean) => void;
  resetPlayback: () => void;
}

// Values are validated field by field rather than trusted, following
// `settingsRepository.coerce`. A saved file is user-writable data on disk: a value
// outside its option list would otherwise reach a generator and render nonsense.
function coerceExercise(raw: unknown): ExerciseSettings {
  const o = (raw ?? {}) as Partial<Record<keyof ExerciseSettings, unknown>>;
  const pick = <T>(value: unknown, options: readonly T[], fallback: T): T =>
    options.includes(value as T) ? (value as T) : fallback;

  return {
    exercise:
      typeof o.exercise === 'number' &&
      Number.isInteger(o.exercise) &&
      o.exercise >= 1 &&
      o.exercise <= HANON_EXERCISE_COUNT
        ? o.exercise
        : DEFAULT_EXERCISE_PARAMS.exercise,
    pitchClass:
      typeof o.pitchClass === 'number' &&
      Number.isInteger(o.pitchClass) &&
      o.pitchClass >= 0 &&
      o.pitchClass <= 11
        ? o.pitchClass
        : DEFAULT_EXERCISE_PARAMS.pitchClass,
    mode: pick<WarmUpScaleMode>(o.mode, ['major', 'minor'], DEFAULT_EXERCISE_PARAMS.mode),
    hand: pick<WarmUpHand>(o.hand, ['both', 'right', 'left'], DEFAULT_EXERCISE_PARAMS.hand),
    bpm: pick<WarmUpBpm>(o.bpm, WARMUP_BPMS, DEFAULT_EXERCISE_PARAMS.bpm),
    octaves: pick<WarmUpOctaves>(o.octaves, WARMUP_OCTAVES, DEFAULT_EXERCISE_PARAMS.octaves),
    peakRepeats: pick<WarmUpPeakRepeats>(
      o.peakRepeats,
      WARMUP_PEAK_REPEATS,
      DEFAULT_EXERCISE_PARAMS.peakRepeats,
    ),
  };
}

function coerceBlock(raw: unknown): WarmUpSettings {
  const saved = (raw ?? {}) as Record<string, unknown>;
  // Built from the registry rather than from the file, so an exercise removed from
  // this build is dropped and a newly added one picks up its defaults.
  return Object.fromEntries(
    WARM_UP_TYPES.map((t) => [t, coerceExercise(saved[t])]),
  ) as WarmUpSettings;
}

async function loadSettings(): Promise<WarmUpFile> {
  try {
    const info = await FileSystem.getInfoAsync(SETTINGS_PATH);
    if (!info.exists) return { byInstrument: DEFAULTS_BY_INSTRUMENT };
    const raw = await FileSystem.readAsStringAsync(SETTINGS_PATH);
    const saved = (JSON.parse(raw) ?? {}) as Record<string, unknown>;

    // A file written before instruments existed is a flat map of exercise ids. Those
    // were piano settings and always were, so they become the piano block rather than
    // being discarded — the same normalise-on-read stance the repositories take.
    const legacy = !('byInstrument' in saved);
    const blocks = (
      legacy ? {} : ((saved.byInstrument ?? {}) as Record<string, unknown>)
    ) as Record<string, unknown>;
    const byInstrument = Object.fromEntries(
      INSTRUMENT_IDS.map((id) => [
        id,
        coerceBlock(legacy && id === DEFAULT_INSTRUMENT ? saved : blocks[id]),
      ]),
    ) as Record<InstrumentId, WarmUpSettings>;

    return { byInstrument };
  } catch {
    return { byInstrument: DEFAULTS_BY_INSTRUMENT };
  }
}

function saveSettings(file: WarmUpFile): void {
  FileSystem.writeAsStringAsync(SETTINGS_PATH, JSON.stringify(file)).catch(() => {});
}

export const useWarmUpStore = create<WarmUpState>()((set, get) => ({
  exercisesByInstrument: DEFAULTS_BY_INSTRUMENT,
  webViewReady: false,
  isLoadingScore: false,
  scoreError: null,
  isPlaying: false,
  loopActive: false,
  metronomeOn: false,
  scoreMoving: false,

  initSettings: async () => {
    const file = await loadSettings();
    set({ exercisesByInstrument: file.byInstrument });
  },

  updateExercise: (instrument, type, patch) => {
    set((s) => {
      const block = s.exercisesByInstrument[instrument];
      return {
        exercisesByInstrument: {
          ...s.exercisesByInstrument,
          [instrument]: { ...block, [type]: { ...block[type], ...patch } },
        },
      };
    });
    saveSettings({ byInstrument: get().exercisesByInstrument });
  },

  setWebViewReady: (v) => set({ webViewReady: v }),
  setLoadingScore: (v) => set({ isLoadingScore: v }),
  setScoreError: (v) => set({ scoreError: v }),
  setPlaying: (v) => set({ isPlaying: v }),
  setLoopActive: (v) => set({ loopActive: v }),
  setMetronomeOn: (v) => set({ metronomeOn: v }),
  setScoreMoving: (v) => set({ scoreMoving: v }),
  resetPlayback: () =>
    set({
      webViewReady: false,
      isLoadingScore: false,
      scoreError: null,
      isPlaying: false,
      loopActive: false,
      metronomeOn: false,
      scoreMoving: false,
    }),
}));

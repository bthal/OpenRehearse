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
  WARM_UP_TYPES,
  type ExerciseParams,
  type WarmUpType,
} from '@domain/warmupRegistry';

/**
 * Remembered parameters for one exercise. Every exercise stores the full parameter
 * set even where it doesn't use all of it — the registry's `params` list decides what
 * is shown and what its generator reads. One shape means one merge, one validator,
 * and no padding at the call site.
 */
export type ExerciseSettings = ExerciseParams;

type WarmUpSettings = Record<WarmUpType, ExerciseSettings>;

const DEFAULTS: WarmUpSettings = Object.fromEntries(
  WARM_UP_TYPES.map((t) => [t, { ...DEFAULT_EXERCISE_PARAMS }]),
) as WarmUpSettings;

const SETTINGS_PATH = (FileSystem.documentDirectory ?? '') + 'warmup-settings.json';

interface WarmUpState {
  /** Persisted per-exercise parameters, keyed by exercise id. */
  exercises: WarmUpSettings;

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
  updateExercise: (type: WarmUpType, patch: Partial<ExerciseSettings>) => void;
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

async function loadSettings(): Promise<WarmUpSettings> {
  try {
    const info = await FileSystem.getInfoAsync(SETTINGS_PATH);
    if (!info.exists) return DEFAULTS;
    const raw = await FileSystem.readAsStringAsync(SETTINGS_PATH);
    const saved = (JSON.parse(raw) ?? {}) as Record<string, unknown>;
    // Built from the registry rather than from the file, so an exercise removed from
    // this build is dropped and a newly added one picks up its defaults.
    return Object.fromEntries(
      WARM_UP_TYPES.map((t) => [t, coerceExercise(saved[t])]),
    ) as WarmUpSettings;
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(settings: WarmUpSettings): void {
  FileSystem.writeAsStringAsync(SETTINGS_PATH, JSON.stringify(settings)).catch(() => {});
}

export const useWarmUpStore = create<WarmUpState>()((set, get) => ({
  exercises: DEFAULTS,
  webViewReady: false,
  isLoadingScore: false,
  scoreError: null,
  isPlaying: false,
  loopActive: false,
  metronomeOn: false,
  scoreMoving: false,

  initSettings: async () => {
    set({ exercises: await loadSettings() });
  },

  updateExercise: (type, patch) => {
    set((s) => ({ exercises: { ...s.exercises, [type]: { ...s.exercises[type], ...patch } } }));
    saveSettings(get().exercises);
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

import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';

import {
  DEFAULT_PEAK_REPEATS,
  DEFAULT_WARMUP_BPM,
  type WarmUpBpm,
  type WarmUpHand,
  type WarmUpOctaves,
  type WarmUpPeakRepeats,
  type WarmUpScaleMode,
} from '@domain/warmup';

interface ExerciseSettings {
  pitchClass: number;
  mode: WarmUpScaleMode;
  hand: WarmUpHand;
  bpm: WarmUpBpm;
  octaves: WarmUpOctaves;
}

export interface Drill45Settings {
  hand: WarmUpHand;
  bpm: WarmUpBpm;
  peakRepeats: WarmUpPeakRepeats;
}

interface WarmUpSettings {
  hanon: ExerciseSettings;
  scales: ExerciseSettings;
  arpeggio: ExerciseSettings;
  chromatic: ExerciseSettings;
  fiveScale: ExerciseSettings;
  drill45: Drill45Settings;
}

const defaultExerciseSettings = (): ExerciseSettings => ({
  pitchClass: 0,
  mode: 'major',
  hand: 'both',
  bpm: DEFAULT_WARMUP_BPM,
  octaves: 1,
});

const DEFAULTS: WarmUpSettings = {
  hanon: defaultExerciseSettings(),
  scales: defaultExerciseSettings(),
  arpeggio: defaultExerciseSettings(),
  chromatic: defaultExerciseSettings(),
  fiveScale: defaultExerciseSettings(),
  drill45: { hand: 'both', bpm: DEFAULT_WARMUP_BPM, peakRepeats: DEFAULT_PEAK_REPEATS },
};

const SETTINGS_PATH = (FileSystem.documentDirectory ?? '') + 'warmup-settings.json';

interface WarmUpState extends WarmUpSettings {
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
  updateHanon: (patch: Partial<ExerciseSettings>) => void;
  updateScales: (patch: Partial<ExerciseSettings>) => void;
  updateArpeggio: (patch: Partial<ExerciseSettings>) => void;
  updateChromatic: (patch: Partial<ExerciseSettings>) => void;
  updateFiveScale: (patch: Partial<ExerciseSettings>) => void;
  updateDrill45: (patch: Partial<Drill45Settings>) => void;
  setWebViewReady: (v: boolean) => void;
  setLoadingScore: (v: boolean) => void;
  setScoreError: (v: string | null) => void;
  setPlaying: (v: boolean) => void;
  setLoopActive: (v: boolean) => void;
  setMetronomeOn: (v: boolean) => void;
  setScoreMoving: (v: boolean) => void;
  resetPlayback: () => void;
}

async function loadSettings(): Promise<WarmUpSettings> {
  try {
    const info = await FileSystem.getInfoAsync(SETTINGS_PATH);
    if (!info.exists) return DEFAULTS;
    const raw = await FileSystem.readAsStringAsync(SETTINGS_PATH);
    const saved = JSON.parse(raw) as Partial<WarmUpSettings>;
    // Merge per exercise, not just per top-level key: a file written before a setting
    // was added would otherwise replace that exercise wholesale and drop its default.
    return {
      hanon: { ...DEFAULTS.hanon, ...saved.hanon },
      scales: { ...DEFAULTS.scales, ...saved.scales },
      arpeggio: { ...DEFAULTS.arpeggio, ...saved.arpeggio },
      chromatic: { ...DEFAULTS.chromatic, ...saved.chromatic },
      fiveScale: { ...DEFAULTS.fiveScale, ...saved.fiveScale },
      drill45: { ...DEFAULTS.drill45, ...saved.drill45 },
    };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(settings: WarmUpSettings): void {
  FileSystem.writeAsStringAsync(SETTINGS_PATH, JSON.stringify(settings)).catch(() => {});
}

// Extracts just the persisted settings slice from the full store state.
function snapshotSettings(state: WarmUpState): WarmUpSettings {
  return {
    hanon: state.hanon,
    scales: state.scales,
    arpeggio: state.arpeggio,
    chromatic: state.chromatic,
    fiveScale: state.fiveScale,
    drill45: state.drill45,
  };
}

export const useWarmUpStore = create<WarmUpState>()((set, get) => ({
  ...DEFAULTS,
  webViewReady: false,
  isLoadingScore: false,
  scoreError: null,
  isPlaying: false,
  loopActive: false,
  metronomeOn: false,
  scoreMoving: false,

  initSettings: async () => {
    const settings = await loadSettings();
    set({
      hanon: settings.hanon,
      scales: settings.scales,
      arpeggio: settings.arpeggio,
      chromatic: settings.chromatic,
      fiveScale: settings.fiveScale,
      drill45: settings.drill45,
    });
  },

  updateHanon: (patch) => {
    set((s) => ({ hanon: { ...s.hanon, ...patch } }));
    saveSettings(snapshotSettings(get()));
  },

  updateScales: (patch) => {
    set((s) => ({ scales: { ...s.scales, ...patch } }));
    saveSettings(snapshotSettings(get()));
  },

  updateArpeggio: (patch) => {
    set((s) => ({ arpeggio: { ...s.arpeggio, ...patch } }));
    saveSettings(snapshotSettings(get()));
  },

  updateChromatic: (patch) => {
    set((s) => ({ chromatic: { ...s.chromatic, ...patch } }));
    saveSettings(snapshotSettings(get()));
  },

  updateFiveScale: (patch) => {
    set((s) => ({ fiveScale: { ...s.fiveScale, ...patch } }));
    saveSettings(snapshotSettings(get()));
  },

  updateDrill45: (patch) => {
    set((s) => ({ drill45: { ...s.drill45, ...patch } }));
    saveSettings(snapshotSettings(get()));
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

import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';

import {
  DEFAULT_WARMUP_BPM,
  type WarmUpBpm,
  type WarmUpHand,
  type WarmUpOctaves,
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
}

interface WarmUpSettings {
  hanon: ExerciseSettings;
  scales: ExerciseSettings;
  drill45: Drill45Settings;
}

const DEFAULTS: WarmUpSettings = {
  hanon: { pitchClass: 0, mode: 'major', hand: 'both', bpm: DEFAULT_WARMUP_BPM, octaves: 1 },
  scales: { pitchClass: 0, mode: 'major', hand: 'both', bpm: DEFAULT_WARMUP_BPM, octaves: 1 },
  drill45: { hand: 'both', bpm: DEFAULT_WARMUP_BPM },
};

const SETTINGS_PATH = (FileSystem.documentDirectory ?? '') + 'warmup-settings.json';

interface WarmUpState extends WarmUpSettings {
  webViewReady: boolean;
  isLoadingScore: boolean;
  scoreError: string | null;
  isPlaying: boolean;
  loopActive: boolean;
  metronomeOn: boolean;

  initSettings: () => Promise<void>;
  updateHanon: (patch: Partial<ExerciseSettings>) => void;
  updateScales: (patch: Partial<ExerciseSettings>) => void;
  updateDrill45: (patch: Partial<Drill45Settings>) => void;
  setWebViewReady: (v: boolean) => void;
  setLoadingScore: (v: boolean) => void;
  setScoreError: (v: string | null) => void;
  setPlaying: (v: boolean) => void;
  setLoopActive: (v: boolean) => void;
  setMetronomeOn: (v: boolean) => void;
  resetPlayback: () => void;
}

async function loadSettings(): Promise<WarmUpSettings> {
  try {
    const info = await FileSystem.getInfoAsync(SETTINGS_PATH);
    if (!info.exists) return DEFAULTS;
    const raw = await FileSystem.readAsStringAsync(SETTINGS_PATH);
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<WarmUpSettings>) };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(settings: WarmUpSettings): void {
  FileSystem.writeAsStringAsync(SETTINGS_PATH, JSON.stringify(settings)).catch(() => {});
}

export const useWarmUpStore = create<WarmUpState>()((set, get) => ({
  ...DEFAULTS,
  webViewReady: false,
  isLoadingScore: false,
  scoreError: null,
  isPlaying: false,
  loopActive: false,
  metronomeOn: false,

  initSettings: async () => {
    const settings = await loadSettings();
    set({ hanon: settings.hanon, scales: settings.scales, drill45: settings.drill45 });
  },

  updateHanon: (patch) => {
    const hanon = { ...get().hanon, ...patch };
    set({ hanon });
    saveSettings({ hanon, scales: get().scales, drill45: get().drill45 });
  },

  updateScales: (patch) => {
    const scales = { ...get().scales, ...patch };
    set({ scales });
    saveSettings({ hanon: get().hanon, scales, drill45: get().drill45 });
  },

  updateDrill45: (patch) => {
    const drill45 = { ...get().drill45, ...patch };
    set({ drill45 });
    saveSettings({ hanon: get().hanon, scales: get().scales, drill45 });
  },

  setWebViewReady: (v) => set({ webViewReady: v }),
  setLoadingScore: (v) => set({ isLoadingScore: v }),
  setScoreError: (v) => set({ scoreError: v }),
  setPlaying: (v) => set({ isPlaying: v }),
  setLoopActive: (v) => set({ loopActive: v }),
  setMetronomeOn: (v) => set({ metronomeOn: v }),
  resetPlayback: () =>
    set({
      webViewReady: false,
      isLoadingScore: false,
      scoreError: null,
      isPlaying: false,
      loopActive: false,
      metronomeOn: false,
    }),
}));

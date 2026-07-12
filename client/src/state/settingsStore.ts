import { create } from 'zustand';

import type { CountInMeasures } from '@domain/countIn';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '@data/settingsRepository';

interface SettingsState {
  /** Measures of metronome count-in before a piece, routine, or loop begins. */
  countInMeasures: CountInMeasures;
  /** True once settings have been read from disk at least once this session. */
  loaded: boolean;

  /** Read persisted settings into the store. Safe to call repeatedly. */
  loadSettings: () => Promise<void>;
  /** Update the count-in and persist it. */
  setCountInMeasures: (measures: CountInMeasures) => void;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  countInMeasures: DEFAULT_SETTINGS.countInMeasures,
  loaded: false,

  loadSettings: async () => {
    const settings = await loadSettings();
    set({ countInMeasures: settings.countInMeasures, loaded: true });
  },

  setCountInMeasures: (measures) => {
    set({ countInMeasures: measures });
    // Fire-and-forget: the store is the source of truth for the session; the
    // file is a durability backstop, so a failed write should not block the UI.
    void saveSettings({ countInMeasures: get().countInMeasures });
  },
}));

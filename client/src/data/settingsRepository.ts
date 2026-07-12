import * as FileSystem from 'expo-file-system/legacy';

import { COUNT_IN_OPTIONS, type CountInMeasures } from '@domain/countIn';

// App-wide settings live in a single on-device JSON file, mirroring the routine
// store. Nothing here is ever uploaded (see the privacy non-negotiable).
const SETTINGS_PATH = (FileSystem.documentDirectory ?? '') + 'settings.json';

export interface AppSettings {
  /** Measures of metronome count-in before a piece, routine, or loop begins. */
  countInMeasures: CountInMeasures;
}

export const DEFAULT_SETTINGS: AppSettings = {
  countInMeasures: 0,
};

function coerce(raw: unknown): AppSettings {
  const obj = (raw ?? {}) as Partial<Record<keyof AppSettings, unknown>>;
  const countIn = obj.countInMeasures;
  return {
    countInMeasures: COUNT_IN_OPTIONS.includes(countIn as CountInMeasures)
      ? (countIn as CountInMeasures)
      : DEFAULT_SETTINGS.countInMeasures,
  };
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const info = await FileSystem.getInfoAsync(SETTINGS_PATH);
    if (!info.exists) return { ...DEFAULT_SETTINGS };
    const raw = await FileSystem.readAsStringAsync(SETTINGS_PATH);
    return coerce(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await FileSystem.writeAsStringAsync(SETTINGS_PATH, JSON.stringify(settings));
}

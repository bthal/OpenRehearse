import * as FileSystem from 'expo-file-system/legacy';
import type { Routine } from '@domain/routine';

const ROUTINES_PATH = (FileSystem.documentDirectory ?? '') + 'routines.json';

export async function loadRoutines(): Promise<Routine[]> {
  try {
    const info = await FileSystem.getInfoAsync(ROUTINES_PATH);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(ROUTINES_PATH);
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Routine[]) : [];
  } catch {
    return [];
  }
}

export async function saveRoutines(routines: Routine[]): Promise<void> {
  await FileSystem.writeAsStringAsync(ROUTINES_PATH, JSON.stringify(routines));
}

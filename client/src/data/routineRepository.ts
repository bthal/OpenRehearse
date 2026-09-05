import * as FileSystem from 'expo-file-system/legacy';
import { normaliseInstrumentId } from '@domain/instrumentRegistry';
import type { Routine } from '@domain/routine';

const ROUTINES_PATH = (FileSystem.documentDirectory ?? '') + 'routines.json';

export async function loadRoutines(): Promise<Routine[]> {
  try {
    const info = await FileSystem.getInfoAsync(ROUTINES_PATH);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(ROUTINES_PATH);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Routines saved before instruments existed were all piano ones. Filling that in
    // here is what lets the editor and the playview assume every routine has an
    // instrument — the same normalise-on-read contract the piece repository uses.
    return (parsed as Routine[]).map((r) => ({
      ...r,
      instrument: normaliseInstrumentId((r as { instrument?: unknown }).instrument),
    }));
  } catch {
    return [];
  }
}

export async function saveRoutines(routines: Routine[]): Promise<void> {
  await FileSystem.writeAsStringAsync(ROUTINES_PATH, JSON.stringify(routines));
}

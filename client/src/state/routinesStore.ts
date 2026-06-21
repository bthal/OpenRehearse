import { create } from 'zustand';
import type { Routine } from '@domain/routine';
import { loadRoutines, saveRoutines } from '@data/routineRepository';

interface RoutinesState {
  routines: Routine[];
  isLoading: boolean;

  loadRoutines: () => Promise<void>;
  saveRoutine: (routine: Routine) => Promise<void>;
  deleteRoutines: (ids: string[]) => Promise<void>;
}

export const useRoutinesStore = create<RoutinesState>((set, get) => ({
  routines: [],
  isLoading: false,

  async loadRoutines() {
    set({ isLoading: true });
    try {
      const routines = await loadRoutines();
      set({ routines });
    } finally {
      set({ isLoading: false });
    }
  },

  async saveRoutine(routine: Routine) {
    const existing = get().routines;
    const idx = existing.findIndex((r) => r.id === routine.id);
    const next =
      idx >= 0 ? existing.map((r) => (r.id === routine.id ? routine : r)) : [routine, ...existing];
    set({ routines: next });
    await saveRoutines(next);
  },

  async deleteRoutines(ids: string[]) {
    const next = get().routines.filter((r) => !ids.includes(r.id));
    set({ routines: next });
    await saveRoutines(next);
  },
}));

import { create } from 'zustand';
import type { Routine } from '@domain/routine';
import { loadRoutines, saveRoutines } from '@data/routineRepository';

interface RoutinesState {
  routines: Routine[];
  isLoading: boolean;

  loadRoutines: () => Promise<void>;
  saveRoutine: (routine: Routine) => Promise<void>;
  touchRoutine: (id: string) => Promise<void>;
  deleteRoutines: (ids: string[]) => Promise<void>;
}

function sortByLastOpened(routines: Routine[]): Routine[] {
  return [...routines].sort((a, b) => {
    const ta = a.lastOpenedAt ?? a.createdAt;
    const tb = b.lastOpenedAt ?? b.createdAt;
    return tb.localeCompare(ta);
  });
}

export const useRoutinesStore = create<RoutinesState>((set, get) => ({
  routines: [],
  isLoading: false,

  async loadRoutines() {
    set({ isLoading: true });
    try {
      const routines = await loadRoutines();
      set({ routines: sortByLastOpened(routines) });
    } finally {
      set({ isLoading: false });
    }
  },

  async saveRoutine(routine: Routine) {
    const existing = get().routines;
    const idx = existing.findIndex((r) => r.id === routine.id);
    const updated =
      idx >= 0 ? existing.map((r) => (r.id === routine.id ? routine : r)) : [routine, ...existing];
    const next = sortByLastOpened(updated);
    set({ routines: next });
    await saveRoutines(next);
  },

  async touchRoutine(id: string) {
    const existing = get().routines;
    const at = new Date().toISOString();
    const updated = existing.map((r) => (r.id === id ? { ...r, lastOpenedAt: at } : r));
    const next = sortByLastOpened(updated);
    set({ routines: next });
    await saveRoutines(next);
  },

  async deleteRoutines(ids: string[]) {
    const next = get().routines.filter((r) => !ids.includes(r.id));
    set({ routines: next });
    await saveRoutines(next);
  },
}));

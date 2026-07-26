import { create } from 'zustand';

import { applyPracticeDeltas, practiceDayKey, type PracticeDelta } from '@domain/practiceTime';
import { addPracticeSeconds, loadPracticeDailySeconds } from '@data/practiceRepository';

/**
 * How far back the dashboard reads. A little over a year covers the widest
 * heatmap window (53 weeks) without loading history nothing will render.
 */
const HISTORY_WINDOW_DAYS = 400;

interface PracticeState {
  /** Local day (`YYYY-MM-DD`) → seconds of active playback on that day. */
  dailySeconds: Record<string, number>;
  isLoading: boolean;

  loadPracticeHistory: (sinceDay?: string) => Promise<void>;
  /** Banks elapsed practice time: in memory first, then to SQLite. */
  recordPractice: (deltas: readonly PracticeDelta[]) => Promise<void>;
}

export const usePracticeStore = create<PracticeState>((set, get) => ({
  dailySeconds: {},
  isLoading: false,

  async loadPracticeHistory(sinceDay?: string) {
    set({ isLoading: true });
    try {
      const since =
        sinceDay ?? practiceDayKey(Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const dailySeconds = await loadPracticeDailySeconds(since);
      set({ dailySeconds });
    } catch (err) {
      // A missing/locked history must never block the dashboard.
      console.warn('[practiceStore] failed to load practice history:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  async recordPractice(deltas: readonly PracticeDelta[]) {
    if (deltas.length === 0) return;
    set({ dailySeconds: applyPracticeDeltas(get().dailySeconds, deltas) });
    try {
      await addPracticeSeconds(deltas);
    } catch (err) {
      // Losing a flush costs a few seconds of history, not the practice session.
      console.warn('[practiceStore] failed to persist practice time:', err);
    }
  },
}));

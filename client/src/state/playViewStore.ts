import { create } from 'zustand';

interface PlayViewState {
  activePieceId: string | null;
  webViewReady: boolean;
  isLoadingScore: boolean;
  scoreError: string | null;

  setActivePieceId: (id: string | null) => void;
  setWebViewReady: (ready: boolean) => void;
  setLoadingScore: (loading: boolean) => void;
  setScoreError: (error: string | null) => void;
  reset: () => void;
}

const initial = {
  activePieceId: null,
  webViewReady: false,
  isLoadingScore: false,
  scoreError: null,
};

export const usePlayViewStore = create<PlayViewState>()((set) => ({
  ...initial,
  setActivePieceId: (id) => set({ activePieceId: id }),
  setWebViewReady: (ready) => set({ webViewReady: ready }),
  setLoadingScore: (loading) => set({ isLoadingScore: loading }),
  setScoreError: (error) => set({ scoreError: error }),
  reset: () => set(initial),
}));

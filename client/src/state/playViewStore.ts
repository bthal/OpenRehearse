import { create } from 'zustand';

export type TempoMultiplier = 0.5 | 0.75 | 1.0;
export const TEMPO_MULTIPLIERS: TempoMultiplier[] = [0.5, 0.75, 1.0];

interface PlayViewState {
  activePieceId: string | null;
  webViewReady: boolean;
  isLoadingScore: boolean;
  scoreError: string | null;
  isPlaying: boolean;
  /** BPM marked in the score; updated by SCORE_BPM message after each load. */
  scoreBpm: number;
  /** User-selected speed fraction; applied as scoreBpm × tempoMultiplier. */
  tempoMultiplier: TempoMultiplier;
  /** Whether a loop region is currently active in the WebView. */
  loopActive: boolean;
  /** Whether the metronome click is enabled. */
  metronomeOn: boolean;

  setActivePieceId: (id: string | null) => void;
  setWebViewReady: (ready: boolean) => void;
  setLoadingScore: (loading: boolean) => void;
  setScoreError: (error: string | null) => void;
  setPlaying: (playing: boolean) => void;
  setScoreBpm: (bpm: number) => void;
  setTempoMultiplier: (m: TempoMultiplier) => void;
  setLoopActive: (v: boolean) => void;
  setMetronomeOn: (v: boolean) => void;
  reset: () => void;
}

const initial = {
  activePieceId: null,
  webViewReady: false,
  isLoadingScore: false,
  scoreError: null,
  isPlaying: false,
  scoreBpm: 120,
  tempoMultiplier: 1.0 as TempoMultiplier,
  loopActive: false,
  metronomeOn: false,
};

export const usePlayViewStore = create<PlayViewState>()((set) => ({
  ...initial,
  setActivePieceId: (id) => set({ activePieceId: id }),
  setWebViewReady: (ready) => set({ webViewReady: ready }),
  setLoadingScore: (loading) => set({ isLoadingScore: loading }),
  setScoreError: (error) => set({ scoreError: error }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setScoreBpm: (bpm) => set({ scoreBpm: bpm }),
  setTempoMultiplier: (m) => set({ tempoMultiplier: m }),
  setLoopActive: (v) => set({ loopActive: v }),
  setMetronomeOn: (v) => set({ metronomeOn: v }),
  reset: () => set(initial),
}));

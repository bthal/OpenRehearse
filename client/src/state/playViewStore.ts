import { create } from 'zustand';

import {
  ACTIVE_HANDS,
  TEMPO_MULTIPLIERS,
  type ActiveHand,
  type PracticeSettings,
  type TempoMultiplier,
} from '@domain/practiceSettings';

// These moved to the domain when saved bits started storing them — a bit records the
// practice settings it was saved with, and the domain may not import from state.
// Re-exported here so screens keep importing them from where they always have.
export { ACTIVE_HANDS, TEMPO_MULTIPLIERS };
export type { ActiveHand, PracticeSettings, TempoMultiplier };

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
  /** Which hand(s) are active for playback and score display. */
  activeHand: ActiveHand;
  /**
   * Index into the active piece's `sections`, or null when the cursor is in no
   * section — which is the normal state for a piece with no detected form.
   * Driven by SECTION_INDEX from the WebView, which owns the position.
   */
  currentSectionIndex: number | null;
  /**
   * Whether the score is moving under the cursor — panned, coasting, gliding, or
   * dragged by a loop handle. Driven by SCORE_MOTION from the WebView, which owns the
   * gesture; the centred play button hides while it is true.
   */
  scoreMoving: boolean;
  /**
   * The bit currently being practised, or null in ordinary play view. Driven by
   * BIT_ENTERED from the WebView, which owns the armed loop.
   *
   * Non-null puts the toolbar in bit mode: no back button, no loop button, and a
   * leave/delete pair in their place.
   */
  activeBitId: string | null;
  /**
   * Hand, speed and metronome as they were just before the first bit was entered,
   * restored on leaving.
   *
   * A bit owns its practice settings, so entering one overwrites the live ones. Without
   * this snapshot, visiting a slow left-hand bit would silently leave the whole piece
   * slow and left-handed with nothing on screen to explain it. Captured once — hopping
   * bit to bit must not overwrite it with the previous bit's values.
   */
  preBitSettings: PracticeSettings | null;

  setActivePieceId: (id: string | null) => void;
  setWebViewReady: (ready: boolean) => void;
  setLoadingScore: (loading: boolean) => void;
  setScoreError: (error: string | null) => void;
  setPlaying: (playing: boolean) => void;
  setScoreBpm: (bpm: number) => void;
  setTempoMultiplier: (m: TempoMultiplier) => void;
  setLoopActive: (v: boolean) => void;
  setMetronomeOn: (v: boolean) => void;
  setActiveHand: (h: ActiveHand) => void;
  setCurrentSectionIndex: (index: number | null) => void;
  setScoreMoving: (moving: boolean) => void;
  setActiveBitId: (id: string | null) => void;
  setPreBitSettings: (settings: PracticeSettings | null) => void;
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
  activeHand: 'both' as ActiveHand,
  currentSectionIndex: null,
  scoreMoving: false,
  activeBitId: null,
  preBitSettings: null,
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
  setActiveHand: (h) => set({ activeHand: h }),
  setCurrentSectionIndex: (index) => set({ currentSectionIndex: index }),
  setScoreMoving: (moving) => set({ scoreMoving: moving }),
  setActiveBitId: (id) => set({ activeBitId: id }),
  setPreBitSettings: (settings) => set({ preBitSettings: settings }),
  reset: () => set(initial),
}));

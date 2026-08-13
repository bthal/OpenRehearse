export type NativeToWebMessage =
  | { type: 'LOAD_XML'; payload: string }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'STOP' }
  | { type: 'SET_TEMPO_BPM'; payload: number }
  | { type: 'TOGGLE_LOOP' }
  | { type: 'TOGGLE_METRONOME' }
  | { type: 'SET_ACTIVE_HAND'; payload: 'both' | 'right' | 'left' }
  /** Measures of metronome count-in (0 = none) before a piece/routine/loop starts. */
  | { type: 'SET_COUNT_IN'; payload: number }
  /**
   * 0-based start measure indices of the piece's detected sections, ascending.
   * Must be sent after LOADED: the web side resolves them against measure metadata
   * that only exists once playback has been initialised.
   */
  | { type: 'SET_SECTIONS'; payload: number[] }
  /** Jump to the start of the previous (-1) or next (+1) section. */
  | { type: 'SEEK_SECTION'; payload: -1 | 1 };

export type WebToNativeMessage =
  | { type: 'LOADED' }
  | { type: 'ERROR'; payload: string }
  | { type: 'DEBUG'; payload: string }
  | { type: 'SCORE_BPM'; payload: number }
  | { type: 'PLAYBACK_STATE'; payload: 'playing' | 'paused' | 'stopped' }
  | { type: 'PLAYBACK_END' }
  | { type: 'LOOP_STATE'; payload: boolean }
  /**
   * Index into the section list sent via SET_SECTIONS, or null when no sections
   * are set. Emitted only when the index changes — about once per section, not
   * per frame, so it stays off the animation hot path.
   */
  | { type: 'SECTION_INDEX'; payload: number | null };

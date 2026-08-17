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
   * The piece's detected sections: `measures` holds their 0-based start measure
   * indices, ascending, and `colors` the palette entry each one draws, index for
   * index. Colors travel with them because the WebView paints the junction marks
   * in the score and has no access to the native theme.
   *
   * Must be sent after LOADED: the web side resolves the measure indices against
   * metadata that only exists once playback has been initialised.
   */
  | { type: 'SET_SECTIONS'; payload: { measures: number[]; colors: string[] } }
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
  | { type: 'SECTION_INDEX'; payload: number | null }
  /**
   * True while the score is moving under the cursor — a finger panning it, the
   * momentum coast, the settle glide, or a loop handle being dragged — and false once
   * it has come to rest on an onset. The native shell hides the centred play button
   * while it is true, so the button only ever offers to play from a settled position.
   *
   * Emitted only when the value changes, like SECTION_INDEX, and coalesced across a
   * turn so a coast handing over to a glide does not report a stop in between.
   */
  | { type: 'SCORE_MOTION'; payload: boolean };

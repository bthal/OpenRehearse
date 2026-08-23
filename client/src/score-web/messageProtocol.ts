import type { Bit } from '@domain/bits';

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
  | { type: 'SEEK_SECTION'; payload: -1 | 1 }
  /**
   * The piece's saved bits — the whole list, every time, since the web side derives the
   * marker strip's layout from all of them at once.
   *
   * Must be sent after LOADED, like SET_SECTIONS: bits are stored in ticks and resolve
   * against the note grid, which only exists once playback has been initialised.
   *
   * Re-sent when a bit is created or deleted, and *not* when only a bit's practice
   * settings change: those live on the native side and the score draws nothing from them.
   */
  | { type: 'SET_BITS'; payload: Bit[] }
  /**
   * Save the live loop as a new bit under this id.
   *
   * Native mints the uuid because `crypto.randomUUID` cannot be relied on in every
   * WebView this ships to. The web side answers with BIT_CREATED carrying the ticks,
   * which only it can supply — or with BIT_ENTERED, if the loop turned out to cover a
   * span an existing bit already holds.
   */
  | { type: 'CREATE_BIT'; payload: { id: string } }
  /** Clear the armed bit: no loop, no grey-out. */
  | { type: 'LEAVE_BIT' };

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
  | { type: 'SCORE_MOTION'; payload: boolean }
  /**
   * A bit was saved from the live loop. Carries the bounds in ticks because the loop
   * region lives in the WebView; native supplies the id and the practice settings.
   */
  | { type: 'BIT_CREATED'; payload: { id: string; startTicks: number; endTicks: number } }
  /**
   * Which bit is now armed, or null when none is. Emitted on a marker tap, on a create
   * that resolved to an existing bit, and on leaving — so it is native's single cue to
   * apply a bit's saved practice settings or restore the ones from before.
   */
  | { type: 'BIT_ENTERED'; payload: { id: string } | null }
  /**
   * The live loop could not be saved: the marker strip has no row left at this point in
   * the piece. Native answers with a message rather than letting the bit be created and
   * its marker drawn over one already there.
   */
  | { type: 'BIT_LIMIT_REACHED' }
  /**
   * A marker was long-pressed — the gesture that deletes a bit. Native prompts and, on
   * confirmation, removes the bit and sends the new list back.
   *
   * Carries the id because a long press reaches *any* marker, not only the armed one: the
   * finger is already on the bit it means.
   */
  | { type: 'BIT_LONG_PRESSED'; payload: { id: string } };

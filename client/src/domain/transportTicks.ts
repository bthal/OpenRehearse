// The transport's tick space, which is not the musical one.
//
// LANDMINE: a tick position handed to Tone is not the tick Tone stores. Every one of
// them goes through `ToneWithContext.toTicks` → `TransportTimeClass.toTicks`, which
// converts to seconds at the current BPM and straight back, and that round trip is not
// exact — at 100 BPM `"43776i"` returns 43775.99999999999. `TransportEvent` then
// **floors** it, keeping the fraction in `_remainderTime` and adding it back to the
// audio time. So a note still *sounds* on the beat; it is merely *filed* one tick early,
// which is why this hid for so long.
//
// The clock only ever emits whole ticks, so every comparison between a transport
// position and a musical tick is off by one wherever this bites. `Transport.loop` fences
// the clock to `[loopStart, loopEnd)`, so with musical bounds A's notes fall *outside*
// the loop and never sound, while B's own notes fall *inside* it and sound at the end of
// every pass. Measured across the test scores, at each one's own tempo: 32 of 623 onsets
// affected in `waltz-for-nala`, 71 of 558 in the Chopin nocturne, 112 of 894 in the Adele
// arrangement, 0 of 196 in `Grüne_Augen_lügen_nicht` — and which onsets are hit changes
// with the tempo, so the speed control moves the failures around rather than removing
// them. No PPQ escapes it (192, 256, 384, 512, 960 and 1920 all fail at some tempo) and
// no input representation does either: the `"Ni"` string, a `Tone.Ticks` and raw seconds
// all land on the same floor, and the `i` notation is integers only (`/^(\d+)i$/`) so
// there is nothing to bias it with. `Math.round` of the round trip is never wrong (the
// error is ≤1.5e-11 ticks and goes both ways), but Tone floors rather than rounds and we
// cannot reach inside it — so the fence meets it where it files instead of arguing.
//
// score-web asks Tone itself for each onset's filed tick (`Transport.toTicks`, floored)
// rather than reproducing the arithmetic here, so this module only decides what to do
// with the pair. Keep it that way: a second implementation of Tone's conversion would
// drift the moment Tone reorders a multiply.

/**
 * How far below B's filed tick the end fence sits, in ticks.
 *
 * Any value in `(0, 1)` satisfies the two rules below; a half tick is simply the one
 * furthest from both edges. At 100 BPM it is 1.6 ms.
 */
export const LOOP_FENCE_BACKOFF_TICKS = 0.5;

export interface LoopFenceParams {
  /** A's tick as Tone filed it — the first tick the loop plays. */
  aTransportTicks: number;
  /** B's tick as Tone filed it — the first tick the loop must *not* play. */
  bTransportTicks: number;
}

export interface LoopFence {
  /** Assigned to `Transport.loopStart`. A whole tick, so it can go via `"Ni"`. */
  loopStartTicks: number;
  /**
   * Assigned to `Transport.loopEnd`. Fractional, so the caller has to convert it to
   * seconds — the tick notation is integers only.
   */
  loopEndTicks: number;
}

/**
 * The transport fence for a loop, in the transport's own tick space.
 *
 * Two rules, and both of them are load-bearing:
 *
 * - **`loopStartTicks` is A's filed tick exactly.** The wrap seeks the clock there and
 *   then fires that tick's timeline events, so a bound one tick off means A never
 *   sounds — on the first pass or any later one. It survives the write unharmed even
 *   though the setter re-converts it: `Transport.loopStart` is stored as a raw float and
 *   both of its readers tolerate the ≤1.5e-11 tick error (`forEachAtTime` matches with an
 *   epsilon of 1e-6, and the emitted ticks are rounded).
 *
 * - **`loopEndTicks` is half a tick *below* B's filed tick.** Tone tests
 *   `ticks >= loopEnd` against that same raw float, and the round trip can leave it a
 *   hair *above* the integer — enough for the wrap to slip a tick and let B's own notes
 *   sound at the end of every pass. Backing off puts the comparison unambiguously on the
 *   right side of B while still leaving every earlier tick inside the loop, so the wrap
 *   fires on exactly B's filed tick: the first tick the loop must not play.
 *
 * `transportTicks.test.ts` reproduces both writes, round trip and all, and asserts the
 * two rules over every loop and tempo — including the tick-scale float error, which is
 * the only reason the backoff has to exist at all.
 */
export function loopFence({ aTransportTicks, bTransportTicks }: LoopFenceParams): LoopFence {
  return {
    loopStartTicks: aTransportTicks,
    loopEndTicks: bTransportTicks - LOOP_FENCE_BACKOFF_TICKS,
  };
}

/**
 * How far below the end of the piece the metronome's last click may sit, in ticks.
 *
 * A whole tick, not the fence's half: this one absorbs the `TransportEvent` floor at the
 * top of this file rather than a float comparison, and that floor is a whole tick. Beats
 * are quarter-notes apart, so a tick of slack cannot reach the previous one.
 */
export const METRONOME_END_TOLERANCE_TICKS = 1;

export interface MetronomeClickParams {
  /** The click's position, as the transport reports it at the click's own audio time. */
  clickTicks: number;
  /** The end of the piece — `totalQuarters` in ticks, i.e. the closing barline. */
  pieceEndTicks: number;
}

/**
 * Whether a metronome click belongs to the piece, or has run off the end of it.
 *
 * The metronome is a `Transport.scheduleRepeat` with no end bound, and its clicks are raw
 * `OscillatorNode`s started at a *future* audio time. Neither half of that can be taken
 * back: by the time the RAF loop sees the transport reach the end and calls
 * `Transport.stop()`, the click on the closing barline has already been scheduled into
 * the audio graph, and stopping the transport does not unschedule a Web Audio node. So it
 * sounded — one beat too many, exactly as the piece ended. The click has to be refused
 * when it is *scheduled*, which is what this is for.
 *
 * A click at the closing barline is the downbeat of a measure that does not exist. The
 * last click a piece gets is the last beat that falls strictly inside it.
 *
 * The tolerance is the same "filed one tick early" defect as {@link loopFence}'s backoff
 * — score-web's `SEAM_EPSILON_TICKS` is the same number for the same reason — so the
 * comparison meets the click where Tone files it rather than where the beat is.
 */
export function metronomeClickSounds({ clickTicks, pieceEndTicks }: MetronomeClickParams): boolean {
  return clickTicks + METRONOME_END_TOLERANCE_TICKS < pieceEndTicks;
}

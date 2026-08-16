// Count-in: a metronome pre-roll that plays before a piece, routine, or loop
// begins, so the player has time to find the pulse. Pure time math only — the
// score-web layer supplies the meter/tempo it reads from OSMD and turns the
// returned offsets into audible clicks.

/** Number of measures to count in before playback. `0` disables the count-in. */
export type CountInMeasures = 0 | 1 | 2;

export const COUNT_IN_OPTIONS: CountInMeasures[] = [0, 1, 2];

export interface CountInParams {
  /** How many measures to count in (0 or less = none). */
  measures: number;
  /** Beats per measure — the time-signature numerator at the start point. */
  beatsPerMeasure: number;
  /** Seconds per beat at the count-in tempo (beat = time-signature denominator). */
  secPerBeat: number;
  /**
   * Beats of the count-in already covered by a prelude (anacrusis) at the start
   * point. The prelude is part of the LAST counted measure, so the real audio
   * begins this many beats before the first full downbeat and no pure-count
   * click covers those beats. `0` when there is no prelude (always the case for
   * loops, which start on a full beat).
   */
  pickupBeats?: number;
}

export interface CountInClick {
  /** Seconds from the start of the count-in at which this click sounds. */
  offsetSec: number;
  /** True on the first beat of each counted measure (accented click). */
  accented: boolean;
}

export interface CountInSchedule {
  /** Clicks to sound, in order, before the audio starts. */
  clicks: CountInClick[];
  /**
   * Seconds to wait after the count-in begins before starting the piece/loop
   * audio. Equals the prelude-adjusted count-in length; `0` when disabled.
   */
  delaySec: number;
}

const EMPTY: CountInSchedule = { clicks: [], delaySec: 0 };

/** What a start needs to know about itself to decide whether it counts in. */
export interface FreshStartParams {
  /** True when a loop is armed, so the start point is the loop's A handle. */
  hasLoop: boolean;
  /** True when this start moved the transport to the loop's A handle. */
  didLoopSeek: boolean;
  /**
   * True when a previous start's count-in was cancelled before it produced sound,
   * left the playhead exactly here, and is owed a retry.
   */
  resumingAbortedCountIn: boolean;
  /** Transport position this start begins from, in ticks. */
  posTicks: number;
  /** Ticks of the piece's first onset. */
  firstStepTicks: number;
}

/**
 * Does this start deserve a count-in?
 *
 * Only a *fresh* start does — the top of a piece or routine, or a loop entering at
 * its A handle. Resuming a pause partway through either is not fresh: the player
 * already has the pulse, and counting them in again would be an interruption.
 *
 * The loop branch cannot decide this from position alone. A loop that (re)starts at
 * A and a loop paused *on* A sit at the same tick, so the seek is what distinguishes
 * them — except after a cancelled count-in, which leaves the playhead on A having
 * never sounded a note. That case has to be remembered rather than measured, which is
 * what `resumingAbortedCountIn` carries. The piece branch needs no such term: a
 * cancelled count-in there leaves the playhead at the first onset, which already
 * reads as the top.
 */
export function isFreshStart(params: FreshStartParams): boolean {
  if (params.hasLoop) return params.didLoopSeek || params.resumingAbortedCountIn;
  return params.posTicks <= params.firstStepTicks;
}

/**
 * Prelude beats to fold in when a loop starts partway through a measure.
 *
 * A loop whose first note is `beatOffset` beats after its measure downbeat is
 * treated like an anacrusis: the beats from the loop start to the end of that
 * measure become the last counted measure's tail, so the loop enters on its
 * natural beat and the count-in's downbeats stay aligned to the loop's bar grid.
 * A loop that starts on a downbeat (offset 0) has no prelude and counts full
 * measures.
 *
 * Returns a value in `[0, beatsPerMeasure)` suitable as `pickupBeats`.
 */
export function loopLeadInBeats(beatOffset: number, beatsPerMeasure: number): number {
  if (beatsPerMeasure <= 0) return 0;
  const k = ((beatOffset % beatsPerMeasure) + beatsPerMeasure) % beatsPerMeasure;
  return k === 0 ? 0 : beatsPerMeasure - k;
}

/**
 * Build the click schedule for a count-in.
 *
 * The count-in spans `measures` full measures of the given meter. When a prelude
 * is present its beats fill the tail of the last counted measure, so the audio
 * starts `pickupBeats` early and only the remaining beats get a pure metronome
 * click. Accented clicks land on each measure's downbeat.
 *
 * Examples (4/4, quarter-note beats):
 *   1 measure, no prelude  → 4 clicks, audio after 4 beats
 *   1 measure, 1-beat prelude → 3 clicks, audio after 3 beats (prelude = beat 4)
 *   2 measures, no prelude → 8 clicks, audio after 8 beats
 */
export function computeCountIn(params: CountInParams): CountInSchedule {
  const { measures, beatsPerMeasure, secPerBeat } = params;
  const pickupBeats = params.pickupBeats ?? 0;

  if (measures <= 0 || beatsPerMeasure <= 0 || secPerBeat <= 0) return EMPTY;

  const totalBeats = measures * beatsPerMeasure;
  // Audio starts once the pure-count portion elapses; the prelude covers the
  // rest of the final measure. Clamp so an over-long prelude can't go negative.
  const audioStartBeats = Math.max(0, totalBeats - Math.max(0, pickupBeats));

  const clicks: CountInClick[] = [];
  // Click on every whole beat strictly before the audio start. The epsilon keeps
  // a beat that lands exactly on the audio-start boundary (integer prelude) from
  // producing a click that would collide with the first note.
  for (let beat = 0; beat < audioStartBeats - 1e-6; beat++) {
    clicks.push({ offsetSec: beat * secPerBeat, accented: beat % beatsPerMeasure === 0 });
  }

  return { clicks, delaySec: audioStartBeats * secPerBeat };
}

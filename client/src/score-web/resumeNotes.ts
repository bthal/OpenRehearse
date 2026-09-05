/**
 * Which notes are already sounding when playback resumes partway through them.
 *
 * Note events are scheduled on a `Tone.Part` by their onset tick, and a Part starts
 * only the events at or after the transport's position — `event.startOffset >= offset`
 * in Tone's own `_startNote`. A note whose onset is behind the playhead is therefore
 * never triggered, and resuming inside it produces silence for the rest of its length.
 *
 * That went unnoticed for years because every position the playhead can park on is
 * normally a note onset, so the gap is at most one note long and usually inaudible.
 * A tied chain breaks the assumption: the cursor visits each continuation, but the
 * continuations contribute no event of their own (playback skips them so the chain
 * sounds once, for its whole length), so the playhead can sit squarely inside a note
 * with nothing scheduled anywhere near it. A two-measure long tone makes that the
 * normal case rather than a curiosity.
 *
 * Pure and tick-based, with no tempo in it: seconds are the caller's business, and
 * this module lives under `src/` rather than in `score-web/` so it is covered by tsc
 * and Jest.
 */

/** A scheduled note, as `playback.ts` builds it. */
export interface ResumeCandidate {
  /** Onset, in transport ticks. */
  readonly ticks: number;
  readonly midi: number;
  /** Sounding length in quarter notes — the whole tied chain, not one note of it. */
  readonly durQ: number;
}

export interface SoundingNote {
  readonly midi: number;
  /** How far into the note the playhead already is, in quarters. Always > 0. */
  readonly elapsedQ: number;
  /** What is left to sound, in quarters. Always > 0. */
  readonly remainingQ: number;
}

/**
 * The notes spanning `resumeTicks`, with how far into each the playhead sits.
 *
 * Half-open on both ends, and both exclusions matter. A note whose onset *is* the
 * resume position is left out because the Part will fire it itself — returning it
 * here would attack the same note twice at the same instant. A note ending exactly
 * there is left out because it has finished.
 */
export function notesSoundingAt(
  events: readonly ResumeCandidate[],
  resumeTicks: number,
  ppq: number,
): SoundingNote[] {
  if (!Number.isFinite(resumeTicks) || resumeTicks <= 0) return [];
  if (!Number.isFinite(ppq) || ppq <= 0) return [];

  const sounding: SoundingNote[] = [];
  for (const event of events) {
    if (!Number.isFinite(event.ticks) || !Number.isFinite(event.durQ)) continue;
    if (event.durQ <= 0) continue;
    if (event.ticks >= resumeTicks) continue;
    const endTicks = event.ticks + event.durQ * ppq;
    if (endTicks <= resumeTicks) continue;
    const elapsedQ = (resumeTicks - event.ticks) / ppq;
    sounding.push({ midi: event.midi, elapsedQ, remainingQ: event.durQ - elapsedQ });
  }
  return sounding;
}

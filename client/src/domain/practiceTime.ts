// Practice-time accounting: turns "playback started / stopped" events into
// per-calendar-day second totals for the dashboard heatmap.
//
// Two independent stores drive playback (the score play view + routines share
// one, warm-ups have their own), so this module measures the *union* of their
// playing intervals rather than each one separately: wall-clock time is only
// counted once even if both report playing at the same moment.
//
// Pure time math — no timers, no storage. Every entry point takes `nowMs` so
// callers (and tests) own the clock.

/** Which surface reported playback. Two sources, one shared wall clock. */
export type PracticeSource = 'score' | 'warmup';

/** Seconds of practice to add to one local calendar day. */
export interface PracticeDelta {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  /** Whole seconds to add to that day's total. Always > 0. */
  seconds: number;
}

const MS_PER_SECOND = 1000;

/** Local-time `YYYY-MM-DD` key for a timestamp. Days are local, not UTC. */
export function practiceDayKey(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Local midnight that starts the day containing `ms`. */
function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight that starts the day after the one containing `ms`. */
function startOfNextLocalDay(ms: number): number {
  const d = new Date(startOfLocalDay(ms));
  // setDate handles month/year ends; going through the date object also keeps
  // DST-shifted days correct (a "day" is not always 24h of wall clock).
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/**
 * Split the interval `[startMs, endMs)` into per-local-day millisecond chunks,
 * cutting at each local midnight so a session that runs past midnight is
 * attributed to both days.
 */
export function splitIntervalByDay(startMs: number, endMs: number): { day: string; ms: number }[] {
  if (!(endMs > startMs)) return [];
  const chunks: { day: string; ms: number }[] = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const boundary = Math.min(startOfNextLocalDay(cursor), endMs);
    chunks.push({ day: practiceDayKey(cursor), ms: boundary - cursor });
    cursor = boundary;
  }
  return chunks;
}

/**
 * Accumulates real elapsed playing time across both playback stores.
 *
 * A single open segment spans from "first source started playing" to "last
 * source stopped", so overlapping sources cannot double-count wall clock.
 * Sub-second remainders are carried into the next segment instead of being
 * floored away, so repeated flushes during a long session don't leak time.
 */
export class PracticeClock {
  private readonly playing = new Set<PracticeSource>();
  /** Start of the currently open segment, or null when nothing is playing. */
  private segmentStartMs: number | null = null;

  /** True while at least one source is playing. */
  get isRunning(): boolean {
    return this.segmentStartMs !== null;
  }

  /**
   * Record a source's play state. Returns the day deltas that became durable
   * because of this transition (non-empty only when the last source stopped).
   */
  setPlaying(source: PracticeSource, playing: boolean, nowMs: number): PracticeDelta[] {
    if (playing) {
      this.playing.add(source);
      if (this.segmentStartMs === null) this.segmentStartMs = nowMs;
      return [];
    }
    this.playing.delete(source);
    if (this.playing.size > 0) return [];
    return this.closeSegment(nowMs, false);
  }

  /**
   * Bank the time accumulated so far without changing play state. Used on a
   * periodic tick and when the app is backgrounded, so a session that is never
   * cleanly stopped (app killed mid-play) still persists what it earned.
   */
  flush(nowMs: number): PracticeDelta[] {
    return this.closeSegment(nowMs, this.playing.size > 0);
  }

  /** Drops any open segment without banking it. For tests and teardown. */
  reset(): void {
    this.playing.clear();
    this.segmentStartMs = null;
  }

  private closeSegment(nowMs: number, keepRunning: boolean): PracticeDelta[] {
    const startMs = this.segmentStartMs;
    if (startMs === null || nowMs <= startMs) {
      // Clock skew or a stop with no elapsed time: keep the segment open only
      // if something is still playing, and bank nothing.
      this.segmentStartMs = keepRunning ? (startMs ?? nowMs) : null;
      return [];
    }

    const chunks = splitIntervalByDay(startMs, nowMs);
    const deltas: PracticeDelta[] = [];
    let remainderMs = 0;
    chunks.forEach((chunk, i) => {
      const seconds = Math.floor(chunk.ms / MS_PER_SECOND);
      if (seconds > 0) deltas.push({ day: chunk.day, seconds });
      // Only the final chunk's remainder can be carried forward; earlier chunks
      // end at a midnight that is already behind us (sub-second loss per day
      // boundary, which is immaterial for a heatmap).
      if (i === chunks.length - 1) remainderMs = chunk.ms - seconds * MS_PER_SECOND;
    });

    this.segmentStartMs = keepRunning ? nowMs - remainderMs : null;
    return deltas;
  }
}

/** Folds deltas into an existing day→seconds map, returning a new map. */
export function applyPracticeDeltas(
  totals: Readonly<Record<string, number>>,
  deltas: readonly PracticeDelta[],
): Record<string, number> {
  if (deltas.length === 0) return { ...totals };
  const next: Record<string, number> = { ...totals };
  for (const { day, seconds } of deltas) {
    next[day] = (next[day] ?? 0) + seconds;
  }
  return next;
}

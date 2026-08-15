// The note grid: the discrete positions the cursor and the loop handles are
// allowed to occupy. Every position the user produces by scrolling or dragging is
// continuous; it is resolved to one of these points immediately, so nothing ever
// sits between notes and pressing play never has to correct the position.
//
// The grid is the score-web layer's `cursorSteps` (one point per note onset, in
// playback order) plus a terminal point standing for the final barline. Only the
// two fields below are needed here, so this module stays free of OSMD, Tone and
// the DOM and can be unit-tested — `score-web/**` is excluded from Jest and tsc.

/** One snappable position. Structurally satisfied by score-web's `CursorStep`. */
export interface GridPoint {
  /** Musical position in quarter notes (fermata-expanded, as playback sees it). */
  quarters: number;
  /** Horizontal position in rendered score pixels. */
  pxLeft: number;
}

/**
 * Shortest loop the user may create, in quarter notes.
 *
 * Deliberately meter-independent. Deriving it from the time signature makes the
 * same drag legal in 6/8 and illegal in 2/2, and changes the rule silently at a
 * meter change. The cost is that a passage shorter than a quarter cannot be
 * looped on its own.
 */
export const LOOP_MIN_QUARTERS = 1;

export interface LoopIndices {
  aIndex: number;
  bIndex: number;
}

export interface LoopClampParams {
  /** The grid, ascending in both `quarters` and `pxLeft`. */
  grid: readonly GridPoint[];
  aIndex: number;
  bIndex: number;
  /** Which handle the finger owns. The other one moves only as a last resort. */
  moved: 'a' | 'b';
}

export interface SnapGridParams {
  /** Note onsets, ascending in both fields — score-web's `cursorSteps`. */
  onsets: readonly GridPoint[];
  /** Musical end of the piece, one quarter past the final onset in practice. */
  terminalQuarters: number;
  /** Where the final barline sits, already clamped to something reachable. */
  terminalPxLeft: number;
}

/**
 * Appends the terminal target to the onsets, normalising it so it is always
 * strictly right of, and at least {@link LOOP_MIN_QUARTERS} past, the final onset.
 *
 * That normalisation is what makes {@link clampLoopIndices} total: a loop of
 * `[lastOnset, terminal)` always satisfies the minimum, so dragging B to the end
 * can never fail to produce a legal loop and the final note is always loopable.
 */
export function buildSnapGrid({
  onsets,
  terminalQuarters,
  terminalPxLeft,
}: SnapGridParams): GridPoint[] {
  const lastOnset = onsets[onsets.length - 1];
  if (lastOnset === undefined) return [];
  return [
    ...onsets,
    {
      quarters: Math.max(terminalQuarters, lastOnset.quarters + LOOP_MIN_QUARTERS),
      pxLeft: Math.max(terminalPxLeft, lastOnset.pxLeft + 1),
    },
  ];
}

function quartersAt(grid: readonly GridPoint[], index: number): number {
  return grid[index]?.quarters ?? 0;
}

function clampIndex(index: number, last: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(last, Math.round(index)));
}

/** Last index whose `quarters` ≤ q, or -1 when every point is later than q. */
function floorByQuarters(grid: readonly GridPoint[], q: number): number {
  let lo = 0;
  let hi = grid.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const point = grid[mid];
    if (point !== undefined && point.quarters <= q) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** First index whose `quarters` ≥ q, or -1 when every point is earlier than q. */
function ceilByQuarters(grid: readonly GridPoint[], q: number): number {
  let lo = 0;
  let hi = grid.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const point = grid[mid];
    if (point !== undefined && point.quarters >= q) {
      best = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return best;
}

/**
 * Index of the grid point nearest `px`.
 *
 * Nearest rather than floor: the preview line makes the target explicit while
 * the user drags, so scrolling nine tenths of the way to the next note and
 * landing on the previous one would read as a bug. Exact midpoints resolve
 * forward.
 *
 * Returns 0 for an empty grid — callers guard on the point being present, the
 * same way the rest of the score-web layer does.
 */
export function nearestGridIndex(grid: readonly GridPoint[], px: number): number {
  if (grid.length === 0) return 0;

  let lo = 0;
  let hi = grid.length - 1;
  let floorIdx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const point = grid[mid];
    if (point !== undefined && point.pxLeft <= px) {
      floorIdx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const here = grid[floorIdx];
  const next = grid[floorIdx + 1];
  if (here === undefined || next === undefined) return floorIdx;
  return px - here.pxLeft < next.pxLeft - px ? floorIdx : floorIdx + 1;
}

/**
 * Resolves a dragged loop to legal half-open `[a, b)` indices: the note at `a` is
 * the first one played, the note at `b` is the first one *not* played.
 *
 * The handle the finger owns is honoured wherever possible — it is only ever
 * clamped, never overshot. The other handle moves only when the minimum cannot
 * otherwise be met, which happens at the ends of the piece; that mirrors
 * `placeLoopAtCursor`, which also anchors at the end and derives the other bound
 * backwards rather than shortening the loop.
 */
export function clampLoopIndices({ grid, aIndex, bIndex, moved }: LoopClampParams): LoopIndices {
  const last = grid.length - 1;
  // Fewer than two points cannot express a loop at all.
  if (last < 1) return { aIndex: 0, bIndex: Math.max(0, last) };

  let a = clampIndex(aIndex, last);
  let b = clampIndex(bIndex, last);

  if (moved === 'b') {
    const aQ = quartersAt(grid, a);
    const earliestB = ceilByQuarters(grid, aQ + LOOP_MIN_QUARTERS);
    b = earliestB === -1 ? last : Math.max(b, earliestB);
    if (quartersAt(grid, b) - aQ < LOOP_MIN_QUARTERS) {
      // No room ahead of A: anchor B at the end of the piece and retreat A.
      b = last;
      const retreat = floorByQuarters(grid, quartersAt(grid, b) - LOOP_MIN_QUARTERS);
      a = retreat === -1 ? 0 : Math.min(a, retreat);
    }
  } else {
    const bQ = quartersAt(grid, b);
    const latestA = floorByQuarters(grid, bQ - LOOP_MIN_QUARTERS);
    a = latestA === -1 ? 0 : Math.min(a, latestA);
    if (bQ - quartersAt(grid, a) < LOOP_MIN_QUARTERS) {
      // No room behind B: anchor A at the start of the piece and advance B.
      a = 0;
      const advance = ceilByQuarters(grid, quartersAt(grid, a) + LOOP_MIN_QUARTERS);
      b = advance === -1 ? last : Math.max(b, advance);
    }
  }

  // Guard against grids with repeated timestamps, where the quarter rules above
  // can leave the two handles on the same point.
  if (b <= a) b = Math.min(last, a + 1);
  if (b <= a) a = Math.max(0, b - 1);

  return { aIndex: a, bIndex: b };
}

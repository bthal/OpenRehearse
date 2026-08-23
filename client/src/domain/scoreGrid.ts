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

/**
 * Smallest pixel gap left between two adjacent grid points when an anchor is
 * clamped. Matches the margin {@link buildSnapGrid} keeps ahead of the final
 * onset, so no two points can ever collapse onto one pixel.
 */
const MIN_STEP_SEPARATION_PX = 1;

/** An onset, plus the barline that opens its measure when it starts one. */
export interface AnchorableStep {
  /** Where the onset's notehead group sits, in rendered score pixels. */
  pxLeft: number;
  /**
   * The barline opening this onset's measure — set only on the first onset of a
   * measure, and never on the opening measure of the piece, whose left edge is
   * the edge of the engraving itself (clef and key signature would end up right
   * of the playhead).
   */
  barPxLeft?: number;
}

/**
 * Moves the onset that starts a measure onto that measure's barline, and returns
 * one pixel per step. Onsets without a barline are returned untouched.
 *
 * Why the grid is worth bending: a measure start is the position users actually
 * aim at — a section junction divides two measures exactly, and a practice loop
 * is nearly always a whole number of bars. OSMD positions its cursor on the
 * notehead group, which sits inside the measure by the stave's note-start inset,
 * so without this every seam, handle and shade edge lands *after* the barline
 * that defines it.
 *
 * **The cost, measured rather than assumed.** On Bach BWV 846 at zoom 1 the shift
 * is a median 6.9 px (max 22.8 where accidentals widen the first entry). Those
 * pixels have to be traversed by someone: they leave the segment arriving at the
 * downbeat and join the one leaving it. Taking a typical sixteenth-note step in
 * that score as 1.0x, the two steps either side of a barline go from 1.50x / 1.28x
 * to 1.25x / 1.52x — the engraving already bulges there, and anchoring only
 * redistributes the bulge. Not noticeable in practice.
 *
 * Do not "fix" even that by splitting the pixel in two, one for overlays and one
 * for playback. A single value shared by the snap search, the overlays and the
 * playback interpolation is exactly what guarantees the playhead and the loop
 * handles can never disagree at rest; the alternative parks the playhead inside
 * the loop shade forever.
 */
export function anchorToBarlines(steps: readonly AnchorableStep[]): number[] {
  return steps.map((step, i) => {
    if (step.barPxLeft === undefined) return step.pxLeft;

    let target = step.barPxLeft;
    // Never let an anchor reach back past the previous onset. Skipped where the
    // raw sequence descends, which is a repeat's back-jump: there the previous
    // step belongs to a later pass over earlier engraving and says nothing about
    // how far left this one may go.
    const prev = steps[i - 1];
    if (prev !== undefined && prev.pxLeft <= step.pxLeft) {
      target = Math.max(target, prev.pxLeft + MIN_STEP_SEPARATION_PX);
    }
    // An anchor only ever pulls left; a barline right of its own notehead would
    // mean the geometry was misread.
    return Math.min(target, step.pxLeft);
  });
}

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
 * Index of the grid point nearest `quarters`.
 *
 * The musical-time counterpart of {@link nearestGridIndex}, for callers that hold a
 * position in quarter notes rather than pixels — restoring a saved bit, whose bounds
 * were persisted in musical time precisely because pixels do not survive a reload.
 *
 * Nearest rather than floor, and exact midpoints resolve forward, so the two searches
 * agree wherever both are applied to the same position.
 */
export function nearestIndexByQuarters(grid: readonly GridPoint[], quarters: number): number {
  if (grid.length === 0) return 0;

  const floorIdx = floorByQuarters(grid, quarters);
  if (floorIdx === -1) return 0;

  const here = grid[floorIdx];
  const next = grid[floorIdx + 1];
  if (here === undefined || next === undefined) return floorIdx;
  return quarters - here.quarters < next.quarters - quarters ? floorIdx : floorIdx + 1;
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

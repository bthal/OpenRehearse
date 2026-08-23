/**
 * Resolving saved bits into the WebView's live geometry.
 *
 * Pure and dependency-free, and here rather than in `score-web/src/playback.ts` for the
 * same reason `sectionResolve.ts` is: that directory is outside the app's tsconfig and
 * has no test setup, and this is logic whose failure would be both likely and silent.
 *
 * A bit is stored in ticks (see `domain/bits.ts`) because only musical time survives a
 * reload. Everything the UI does with it — the marker strip, the loop shade, the
 * grey-out, the duplicate check — needs pixels and grid indices. This is the one place
 * that conversion happens, and it runs once per load rather than per frame.
 */

// Relative rather than the `@domain/*` alias: this module is bundled into the WebView
// by esbuild, which does not read the app's tsconfig paths.
import { nearestIndexByQuarters, type GridPoint } from '../domain/scoreGrid';

/** Ticks per quarter note. Mirrors `TONE_PPQ` in `score-web/src/playback.ts`. */
const TICKS_PER_QUARTER = 192;

/**
 * The part of a `Bit` that placing one on the grid actually reads — structurally
 * satisfied by `Bit`, so callers pass their stored bits straight in.
 *
 * Narrower than `Bit` on purpose: a bit's hand, speed and metronome are native's business
 * and the score draws nothing from them, so the WebView never has to hold a full bit and
 * never has to invent one.
 */
export interface BitBounds {
  id: string;
  startTicks: number;
  endTicks: number;
}

export interface ResolvedBit {
  id: string;
  /** Half-open grid indices, the same representation `LoopRegion` holds. */
  aStep: number;
  bStep: number;
  /** Rendered score pixels, derived from the grid points the indices name. */
  aPx: number;
  bPx: number;
}

/**
 * Places each bit on the current grid.
 *
 * `onsets` and `snapGrid` are asked separately on purpose, mirroring how a live loop is
 * clamped: handle A must land on a note the playhead can actually sit on, while B may
 * land on the terminal target standing for the closing barline — otherwise a bit saved
 * with the final note inside it would come back one note short.
 *
 * A bit whose ticks fall outside the grid resolves to the nearest end rather than being
 * dropped. The score behind a bit is immutable after import, so an out-of-range tick
 * means the grid was rebuilt slightly differently, not that the passage is gone; losing
 * the user's saved region over a rounding difference would be the worse failure.
 *
 * Bits that resolve to a degenerate or duplicate span are dropped: two markers on the
 * same pixels are indistinguishable and one of them would be unreachable.
 */
export function resolveBits(
  bits: readonly BitBounds[],
  onsets: readonly GridPoint[],
  snapGrid: readonly GridPoint[],
): ResolvedBit[] {
  if (onsets.length === 0 || snapGrid.length === 0) return [];

  const seenSpans = new Set<string>();
  const resolved: ResolvedBit[] = [];

  for (const bit of bits) {
    const aStep = nearestIndexByQuarters(onsets, bit.startTicks / TICKS_PER_QUARTER);
    const bStep = nearestIndexByQuarters(snapGrid, bit.endTicks / TICKS_PER_QUARTER);
    const a = onsets[aStep];
    const b = snapGrid[bStep];
    if (a === undefined || b === undefined) continue;
    if (b.pxLeft <= a.pxLeft) continue;

    const key = `${a.pxLeft}:${b.pxLeft}`;
    if (seenSpans.has(key)) continue;
    seenSpans.add(key);

    resolved.push({ id: bit.id, aStep, bStep, aPx: a.pxLeft, bPx: b.pxLeft });
  }

  return resolved;
}

/**
 * The bit already occupying a pixel span, if any — the duplicate check that runs before
 * a new bit is created.
 *
 * Compares *pixels*, not ticks, which is what makes two passes of a repeat one bit: the
 * repeated bars are engraved once, so a loop over the second pass has different ticks
 * but the same pixels as one over the first. Saving both would draw two markers exactly
 * on top of each other, with only one of them tappable.
 */
export function findBitByPixelSpan(
  resolved: readonly ResolvedBit[],
  aPx: number,
  bPx: number,
): ResolvedBit | undefined {
  return resolved.find((bit) => bit.aPx === aPx && bit.bPx === bPx);
}

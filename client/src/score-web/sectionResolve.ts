/**
 * Resolving native's section list into the WebView's playback timeline.
 *
 * Pure and dependency-free on purpose. It lives here rather than in
 * `score-web/src/playback.ts` because that directory is excluded from the app's
 * tsconfig and has no test setup, and this is the one piece of that file whose
 * failure is both likely and silent.
 *
 * The problem it solves: native sends section starts as printed-score measure indices.
 * Some cannot be resolved — a measure the OSMD cursor never visits has no tick — and
 * the survivors are re-sorted into tick order. So position *k* in the resolved list is
 * not position *k* in what native sent. Native looks `SECTION_INDEX` up in its own
 * array, so every index after a dropped entry would name the wrong section.
 *
 * Detection never triggered this: its boundaries are already ascending and all
 * resolvable. User-placed boundaries are neither, which is why this now carries the
 * original position through the drop and the sort.
 */

export interface ResolvedSection {
  /** Tick this section starts at. */
  ticks: number;
  /** Palette color, supplied by native, which owns the theme. */
  color: string;
  /** Position in the arrays native sent — what SECTION_INDEX must report. */
  inputIndex: number;
}

/**
 * Resolves start measures to ticks, dropping what cannot be placed and sorting the
 * rest into playback order.
 *
 * Entries are dropped when the measure has no tick (the cursor never reached it), when
 * a color is missing, or when the tick duplicates one already taken — distinct measures
 * resolve to distinct ticks, so the dedupe should never fire, but a malformed list is
 * better collapsed than drawn twice over itself.
 */
export function resolveSections(
  startMeasureIndices: readonly number[],
  colors: readonly string[],
  tickForMeasure: (measureIndex: number) => number | null,
): ResolvedSection[] {
  const seen = new Set<number>();
  const resolved: ResolvedSection[] = [];

  for (let i = 0; i < startMeasureIndices.length; i++) {
    const measureIndex = startMeasureIndices[i];
    const color = colors[i];
    if (measureIndex === undefined || color === undefined) continue;
    const ticks = tickForMeasure(measureIndex);
    if (ticks === null || seen.has(ticks)) continue;
    seen.add(ticks);
    resolved.push({ ticks, color, inputIndex: i });
  }

  resolved.sort((a, b) => a.ticks - b.ticks);
  return resolved;
}

/**
 * Translates a position in the resolved list back to native's own indexing.
 *
 * Returns null for an index with no counterpart, which native renders as "no section"
 * rather than guessing — the same thing it already does for a piece with no sections.
 */
export function toInputIndex(resolved: readonly ResolvedSection[], index: number | null): number | null {
  if (index === null) return null;
  return resolved[index]?.inputIndex ?? null;
}

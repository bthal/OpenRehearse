// Bits: loop regions the user saved on a piece so they do not have to be drawn again
// next session, each carrying the practice settings it was saved with.
//
// A bit is deliberately nameless. It is identified by where it sits in the score, and
// drawn as a marker under the notation at exactly the span it loops — so there is
// nothing to read and nothing to type on a landscape phone. The consequence is that
// two bits may not share a span (see `score-web/bitResolve.ts`): identical markers
// would be indistinguishable and one of them unreachable.
//
// This module is pure so the row packing and the disk coercion stay testable without
// OSMD or a DOM.

import {
  coerceHand,
  coerceTempoMultiplier,
  type ActiveHand,
  type TempoMultiplier,
} from './practiceSettings';

export interface Bit {
  /**
   * Stable handle. Minted natively with `Crypto.randomUUID()` — the WebView cannot be
   * relied on for `crypto.randomUUID`, and an array index is not a handle: deleting a
   * bit would silently rename every one after it.
   */
  id: string;
  /**
   * Half-open `[startTicks, endTicks)` in the *unrolled playback timeline* — the same
   * coordinate `Tone.Transport.loopStart/loopEnd` take and `loopFromSteps` produces.
   *
   * Ticks rather than the measure + beat `specs/features/pieces-domain.md` also
   * suggests: measure + beat resolves through `firstTicksBySourceIndex`, which keeps
   * only a measure's *first* visit, so it cannot address a position on the second pass
   * of a repeat. Ticks are a pure function of the piece's XML, which is immutable
   * after import, so they survive a reload.
   */
  startTicks: number;
  endTicks: number;
  /** Which hand(s) sounded when the bit was saved; restored on entering it. */
  hand: ActiveHand;
  /** Speed the bit was saved at; restored on entering it. */
  tempoMultiplier: TempoMultiplier;
  /** Whether the metronome was on when the bit was saved; restored on entering it. */
  metronome: boolean;
}

/**
 * Most marker rows the strip may grow to.
 *
 * Rows are the only cost of nesting, and the strip sits under a staff system that is
 * vertically centred in a landscape viewport — so the budget is small and fixed.
 * Anything deeper shares the bottom row rather than pushing the notation around.
 */
export const BIT_MAX_ROWS = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Forces a blob read off disk into well-formed bits, so every consumer past the
 * repository can assume valid data — the same normalise-on-read contract
 * `normaliseSections` gives sections, and for the same reason: no migration, no
 * re-parse of the score at startup.
 *
 * Entries are dropped only when they carry no usable *region* — a missing id, a
 * non-numeric or inverted tick range, or a span already claimed. A rotted setting is
 * repaired to its default instead, because the region is the part that cost the user
 * something to place.
 */
export function normaliseBits(raw: unknown): Bit[] {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  const bits: Bit[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === 'string' && entry.id !== '' ? entry.id : null;
    const startTicks = finiteNumber(entry.startTicks);
    const endTicks = finiteNumber(entry.endTicks);
    if (id === null || startTicks === null || endTicks === null) continue;
    if (startTicks >= endTicks) continue;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    bits.push({
      id,
      startTicks,
      endTicks,
      hand: coerceHand(entry.hand),
      tempoMultiplier: coerceTempoMultiplier(entry.tempoMultiplier),
      metronome: entry.metronome === true,
    });
  }
  return bits;
}

/**
 * Field-wise equality, not `JSON.stringify` — key order off disk is not guaranteed
 * and a spurious inequality means a pointless write on every settings change.
 */
export function bitsEqual(a: readonly Bit[], b: readonly Bit[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((bit, i) => {
    const other = b[i];
    return (
      other !== undefined &&
      bit.id === other.id &&
      bit.startTicks === other.startTicks &&
      bit.endTicks === other.endTicks &&
      bit.hand === other.hand &&
      bit.tempoMultiplier === other.tempoMultiplier &&
      bit.metronome === other.metronome
    );
  });
}

/** A marker's horizontal extent in rendered score pixels. */
export interface BitSpan {
  aPx: number;
  bPx: number;
}

/**
 * Would adding `candidate` need more marker rows than the strip has?
 *
 * Asked *before* a bit is created, so the answer can be a refusal the user sees. The
 * clamp inside {@link packBitRows} is a safety net for spans that are already stored —
 * it collapses the overflow onto the last row, where two markers can end up drawn over
 * each other and one of them effectively untappable. Fine as a fallback, wrong as the
 * response to a deliberate act.
 *
 * Packing is order-dependent (shortest first), so the candidate cannot simply be assigned
 * a row on its own: adding it can push a longer span down. The whole set is repacked
 * without a cap and the deepest row is what decides.
 */
export function exceedsRowBudget(
  existing: readonly BitSpan[],
  candidate: BitSpan,
  maxRows: number = BIT_MAX_ROWS,
): boolean {
  const rows = packBitRows([...existing, candidate], Number.POSITIVE_INFINITY);
  return rows.some((row) => row >= maxRows);
}

/**
 * Assigns each span a marker row, shortest nearest the score.
 *
 * Packed rather than one row per bit: two bits at opposite ends of the piece never
 * overlap on screen, so they can share a row, and a piece with a dozen bits usually
 * needs two or three. What the packing *does* guarantee is that a bit nested inside a
 * longer one sits above it — placing spans shortest-first means the longer span
 * always finds the row it wants already taken.
 *
 * Rows past {@link BIT_MAX_ROWS} collapse onto the last one, where markers may end up
 * adjacent or touching. That is the deliberate trade: the strip's height is bounded so
 * it can never crowd the notation, and deep nesting is rare enough that a visual
 * collision there is cheaper than a growing strip.
 *
 * Returns one row index per *input* position, so the caller can keep its own ordering.
 */
export function packBitRows(spans: readonly BitSpan[], maxRows: number = BIT_MAX_ROWS): number[] {
  const rows: number[] = new Array<number>(spans.length).fill(0);
  const lastRow = Math.max(0, maxRows - 1);

  // Shortest first, ties broken by position so the result does not depend on the
  // order bits happen to be stored in.
  const order = spans
    .map((span, index) => ({ span, index }))
    .sort((x, y) => {
      const widthDiff = x.span.bPx - x.span.aPx - (y.span.bPx - y.span.aPx);
      if (widthDiff !== 0) return widthDiff;
      const startDiff = x.span.aPx - y.span.aPx;
      return startDiff !== 0 ? startDiff : x.index - y.index;
    });

  // Spans already placed in each row, so overlap can be tested per row. Small enough
  // (a handful of bits per row) that a linear scan beats an interval tree.
  const placed: BitSpan[][] = [];

  for (const { span, index } of order) {
    let row = 0;
    while (row < lastRow) {
      const occupants = placed[row];
      if (occupants === undefined) break;
      // Touching end to end is not overlapping: two bits that meet at a barline may
      // share a row, which is the common case for consecutive practice passages.
      const collides = occupants.some((o) => span.aPx < o.bPx && o.aPx < span.bPx);
      if (!collides) break;
      row++;
    }
    if (placed[row] === undefined) placed[row] = [];
    placed[row]!.push(span);
    rows[index] = row;
  }

  return rows;
}

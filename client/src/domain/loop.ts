// Loop ("bit") geometry. Positions are horizontal pixel offsets inside the
// rendered one-line score — the coordinate the loop UI draws in. This module is
// pure math so the placement rules stay testable without OSMD or a DOM.
//
// Placement is the *first* half of creating a loop: the result is a pixel span,
// which `scoreGrid.ts` then resolves onto the note grid. Legality (the minimum
// loop length, A before B) is decided there, in musical time — a pixel gap means
// nothing once positions are discrete, since the same distance spans four notes
// in a run of semiquavers and less than one in a bar of whole notes.

/** Width of a freshly created loop, in rendered score pixels. */
export const LOOP_DEFAULT_PX = 200;

export interface LoopPlacementParams {
  /** Cursor position in score pixels — where the loop should start. */
  cursorPx: number;
  /** Pixel position of the first note; a loop may not start left of it. */
  scorePxMin: number;
  /** Pixel position of the last note; a loop may not end right of it. */
  scorePxMax: number;
  /** Standard loop width. Defaults to {@link LOOP_DEFAULT_PX}. */
  widthPx?: number;
}

export interface LoopPlacement {
  /** Start (A handle) position in score pixels. */
  aPx: number;
  /** End (B handle) position in score pixels. */
  bPx: number;
}

/**
 * Places a standard-width loop that starts at the cursor and extends forward.
 *
 * Near the end of the piece a full-width loop no longer fits ahead of the
 * cursor. Rather than shortening it, B is anchored at the last note and A
 * derived backwards, so the loop keeps its standard width and its start lands
 * *before* the cursor. When the piece itself is shorter than the standard width
 * the loop collapses to the whole piece.
 */
export function placeLoopAtCursor({
  cursorPx,
  scorePxMin,
  scorePxMax,
  widthPx = LOOP_DEFAULT_PX,
}: LoopPlacementParams): LoopPlacement {
  // Tolerate swapped/negative inputs so a degenerate score can never produce an
  // inverted loop (which would make B un-draggable past A).
  const min = Math.min(scorePxMin, scorePxMax);
  const max = Math.max(scorePxMin, scorePxMax);
  const width = Math.max(0, widthPx);

  const start = Math.max(min, Math.min(max, cursorPx));
  const bPx = Math.min(start + width, max);
  const aPx = Math.max(min, bPx - width);
  return { aPx, bPx };
}

import { LOOP_DEFAULT_PX, placeLoopAtCursor } from '../loop';

// The rendered score spans [100, 1100] px, i.e. exactly five standard loops wide.
const SCORE = { scorePxMin: 100, scorePxMax: 1100 };

describe('placeLoopAtCursor', () => {
  it('starts the loop at the cursor and extends a standard width forward', () => {
    const { aPx, bPx } = placeLoopAtCursor({ cursorPx: 400, ...SCORE });
    expect(aPx).toBe(400);
    expect(bPx).toBe(400 + LOOP_DEFAULT_PX);
  });

  it('starts at the first note when the cursor sits at the start of the piece', () => {
    const { aPx, bPx } = placeLoopAtCursor({ cursorPx: 100, ...SCORE });
    expect(aPx).toBe(100);
    expect(bPx).toBe(100 + LOOP_DEFAULT_PX);
  });

  it('keeps the loop exactly one standard width wide away from the end', () => {
    const { aPx, bPx } = placeLoopAtCursor({ cursorPx: 731, ...SCORE });
    expect(bPx - aPx).toBe(LOOP_DEFAULT_PX);
  });

  it('shifts the start before the cursor when a full loop no longer fits ahead', () => {
    const cursorPx = 1000; // only 100 px of score left — half a standard loop
    const { aPx, bPx } = placeLoopAtCursor({ cursorPx, ...SCORE });
    expect(bPx).toBe(SCORE.scorePxMax);
    expect(aPx).toBe(SCORE.scorePxMax - LOOP_DEFAULT_PX);
    expect(aPx).toBeLessThan(cursorPx);
    expect(bPx - aPx).toBe(LOOP_DEFAULT_PX);
  });

  it('places a full-width loop ending at the last note when the cursor is on it', () => {
    const { aPx, bPx } = placeLoopAtCursor({ cursorPx: SCORE.scorePxMax, ...SCORE });
    expect(bPx).toBe(SCORE.scorePxMax);
    expect(aPx).toBe(SCORE.scorePxMax - LOOP_DEFAULT_PX);
  });

  it('collapses to the whole piece when the score is narrower than a standard loop', () => {
    const { aPx, bPx } = placeLoopAtCursor({ cursorPx: 120, scorePxMin: 100, scorePxMax: 180 });
    expect(aPx).toBe(100);
    expect(bPx).toBe(180);
  });

  it('clamps a cursor outside the score into the placeable range', () => {
    expect(placeLoopAtCursor({ cursorPx: -500, ...SCORE }).aPx).toBe(SCORE.scorePxMin);
    expect(placeLoopAtCursor({ cursorPx: 9999, ...SCORE }).bPx).toBe(SCORE.scorePxMax);
  });

  it('never returns an inverted loop, even for swapped bounds', () => {
    const { aPx, bPx } = placeLoopAtCursor({ cursorPx: 400, scorePxMin: 1100, scorePxMax: 100 });
    expect(bPx).toBeGreaterThanOrEqual(aPx);
  });

  it('honours an explicit width override', () => {
    const { aPx, bPx } = placeLoopAtCursor({ cursorPx: 400, ...SCORE, widthPx: 50 });
    expect(aPx).toBe(400);
    expect(bPx).toBe(450);
  });
});

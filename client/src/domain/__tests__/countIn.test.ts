import { computeCountIn, loopLeadInBeats } from '../countIn';

// One quarter-note beat at 60 BPM = 1 second, which keeps the offset assertions
// readable (offsetSec === beat index).
const SEC_PER_BEAT = 1;

describe('computeCountIn', () => {
  it('returns an empty schedule when disabled (measures = 0)', () => {
    const s = computeCountIn({ measures: 0, beatsPerMeasure: 4, secPerBeat: SEC_PER_BEAT });
    expect(s.clicks).toEqual([]);
    expect(s.delaySec).toBe(0);
  });

  it('counts one full 4/4 measure with no prelude (8 beats for two)', () => {
    const one = computeCountIn({ measures: 1, beatsPerMeasure: 4, secPerBeat: SEC_PER_BEAT });
    expect(one.clicks).toHaveLength(4);
    expect(one.delaySec).toBe(4);

    const two = computeCountIn({ measures: 2, beatsPerMeasure: 4, secPerBeat: SEC_PER_BEAT });
    expect(two.clicks).toHaveLength(8);
    expect(two.delaySec).toBe(8);
  });

  it('scales beats with the meter (2/4 → 4 beats for two measures)', () => {
    const s = computeCountIn({ measures: 2, beatsPerMeasure: 2, secPerBeat: SEC_PER_BEAT });
    expect(s.clicks).toHaveLength(4);
    expect(s.delaySec).toBe(4);
  });

  it('accents the downbeat of each counted measure', () => {
    const s = computeCountIn({ measures: 2, beatsPerMeasure: 4, secPerBeat: SEC_PER_BEAT });
    expect(s.clicks.map((c) => c.accented)).toEqual([
      true,
      false,
      false,
      false, // measure 1
      true,
      false,
      false,
      false, // measure 2
    ]);
  });

  it('places clicks on whole-beat boundaries', () => {
    const s = computeCountIn({ measures: 1, beatsPerMeasure: 3, secPerBeat: 0.5 });
    expect(s.clicks.map((c) => c.offsetSec)).toEqual([0, 0.5, 1]);
  });

  it('folds a 1-beat prelude into the last counted measure (1 measure → 3 clicks)', () => {
    const s = computeCountIn({
      measures: 1,
      beatsPerMeasure: 4,
      secPerBeat: SEC_PER_BEAT,
      pickupBeats: 1,
    });
    // Beats 1–3 click; the prelude sounds on beat 4, when the audio starts.
    expect(s.clicks).toHaveLength(3);
    expect(s.delaySec).toBe(3);
    expect(s.clicks[0]?.accented).toBe(true); // measure downbeat still accented
  });

  it('folds the prelude across a two-measure count-in (8 → 7 clicks)', () => {
    const s = computeCountIn({
      measures: 2,
      beatsPerMeasure: 4,
      secPerBeat: SEC_PER_BEAT,
      pickupBeats: 1,
    });
    expect(s.clicks).toHaveLength(7);
    expect(s.delaySec).toBe(7);
  });

  it('handles a sub-beat prelude (half-beat anacrusis)', () => {
    const s = computeCountIn({
      measures: 1,
      beatsPerMeasure: 4,
      secPerBeat: SEC_PER_BEAT,
      pickupBeats: 0.5,
    });
    // Audio starts at 3.5 beats; whole-beat clicks fall on 0,1,2,3.
    expect(s.clicks.map((c) => c.offsetSec)).toEqual([0, 1, 2, 3]);
    expect(s.delaySec).toBe(3.5);
  });

  it('never returns negative timing when the prelude exceeds the count-in', () => {
    const s = computeCountIn({
      measures: 1,
      beatsPerMeasure: 4,
      secPerBeat: SEC_PER_BEAT,
      pickupBeats: 6,
    });
    expect(s.clicks).toEqual([]);
    expect(s.delaySec).toBe(0);
  });
});

describe('loopLeadInBeats', () => {
  it('is 0 for a loop starting on a downbeat (full measures counted)', () => {
    expect(loopLeadInBeats(0, 4)).toBe(0);
  });

  it('folds the rest of the measure in for a mid-measure loop start', () => {
    // Loop starts on beat 3 (offset 2) of 4/4 → 2 lead-in beats, so a 2-measure
    // count-in becomes 8 − 2 = 6 clicks and the loop enters on its beat 3.
    expect(loopLeadInBeats(2, 4)).toBe(2);
    const s = computeCountIn({
      measures: 2,
      beatsPerMeasure: 4,
      secPerBeat: SEC_PER_BEAT,
      pickupBeats: loopLeadInBeats(2, 4),
    });
    expect(s.clicks).toHaveLength(6);
    expect(s.delaySec).toBe(6);
    // Downbeats of the count-in stay aligned to the loop's bar grid.
    expect(s.clicks.map((c) => c.accented)).toEqual([true, false, false, false, true, false]);
  });

  it('handles the last-beat and sub-beat loop starts', () => {
    expect(loopLeadInBeats(3, 4)).toBe(1); // loop on beat 4 → 1 lead-in beat
    expect(loopLeadInBeats(1.5, 4)).toBe(2.5); // "and of beat 2" → 2.5 lead-in beats
  });

  it('is phase-invariant across whole measures and guards bad meters', () => {
    expect(loopLeadInBeats(6, 4)).toBe(loopLeadInBeats(2, 4)); // offset wraps by measure
    expect(loopLeadInBeats(2, 0)).toBe(0);
  });
});

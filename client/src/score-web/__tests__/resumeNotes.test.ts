import { notesSoundingAt } from '../resumeNotes';

const PPQ = 192;
const q = (n: number) => n * PPQ;

// A two-measure held note in 4/4: onset at the top, eight quarters long.
const HELD = [{ ticks: 0, midi: 67, durQ: 8 }];

describe('notesSoundingAt', () => {
  it('finds a note that is already sounding when playback resumes inside it', () => {
    // The bug: resuming at the second measure's downbeat sounded nothing, because a
    // Tone.Part only fires events whose onset is at or after the resume position and
    // a tied chain contributes no event of its own.
    expect(notesSoundingAt(HELD, q(4), PPQ)).toEqual([
      { midi: 67, elapsedQ: 4, remainingQ: 4 },
    ]);
  });

  it('reports elapsed and remaining for a resume that is not on a beat', () => {
    expect(notesSoundingAt(HELD, q(2.5), PPQ)).toEqual([
      { midi: 67, elapsedQ: 2.5, remainingQ: 5.5 },
    ]);
  });

  it('ignores a note whose onset is the resume position', () => {
    // Tone.Part fires `startOffset >= offset` itself, so returning this note here
    // would attack it twice at the same instant.
    expect(notesSoundingAt(HELD, 0, PPQ)).toEqual([]);
  });

  it('ignores a note that ends exactly where playback resumes', () => {
    expect(notesSoundingAt(HELD, q(8), PPQ)).toEqual([]);
  });

  it('ignores notes wholly before or wholly after the resume position', () => {
    const events = [
      { ticks: 0, midi: 60, durQ: 1 },
      { ticks: q(16), midi: 72, durQ: 4 },
    ];
    expect(notesSoundingAt(events, q(8), PPQ)).toEqual([]);
  });

  it('returns every voice of a chord that spans the resume position', () => {
    const chord = [
      { ticks: 0, midi: 60, durQ: 8 },
      { ticks: 0, midi: 64, durQ: 8 },
      { ticks: q(1), midi: 67, durQ: 1 },
    ];
    expect(notesSoundingAt(chord, q(4), PPQ)).toEqual([
      { midi: 60, elapsedQ: 4, remainingQ: 4 },
      { midi: 64, elapsedQ: 4, remainingQ: 4 },
    ]);
  });

  it('stops a resumed note at the loop end so the next wrap does not stack a second voice', () => {
    // Loop A at 4q, B at 6q, inside a note running 0-8q. Left unbounded the voice
    // would still have 2q to run when the wrap sounds another copy of the same pitch,
    // and every pass would add one more.
    expect(notesSoundingAt(HELD, q(4), PPQ, { untilTicks: q(6) })).toEqual([
      { midi: 67, elapsedQ: 4, remainingQ: 2 },
    ]);
  });

  it('leaves a note that already ends before the loop end alone', () => {
    expect(notesSoundingAt(HELD, q(4), PPQ, { untilTicks: q(99) })).toEqual([
      { midi: 67, elapsedQ: 4, remainingQ: 4 },
    ]);
  });

  it('ignores a bound that is not a usable one rather than falling silent', () => {
    // A bound at or behind the resume position would leave nothing to sound. That is
    // a caller bug, and a slightly long note is a better failure than silence.
    expect(notesSoundingAt(HELD, q(4), PPQ, { untilTicks: q(4) })).toEqual([
      { midi: 67, elapsedQ: 4, remainingQ: 4 },
    ]);
    expect(notesSoundingAt(HELD, q(4), PPQ, { untilTicks: Number.NaN })).toEqual([
      { midi: 67, elapsedQ: 4, remainingQ: 4 },
    ]);
  });

  it('does not sound a stub of a note that has all but ended', () => {
    // Tone files a tick position up to one tick early (domain/transportTicks.ts), so a
    // note ending exactly where playback resumes can look like it has a tick left.
    // Without the tolerance that became a 50 ms blip of the previous note, underneath
    // the correct one.
    expect(notesSoundingAt(HELD, q(8) - 1, PPQ, { endToleranceTicks: 1 })).toEqual([]);
  });

  it('still sounds a note with real time left on it', () => {
    const [note] = notesSoundingAt(HELD, q(7), PPQ, { endToleranceTicks: 1 });
    expect(note?.remainingQ).toBe(1);
  });

  it('tolerates a zero or negative duration rather than sounding a phantom note', () => {
    expect(notesSoundingAt([{ ticks: 0, midi: 60, durQ: 0 }], q(1), PPQ)).toEqual([]);
  });
});

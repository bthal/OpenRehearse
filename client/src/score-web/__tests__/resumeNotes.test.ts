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

  it('tolerates a zero or negative duration rather than sounding a phantom note', () => {
    expect(notesSoundingAt([{ ticks: 0, midi: 60, durQ: 0 }], q(1), PPQ)).toEqual([]);
  });
});

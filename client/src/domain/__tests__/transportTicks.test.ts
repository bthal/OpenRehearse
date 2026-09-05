import { LOOP_FENCE_BACKOFF_TICKS, loopFence, metronomeClickSounds } from '../transportTicks';

const TONE_PPQ = 192;

// ─── A model of Tone, which belongs here and nowhere else ─────────────────────
//
// `transportTicks.ts` deliberately does not reproduce Tone's arithmetic — score-web asks
// the live transport for it. These tests do, because the whole point of the fence is to
// survive that arithmetic, and there is no Tone in the app's test environment (it is a
// score-web dependency, and score-web needs an AudioContext). Every number below was
// cross-checked against a real Tone 14.9.17 transport in a browser.

/** `ToneWithContext.toTicks` — a tick position out to seconds and straight back. */
function toneRoundTrip(ticks: number, bpm: number): number {
  const quarterSeconds = 60 / bpm;
  const seconds = (ticks * quarterSeconds) / TONE_PPQ; // TransportTimeClass._ticksToUnits
  return (seconds / quarterSeconds) * TONE_PPQ; // TransportTimeClass.toTicks
}

/** Where a `Tone.Part` event ends up: `TransportEvent.time = Math.floor(…)`. */
function filedTick(musicalTicks: number, bpm: number): number {
  return Math.floor(toneRoundTrip(musicalTicks, bpm));
}

/** What `Transport.loopStart = "<n>i"` leaves in `_loopStart`. */
function storedLoopStart(loopStartTicks: number, bpm: number): number {
  return toneRoundTrip(loopStartTicks, bpm);
}

/**
 * What `Transport.loopEnd = <seconds>` leaves in `_loopEnd`. The caller converts ticks
 * to seconds because the tick notation is integers only; the setter converts back.
 */
function storedLoopEnd(loopEndTicks: number, bpm: number): number {
  return toneRoundTrip(loopEndTicks, bpm);
}

/** `Timeline.forEachAtTime` matches an event to a position within `EPSILON`. */
const TONE_EPSILON = 1e-6;

/** `_processTick`'s `ticks >= _loopEnd`, over the whole ticks the clock emits. */
function wrapTick(loopEndTicks: number, bpm: number): number {
  return Math.ceil(storedLoopEnd(loopEndTicks, bpm));
}

// The positions from the bug report: the downbeats of measures 77 and 82 of
// `waltz-for-nala`, whose own tempo is 100 BPM.
const M77 = 43776;
const M82 = 46656;

describe('the defect these fences exist for', () => {
  it('files measures 77 and 82 of waltz-for-nala a tick early at its own tempo', () => {
    expect(filedTick(M77, 100)).toBe(M77 - 1);
    expect(filedTick(M82, 100)).toBe(M82 - 1);
  });

  it('files the same positions exactly at other tempos — why it looks intermittent', () => {
    expect(filedTick(M77, 120)).toBe(M77);
    expect(filedTick(M82, 60)).toBe(M82);
  });

  it('is never more than a tick early, at any tempo', () => {
    for (let bpm = 40; bpm <= 220; bpm += 2) {
      for (let ticks = 0; ticks <= 120_000; ticks += 384) {
        const filed = filedTick(ticks, bpm);
        expect(filed === ticks || filed === ticks - 1).toBe(true);
      }
    }
  });

  it('can also land a hair *above* the integer — which is what the backoff is for', () => {
    // 96 ticks at 41 BPM comes back as 96.00000000000003. A loopEnd written there would
    // be tested as `96 >= 96.00000000000003` — false — so the wrap would slip a tick and
    // sound B's own notes at the end of every pass. The backoff is the only thing
    // standing between the two.
    expect(toneRoundTrip(96, 41)).toBeGreaterThan(96);
    expect(wrapTick(96, 41)).toBe(97);
    expect(wrapTick(loopFence({ aTransportTicks: 0, bTransportTicks: 96 }).loopEndTicks, 41)).toBe(
      96,
    );
  });
});

describe('loopFence', () => {
  const fence = loopFence({ aTransportTicks: M77 - 1, bTransportTicks: M82 - 1 });

  it('starts exactly on A, so the wrap fires A note events', () => {
    expect(fence.loopStartTicks).toBe(M77 - 1);
  });

  it('wraps on B, so B note events never sound', () => {
    expect(wrapTick(fence.loopEndTicks, 100)).toBe(M82 - 1);
  });

  it('leaves the tick before B inside the loop', () => {
    expect(fence.loopEndTicks).toBeGreaterThan(M82 - 2);
  });

  it('backs the end off by less than a whole tick, so no onset can be swallowed', () => {
    expect(LOOP_FENCE_BACKOFF_TICKS).toBeGreaterThan(0);
    expect(LOOP_FENCE_BACKOFF_TICKS).toBeLessThan(1);
  });

  it('keeps the span the handles describe, wherever the fence is read', () => {
    const musical = loopFence({ aTransportTicks: M77, bTransportTicks: M82 });
    expect(wrapTick(fence.loopEndTicks, 100) - fence.loopStartTicks).toBe(
      wrapTick(musical.loopEndTicks, 100) - musical.loopStartTicks,
    );
  });
});

describe('loopFence invariants over every loop and tempo', () => {
  // The executable form of the browser sweep. Eighth-note onsets high enough up the
  // timeline for the float error to bite, every A < B pair, at nine tempos including the
  // score tempos of the test pieces and the non-integer one the Adele arrangement
  // reports. Fails if the backoff is dropped, made a whole tick, or moved to the start.
  const ONSETS = Array.from({ length: 45 }, (_, i) => 43_000 + i * 96);
  // A second grid low down the timeline, where the same tempos err the other way.
  const EARLY = Array.from({ length: 30 }, (_, i) => 96 + i * 96);

  it.each([40, 41, 72, 88, 92, 100, 107.99999999999999, 132, 220])(
    'holds at %p BPM',
    (bpm: number) => {
      for (const onsets of [ONSETS, EARLY]) {
        const filed = onsets.map((n) => filedTick(n, bpm));
        for (let i = 0; i < onsets.length; i++) {
          for (let j = i + 1; j < onsets.length; j++) {
            const a = filed[i]!;
            const b = filed[j]!;
            const { loopStartTicks, loopEndTicks } = loopFence({
              aTransportTicks: a,
              bTransportTicks: b,
            });
            // A is reachable: the wrap seeks to _loopStart and fires that tick's events,
            // which Tone matches to A's own filed tick within its epsilon.
            expect(Math.abs(storedLoopStart(loopStartTicks, bpm) - a)).toBeLessThan(TONE_EPSILON);
            // B is excluded: the transport wraps on B's own filed tick.
            expect(wrapTick(loopEndTicks, bpm)).toBe(b);
            // Nothing in between is: the onset before B still plays.
            expect(loopEndTicks).toBeGreaterThan(filed[j - 1]!);
            // And the loop is neither inverted nor empty.
            expect(loopEndTicks).toBeGreaterThan(loopStartTicks);
          }
        }
      }
    },
  );
});

describe('metronomeClickSounds', () => {
  // Hanon No. 1: sixteen 4/4 bars, so the closing barline is at quarter 64.
  const PIECE_END = 64 * TONE_PPQ;

  it('silences the click landing on the closing barline', () => {
    // The beat that used to be heard as one too many, right as the piece ended. It is
    // the downbeat of a measure that does not exist.
    expect(metronomeClickSounds({ clickTicks: PIECE_END, pieceEndTicks: PIECE_END })).toBe(false);
  });

  it('silences it even when Tone files it a tick early', () => {
    // The `TransportEvent` floor this module exists for: the click still *sounds* on the
    // barline, it is merely filed at 12287 instead of 12288, so an exact comparison
    // would let it through.
    expect(metronomeClickSounds({ clickTicks: PIECE_END - 1, pieceEndTicks: PIECE_END })).toBe(
      false,
    );
  });

  it('sounds the last real beat of the closing measure', () => {
    // Quarter 63 — inside the closing semibreve, and the beat a player is counting on.
    expect(metronomeClickSounds({ clickTicks: 63 * TONE_PPQ, pieceEndTicks: PIECE_END })).toBe(
      true,
    );
  });

  it('sounds every beat of a closing measure that ends off the beat', () => {
    // A short closing bar paying back a pickup: the piece ends at quarter 34.5, so the
    // beat at 34 is the last one and nothing is due at the barline itself.
    const end = 34.5 * TONE_PPQ;
    expect(metronomeClickSounds({ clickTicks: 34 * TONE_PPQ, pieceEndTicks: end })).toBe(true);
    expect(metronomeClickSounds({ clickTicks: 35 * TONE_PPQ, pieceEndTicks: end })).toBe(false);
  });

  it('silences everything past the end, however far past', () => {
    // The metronome is an unbounded repeat: nothing in the audio schedule stops it, so
    // if the RAF loop is throttled (backgrounded, screen off) it keeps arriving here.
    expect(metronomeClickSounds({ clickTicks: 200 * TONE_PPQ, pieceEndTicks: PIECE_END })).toBe(
      false,
    );
  });
});

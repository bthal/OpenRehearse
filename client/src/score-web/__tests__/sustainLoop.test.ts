import {
  blendSustainLoopSeam,
  nearestSampleMidi,
  prepareSustainLoop,
  resolveSustainLoop,
  type SustainLoopFrames,
} from '../sustainLoop';

const SR = 1000;

/** A sine of `periodFrames` frames, so a loop length that is a whole number of periods
 *  puts the two blended copies exactly in phase — the best case for the seam. */
function sine(length: number, periodFrames: number, amplitude = 1): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * i) / periodFrames);
  return out;
}

/** Renders `frames` of looped playback, the way an AudioBufferSourceNode would. */
function renderLooped(buffer: Float32Array, bounds: SustainLoopFrames, frames: number): number[] {
  const { startFrame, endFrame } = bounds;
  const out: number[] = [];
  let read = 0;
  for (let i = 0; i < frames; i++) {
    out.push(buffer[read] ?? 0);
    read += 1;
    if (read >= endFrame) read = startFrame;
  }
  return out;
}

/** The largest jump between neighbouring frames — a click is a large one. */
function maxStep(values: readonly number[]): number {
  let worst = 0;
  for (let i = 1; i < values.length; i++) {
    worst = Math.max(worst, Math.abs((values[i] as number) - (values[i - 1] as number)));
  }
  return worst;
}

describe('resolveSustainLoop', () => {
  it('converts seconds to frames', () => {
    expect(resolveSustainLoop({ startSec: 0.5, endSec: 2.9, crossfadeSec: 0.2 }, 3000, SR)).toEqual({
      startFrame: 500,
      endFrame: 2900,
      crossfadeFrames: 200,
    });
  });

  // A decoder that trims mp3 padding differently hands back a slightly shorter buffer;
  // giving up a few frames of loop beats giving up the loop.
  it('clamps an end past the buffer rather than refusing', () => {
    const bounds = resolveSustainLoop({ startSec: 0.5, endSec: 9, crossfadeSec: 0.2 }, 3000, SR);
    expect(bounds?.endFrame).toBe(3000);
  });

  it('clamps the crossfade to the material available before the loop start', () => {
    // S = 100 frames, so there are only 100 frames of fade-in material to read.
    const bounds = resolveSustainLoop({ startSec: 0.1, endSec: 2.9, crossfadeSec: 0.2 }, 3000, SR);
    expect(bounds?.crossfadeFrames).toBe(100);
  });

  it('clamps the crossfade to the loop length', () => {
    // E - S = 50 frames; a 200-frame seam would reach back past S.
    const bounds = resolveSustainLoop({ startSec: 0.5, endSec: 0.55, crossfadeSec: 0.2 }, 3000, SR);
    expect(bounds?.crossfadeFrames).toBe(50);
  });

  it('refuses a loop that ends at or before it starts', () => {
    expect(resolveSustainLoop({ startSec: 2, endSec: 2, crossfadeSec: 0.2 }, 3000, SR)).toBeNull();
    expect(resolveSustainLoop({ startSec: 2, endSec: 1, crossfadeSec: 0.2 }, 3000, SR)).toBeNull();
  });

  it('refuses a negative start, a crossfade that clamps away, and a degenerate buffer', () => {
    expect(resolveSustainLoop({ startSec: -1, endSec: 2, crossfadeSec: 0.2 }, 3000, SR)).toBeNull();
    // S = 0 leaves nothing to fade in from.
    expect(resolveSustainLoop({ startSec: 0, endSec: 2, crossfadeSec: 0.2 }, 3000, SR)).toBeNull();
    expect(resolveSustainLoop({ startSec: 0.5, endSec: 2, crossfadeSec: 0 }, 3000, SR)).toBeNull();
    expect(resolveSustainLoop({ startSec: 0.5, endSec: 2, crossfadeSec: 0.2 }, 0, SR)).toBeNull();
    expect(resolveSustainLoop({ startSec: 0.5, endSec: 2, crossfadeSec: 0.2 }, 3000, 0)).toBeNull();
    expect(
      resolveSustainLoop({ startSec: NaN, endSec: 2, crossfadeSec: 0.2 }, 3000, SR),
    ).toBeNull();
  });
});

describe('blendSustainLoopSeam', () => {
  const bounds: SustainLoopFrames = { startFrame: 200, endFrame: 700, crossfadeFrames: 100 };

  it('writes the equal-power weighted sum over the seam and nothing else', () => {
    const original = sine(1000, 40);
    const blended = Float32Array.from(original);
    blendSustainLoopSeam(blended, bounds);

    for (let i = 0; i < 1000; i++) {
      const inSeam = i >= 600 && i < 700;
      if (inSeam) continue;
      expect(blended[i]).toBe(original[i]);
    }
    for (let i = 0; i < 100; i++) {
      const angle = (i / 100) * (Math.PI / 2);
      const expected =
        (original[600 + i] as number) * Math.cos(angle) +
        (original[100 + i] as number) * Math.sin(angle);
      expect(blended[600 + i]).toBeCloseTo(expected, 6);
    }
  });

  // The seam's whole purpose: the last frame the loop plays has to lead into the first
  // one as smoothly as the untouched original leads into it. The 2% slack is the
  // equal-power pair's own gain one frame short of the end (cos + sin at 0.495π).
  it('leaves no discontinuity at the wrap for a period-aligned sine', () => {
    const period = 50; // 500-frame loop = 10 whole periods
    const original = sine(1000, period);
    const blended = Float32Array.from(original);
    blendSustainLoopSeam(blended, bounds);

    const naturalStep = Math.abs((original[200] as number) - (original[199] as number));
    const wrapStep = Math.abs((blended[200] as number) - (blended[699] as number));
    expect(wrapStep).toBeLessThanOrEqual(naturalStep * 1.02);
  });

  // The case the blend exists for. 500 frames is 16⅔ periods of a 30-frame sine, so the
  // loop end and the loop start meet a third of a cycle out of phase and a raw wrap is
  // a hard step — an audible click on every pass.
  it('removes the discontinuity a non-period-aligned loop would have', () => {
    const period = 30;
    const original = sine(1000, period);
    const blended = Float32Array.from(original);
    blendSustainLoopSeam(blended, bounds);

    // The ceiling is the untouched sine's own largest inter-frame step, times the
    // equal-power pair's worst-case coherent gain of sqrt(2) — see the next test.
    const naturalMaxStep = Math.abs(Math.sin((2 * Math.PI) / period));
    expect(maxStep(renderLooped(original, bounds, 2400))).toBeGreaterThan(naturalMaxStep * 5);
    expect(maxStep(renderLooped(blended, bounds, 2400))).toBeLessThanOrEqual(
      naturalMaxStep * Math.SQRT2 * 1.01,
    );
  });

  // Recorded rather than regretted: equal-power fades keep the *expected* energy flat
  // for two copies meeting at an arbitrary phase, which is the real case across a whole
  // sample set. Where the two happen to be exactly in phase they instead add
  // coherently, so the seam swells by up to +3 dB over its 0.2 s; where they are in
  // antiphase they comb down. Linear fades would trade that swell for a dip, which is
  // the more audible failure. Neither is a click.
  it('gains up to +3 dB where the blended copies are exactly in phase', () => {
    const period = 50; // 500-frame loop = 10 whole periods, so E - F + i and S - F + i match
    const original = sine(1000, period);
    const blended = Float32Array.from(original);
    blendSustainLoopSeam(blended, bounds);

    let worstRatio = 0;
    for (let i = 0; i < 100; i++) {
      const before = Math.abs(original[600 + i] as number);
      if (before < 0.5) continue; // ignore frames near a zero crossing
      worstRatio = Math.max(worstRatio, Math.abs(blended[600 + i] as number) / before);
    }
    expect(worstRatio).toBeGreaterThan(1.3);
    expect(worstRatio).toBeLessThanOrEqual(Math.SQRT2 + 1e-6);
  });

  it('does nothing when the bounds do not fit the channel', () => {
    const short = sine(300, 40);
    const copy = Float32Array.from(short);
    blendSustainLoopSeam(copy, bounds);
    expect(Array.from(copy)).toEqual(Array.from(short));
  });
});

describe('prepareSustainLoop', () => {
  it('blends every channel and reports the bounds', () => {
    const left = sine(3000, 40);
    const right = sine(3000, 40, 0.5);
    const bounds = prepareSustainLoop(
      [left, right],
      { startSec: 0.5, endSec: 2.9, crossfadeSec: 0.2 },
      3000,
      SR,
    );
    expect(bounds).toEqual({ startFrame: 500, endFrame: 2900, crossfadeFrames: 200 });
    // Both channels moved; an untouched channel would still equal its own source.
    expect(left[2800]).not.toBe(Math.sin((2 * Math.PI * 2800) / 40));
    expect(right[2800]).not.toBe(0.5 * Math.sin((2 * Math.PI * 2800) / 40));
  });

  it('leaves the channels alone when the spec cannot be honoured', () => {
    const channel = sine(3000, 40);
    const copy = Float32Array.from(channel);
    expect(
      prepareSustainLoop([channel], { startSec: 2, endSec: 1, crossfadeSec: 0.2 }, 3000, SR),
    ).toBeNull();
    expect(Array.from(channel)).toEqual(Array.from(copy));
  });
});

describe('nearestSampleMidi', () => {
  const clarinet = [48, 51, 54, 57, 60, 63, 66, 69, 72, 75, 78, 81, 84, 87, 90, 93, 96];

  it('picks the closest sample', () => {
    expect(nearestSampleMidi(61, clarinet)).toBe(60);
    expect(nearestSampleMidi(62, clarinet)).toBe(63);
    expect(nearestSampleMidi(60, clarinet)).toBe(60);
  });

  // A pitch exactly between two samples plays from the lower one, so the shift is up.
  it('resolves a tie downward', () => {
    expect(nearestSampleMidi(62, [60, 64])).toBe(60);
    expect(nearestSampleMidi(62, [64, 60])).toBe(60);
  });

  it('clamps to the ends of the set rather than going silent', () => {
    expect(nearestSampleMidi(20, clarinet)).toBe(48);
    expect(nearestSampleMidi(120, clarinet)).toBe(96);
  });

  it('returns null for an empty set', () => {
    expect(nearestSampleMidi(60, [])).toBeNull();
  });
});

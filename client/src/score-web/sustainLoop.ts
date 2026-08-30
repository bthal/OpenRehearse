/**
 * The pure maths behind looping a sustained instrument's sample — no Tone, no DOM.
 *
 * `Tone.Sampler` cannot loop (`SamplerOptions` is `attack | release | onload |
 * onerror | baseUrl | curve | urls`), so a note that outlasts its buffer simply stops
 * — which the 3.13 s bundled clarinet one-shots hit constantly. The fix is to let Web
 * Audio do the looping natively, via `AudioBufferSourceNode`'s own `loop` /
 * `loopStart` / `loopEnd`, and to make the wrap *inaudible* by pre-blending the buffer
 * **once at load** rather than juggling overlapping voices at runtime.
 *
 * With loop start `S`, loop end `E` and crossfade length `F`, all in frames:
 *
 *     for i in [0, F):
 *       buf[E - F + i] = orig[E - F + i] * fadeOut(i/F) + orig[S - F + i] * fadeIn(i/F)
 *
 * The material immediately before `E` has then already been blended toward the
 * material immediately before `S`, so when playback wraps from `E` back to `S` the
 * signal is continuous — the sample just before the wrap equals the sample just before
 * `S`, which is exactly the neighbour `S` follows in the untouched original.
 *
 * The fades are **equal power** (`cos`/`sin`), not linear. One set of loop bounds is
 * declared per sample set and applies to all of its pitches, so the loop length is not
 * a whole number of periods for any particular note and the two blended copies meet at
 * an arbitrary phase. Equal power keeps the *expected* energy flat across that blend;
 * a linear fade would dip wherever the two copies are out of phase.
 *
 * Lives here rather than in `score-web/` because `score-web/` is outside tsc and Jest
 * (see AGENTS.md's module map) and this is precisely the kind of thing that has to be
 * tested on synthetic data rather than by ear.
 */

import type { SustainLoop } from '../domain/instrument';

/** The declared bounds resolved against one decoded buffer, in frames. */
export interface SustainLoopFrames {
  readonly startFrame: number;
  readonly endFrame: number;
  readonly crossfadeFrames: number;
}

/**
 * Turns a declared spec into frame bounds for one buffer, or `null` if it cannot be
 * honoured at all.
 *
 * The two clamps are both structural rather than defensive tidying:
 *
 * - **`E` past the buffer is clamped, not refused.** The bounds are measured against
 *   one mp3 decoder; another may trim the encoder's padding by a few milliseconds and
 *   hand back a marginally shorter buffer. Losing those milliseconds of loop is much
 *   better than losing the loop.
 * - **`F` is clamped to both `S` and `E - S`.** The fade-in material is read from
 *   `[S - F, S)`, which has to exist; and the blended region `[E - F, E)` must not
 *   reach back past `S`, or the seam would overwrite material the loop still has to
 *   play through on every pass.
 *
 * A loop that ends at or before it starts, or whose crossfade clamps away to nothing,
 * is refused — there is no sensible repair, and a one-shot is a better answer than a
 * buzzing one-frame loop.
 */
export function resolveSustainLoop(
  spec: SustainLoop,
  totalFrames: number,
  sampleRate: number,
): SustainLoopFrames | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  if (!Number.isFinite(totalFrames) || totalFrames <= 0) return null;
  const { startSec, endSec, crossfadeSec } = spec;
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return null;
  if (!Number.isFinite(crossfadeSec)) return null;

  const startFrame = Math.round(startSec * sampleRate);
  const endFrame = Math.min(Math.round(endSec * sampleRate), Math.floor(totalFrames));
  if (startFrame < 0 || endFrame <= startFrame) return null;

  const crossfadeFrames = Math.min(
    Math.round(crossfadeSec * sampleRate),
    startFrame,
    endFrame - startFrame,
  );
  if (crossfadeFrames < 1) return null;

  return { startFrame, endFrame, crossfadeFrames };
}

/**
 * Blends one channel's loop seam in place, so `[S, E)` can be looped natively.
 *
 * The fade-in material is copied out first. It is read from strictly below the write
 * region either way (`S - F + i < S <= E - F + i`, given the clamps above), so an
 * in-place read would also be correct — the copy is there to make that non-obvious
 * fact irrelevant to anyone reading the loop.
 */
export function blendSustainLoopSeam(channel: Float32Array, bounds: SustainLoopFrames): void {
  const { startFrame, endFrame, crossfadeFrames } = bounds;
  if (endFrame > channel.length || startFrame < crossfadeFrames) return;

  const fadeInSource = channel.slice(startFrame - crossfadeFrames, startFrame);
  const seamStart = endFrame - crossfadeFrames;
  for (let i = 0; i < crossfadeFrames; i++) {
    const angle = (i / crossfadeFrames) * (Math.PI / 2);
    const out = channel[seamStart + i] ?? 0;
    const incoming = fadeInSource[i] ?? 0;
    channel[seamStart + i] = out * Math.cos(angle) + incoming * Math.sin(angle);
  }
}

/**
 * Resolves the spec against a buffer's shape and blends every channel.
 *
 * Returns the bounds the caller should hand to `loopStart`/`loopEnd`, or `null` when
 * the sample must stay a one-shot. Note that those two are in **buffer** seconds and
 * are unaffected by `playbackRate`, so a pitch-shifted note needs no scaling of them.
 */
export function prepareSustainLoop(
  channels: readonly Float32Array[],
  spec: SustainLoop,
  totalFrames: number,
  sampleRate: number,
): SustainLoopFrames | null {
  const bounds = resolveSustainLoop(spec, totalFrames, sampleRate);
  if (!bounds) return null;
  for (const channel of channels) blendSustainLoopSeam(channel, bounds);
  return bounds;
}

/**
 * The sample a requested pitch should be played from: the nearest one, ties going to
 * the lower sample.
 *
 * This is what `Tone.Sampler` does internally and the reason a set spaced about a
 * minor third apart covers a full range. Preferring the lower neighbour on a tie means
 * a tie pitch-shifts *up*, which stretches formants rather than compressing them —
 * marginal at a minor third, but it makes the choice deterministic instead of
 * dependent on iteration order.
 */
export function nearestSampleMidi(midi: number, available: readonly number[]): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (const candidate of available) {
    const distance = Math.abs(candidate - midi);
    if (distance < bestDistance || (distance === bestDistance && best !== null && candidate < best)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

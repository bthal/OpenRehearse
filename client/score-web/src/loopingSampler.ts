import * as Tone from 'tone';

import type { SustainLoopFrames } from '../../src/score-web/sustainLoop';
import { nearestSampleMidi, resumeBufferOffsetSec } from '../../src/score-web/sustainLoop';

/**
 * A minimal sampler that can sustain a note past the end of its recording.
 *
 * It exists because `Tone.Sampler` cannot: its options are `attack | release | onload
 * | onerror | baseUrl | curve | urls`, with no loop among them, so it plays a one-shot
 * and the sound ends when the buffer does — whatever duration `triggerAttackRelease`
 * was given. The bundled clarinet samples are 3.13 s, so every long note truncated.
 *
 * The looping itself is Web Audio's, not ours: `AudioBufferSourceNode` has `loop`,
 * `loopStart` and `loopEnd` built in, and `Tone.ToneBufferSource` exposes all three.
 * What makes the wrap inaudible is that each buffer was pre-blended **once at load**
 * (`src/score-web/sustainLoop.ts`) so the material before the loop end already leads
 * into the material at the loop start. Nothing overlaps at runtime; one voice per
 * note, exactly as before.
 *
 * `loopStart`/`loopEnd` are in **buffer** seconds and are unaffected by
 * `playbackRate`, so a pitch-shifted note needs no scaling of them.
 *
 * A decaying set (the piano) keeps `Tone.Sampler` for its ordinary notes, which it is
 * doing a good job of — see `compound-docs/tone-playback.md`. It does borrow this
 * player for one thing: resuming inside a held note needs a buffer started at an
 * offset, and the Sampler hardcodes zero.
 */

interface LoopedSample {
  buffer: AudioBuffer;
  /** Null when the buffer could not be looped; it then plays as a one-shot. */
  loop: SustainLoopFrames | null;
}

/**
 * A few milliseconds of fade at each end of a note, so a buffer that starts and ends
 * mid-waveform does not click. Short enough not to soften the reed attack, which is
 * already only ~1.6 dB below the steady state in this set. The release is the longer
 * of the two because it is the one a listener hears as a note "stopping" rather than
 * being cut.
 */
const ATTACK_SEC = 0.006;
const RELEASE_SEC = 0.08;

export class LoopingSamplePlayer {
  private readonly output: Tone.Gain;
  private readonly samples = new Map<number, LoopedSample>();
  private midis: number[] = [];
  private readonly voices = new Set<Tone.ToneBufferSource>();

  constructor() {
    this.output = new Tone.Gain(1).toDestination();
  }

  /**
   * Registers one decoded, already-blended sample.
   *
   * Note names come in as Tone spells them (`Eb3`, `D#1`); they are resolved to MIDI
   * once here so the per-note lookup is arithmetic rather than string work.
   */
  add(noteName: string, buffer: AudioBuffer, loop: SustainLoopFrames | null): void {
    const midi = Math.round(Tone.Frequency(noteName).toMidi());
    if (!Number.isFinite(midi)) return;
    this.samples.set(midi, { buffer, loop });
    this.midis = [...this.samples.keys()].sort((a, b) => a - b);
  }

  get loaded(): boolean {
    return this.samples.size > 0;
  }

  /**
   * Sounds `noteName` for `durSec`, starting at audio-context time `time`.
   *
   * Same contract as `Tone.Sampler.triggerAttackRelease`, including that the release
   * tail extends past `durSec` — the note is *released* at `time + durSec`, not
   * silenced there.
   *
   * `elapsedSec` is how long the note has *already* been sounding, which is non-zero
   * only when playback resumes inside a held note. The buffer then starts partway in
   * rather than at its attack, so a long tone rejoins itself instead of acquiring a
   * second reed attack halfway through. `Tone.Sampler` cannot do this at all — it
   * hardcodes a zero offset — which is why the resume path uses this player even for
   * an instrument whose ordinary notes go through the Sampler.
   */
  triggerAttackRelease(noteName: string, durSec: number, time: number, elapsedSec = 0): void {
    const midi = Math.round(Tone.Frequency(noteName).toMidi());
    const sampleMidi = nearestSampleMidi(midi, this.midis);
    if (sampleMidi === null) return;
    const sample = this.samples.get(sampleMidi);
    if (!sample) return;

    const { sampleRate } = sample.buffer;
    const playbackRate = Math.pow(2, (midi - sampleMidi) / 12);
    const offsetSec =
      elapsedSec > 0
        ? resumeBufferOffsetSec(
            elapsedSec,
            playbackRate,
            sample.buffer.duration,
            sample.loop,
            sampleRate,
          )
        : 0;
    // A one-shot that has already run out has genuinely stopped; there is no sound
    // left to rejoin, and starting it over would be a re-attack.
    if (offsetSec === null) return;

    const source = new Tone.ToneBufferSource({
      url: sample.buffer,
      loop: sample.loop !== null,
      loopStart: sample.loop ? sample.loop.startFrame / sampleRate : 0,
      loopEnd: sample.loop ? sample.loop.endFrame / sampleRate : 0,
      playbackRate,
      fadeIn: ATTACK_SEC,
      fadeOut: RELEASE_SEC,
      curve: 'linear',
      onended: (self) => {
        this.voices.delete(self as Tone.ToneBufferSource);
      },
    }).connect(this.output);
    this.voices.add(source);
    // The explicit offset matters even when it is 0: `ToneBufferSource.start` defaults
    // a looping source's offset to `loopStart`, which would skip the note's attack.
    source.start(time, offsetSec, durSec);
  }

  /**
   * Silences everything now.
   *
   * A one-shot ends by itself, which is why the Sampler path never needed this. A
   * looping voice does not: it is scheduled to stop at the note's end, and a note
   * several seconds long would go on sounding after the transport had stopped.
   */
  releaseAll(): void {
    for (const voice of [...this.voices]) {
      try {
        voice.stop(Tone.now());
      } catch {
        // Already stopped or disposed — nothing to release.
      }
    }
  }

  dispose(): void {
    for (const voice of [...this.voices]) {
      try {
        voice.dispose();
      } catch {
        // Already disposed by its own onended handler.
      }
    }
    this.voices.clear();
    this.samples.clear();
    this.midis = [];
    this.output.dispose();
  }
}

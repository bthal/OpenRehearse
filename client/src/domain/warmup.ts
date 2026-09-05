// WarmUpType is derived from WARM_UP_REGISTRY — see warmupRegistry.ts.
export type WarmUpHand = 'both' | 'right' | 'left';
export type WarmUpScaleMode = 'major' | 'minor';

export const WARMUP_KEYS = [
  { label: 'C', pitchClass: 0, mode: 'major' as WarmUpScaleMode },
  { label: 'Cm', pitchClass: 0, mode: 'minor' as WarmUpScaleMode },
  { label: 'C#', pitchClass: 1, mode: 'major' as WarmUpScaleMode },
  { label: 'C#m', pitchClass: 1, mode: 'minor' as WarmUpScaleMode },
  { label: 'D', pitchClass: 2, mode: 'major' as WarmUpScaleMode },
  { label: 'Dm', pitchClass: 2, mode: 'minor' as WarmUpScaleMode },
  { label: 'D#', pitchClass: 3, mode: 'major' as WarmUpScaleMode },
  { label: 'D#m', pitchClass: 3, mode: 'minor' as WarmUpScaleMode },
  { label: 'E', pitchClass: 4, mode: 'major' as WarmUpScaleMode },
  { label: 'Em', pitchClass: 4, mode: 'minor' as WarmUpScaleMode },
  { label: 'F', pitchClass: 5, mode: 'major' as WarmUpScaleMode },
  { label: 'Fm', pitchClass: 5, mode: 'minor' as WarmUpScaleMode },
  { label: 'F#', pitchClass: 6, mode: 'major' as WarmUpScaleMode },
  { label: 'F#m', pitchClass: 6, mode: 'minor' as WarmUpScaleMode },
  { label: 'G', pitchClass: 7, mode: 'major' as WarmUpScaleMode },
  { label: 'Gm', pitchClass: 7, mode: 'minor' as WarmUpScaleMode },
  { label: 'G#', pitchClass: 8, mode: 'major' as WarmUpScaleMode },
  { label: 'G#m', pitchClass: 8, mode: 'minor' as WarmUpScaleMode },
  { label: 'A', pitchClass: 9, mode: 'major' as WarmUpScaleMode },
  { label: 'Am', pitchClass: 9, mode: 'minor' as WarmUpScaleMode },
  { label: 'A#', pitchClass: 10, mode: 'major' as WarmUpScaleMode },
  { label: 'A#m', pitchClass: 10, mode: 'minor' as WarmUpScaleMode },
  { label: 'B', pitchClass: 11, mode: 'major' as WarmUpScaleMode },
  { label: 'Bm', pitchClass: 11, mode: 'minor' as WarmUpScaleMode },
] as const;

export type WarmUpKey = (typeof WARMUP_KEYS)[number];

export const WARMUP_BPMS = [40, 50, 60, 70, 80, 100, 120, 140, 160, 180] as const;
export type WarmUpBpm = (typeof WARMUP_BPMS)[number];
export const DEFAULT_WARMUP_BPM: WarmUpBpm = 60;

export const WARMUP_OCTAVES = [1, 2, 3] as const;
export type WarmUpOctaves = (typeof WARMUP_OCTAVES)[number];

// 4-5 drill only: how many times the peak bar (fingers 2-3 at the top of the melody,
// G-A in C major) is played before the melody turns around. 1 = no repeat.
export const WARMUP_PEAK_REPEATS = [1, 2, 4, 8, 16] as const;
export type WarmUpPeakRepeats = (typeof WARMUP_PEAK_REPEATS)[number];
export const DEFAULT_PEAK_REPEATS: WarmUpPeakRepeats = 1;

// ─── Long note ────────────────────────────────────────────────────────────────
// One held written pitch, named absolutely. Same shape as WARMUP_KEYS, and for the
// same reason: the table is the enumeration. `step`/`alter` map straight onto
// MusicXML so the generator never has to re-derive a spelling.
//
// Seventeen entries — seven naturals plus both spellings of each black key, because a
// clarinettist's part may write either and the exercise should look like the music.
// Cb and B# are deliberately absent: they cross an octave boundary, where the octave
// number would stop meaning what the picker says it means.
export const WARMUP_LONG_NOTE_NOTES = [
  { label: 'C', step: 'C', alter: 0, pitchClass: 0 },
  { label: 'C#', step: 'C', alter: 1, pitchClass: 1 },
  { label: 'Db', step: 'D', alter: -1, pitchClass: 1 },
  { label: 'D', step: 'D', alter: 0, pitchClass: 2 },
  { label: 'D#', step: 'D', alter: 1, pitchClass: 3 },
  { label: 'Eb', step: 'E', alter: -1, pitchClass: 3 },
  { label: 'E', step: 'E', alter: 0, pitchClass: 4 },
  { label: 'F', step: 'F', alter: 0, pitchClass: 5 },
  { label: 'F#', step: 'F', alter: 1, pitchClass: 6 },
  { label: 'Gb', step: 'G', alter: -1, pitchClass: 6 },
  { label: 'G', step: 'G', alter: 0, pitchClass: 7 },
  { label: 'G#', step: 'G', alter: 1, pitchClass: 8 },
  { label: 'Ab', step: 'A', alter: -1, pitchClass: 8 },
  { label: 'A', step: 'A', alter: 0, pitchClass: 9 },
  { label: 'A#', step: 'A', alter: 1, pitchClass: 10 },
  { label: 'Bb', step: 'B', alter: -1, pitchClass: 10 },
  { label: 'B', step: 'B', alter: 0, pitchClass: 11 },
] as const;

export type WarmUpLongNote = (typeof WARMUP_LONG_NOTE_NOTES)[number];
export type WarmUpLongNoteName = WarmUpLongNote['label'];

/**
 * Just the tokens, for validating a value read off disk.
 *
 * The annotation is load-bearing: without it `.map` widens the element type to
 * `string`, and the store's option check would then accept any string at all.
 */
export const WARMUP_LONG_NOTE_NAMES: readonly WarmUpLongNoteName[] = WARMUP_LONG_NOTE_NOTES.map(
  (n) => n.label,
);

export const DEFAULT_LONG_NOTE_NAME: WarmUpLongNoteName = 'G';

/**
 * Candidate written octaves, scientific pitch (C4 = middle C = MIDI 60).
 *
 * A superset of any instrument's range on purpose: which of these the picker actually
 * offers is the instrument's answer, not this list's — see `longNoteOctaves`.
 */
export const WARMUP_LONG_NOTE_OCTAVES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export type WarmUpLongNoteOctave = (typeof WARMUP_LONG_NOTE_OCTAVES)[number];
export const DEFAULT_LONG_NOTE_OCTAVE: WarmUpLongNoteOctave = 4;

/** How many measures the note is held for, tied across each barline. */
export const WARMUP_LONG_NOTE_MEASURES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type WarmUpLongNoteMeasures = (typeof WARMUP_LONG_NOTE_MEASURES)[number];
export const DEFAULT_LONG_NOTE_MEASURES: WarmUpLongNoteMeasures = 2;

/** How many hold-then-breathe blocks the exercise contains. */
export const WARMUP_LONG_NOTE_REPEATS = [1, 2, 4, 8] as const;
export type WarmUpLongNoteRepeats = (typeof WARMUP_LONG_NOTE_REPEATS)[number];
export const DEFAULT_LONG_NOTE_REPEATS: WarmUpLongNoteRepeats = 4;

/**
 * Table lookup that tolerates a value read off disk, mirroring `keyLabel`'s fallback.
 *
 * Lives here rather than in the registry because the generator needs it, and the
 * generator cannot import the registry — the registry imports the generator.
 */
export function longNoteEntry(name: unknown): WarmUpLongNote {
  return (
    WARMUP_LONG_NOTE_NOTES.find((n) => n.label === name) ??
    WARMUP_LONG_NOTE_NOTES.find((n) => n.label === DEFAULT_LONG_NOTE_NAME)!
  );
}

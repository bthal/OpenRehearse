/**
 * Instrument constants: the vocabulary the registry is built from.
 *
 * Split from `instrumentRegistry.ts` the way `warmup.ts` is split from
 * `warmupRegistry.ts` — the types and the bulky sample-note lists live here so the
 * registry itself stays readable as a table.
 *
 * Note names in the sample lists are **sounding** pitch, because that is what the
 * sampler is handed. See `specs/features/instruments.md` § Transposition for why
 * sounding and written pitch differ on a transposing instrument.
 */

/** How a generated exercise score is engraved for this instrument. */
export type StaffLayout = 'grand' | 'single';

/**
 * The lowest and highest note the player *reads*, as standard MIDI numbers
 * (A0 = 21, C4 = 60, C8 = 108).
 *
 * This governs what the app offers — which octave counts a warm-up picker shows —
 * and never what playback permits. A note pushed outside the range by a practice
 * transposition still sounds; silence would contradict the notation. See the spec.
 */
export interface WrittenRange {
  lowMidi: number;
  highMidi: number;
}

/**
 * Salamander Grand Piano, the set already in use — one sample per minor third across
 * A0–C8, which is why "thin to a minor third" leaves the piano sound untouched.
 * Sharps are spelled with `s` in the filenames (`D#1` → `Ds1.mp3`).
 */
export const PIANO_SAMPLE_NOTES = [
  'A0',
  'C1',
  'D#1',
  'F#1',
  'A1',
  'C2',
  'D#2',
  'F#2',
  'A2',
  'C3',
  'D#3',
  'F#3',
  'A3',
  'C4',
  'D#4',
  'F#4',
  'A4',
  'C5',
  'D#5',
  'F#5',
  'A5',
  'C6',
  'D#6',
  'F#6',
  'A6',
  'C7',
  'D#7',
  'F#7',
  'A7',
  'C8',
] as const;

/**
 * FluidR3_GM clarinet, thinned from 88 chromatic files to one per minor third.
 *
 * The span is C3–C7 *sounding*, which covers the Bb clarinet's written E3–C7
 * (sounding D3–Bb6) with a little margin at each end so a modest practice
 * transposition does not immediately run off a sample. Filenames spell accidentals
 * as flats (`Eb3.mp3`), unlike Salamander's sharps — a per-set convention, not a
 * global one, which is why each set carries its own list.
 */
export const CLARINET_SAMPLE_NOTES = [
  'C3',
  'Eb3',
  'Gb3',
  'A3',
  'C4',
  'Eb4',
  'Gb4',
  'A4',
  'C5',
  'Eb5',
  'Gb5',
  'A5',
  'C6',
  'Eb6',
  'Gb6',
  'A6',
  'C7',
] as const;

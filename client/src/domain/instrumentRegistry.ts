/**
 * The single source of truth for what instruments exist and what each one is.
 *
 * Deliberately the same shape as `WARM_UP_REGISTRY`: `InstrumentId` is derived from
 * the keys, display order is key order, and every consumer reads what it needs off a
 * descriptor rather than switching on a name. That is what keeps "which exercises can
 * a clarinet do", "how is its score engraved", and "what does it sound like" in one
 * place instead of scattered across the screens that ask.
 *
 * Adding an instrument is a row here plus a bundled sample set. It is *not* free —
 * the samples, the range and the exercise list all have to be got right — which is
 * why the catalogue is short on purpose. See `specs/features/instruments.md`.
 */
import {
  CLARINET_SAMPLE_NOTES,
  PIANO_SAMPLE_NOTES,
  type StaffLayout,
  type WrittenRange,
} from './instrument';
import type { WarmUpType } from './warmupRegistry';

export interface InstrumentDescriptor {
  /** i18n key for the display name. */
  labelKey: string;
  /** Directory name under `assets/samples/`; also the id used in the sample bridge. */
  sampleSet: string;
  /** Sounding-pitch note names the sample set provides, one file each. */
  sampleNotes: readonly string[];
  /** What the player reads. Governs what the UI offers, never what playback permits. */
  writtenRange: WrittenRange;
  /**
   * Sounding pitch relative to written, in semitones. `0` for a concert-pitch
   * instrument; `-2` for a Bb clarinet, which sounds a major 2nd below what it reads.
   *
   * This is authoritative for playback, in preference to the file's `<transpose>`
   * element — reading the interval off the file would double-count the moment a
   * concert-pitch score is assigned to a transposing instrument.
   */
  transposeSemitones: number;
  staffLayout: StaffLayout;
  /** The warm-up families this instrument can do, in registry order. */
  exercises: readonly WarmUpType[];
}

export const INSTRUMENT_REGISTRY = {
  piano: {
    labelKey: 'instruments.piano',
    sampleSet: 'salamander-piano',
    sampleNotes: PIANO_SAMPLE_NOTES,
    // A0–C8, the standard 88.
    writtenRange: { lowMidi: 21, highMidi: 108 },
    transposeSemitones: 0,
    staffLayout: 'grand',
    exercises: ['hanon', 'scales', 'arpeggio', 'chromatic', 'fiveScale', 'drill45'],
  },
  clarinetBb: {
    labelKey: 'instruments.clarinetBb',
    sampleSet: 'fluidr3-clarinet',
    sampleNotes: CLARINET_SAMPLE_NOTES,
    // Written E3–C7; sounding D3–Bb6.
    writtenRange: { lowMidi: 52, highMidi: 96 },
    transposeSemitones: -2,
    staffLayout: 'single',
    // Scales and chromatic only for now. `drill45` is two simultaneous voices per hand
    // and cannot exist here at all; Hanon would render as a single line but trains
    // piano finger independence and prints piano fingerings, so it is excluded as
    // pointless rather than impossible. Arpeggios and 5-finger are playable and are
    // the obvious next additions — held back only to keep the first slice small.
    exercises: ['scales', 'chromatic'],
  },
} as const satisfies Record<string, InstrumentDescriptor>;

export type InstrumentId = keyof typeof INSTRUMENT_REGISTRY;

/** Display order for every list of instruments in the app. */
export const INSTRUMENT_IDS = Object.keys(INSTRUMENT_REGISTRY) as InstrumentId[];

/** What a piece or routine is when it does not say — see `normaliseInstrumentId`. */
export const DEFAULT_INSTRUMENT: InstrumentId = 'piano';

export function isInstrumentId(value: unknown): value is InstrumentId {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(INSTRUMENT_REGISTRY, value)
  );
}

/**
 * Forces a value read off disk into a known instrument.
 *
 * Everything stored before instruments existed is a piano piece, and so is anything
 * whose column has rotted — the same normalise-on-read contract `normaliseBits` and
 * `normaliseSections` give, and for the same reason: no migration, and no consumer
 * past the repository has to defend against `undefined`.
 */
export function normaliseInstrumentId(raw: unknown): InstrumentId {
  return isInstrumentId(raw) ? raw : DEFAULT_INSTRUMENT;
}

/** Descriptor lookup that tolerates unknown input, for data loaded off disk. */
export function instrumentDescriptor(value: unknown): InstrumentDescriptor | null {
  return isInstrumentId(value) ? INSTRUMENT_REGISTRY[value] : null;
}

export function supportsExercise(instrument: InstrumentId, type: WarmUpType): boolean {
  // `as const` narrows each exercises tuple to its own literal union, so widen to compare.
  return (INSTRUMENT_REGISTRY[instrument].exercises as readonly WarmUpType[]).includes(type);
}

/** The exercises this instrument offers, in registry order. */
export function exercisesFor(instrument: InstrumentId): readonly WarmUpType[] {
  return INSTRUMENT_REGISTRY[instrument].exercises;
}

/**
 * What the speaker plays for a note the player reads.
 *
 * The app is something you play along with: a Bb clarinet sounds a major 2nd below
 * what it reads, so sounding written pitch through clarinet samples would put the app
 * a whole tone above the person reading the same notes off the same screen.
 */
export function soundingMidi(writtenMidi: number, instrument: InstrumentId): number {
  return writtenMidi + INSTRUMENT_REGISTRY[instrument].transposeSemitones;
}

/**
 * The transposition that makes an imported score readable on this instrument.
 *
 * A correctly exported clarinet part is *already* written in the transposed key and
 * needs nothing; a concert-pitch melody needs the whole interval. `<transpose>` is the
 * signal the engraver actually wrote, and it is exactly what tells the two apart —
 * which is why its presence, not the instrument alone, decides.
 *
 * `fileTransposeSemitones` is the part's `<transpose><chromatic>` value, or `null`
 * when the part carries no `<transpose>` element at all. Note that `0` and `null` are
 * different answers here: an explicit `<transpose>` of 0 still means the engraver
 * declared the part's pitch relationship, so we leave it alone.
 */
export function defaultBaseTranspose(
  instrument: InstrumentId,
  fileTransposeSemitones: number | null,
): number {
  if (fileTransposeSemitones !== null) return 0;
  // Negating a concert-pitch instrument's 0 yields `-0`, which is a distinct value:
  // it would be stored as such and would fail an `Object.is` comparison against 0.
  const interval = INSTRUMENT_REGISTRY[instrument].transposeSemitones;
  return interval === 0 ? 0 : -interval;
}

/** Whether a written pitch sits within what this instrument reads. */
export function isInWrittenRange(instrument: InstrumentId, writtenMidi: number): boolean {
  const { lowMidi, highMidi } = INSTRUMENT_REGISTRY[instrument].writtenRange;
  return writtenMidi >= lowMidi && writtenMidi <= highMidi;
}

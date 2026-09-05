import {
  WARMUP_LONG_NOTE_MEASURES,
  WARMUP_LONG_NOTE_REPEATS,
  WARMUP_PEAK_REPEATS,
  longNoteEntry,
  type WarmUpHand,
  type WarmUpScaleMode,
} from './warmup';

/** MusicXML divisions per quarter note. Shared with routineMusicXml. */
export const DIVISIONS = 2;

/**
 * A full-measure rest. Shared with routineMusicXml, which fills the unused hand of a
 * single-hand exercise with it and had grown two copies of the same string.
 */
export const WHOLE_REST = `<note><rest measure="yes"/><duration>${DIVISIONS * 4}</duration><type>whole</type></note>`;

type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

interface KeyInfo {
  fifths: number;
  /** Enharmonic note name for each pitch class 0-11 in this key context. */
  names: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
}

// Key signature & enharmonic note-name tables, indexed by pitch class and mode.
// Uses standard enharmonic conventions (Db major = -5 fifths, Eb = -3, etc.)
const KEY_INFO: Record<PitchClass, Record<WarmUpScaleMode, KeyInfo>> = {
  0: {
    major: { fifths: 0, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
    minor: { fifths: -3, names: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] },
  },
  1: {
    // Db major (-5) / C# minor (+4)
    major: {
      fifths: -5,
      names: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'Cb'],
    },
    minor: { fifths: 4, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
  },
  2: {
    major: { fifths: 2, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
    minor: { fifths: -1, names: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] },
  },
  3: {
    // Eb major (-3) / D# minor (+6)
    major: { fifths: -3, names: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] },
    minor: { fifths: 6, names: ['C', 'C#', 'D', 'D#', 'E', 'E#', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
  },
  4: {
    major: { fifths: 4, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
    minor: { fifths: 1, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
  },
  5: {
    major: { fifths: -1, names: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] },
    minor: {
      fifths: -4,
      names: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'Cb'],
    },
  },
  6: {
    major: { fifths: 6, names: ['C', 'C#', 'D', 'D#', 'E', 'E#', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
    minor: { fifths: 3, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
  },
  7: {
    major: { fifths: 1, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
    minor: { fifths: -2, names: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] },
  },
  8: {
    // Ab major (-4) / G# minor (+5)
    major: {
      fifths: -4,
      names: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'Cb'],
    },
    minor: { fifths: 5, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
  },
  9: {
    major: { fifths: 3, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
    minor: { fifths: 0, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
  },
  10: {
    // Bb major (-2) / Bb minor (-5)
    major: { fifths: -2, names: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] },
    minor: {
      fifths: -5,
      names: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'Cb'],
    },
  },
  11: {
    major: { fifths: 5, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
    minor: { fifths: 2, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
  },
};

const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11, 12] as const;
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10, 12] as const;

type ScaleIntervals = typeof MAJOR_INTERVALS | typeof MINOR_INTERVALS;

function getKeyInfo(pitchClass: number, mode: WarmUpScaleMode): KeyInfo {
  const pc = (((pitchClass % 12) + 12) % 12) as PitchClass;
  return KEY_INFO[pc][mode];
}

/**
 * Key signature (fifths) for a key. The single source of truth — routineMusicXml used
 * to keep a parallel KEY_FIFTHS table that had silently drifted out of sync for
 * Bb minor (-4 here vs -5 there; -5 is correct).
 */
export function getKeyFifths(pitchClass: number, mode: WarmUpScaleMode): number {
  return getKeyInfo(pitchClass, mode).fifths;
}

function midiToPitch(
  midi: number,
  names: KeyInfo['names'],
): { step: string; alter: number; octave: number } {
  const pc = (((midi % 12) + 12) % 12) as PitchClass;
  const octave = Math.floor(midi / 12) - 1;
  const name = names[pc]; // tuple: always defined for 0-11
  const step = name.charAt(0);
  if (name.length === 2 && name.charAt(1) === '#') return { step, alter: 1, octave };
  if (name.length === 2 && name.charAt(1) === 'b') return { step, alter: -1, octave };
  return { step, alter: 0, octave };
}

function pitchXml(p: { step: string; alter: number; octave: number }): string {
  const alterXml = p.alter !== 0 ? `<alter>${p.alter}</alter>` : '';
  return `<pitch><step>${p.step}</step>${alterXml}<octave>${p.octave}</octave></pitch>`;
}

function eighth(
  midi: number,
  names: KeyInfo['names'],
  beam?: 'begin' | 'continue' | 'end',
  fingering?: number,
): string {
  const beamXml = beam ? `<beam number="1">${beam}</beam>` : '';
  const fingeringXml =
    fingering !== undefined
      ? `<notations><technical><fingering>${fingering}</fingering></technical></notations>`
      : '';
  return `<note>${pitchXml(midiToPitch(midi, names))}<duration>1</duration><type>eighth</type>${beamXml}${fingeringXml}</note>`;
}

function wholeNote(midi: number, names: KeyInfo['names']): string {
  return `<note>${pitchXml(midiToPitch(midi, names))}<duration>8</duration><type>whole</type></note>`;
}

function noteWithDuration(midi: number, names: KeyInfo['names'], eighths: number): string {
  let type: string;
  let dot = false;
  if (eighths <= 1) {
    type = 'eighth';
  } else if (eighths === 2) {
    type = 'quarter';
  } else if (eighths === 3) {
    type = 'quarter';
    dot = true;
  } else if (eighths === 4) {
    type = 'half';
  } else if (eighths === 6) {
    type = 'half';
    dot = true;
  } else {
    type = 'whole';
  }
  const dotXml = dot ? '<dot/>' : '';
  return `<note>${pitchXml(midiToPitch(midi, names))}<duration>${eighths}</duration>${dotXml}<type>${type}</type></note>`;
}

// Returns beam tag for note at position i within a run of `total` eighths, grouped in groupSize.
function beamFor(
  i: number,
  total: number,
  groupSize: number,
): 'begin' | 'continue' | 'end' | undefined {
  if (total < 2) return undefined;
  const groupStart = Math.floor(i / groupSize) * groupSize;
  const groupEnd = Math.min(groupStart + groupSize, total) - 1;
  if (groupEnd === groupStart) return undefined;
  if (i === groupStart) return 'begin';
  if (i === groupEnd) return 'end';
  return 'continue';
}

interface PartDef {
  id: string;
  name: string;
  clef: { sign: string; line: number };
  measures: string[][];
}

function buildXml(fifths: number, mode: WarmUpScaleMode, parts: PartDef[]): string {
  const partList = parts
    .map((p) => `<score-part id="${p.id}"><part-name>${p.name}</part-name></score-part>`)
    .join('');

  const modeStr = mode === 'major' ? 'major' : 'minor';

  const finalBarline = `<barline location="right"><bar-style>light-heavy</bar-style></barline>`;

  const partXmls = parts.map(
    (p) =>
      `<part id="${p.id}">${p.measures
        .map((notes, mi) => {
          const attrXml =
            mi === 0
              ? `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>${fifths}</fifths><mode>${modeStr}</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>${p.clef.sign}</sign><line>${p.clef.line}</line></clef></attributes>`
              : '';
          const barlineXml = mi === p.measures.length - 1 ? finalBarline : '';
          return `<measure number="${mi + 1}">${attrXml}${notes.join('')}${barlineXml}</measure>`;
        })
        .join('')}</part>`,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1"><part-list>${partList}</part-list>${partXmls.join('')}</score-partwise>`;
}

// Scale degrees as semitone offsets from root, for building diatonic intervals
function scaleSteps(intervals: ScaleIntervals): readonly number[] {
  // 7 unique diatonic steps (intervals[0..6]), all relative to root=0
  return [
    0,
    intervals[1] - intervals[0],
    intervals[2] - intervals[0],
    intervals[3] - intervals[0],
    intervals[4] - intervals[0],
    intervals[5] - intervals[0],
    intervals[6] - intervals[0],
  ];
}

/** MIDI pitch for diatonic degree (can be > 7, spans multiple octaves). */
function diatonicMidi(rootMidi: number, degree: number, steps: readonly number[]): number {
  const octaves = Math.floor(degree / 7);
  // Euclidean remainder: JS `%` is signed, so a negative degree would index steps[-n]
  // and silently fall back to 0 — a wrong pitch rather than an error. Negative degrees
  // are reachable now that a Hanon cell can sit below its bar's root note (No. 12).
  const degInOctave = ((degree % 7) + 7) % 7;
  const step = steps[degInOctave] ?? 0; // steps has 7 elements, degInOctave is 0-6
  return rootMidi + octaves * 12 + step;
}

// Semitone offset from root for diatonic index i spanning multiple octaves.
// Uses the fact that intervals[0..7] covers one octave: floor(i/7)*12 + intervals[i%7].
function scaleOffset(intervals: ScaleIntervals, i: number): number {
  return Math.floor(i / 7) * 12 + (intervals[i % 7] ?? 0);
}

// Generic renderer shared by every scale-family exercise (scales, arpeggio, chromatic,
// five-finger). `offsets` are semitone offsets from `rootMidi`, in playing order. All but
// the last are eighth notes beamed in groups of 4; the final note is held to fill the rest
// of its bar (quarter / half / dotted half / whole, depending on how the run lands).
function buildMeasuresFromOffsets(
  rootMidi: number,
  names: KeyInfo['names'],
  offsets: readonly number[],
): string[][] {
  const eighthsBefore = offsets.length - 1;
  const slotsInLastBar = eighthsBefore % 8;
  const finalDuration = slotsInLastBar === 0 ? 8 : 8 - slotsInLastBar;

  const bars: string[][] = [];
  const BEAM_GROUP = 4;

  for (let b = 0; b + 8 <= eighthsBefore; b += 8) {
    bars.push(
      offsets
        .slice(b, b + 8)
        .map((off, i) => eighth(rootMidi + off, names, beamFor(i, 8, BEAM_GROUP))),
    );
  }

  const lastBarOffsets =
    slotsInLastBar > 0 ? offsets.slice(eighthsBefore - slotsInLastBar, eighthsBefore) : [];
  const lastBarNotes = lastBarOffsets.map((off, i) =>
    eighth(rootMidi + off, names, beamFor(i, slotsInLastBar, BEAM_GROUP)),
  );
  lastBarNotes.push(
    noteWithDuration(rootMidi + offsets[offsets.length - 1]!, names, finalDuration),
  );
  bars.push(lastBarNotes);

  return bars;
}

// Mirror an ascending run into a full up-then-down sequence — the top note is played once,
// the descent retraces the ascent in reverse — then render it as measures. Every
// scale-family exercise differs only in which ascending offsets it feeds here.
function buildMirroredMeasures(
  rootMidi: number,
  names: KeyInfo['names'],
  ascending: readonly number[],
): string[][] {
  const descending = ascending.slice(0, -1).reverse();
  return buildMeasuresFromOffsets(rootMidi, names, [...ascending, ...descending]);
}

function buildScaleMeasuresInternal(
  rootMidi: number,
  names: KeyInfo['names'],
  intervals: ScaleIntervals,
  octaves: number,
): string[][] {
  const top = 7 * octaves;
  const ascending: number[] = [];
  for (let i = 0; i <= top; i++) ascending.push(scaleOffset(intervals, i));
  return buildMirroredMeasures(rootMidi, names, ascending);
}

// ─── Arpeggio ───────────────────────────────────────────────────────────────
// Rolling-window arpeggio étude. The chord tones (root/3rd/5th) form a ladder that
// repeats every octave; the exercise plays a sliding window of four consecutive ladder
// tones, each group starting one tone higher than the last. The window's starting note
// climbs `octaves` octaves (3 tones each), so the four-wide window peaks one octave above
// that. Example (C major, 1 octave): C-E-G-C · E-G-C-E · G-C-E-G · C-E-G-C, then mirrored.
const MAJOR_TRIAD = [0, 4, 7] as const;
const MINOR_TRIAD = [0, 3, 7] as const;
type TriadOffsets = typeof MAJOR_TRIAD | typeof MINOR_TRIAD;

function arpeggioLadder(triad: TriadOffsets, ladderIndex: number): number {
  return Math.floor(ladderIndex / 3) * 12 + (triad[ladderIndex % 3] ?? 0);
}

function buildArpeggioMeasuresInternal(
  rootMidi: number,
  names: KeyInfo['names'],
  triad: TriadOffsets,
  octaves: number,
): string[][] {
  const lastStart = 3 * octaves;
  const ascending: number[] = [];
  for (let start = 0; start <= lastStart; start++) {
    for (let w = 0; w < 4; w++) ascending.push(arpeggioLadder(triad, start + w));
  }
  return buildMirroredMeasures(rootMidi, names, ascending);
}

// ─── Chromatic scale ──────────────────────────────────────────────────────────
// Every semitone from the tonic up `octaves` octaves and back. The selected key only
// governs note spelling and the rendered key signature; the pitches are always chromatic.
function buildChromaticMeasuresInternal(
  rootMidi: number,
  names: KeyInfo['names'],
  octaves: number,
): string[][] {
  const top = 12 * octaves;
  const ascending: number[] = [];
  for (let s = 0; s <= top; s++) ascending.push(s);
  return buildMirroredMeasures(rootMidi, names, ascending);
}

// ─── Five-finger scale ────────────────────────────────────────────────────────
// Scale degrees 1-5 ascending then back to the tonic (C-D-E-F-G-F-E-D-C in C major).
// For multiple octaves the five-note run climbs into each successive octave before the
// mirror brings it back down.
function buildFiveScaleMeasuresInternal(
  rootMidi: number,
  names: KeyInfo['names'],
  intervals: ScaleIntervals,
  octaves: number,
): string[][] {
  const ascending: number[] = [];
  for (let o = 0; o < octaves; o++) {
    for (let d = 0; d < 5; d++) ascending.push(o * 12 + (intervals[d] ?? 0));
  }
  return buildMirroredMeasures(rootMidi, names, ascending);
}

// Builds right-/left-hand measures for a scale-family exercise. RH plays from C4 (MIDI 60),
// LH an octave lower (C3, MIDI 48); the requested hand determines which are produced.
type MeasureBuilder = (rootMidi: number) => string[][];

function twoHandMeasures(
  pitchClass: number,
  hand: WarmUpHand,
  build: MeasureBuilder,
  rootMidi?: number,
): { rh: string[][] | null; lh: string[][] | null } {
  // The piano's C4/C3 anchor stays the default. A single-staff instrument passes its
  // own root so the exercise sits where that instrument actually plays; the left-hand
  // octave below is kept relative to it, which is a no-op for the piano.
  const rhRoot = rootMidi ?? 60 + pitchClass;
  return {
    rh: hand === 'left' ? null : build(rhRoot),
    lh: hand === 'right' ? null : build(rhRoot - 12),
  };
}

// Assembles a one- or two-hand score from pre-built measures. Single-hand exercises use
// P1 for whichever hand is present; "both" puts the right hand on P1 and the left on P2.
function buildTwoHandXml(
  fifths: number,
  mode: WarmUpScaleMode,
  hand: WarmUpHand,
  rh: string[][] | null,
  lh: string[][] | null,
): string {
  const parts: PartDef[] = [];
  if (rh) parts.push({ id: 'P1', name: 'Right Hand', clef: { sign: 'G', line: 2 }, measures: rh });
  if (lh)
    parts.push({
      id: hand === 'both' ? 'P2' : 'P1',
      name: 'Left Hand',
      clef: { sign: 'F', line: 4 },
      measures: lh,
    });
  return buildXml(fifths, mode, parts);
}

export function getScaleMeasureNotes(
  pitchClass: number,
  mode: WarmUpScaleMode,
  hand: WarmUpHand,
  octaves: number,
  rootMidi?: number,
): { rh: string[][] | null; lh: string[][] | null } {
  const { names } = getKeyInfo(pitchClass, mode);
  const intervals = mode === 'major' ? MAJOR_INTERVALS : MINOR_INTERVALS;
  return twoHandMeasures(
    pitchClass,
    hand,
    (root) => buildScaleMeasuresInternal(root, names, intervals, octaves),
    rootMidi,
  );
}

export function generateScaleXml(
  pitchClass: number,
  mode: WarmUpScaleMode,
  hand: WarmUpHand,
  octaves = 1,
  rootMidi?: number,
): string {
  const { fifths } = getKeyInfo(pitchClass, mode);
  const { rh, lh } = getScaleMeasureNotes(pitchClass, mode, hand, octaves, rootMidi);
  return buildTwoHandXml(fifths, mode, hand, rh, lh);
}

export function getArpeggioMeasureNotes(
  pitchClass: number,
  mode: WarmUpScaleMode,
  hand: WarmUpHand,
  octaves: number,
): { rh: string[][] | null; lh: string[][] | null } {
  const { names } = getKeyInfo(pitchClass, mode);
  const triad = mode === 'major' ? MAJOR_TRIAD : MINOR_TRIAD;
  return twoHandMeasures(pitchClass, hand, (root) =>
    buildArpeggioMeasuresInternal(root, names, triad, octaves),
  );
}

export function generateArpeggioXml(
  pitchClass: number,
  mode: WarmUpScaleMode,
  hand: WarmUpHand,
  octaves = 1,
): string {
  const { fifths } = getKeyInfo(pitchClass, mode);
  const { rh, lh } = getArpeggioMeasureNotes(pitchClass, mode, hand, octaves);
  return buildTwoHandXml(fifths, mode, hand, rh, lh);
}

export function getChromaticMeasureNotes(
  pitchClass: number,
  mode: WarmUpScaleMode,
  hand: WarmUpHand,
  octaves: number,
  rootMidi?: number,
): { rh: string[][] | null; lh: string[][] | null } {
  const { names } = getKeyInfo(pitchClass, mode);
  return twoHandMeasures(
    pitchClass,
    hand,
    (root) => buildChromaticMeasuresInternal(root, names, octaves),
    rootMidi,
  );
}

export function generateChromaticXml(
  pitchClass: number,
  mode: WarmUpScaleMode,
  hand: WarmUpHand,
  octaves = 1,
  rootMidi?: number,
): string {
  const { fifths } = getKeyInfo(pitchClass, mode);
  const { rh, lh } = getChromaticMeasureNotes(pitchClass, mode, hand, octaves, rootMidi);
  return buildTwoHandXml(fifths, mode, hand, rh, lh);
}

export function getFiveScaleMeasureNotes(
  pitchClass: number,
  mode: WarmUpScaleMode,
  hand: WarmUpHand,
  octaves: number,
): { rh: string[][] | null; lh: string[][] | null } {
  const { names } = getKeyInfo(pitchClass, mode);
  const intervals = mode === 'major' ? MAJOR_INTERVALS : MINOR_INTERVALS;
  return twoHandMeasures(pitchClass, hand, (root) =>
    buildFiveScaleMeasuresInternal(root, names, intervals, octaves),
  );
}

export function generateFiveScaleXml(
  pitchClass: number,
  mode: WarmUpScaleMode,
  hand: WarmUpHand,
  octaves = 1,
): string {
  const { fifths } = getKeyInfo(pitchClass, mode);
  const { rh, lh } = getFiveScaleMeasureNotes(pitchClass, mode, hand, octaves);
  return buildTwoHandXml(fifths, mode, hand, rh, lh);
}

// ─── Hanon, Le Pianiste Virtuose Part I (Nos. 1-20) ──────────────────────────
//
// Each exercise is one 8-note figure ("cell") of diatonic degree offsets, played once
// per bar and shifted up a degree per bar to the top of the range, then a mirrored
// figure shifted back down, then a held tonic.
//
// The offsets and fingerings below were extracted mechanically from the Mutopia
// Project's LilyPond engraving of the Schirmer (1900) edition — see
// THIRD_PARTY_NOTICES.md. They are NOT transcribed by hand or from memory.
//
// Things the sources establish that a uniform model would get wrong:
//   - the descending figure is not the arithmetic negation of the ascending one
//     (No. 2 rises 0,2,5,... but falls 0,-3,-5,...), so both are stored
//   - each hand has its own fingering; they are not always mirror images
//   - the number of bars and the degree the descent starts on vary per exercise,
//     hence the deltas below, expressed relative to 7 x octaves
//   - a cell can sit BELOW its bar's root note (No. 12), giving negative degrees
//
// `null` in a fingering array means the reference edition prints no fingering for
// that note (No. 4 only); the generator omits the mark rather than inventing one.

interface HanonPattern {
  /** Diatonic degree offsets from the bar's root, ascending half. */
  upCell: readonly number[];
  /** Descending half. Stored, not derived — see above. */
  downCell: readonly number[];
  rhUpFingering: readonly (number | null)[];
  rhDownFingering: readonly (number | null)[];
  lhUpFingering: readonly (number | null)[];
  lhDownFingering: readonly (number | null)[];
  /** Degree the ascent begins on. Usually the tonic (0), but Nos. 12, 13 and 20
   *  start elsewhere, so this cannot be assumed. Not scaled by octaves. */
  ascentStart: number;
  /** Ascending bar count, relative to 7 x octaves. */
  upBars: number;
  /** Descending bar count, relative to 7 x octaves. */
  downBars: number;
  /** Degree the descent begins on, relative to 7 x octaves. */
  descentStart: number;
}

/** Indexed by exercise number minus one. */
const HANON_PATTERNS: readonly HanonPattern[] = [
  {
    upCell: [0, 2, 3, 4, 5, 4, 3, 2],
    downCell: [0, -2, -3, -4, -5, -4, -3, -2],
    rhUpFingering: [1, 2, 3, 4, 5, 4, 3, 2],
    rhDownFingering: [5, 4, 3, 2, 1, 2, 3, 4],
    lhUpFingering: [5, 4, 3, 2, 1, 2, 3, 4],
    lhDownFingering: [1, 2, 3, 4, 5, 4, 3, 2],
    ascentStart: 0,
    upBars: 0,
    downBars: 1,
    descentStart: 4,
  },
  {
    upCell: [0, 2, 5, 4, 3, 4, 3, 2],
    downCell: [0, -3, -5, -4, -3, -4, -3, -2],
    rhUpFingering: [1, 2, 5, 4, 3, 4, 3, 2],
    rhDownFingering: [5, 2, 1, 2, 3, 2, 3, 4],
    lhUpFingering: [5, 3, 1, 2, 3, 2, 3, 4],
    lhDownFingering: [1, 3, 5, 4, 3, 4, 3, 2],
    ascentStart: 0,
    upBars: 0,
    downBars: 0,
    descentStart: 4,
  },
  {
    upCell: [0, 2, 5, 4, 3, 2, 3, 4],
    downCell: [0, -3, -5, -4, -3, -2, -3, -4],
    rhUpFingering: [1, 2, 5, 4, 3, 2, 3, 4],
    rhDownFingering: [5, 2, 1, 2, 3, 4, 3, 2],
    lhUpFingering: [5, 3, 1, 2, 3, 4, 3, 2],
    lhDownFingering: [1, 3, 5, 4, 3, 2, 3, 4],
    ascentStart: 0,
    upBars: 0,
    downBars: 0,
    descentStart: 4,
  },
  {
    upCell: [0, 1, 0, 2, 5, 4, 3, 2],
    downCell: [0, -1, 0, -3, -5, -4, -3, -2],
    rhUpFingering: [1, 2, 1, 2, 5, null, null, 2],
    rhDownFingering: [5, 4, 5, 2, 1, null, 2, null],
    lhUpFingering: [5, 4, 5, 3, 1, null, null, 3],
    lhDownFingering: [1, 2, 1, 3, 5, null, 3, null],
    ascentStart: 0,
    upBars: 0,
    downBars: 0,
    descentStart: 4,
  },
  {
    upCell: [0, 5, 4, 5, 3, 4, 2, 3],
    downCell: [0, 1, 0, 2, 1, 3, 2, 4],
    rhUpFingering: [1, 5, 4, 5, 3, 4, 2, 3],
    rhDownFingering: [1, 2, 1, 3, 2, 4, 3, 5],
    lhUpFingering: [5, 1, 2, 1, 3, 2, 4, 3],
    lhDownFingering: [5, 4, 5, 3, 4, 2, 3, 1],
    ascentStart: 0,
    upBars: 0,
    downBars: 0,
    descentStart: 0,
  },
  {
    upCell: [0, 5, 4, 5, 3, 5, 2, 5],
    downCell: [0, -5, -4, -5, -3, -5, -2, -5],
    rhUpFingering: [1, 5, 4, 5, 3, 5, 2, 5],
    rhDownFingering: [5, 1, 2, 1, 3, 1, 4, 1],
    lhUpFingering: [5, 1, 2, 1, 3, 1, 4, 1],
    lhDownFingering: [1, 5, 4, 5, 3, 5, 2, 5],
    ascentStart: 0,
    upBars: -1,
    downBars: -1,
    descentStart: 4,
  },
  {
    upCell: [0, 2, 1, 3, 2, 4, 3, 2],
    downCell: [0, -2, -1, -3, -2, -4, -3, -2],
    rhUpFingering: [1, 3, 2, 4, 3, 5, 4, 3],
    rhDownFingering: [5, 3, 4, 2, 3, 1, 3, 4],
    lhUpFingering: [5, 3, 4, 2, 3, 1, 3, 4],
    lhDownFingering: [1, 3, 2, 4, 3, 5, 4, 3],
    ascentStart: 0,
    upBars: 0,
    downBars: 0,
    descentStart: 4,
  },
  {
    upCell: [0, 2, 4, 5, 3, 4, 2, 3],
    downCell: [0, -2, -4, -5, -3, -4, -2, -3],
    rhUpFingering: [1, 2, 4, 5, 3, 4, 2, 3],
    rhDownFingering: [5, 4, 2, 1, 3, 2, 4, 3],
    lhUpFingering: [5, 4, 2, 1, 3, 2, 4, 3],
    lhDownFingering: [1, 2, 4, 5, 3, 4, 2, 3],
    ascentStart: 0,
    upBars: 0,
    downBars: 0,
    descentStart: 4,
  },
  {
    upCell: [0, 2, 3, 2, 4, 3, 5, 4],
    downCell: [0, -2, -3, -2, -4, -3, -5, -4],
    rhUpFingering: [1, 2, 3, 2, 4, 3, 5, 4],
    rhDownFingering: [5, 4, 3, 4, 2, 3, 1, 2],
    lhUpFingering: [5, 4, 3, 4, 2, 3, 1, 2],
    lhDownFingering: [1, 2, 3, 2, 4, 3, 5, 4],
    ascentStart: 0,
    upBars: 0,
    downBars: -1,
    descentStart: 4,
  },
  {
    upCell: [0, 5, 4, 3, 2, 3, 2, 3],
    downCell: [0, -5, -4, -3, -2, -3, -2, -3],
    rhUpFingering: [1, 5, 4, 3, 2, 3, 2, 3],
    rhDownFingering: [5, 1, 2, 3, 4, 3, 4, 3],
    lhUpFingering: [5, 1, 2, 3, 4, 3, 4, 3],
    lhDownFingering: [1, 5, 4, 3, 2, 3, 2, 3],
    ascentStart: 0,
    upBars: 0,
    downBars: 0,
    descentStart: 4,
  },
  {
    upCell: [0, 2, 5, 4, 5, 4, 3, 4],
    downCell: [0, -3, -5, -4, -5, -4, -3, -4],
    rhUpFingering: [1, 2, 5, 4, 5, 4, 3, 4],
    rhDownFingering: [5, 2, 1, 2, 1, 2, 3, 2],
    lhUpFingering: [5, 3, 1, 2, 1, 2, 3, 2],
    lhDownFingering: [1, 3, 5, 4, 5, 4, 3, 4],
    ascentStart: 0,
    upBars: 0,
    downBars: 0,
    descentStart: 4,
  },
  {
    upCell: [0, -5, -3, -4, -5, -4, -3, -5],
    downCell: [0, 5, 3, 4, 5, 4, 3, 5],
    rhUpFingering: [5, 1, 3, 2, 1, 2, 3, 1],
    rhDownFingering: [1, 5, 3, 4, 5, 4, 3, 5],
    lhUpFingering: [1, 5, 3, 4, 5, 4, 3, 5],
    lhDownFingering: [5, 1, 3, 2, 1, 2, 3, 1],
    ascentStart: 6,
    upBars: -2,
    downBars: 0,
    descentStart: -1,
  },
  {
    upCell: [0, -2, 1, -1, 2, 0, 1, 2],
    downCell: [0, 2, -1, 1, 0, -2, -1, 0],
    rhUpFingering: [3, 1, 4, 2, 5, 3, 4, 5],
    rhDownFingering: [3, 5, 2, 4, 3, 1, 3, 4],
    lhUpFingering: [3, 5, 2, 4, 1, 3, 2, 1],
    lhDownFingering: [3, 1, 4, 2, 3, 5, 3, 2],
    ascentStart: 2,
    upBars: 0,
    downBars: 0,
    descentStart: 2,
  },
  {
    upCell: [0, 1, 3, 2, 3, 2, 4, 3],
    downCell: [0, -1, -3, -2, -3, -2, -4, -3],
    rhUpFingering: [1, 2, 4, 3, 4, 3, 5, 4],
    rhDownFingering: [5, 4, 2, 3, 2, 3, 1, 3],
    lhUpFingering: [5, 4, 2, 3, 2, 3, 1, 3],
    lhDownFingering: [1, 2, 4, 3, 4, 3, 5, 4],
    ascentStart: 0,
    upBars: 0,
    downBars: 0,
    descentStart: 4,
  },
  {
    upCell: [0, 2, 1, 3, 2, 4, 3, 5],
    downCell: [0, -2, -1, -3, -2, -4, -3, -5],
    rhUpFingering: [1, 2, 1, 3, 2, 4, 3, 5],
    rhDownFingering: [5, 3, 4, 2, 3, 1, 2, 1],
    lhUpFingering: [5, 3, 4, 2, 3, 1, 2, 1],
    lhDownFingering: [1, 2, 1, 3, 2, 4, 3, 5],
    ascentStart: 0,
    upBars: -1,
    downBars: -1,
    descentStart: 4,
  },
  {
    upCell: [0, 2, 1, 2, 5, 4, 3, 4],
    downCell: [0, -3, -2, -3, -5, -4, -3, -4],
    rhUpFingering: [1, 3, 2, 3, 5, 4, 3, 4],
    rhDownFingering: [5, 2, 3, 2, 1, 2, 3, 2],
    lhUpFingering: [5, 3, 4, 3, 1, 2, 3, 2],
    lhDownFingering: [1, 3, 2, 3, 5, 4, 3, 4],
    ascentStart: 0,
    upBars: 0,
    downBars: 0,
    descentStart: 4,
  },
  {
    upCell: [0, 2, 5, 4, 6, 5, 4, 5],
    downCell: [0, -3, -5, -4, -6, -5, -4, -6],
    rhUpFingering: [1, 2, 4, 3, 5, 4, 3, 4],
    rhDownFingering: [5, 3, 2, 3, 1, 2, 3, 1],
    lhUpFingering: [5, 4, 2, 3, 1, 2, 3, 2],
    lhDownFingering: [1, 2, 4, 3, 5, 4, 3, 5],
    ascentStart: 0,
    upBars: -1,
    downBars: -2,
    descentStart: 4,
  },
  {
    upCell: [0, 1, 3, 2, 4, 3, 1, 2],
    downCell: [0, -1, -3, -2, -4, -3, -1, -2],
    rhUpFingering: [1, 2, 4, 3, 5, 4, 2, 3],
    rhDownFingering: [5, 4, 2, 3, 1, 2, 4, 3],
    lhUpFingering: [5, 4, 2, 3, 1, 2, 4, 3],
    lhDownFingering: [1, 2, 4, 3, 5, 4, 2, 3],
    ascentStart: 0,
    upBars: 0,
    downBars: 0,
    descentStart: 4,
  },
  {
    upCell: [0, 5, 3, 4, 5, 3, 2, 4],
    downCell: [0, -5, -3, -4, -5, -3, -2, -4],
    rhUpFingering: [1, 5, 3, 4, 5, 3, 2, 4],
    rhDownFingering: [5, 1, 3, 2, 1, 3, 4, 2],
    lhUpFingering: [5, 1, 3, 2, 1, 3, 4, 2],
    lhDownFingering: [1, 5, 3, 4, 5, 3, 2, 4],
    ascentStart: 0,
    upBars: 0,
    downBars: 0,
    descentStart: 4,
  },
  {
    upCell: [0, 2, 5, 7, 5, 4, 5, 3],
    downCell: [0, -2, -5, -7, -5, -6, -5, -7],
    rhUpFingering: [1, 2, 4, 5, 4, 3, 4, 2],
    rhDownFingering: [5, 4, 2, 1, 3, 2, 3, 1],
    lhUpFingering: [5, 4, 2, 1, 2, 3, 2, 4],
    lhDownFingering: [1, 2, 4, 5, 3, 4, 3, 5],
    ascentStart: -5,
    upBars: 0,
    downBars: 0,
    descentStart: 2,
  },
];

export const HANON_EXERCISE_COUNT = HANON_PATTERNS.length;

/** Clamps an arbitrary number to a valid exercise index. */
function hanonPattern(exercise: number): HanonPattern {
  const i = Math.min(Math.max(Math.trunc(exercise) - 1, 0), HANON_PATTERNS.length - 1);
  return HANON_PATTERNS[i]!;
}

function buildHanonMeasuresInternal(
  rootMidi: number,
  names: KeyInfo['names'],
  steps: readonly number[],
  octaves: number,
  pattern: HanonPattern,
  upFingering: readonly (number | null)[],
  downFingering: readonly (number | null)[],
  showFingering = true,
): string[][] {
  const measures: string[][] = [];
  const BEAM_GROUP = 4;
  const span = 7 * octaves;

  const bar = (
    root: number,
    cell: readonly number[],
    fingering: readonly (number | null)[],
    marked: boolean,
  ) =>
    cell.map((offset, i) =>
      eighth(
        diatonicMidi(rootMidi, root + offset, steps),
        names,
        beamFor(i, cell.length, BEAM_GROUP),
        marked ? (fingering[i] ?? undefined) : undefined,
      ),
    );

  // Fingering is printed on the first two bars of each direction only; after that the
  // hand shape repeats and the marks are clutter.
  const upBars = span + pattern.upBars;
  for (let i = 0; i < upBars; i++) {
    const root = pattern.ascentStart + i;
    measures.push(bar(root, pattern.upCell, upFingering, showFingering && i < 2));
  }

  const descentTop = span + pattern.descentStart;
  const downBars = span + pattern.downBars;
  for (let i = 0; i < downBars; i++) {
    measures.push(bar(descentTop - i, pattern.downCell, downFingering, showFingering && i < 2));
  }

  measures.push([wholeNote(rootMidi, names)]);
  return measures;
}

export function getHanonMeasureNotes(
  pitchClass: number,
  mode: WarmUpScaleMode,
  hand: WarmUpHand,
  octaves: number,
  showFingering = true,
  exercise = 1,
): { rh: string[][] | null; lh: string[][] | null } {
  const { names } = getKeyInfo(pitchClass, mode);
  const intervals = mode === 'major' ? MAJOR_INTERVALS : MINOR_INTERVALS;
  const steps = scaleSteps(intervals);
  const pattern = hanonPattern(exercise);
  const rh =
    hand === 'left'
      ? null
      : buildHanonMeasuresInternal(
          60 + pitchClass,
          names,
          steps,
          octaves,
          pattern,
          pattern.rhUpFingering,
          pattern.rhDownFingering,
          showFingering,
        );
  const lh =
    hand === 'right'
      ? null
      : buildHanonMeasuresInternal(
          48 + pitchClass,
          names,
          steps,
          octaves,
          pattern,
          pattern.lhUpFingering,
          pattern.lhDownFingering,
          showFingering,
        );
  return { rh, lh };
}

// ─── 4-5 Drill ────────────────────────────────────────────────────────────────
// Fixed exercise: C major, one octave. Fingers 4+5 alternate in eighths;
// fingers 1-3 play a contrary-motion half-note melody.

// MIDI values used (C major — no accidentals needed)
const D45_C5 = 72;
const D45_B4 = 71;
const D45_C3 = 48;
const D45_D3 = 50;

// RH lower-voice melody: two half notes per measure (last measure: one whole note)
const D45_RH_MELODY: number[][] = [
  [60, 62], // C4 D4
  [64, 65], // E4 F4
  [67, 69], // G4 A4
  [67, 65], // G4 F4
  [64, 62], // E4 D4
  [60], // C4 (whole)
];

// LH upper-voice melody: contrary motion mirror
const D45_LH_MELODY: number[][] = [
  [60, 59], // C4 B3
  [57, 55], // A3 G3
  [53, 52], // F3 E3
  [53, 55], // F3 G3
  [57, 59], // A3 B3
  [60], // C4 (whole)
];

// The peak bar (RH G4 A4 / LH F3 E3) — the hard spot, where the melody is played by
// fingers 2 and 3 with no thumb anchor while 4+5 keep the ostinato going.
const D45_PEAK_INDEX = 2;

// Returns the melody with the peak bar played `peakRepeats` times in total, so the
// student stays on fingers 2-3 for longer before the melody turns around.
// Clamped rather than validated: routines saved before this parameter existed have no
// value at all, and settings come back off disk unchecked.
function expandDrill45Melody(melody: number[][], peakRepeats: number): number[][] {
  const max = Math.max(...WARMUP_PEAK_REPEATS);
  const extra = Math.max(0, Math.min(max - 1, Math.round(peakRepeats || 1) - 1));
  if (extra === 0) return melody;
  const peak = melody[D45_PEAK_INDEX]!;
  return [
    ...melody.slice(0, D45_PEAK_INDEX + 1),
    ...Array.from({ length: extra }, () => peak),
    ...melody.slice(D45_PEAK_INDEX + 1),
  ];
}

function d45Eighth(
  midi: number,
  voice: 1 | 2,
  stemUp: boolean,
  beam: 'begin' | 'end',
  names: KeyInfo['names'],
  fingering?: number,
): string {
  const stem = stemUp ? '<stem>up</stem>' : '<stem>down</stem>';
  const beamXml = `<beam number="1">${beam}</beam>`;
  const fXml =
    fingering !== undefined
      ? `<notations><technical><fingering>${fingering}</fingering></technical></notations>`
      : '';
  return `<note>${pitchXml(midiToPitch(midi, names))}<duration>1</duration><voice>${voice}</voice><type>eighth</type>${stem}${beamXml}${fXml}</note>`;
}

function d45Half(midi: number, voice: 1 | 2, stemUp: boolean, names: KeyInfo['names']): string {
  const stem = stemUp ? '<stem>up</stem>' : '<stem>down</stem>';
  return `<note>${pitchXml(midiToPitch(midi, names))}<duration>4</duration><voice>${voice}</voice><type>half</type>${stem}</note>`;
}

function d45Whole(midi: number, voice: 1 | 2, names: KeyInfo['names']): string {
  return `<note>${pitchXml(midiToPitch(midi, names))}<duration>8</duration><voice>${voice}</voice><type>whole</type></note>`;
}

const D45_BACKUP = '<backup><duration>8</duration></backup>';

function buildDrill45RhMeasures(showFingering: boolean, peakRepeats: number): string[][] {
  const names = getKeyInfo(0, 'major').names;
  return expandDrill45Melody(D45_RH_MELODY, peakRepeats).map((melody, m) => {
    const notes: string[] = [];
    if (melody.length === 1) {
      // Last measure: whole note per voice, no rhythm pattern
      notes.push(d45Whole(D45_C5, 1, names));
      notes.push(D45_BACKUP);
      notes.push(d45Whole(melody[0]!, 2, names));
    } else {
      // Voice 1: C5 B4 × 4 (8 eighths, stems up)
      for (let i = 0; i < 8; i++) {
        const midi = i % 2 === 0 ? D45_C5 : D45_B4;
        const beam = i % 2 === 0 ? ('begin' as const) : ('end' as const);
        const f = showFingering && m === 0 ? (i === 0 ? 5 : i === 1 ? 4 : undefined) : undefined;
        notes.push(d45Eighth(midi, 1, true, beam, names, f));
      }
      notes.push(D45_BACKUP);
      // Voice 2: 2 half notes (stems down)
      notes.push(d45Half(melody[0]!, 2, false, names));
      notes.push(d45Half(melody[1]!, 2, false, names));
    }
    return notes;
  });
}

function buildDrill45LhMeasures(showFingering: boolean, peakRepeats: number): string[][] {
  const names = getKeyInfo(0, 'major').names;
  return expandDrill45Melody(D45_LH_MELODY, peakRepeats).map((melody, m) => {
    const notes: string[] = [];
    if (melody.length === 1) {
      notes.push(d45Whole(melody[0]!, 1, names));
      notes.push(D45_BACKUP);
      notes.push(d45Whole(D45_C3, 2, names));
    } else {
      // Voice 1: 2 half notes (contrary motion, stems up)
      notes.push(d45Half(melody[0]!, 1, true, names));
      notes.push(d45Half(melody[1]!, 1, true, names));
      notes.push(D45_BACKUP);
      // Voice 2: C3 D3 × 4 (8 eighths, stems down)
      for (let i = 0; i < 8; i++) {
        const midi = i % 2 === 0 ? D45_C3 : D45_D3;
        const beam = i % 2 === 0 ? ('begin' as const) : ('end' as const);
        const f = showFingering && m === 0 ? (i === 0 ? 5 : i === 1 ? 4 : undefined) : undefined;
        notes.push(d45Eighth(midi, 2, false, beam, names, f));
      }
    }
    return notes;
  });
}

export function getDrill45MeasureNotes(
  hand: WarmUpHand,
  showFingering = true,
  peakRepeats = 1,
): { rh: string[][] | null; lh: string[][] | null } {
  const rh = hand === 'left' ? null : buildDrill45RhMeasures(showFingering, peakRepeats);
  const lh = hand === 'right' ? null : buildDrill45LhMeasures(showFingering, peakRepeats);
  return { rh, lh };
}

export function generateDrill45Xml(hand: WarmUpHand, peakRepeats = 1): string {
  const { rh, lh } = getDrill45MeasureNotes(hand, true, peakRepeats);
  return buildTwoHandXml(0, 'major', hand, rh, lh);
}

export function generateHanonXml(
  pitchClass: number,
  mode: WarmUpScaleMode,
  hand: WarmUpHand,
  octaves = 1,
  exercise = 1,
): string {
  const { fifths } = getKeyInfo(pitchClass, mode);
  const { rh, lh } = getHanonMeasureNotes(pitchClass, mode, hand, octaves, true, exercise);
  return buildTwoHandXml(fifths, mode, hand, rh, lh);
}

// ─── Long note ────────────────────────────────────────────────────────────────

/**
 * A whole note carrying the tie markup for its place in a held chain.
 *
 * Both elements are required and they are not interchangeable. `<tie>` is the sound
 * and `<tied>` is the printed slur, and OSMD builds `Note.NoteTie` from `<tied>`
 * inside `<notations>` only — playback then skips continuations by asking
 * `NoteTie.StartNote !== note`. A chain written with `<tie>` alone looks right and
 * re-attacks the pitch at every barline.
 *
 * Element order inside `<note>` is fixed by the schema as pitch, duration, tie, type,
 * notations, which is why this cannot append to `wholeNote()`. On a middle note the
 * stop precedes the start.
 */
function tiedWholeNote(
  pitch: { step: string; alter: number; octave: number },
  tie: { start: boolean; stop: boolean },
): string {
  const tieXml = `${tie.stop ? '<tie type="stop"/>' : ''}${tie.start ? '<tie type="start"/>' : ''}`;
  const tiedXml =
    tie.start || tie.stop
      ? `<notations>${tie.stop ? '<tied type="stop"/>' : ''}${tie.start ? '<tied type="start"/>' : ''}</notations>`
      : '';
  return `<note>${pitchXml(pitch)}<duration>${DIVISIONS * 4}</duration>${tieXml}<type>whole</type>${tiedXml}</note>`;
}

/**
 * (N held measures + one whole-rest measure) × R, written out literally.
 *
 * The rest after the *last* repetition is intentional: every hold-then-breathe block
 * is then the same shape, so the exercise can be spliced anywhere in a routine and
 * `measureCount` is simply `(measures + 1) * repeats`.
 *
 * Clamped rather than validated. Settings and routine blocks are read off disk with a
 * blind cast, so an out-of-range number is reachable and must render something.
 */
function buildLongNoteMeasures(
  noteName: string,
  noteOctave: number,
  measures: number,
  repeats: number,
): string[][] {
  const held = clampToOption(measures, WARMUP_LONG_NOTE_MEASURES);
  const reps = clampToOption(repeats, WARMUP_LONG_NOTE_REPEATS);
  const { step, alter } = longNoteEntry(noteName);
  const octave = Math.trunc(noteOctave);

  const bars: string[][] = [];
  for (let r = 0; r < reps; r++) {
    for (let m = 0; m < held; m++) {
      // A single-measure hold gets neither flag, i.e. a plain whole note.
      bars.push([tiedWholeNote({ step, alter, octave }, { start: m < held - 1, stop: m > 0 })]);
    }
    bars.push([WHOLE_REST]);
  }
  return bars;
}

/** Clamps to the span of an option list, never to a literal. */
function clampToOption(value: number, options: readonly number[]): number {
  const lo = Math.min(...options);
  const hi = Math.max(...options);
  return Math.min(Math.max(Math.round(value || lo), lo), hi);
}

export function getLongNoteMeasureNotes(
  noteName: string,
  noteOctave: number,
  measures = 2,
  repeats = 4,
): { rh: string[][] | null; lh: string[][] | null } {
  // Always the right hand, whatever `hand` says: a long tone is a one-part score, and
  // routine assembly reads `rh` into P1 while `buildTwoHandXml` only gives P1 a treble
  // clef when the notes arrive on `rh`.
  return { rh: buildLongNoteMeasures(noteName, noteOctave, measures, repeats), lh: null };
}

export function generateLongNoteXml(
  noteName: string,
  noteOctave: number,
  measures = 2,
  repeats = 4,
): string {
  const { rh } = getLongNoteMeasureNotes(noteName, noteOctave, measures, repeats);
  // No key signature: the accidental comes from the chosen spelling, not from a key.
  return buildTwoHandXml(0, 'major', 'right', rh, null);
}

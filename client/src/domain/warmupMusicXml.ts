import type { WarmUpHand, WarmUpScaleMode } from './warmup';

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
    minor: { fifths: 6, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
  },
  4: {
    major: { fifths: 4, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
    minor: { fifths: 1, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
  },
  5: {
    major: { fifths: -1, names: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] },
    minor: {
      fifths: -4,
      names: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'Cb'],
    },
  },
  6: {
    major: { fifths: 6, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
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
      names: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'Cb'],
    },
    minor: { fifths: 5, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
  },
  9: {
    major: { fifths: 3, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
    minor: { fifths: 0, names: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] },
  },
  10: {
    // Bb major (-2) / Bb minor (-4)
    major: { fifths: -2, names: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] },
    minor: {
      fifths: -4,
      names: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'Cb'],
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
              ? `<attributes><divisions>2</divisions><key><fifths>${fifths}</fifths><mode>${modeStr}</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>${p.clef.sign}</sign><line>${p.clef.line}</line></clef></attributes>`
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
  const degInOctave = degree % 7;
  const step = steps[degInOctave] ?? 0; // steps has 7 elements, degInOctave is 0-6
  return rootMidi + octaves * 12 + step;
}

// Semitone offset from root for diatonic index i spanning multiple octaves.
// Uses the fact that intervals[0..7] covers one octave: floor(i/7)*12 + intervals[i%7].
function scaleOffset(intervals: ScaleIntervals, i: number): number {
  return Math.floor(i / 7) * 12 + (intervals[i % 7] ?? 0);
}

function buildScaleMeasuresInternal(
  rootMidi: number,
  names: KeyInfo['names'],
  intervals: ScaleIntervals,
  octaves: number,
): string[][] {
  const top = 7 * octaves;
  const seq: number[] = [];
  for (let i = 0; i <= top; i++) seq.push(i);
  for (let i = top - 1; i >= 0; i--) seq.push(i);

  const N = seq.length;
  const eighthMidis = seq.slice(0, N - 1).map((i) => rootMidi + scaleOffset(intervals, i));
  const lastMidi = rootMidi + scaleOffset(intervals, seq[N - 1]!);

  const eighthsBefore = N - 1;
  const slotsInLastBar = eighthsBefore % 8;
  const finalDuration = slotsInLastBar === 0 ? 8 : 8 - slotsInLastBar;

  const bars: string[][] = [];
  const BEAM_GROUP = 4;

  for (let b = 0; b + 8 <= eighthsBefore; b += 8) {
    bars.push(
      eighthMidis.slice(b, b + 8).map((m, i) => eighth(m, names, beamFor(i, 8, BEAM_GROUP))),
    );
  }

  const lastBarEighthMidis =
    slotsInLastBar > 0 ? eighthMidis.slice(eighthsBefore - slotsInLastBar) : [];
  const lastBarNotes = lastBarEighthMidis.map((m, i) =>
    eighth(m, names, beamFor(i, slotsInLastBar, BEAM_GROUP)),
  );
  lastBarNotes.push(noteWithDuration(lastMidi, names, finalDuration));
  bars.push(lastBarNotes);

  return bars;
}

export function getScaleMeasureNotes(
  pitchClass: number,
  mode: WarmUpScaleMode,
  hand: WarmUpHand,
  octaves: number,
): { rh: string[][] | null; lh: string[][] | null } {
  const { names } = getKeyInfo(pitchClass, mode);
  const intervals = mode === 'major' ? MAJOR_INTERVALS : MINOR_INTERVALS;
  const rh =
    hand === 'left' ? null : buildScaleMeasuresInternal(60 + pitchClass, names, intervals, octaves);
  const lh =
    hand === 'right'
      ? null
      : buildScaleMeasuresInternal(48 + pitchClass, names, intervals, octaves);
  return { rh, lh };
}

export function generateScaleXml(
  pitchClass: number,
  mode: WarmUpScaleMode,
  hand: WarmUpHand,
  octaves = 1,
): string {
  const { fifths } = getKeyInfo(pitchClass, mode);
  const { rh, lh } = getScaleMeasureNotes(pitchClass, mode, hand, octaves);
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

// Correct Hanon No.1 cell: skip a third up, then step up to a 6th, then step back to 2nd.
// In C major from C: C–E–F–G–A–G–F–E (diatonic offsets: 0,2,3,4,5,4,3,2)
const HANON_CELL_UP = [0, 2, 3, 4, 5, 4, 3, 2] as const;
// Descending mirror: D–A–G–F–E–F–G–A → offsets: 0,-2,-3,-4,-5,-4,-3,-2
const HANON_CELL_DOWN = [0, -2, -3, -4, -5, -4, -3, -2] as const;
const HANON_FINGER_UP = [1, 2, 3, 4, 5, 4, 3, 2] as const;
const HANON_FINGER_DOWN = [5, 4, 3, 2, 1, 2, 3, 4] as const;

function buildHanonMeasuresInternal(
  rootMidi: number,
  names: KeyInfo['names'],
  steps: readonly number[],
  octaves: number,
  showFingering = true,
): string[][] {
  const measures: string[][] = [];
  const BEAM_GROUP = 4;
  for (let d = 0; d < 7 * octaves; d++) {
    measures.push(
      HANON_CELL_UP.map((offset, i) =>
        eighth(
          diatonicMidi(rootMidi, d + offset, steps),
          names,
          beamFor(i, 8, BEAM_GROUP),
          showFingering && d < 2 ? HANON_FINGER_UP[i] : undefined,
        ),
      ),
    );
  }
  const descentTop = 7 * octaves + 4;
  for (let d = descentTop; d >= 5; d--) {
    const cellIndex = descentTop - d;
    measures.push(
      HANON_CELL_DOWN.map((offset, i) =>
        eighth(
          diatonicMidi(rootMidi, d + offset, steps),
          names,
          beamFor(i, 8, BEAM_GROUP),
          showFingering && cellIndex < 2 ? HANON_FINGER_DOWN[i] : undefined,
        ),
      ),
    );
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
): { rh: string[][] | null; lh: string[][] | null } {
  const { names } = getKeyInfo(pitchClass, mode);
  const intervals = mode === 'major' ? MAJOR_INTERVALS : MINOR_INTERVALS;
  const steps = scaleSteps(intervals);
  const rh =
    hand === 'left'
      ? null
      : buildHanonMeasuresInternal(60 + pitchClass, names, steps, octaves, showFingering);
  const lh =
    hand === 'right'
      ? null
      : buildHanonMeasuresInternal(48 + pitchClass, names, steps, octaves, showFingering);
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

function buildDrill45RhMeasures(showFingering: boolean): string[][] {
  const names = getKeyInfo(0, 'major').names;
  return D45_RH_MELODY.map((melody, m) => {
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

function buildDrill45LhMeasures(showFingering: boolean): string[][] {
  const names = getKeyInfo(0, 'major').names;
  return D45_LH_MELODY.map((melody, m) => {
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
): { rh: string[][] | null; lh: string[][] | null } {
  const rh = hand === 'left' ? null : buildDrill45RhMeasures(showFingering);
  const lh = hand === 'right' ? null : buildDrill45LhMeasures(showFingering);
  return { rh, lh };
}

export function generateDrill45Xml(hand: WarmUpHand): string {
  const { rh, lh } = getDrill45MeasureNotes(hand);
  const parts: PartDef[] = [];
  if (rh) parts.push({ id: 'P1', name: 'Right Hand', clef: { sign: 'G', line: 2 }, measures: rh });
  if (lh)
    parts.push({
      id: hand === 'both' ? 'P2' : 'P1',
      name: 'Left Hand',
      clef: { sign: 'F', line: 4 },
      measures: lh,
    });
  return buildXml(0, 'major', parts);
}

export function generateHanonXml(
  pitchClass: number,
  mode: WarmUpScaleMode,
  hand: WarmUpHand,
  octaves = 1,
): string {
  const { fifths } = getKeyInfo(pitchClass, mode);
  const { rh, lh } = getHanonMeasureNotes(pitchClass, mode, hand, octaves);
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

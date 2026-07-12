import type { ExerciseBlock, Routine, RoutineBlock } from './routine';
import { WARMUP_KEYS } from './warmup';
import {
  getArpeggioMeasureNotes,
  getChromaticMeasureNotes,
  getDrill45MeasureNotes,
  getFiveScaleMeasureNotes,
  getHanonMeasureNotes,
  getScaleMeasureNotes,
} from './warmupMusicXml';

// Divisions per quarter note — must match warmupMusicXml.ts
const DIVISIONS = 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rehearsalDirection(label: string): string {
  return `<direction placement="above"><direction-type><rehearsal>${label}</rehearsal></direction-type></direction>`;
}

function tempoDirection(bpm: number): string {
  return `<direction placement="above"><direction-type><metronome parentheses="no"><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`;
}

function keyAttr(fifths: number, mode: 'major' | 'minor'): string {
  return `<key><fifths>${fifths}</fifths><mode>${mode}</mode></key>`;
}

function clefAttr(sign: string, line: number): string {
  return `<clef><sign>${sign}</sign><line>${line}</line></clef>`;
}

// Wraps an array of note XML strings as a complete <measure>.
// firstOfBlock: prepend key + (optionally clef) attributes + rehearsal + tempo directions.
function wrapMeasure(
  notes: string[],
  measureNumber: number,
  options?: {
    fifths: number;
    mode: 'major' | 'minor';
    includeClef: boolean;
    clefSign: string;
    clefLine: number;
    rehearsalLabel: string;
    bpm: number;
    includeTempo?: boolean;
  },
): string {
  let prefix = '';
  if (options) {
    const clefXml = options.includeClef ? clefAttr(options.clefSign, options.clefLine) : '';
    const attrXml = `<attributes><divisions>${DIVISIONS}</divisions>${keyAttr(options.fifths, options.mode)}<time><beats>4</beats><beat-type>4</beat-type></time>${clefXml}</attributes>`;
    const tempoXml = options.includeTempo !== false ? tempoDirection(options.bpm) : '';
    prefix = attrXml + rehearsalDirection(options.rehearsalLabel) + tempoXml;
  }
  return `<measure number="${measureNumber}">${prefix}${notes.join('')}</measure>`;
}

// Full-measure rest note string (for the unused hand in single-hand exercises).
const WHOLE_REST = `<note><rest measure="yes"/><duration>${DIVISIONS * 4}</duration><type>whole</type></note>`;

// ─── Rehearsal label ──────────────────────────────────────────────────────────

function exerciseRehearsalLabel(block: ExerciseBlock): string {
  if (block.type === 'drill45') return '4-5 Drill';
  const keyLabel =
    WARMUP_KEYS.find((k) => k.pitchClass === block.pitchClass && k.mode === block.mode)?.label ??
    'C';
  switch (block.type) {
    case 'hanon':
      return `Hanon I in ${keyLabel}`;
    case 'arpeggio':
      return `${keyLabel} Arpeggio`;
    case 'chromatic':
      return `${keyLabel} Chromatic`;
    case 'fiveScale':
      return `${keyLabel} 5-Finger`;
    case 'scales':
      return `${keyLabel} Scale`;
  }
}

// Right-/left-hand measures for any exercise block. Routines never render fingering.
function measureNotesForBlock(block: ExerciseBlock): {
  rh: string[][] | null;
  lh: string[][] | null;
} {
  switch (block.type) {
    case 'hanon':
      return getHanonMeasureNotes(block.pitchClass, block.mode, block.hand, block.octaves, false);
    case 'scales':
      return getScaleMeasureNotes(block.pitchClass, block.mode, block.hand, block.octaves);
    case 'arpeggio':
      return getArpeggioMeasureNotes(block.pitchClass, block.mode, block.hand, block.octaves);
    case 'chromatic':
      return getChromaticMeasureNotes(block.pitchClass, block.mode, block.hand, block.octaves);
    case 'fiveScale':
      return getFiveScaleMeasureNotes(block.pitchClass, block.mode, block.hand, block.octaves);
    case 'drill45':
      return getDrill45MeasureNotes(block.hand, false);
  }
}

// Estimate total duration in seconds for a routine (used for UI display only).
export function estimateRoutineSeconds(routine: Routine): number {
  let totalSeconds = 0;
  let lastBpm = 60;

  for (const block of routine.blocks) {
    if (block.type === 'pause') {
      totalSeconds += (block.measures * 4 * 60) / lastBpm;
    } else {
      lastBpm = block.bpm;
      const { rh, lh } = measureNotesForBlock(block);
      const measureCount = (rh ?? lh)!.length;
      totalSeconds += (measureCount * 4 * 60) / block.bpm;
    }
  }

  return totalSeconds;
}

// ─── Key info lookup (mirrors warmupMusicXml KEY_INFO) ────────────────────────

type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
type Mode = 'major' | 'minor';

const KEY_FIFTHS: Record<PitchClass, Record<Mode, number>> = {
  0: { major: 0, minor: -3 },
  1: { major: -5, minor: 4 },
  2: { major: 2, minor: -1 },
  3: { major: -3, minor: 6 },
  4: { major: 4, minor: 1 },
  5: { major: -1, minor: -4 },
  6: { major: 6, minor: 3 },
  7: { major: 1, minor: -2 },
  8: { major: -4, minor: 5 },
  9: { major: 3, minor: 0 },
  10: { major: -2, minor: -5 },
  11: { major: 5, minor: 2 },
};

function getFifths(pitchClass: number, mode: Mode): number {
  const pc = (((pitchClass % 12) + 12) % 12) as PitchClass;
  return KEY_FIFTHS[pc][mode];
}

// ─── Main generator ───────────────────────────────────────────────────────────

// Returns the BPM of the first exercise block at or after `fromIndex`.
function nextExerciseBpm(blocks: RoutineBlock[], fromIndex: number): number {
  for (let i = fromIndex; i < blocks.length; i++) {
    const b = blocks[i];
    if (b && b.type !== 'pause') return b.bpm;
  }
  return 60; // fallback; validation prevents pause as last block
}

export interface RoutineTempoChange {
  quarterBeat: number; // cumulative quarter notes from start of score
  bpm: number;
}

export function computeRoutineTempoSchedule(routine: Routine): RoutineTempoChange[] {
  const schedule: RoutineTempoChange[] = [];
  let cumulativeQuarters = 0;
  let lastEmittedBpm: number | null = null;

  for (let i = 0; i < routine.blocks.length; i++) {
    const block = routine.blocks[i]!;

    if (block.type === 'pause') {
      const bpm = nextExerciseBpm(routine.blocks, i + 1);
      if (lastEmittedBpm === null || bpm !== lastEmittedBpm) {
        schedule.push({ quarterBeat: cumulativeQuarters, bpm });
        lastEmittedBpm = bpm;
      }
      cumulativeQuarters += block.measures * 4;
    } else {
      const { bpm } = block;
      if (lastEmittedBpm === null || bpm !== lastEmittedBpm) {
        schedule.push({ quarterBeat: cumulativeQuarters, bpm });
        lastEmittedBpm = bpm;
      }
      const { rh, lh } = measureNotesForBlock(block);
      const measureCount = (rh ?? lh)!.length;
      cumulativeQuarters += measureCount * 4;
    }
  }

  return schedule;
}

export function generateRoutineXml(routine: Routine): string {
  let measureNumber = 1;
  const p1Measures: string[] = []; // treble
  const p2Measures: string[] = []; // bass

  // Clef is emitted once: in the first exercise block's first measure.
  let clefEmitted = false;
  // Track last emitted BPM to suppress redundant tempo directions.
  let lastEmittedBpm: number | null = null;

  for (let i = 0; i < routine.blocks.length; i++) {
    const block = routine.blocks[i]!;

    if (block.type === 'pause') {
      const bpm = nextExerciseBpm(routine.blocks, i + 1);
      const includePauseTempo = lastEmittedBpm === null || bpm !== lastEmittedBpm;
      const measureCount = block.measures;
      const wholeRest = `<note><rest measure="yes"/><duration>${DIVISIONS * 4}</duration><type>whole</type></note>`;

      for (let m = 0; m < measureCount; m++) {
        if (m === 0) {
          // First pause measure: 4/4 time, rehearsal mark, tempo of next exercise.
          const attrXml = `<attributes><divisions>${DIVISIONS}</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>`;
          const prefix =
            attrXml + rehearsalDirection('Pause') + (includePauseTempo ? tempoDirection(bpm) : '');
          const mXml = `<measure number="${measureNumber}">${prefix}${wholeRest}</measure>`;
          p1Measures.push(mXml);
          p2Measures.push(mXml);
        } else {
          // Subsequent pause measures — plain whole rest, no attr repeat.
          const mXml = `<measure number="${measureNumber}">${wholeRest}</measure>`;
          p1Measures.push(mXml);
          p2Measures.push(mXml);
        }
        measureNumber++;
      }
      if (includePauseTempo) lastEmittedBpm = bpm;
      continue;
    }

    // Exercise block
    const { pitchClass, mode, bpm } = block;
    const fifths = getFifths(pitchClass, mode);
    const label = exerciseRehearsalLabel(block);
    const includeTempo = lastEmittedBpm === null || bpm !== lastEmittedBpm;

    const { rh, lh } = measureNotesForBlock(block);

    const measureCount = (rh ?? lh)!.length;

    for (let m = 0; m < measureCount; m++) {
      const p1Notes = rh?.[m] ?? [WHOLE_REST];
      const p2Notes = lh?.[m] ?? [WHOLE_REST];

      if (m === 0) {
        const needClef = !clefEmitted;
        const commonOpts = {
          fifths,
          mode,
          includeClef: needClef,
          rehearsalLabel: label,
          bpm,
          includeTempo,
        };
        p1Measures.push(
          wrapMeasure(p1Notes, measureNumber, { ...commonOpts, clefSign: 'G', clefLine: 2 }),
        );
        p2Measures.push(
          wrapMeasure(p2Notes, measureNumber, { ...commonOpts, clefSign: 'F', clefLine: 4 }),
        );
        clefEmitted = true;
      } else {
        p1Measures.push(`<measure number="${measureNumber}">${p1Notes.join('')}</measure>`);
        p2Measures.push(`<measure number="${measureNumber}">${p2Notes.join('')}</measure>`);
      }
      measureNumber++;
    }
    if (includeTempo) lastEmittedBpm = bpm;
  }

  const finalBarline = `<barline location="right"><bar-style>light-heavy</bar-style></barline>`;
  if (p1Measures.length > 0) {
    p1Measures[p1Measures.length - 1] = p1Measures[p1Measures.length - 1]!.replace(
      '</measure>',
      `${finalBarline}</measure>`,
    );
    p2Measures[p2Measures.length - 1] = p2Measures[p2Measures.length - 1]!.replace(
      '</measure>',
      `${finalBarline}</measure>`,
    );
  }

  const partList =
    `<score-part id="P1"><part-name>Right Hand</part-name></score-part>` +
    `<score-part id="P2"><part-name>Left Hand</part-name></score-part>`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">` +
    `<score-partwise version="3.1">` +
    `<part-list>${partList}</part-list>` +
    `<part id="P1">${p1Measures.join('')}</part>` +
    `<part id="P2">${p2Measures.join('')}</part>` +
    `</score-partwise>`
  );
}

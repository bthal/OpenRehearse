import { INSTRUMENT_REGISTRY, exerciseRootMidi, type InstrumentId } from './instrumentRegistry';
import type { ExerciseBlock, Routine, RoutineBlock } from './routine';
import { DEFAULT_PEAK_REPEATS } from './warmup';
import {
  keyLabel,
  measureCount as exerciseMeasureCount,
  warmUpDescriptor,
  type ExerciseParams,
  type MeasureNotes,
} from './warmupRegistry';
import { DIVISIONS, getKeyFifths } from './warmupMusicXml';

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

// A saved block carries every parameter; absent ones fall back to their default so a
// routine written before a parameter existed still renders.
function blockParams(block: ExerciseBlock): ExerciseParams {
  return {
    exercise: block.exercise ?? 1,
    pitchClass: block.pitchClass,
    mode: block.mode,
    hand: block.hand,
    bpm: block.bpm,
    octaves: block.octaves,
    peakRepeats: block.peakRepeats ?? DEFAULT_PEAK_REPEATS,
  };
}

function exerciseRehearsalLabel(block: ExerciseBlock): string {
  const d = warmUpDescriptor(block.type);
  if (!d) return '';
  return d.rehearsalLabel(blockParams(block), keyLabel(block.pitchClass, block.mode));
}

// Right-/left-hand measures for any exercise block. Routines never render fingering.
// Returns empty measures for a type this build doesn't know, rather than throwing:
// routines.json is loaded with a blind cast, so an unrecognised type is reachable.
function measureNotesForBlock(block: ExerciseBlock, instrument: InstrumentId): MeasureNotes {
  const d = warmUpDescriptor(block.type);
  if (!d) return { rh: null, lh: null };
  return d.measureNotes(instrumentBlockParams(block, instrument), false);
}

/**
 * A block's score parameters as this instrument plays them.
 *
 * A single-staff instrument has no hand control, so its exercises are the one-part
 * case — which `hand: 'right'` already produces — and they anchor in that
 * instrument's own register rather than the piano's C4. Neither value is persisted on
 * the block: both follow from the routine's instrument, and storing them would let
 * them go stale the moment the registry's range changed.
 */
function instrumentBlockParams(block: ExerciseBlock, instrument: InstrumentId) {
  const base = blockParams(block);
  if (INSTRUMENT_REGISTRY[instrument].staffLayout === 'grand') return base;
  return {
    ...base,
    hand: 'right' as const,
    rootMidi: exerciseRootMidi(instrument, block.pitchClass),
  };
}

// Measure count for an exercise block, memoised in the registry so a routine's blocks
// are generated once rather than once per consumer (estimate, schedule, assembly).
function blockMeasureCount(block: ExerciseBlock, instrument: InstrumentId): number {
  const d = warmUpDescriptor(block.type);
  if (!d) return 0;
  return exerciseMeasureCount(block.type, instrumentBlockParams(block, instrument));
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
      totalSeconds += (blockMeasureCount(block, routine.instrument) * 4 * 60) / block.bpm;
    }
  }

  return totalSeconds;
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
      cumulativeQuarters += blockMeasureCount(block, routine.instrument) * 4;
    }
  }

  return schedule;
}

export function generateRoutineXml(routine: Routine): string {
  const instrument = routine.instrument;
  // A single-staff instrument gets one part. The bass staff is not filled with rests
  // and hidden — it is simply not emitted, so the score is what the player reads.
  const singleStaff = INSTRUMENT_REGISTRY[instrument].staffLayout === 'single';
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
    const fifths = getKeyFifths(pitchClass, mode);
    const label = exerciseRehearsalLabel(block);
    const includeTempo = lastEmittedBpm === null || bpm !== lastEmittedBpm;

    const { rh, lh } = measureNotesForBlock(block, instrument);
    const measureCount = (rh ?? lh)?.length ?? 0;

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

  const partList = singleStaff
    ? `<score-part id="P1"><part-name>Part</part-name></score-part>`
    : `<score-part id="P1"><part-name>Right Hand</part-name></score-part>` +
      `<score-part id="P2"><part-name>Left Hand</part-name></score-part>`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">` +
    `<score-partwise version="3.1">` +
    `<part-list>${partList}</part-list>` +
    `<part id="P1">${p1Measures.join('')}</part>` +
    (singleStaff ? '' : `<part id="P2">${p2Measures.join('')}</part>`) +
    `</score-partwise>`
  );
}

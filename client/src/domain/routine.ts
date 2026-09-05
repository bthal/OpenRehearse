import type {
  WarmUpBpm,
  WarmUpHand,
  WarmUpLongNoteMeasures,
  WarmUpLongNoteName,
  WarmUpLongNoteOctave,
  WarmUpLongNoteRepeats,
  WarmUpOctaves,
  WarmUpPeakRepeats,
  WarmUpScaleMode,
} from './warmup';
import type { InstrumentId } from './instrumentRegistry';
import type { WarmUpType } from './warmupRegistry';

export const PAUSE_MEASURES = [1, 2, 3, 4] as const;
export type PauseMeasures = (typeof PAUSE_MEASURES)[number];

export interface ExerciseBlock {
  type: WarmUpType;
  pitchClass: number;
  mode: WarmUpScaleMode;
  hand: WarmUpHand;
  bpm: WarmUpBpm;
  octaves: WarmUpOctaves;
  // Hanon only; absent on blocks saved before the exercise number existed (treated as
  // No. 1, which is what every such block was).
  exercise?: number;
  // drill45 only; absent on blocks saved before this parameter existed (treated as 1).
  peakRepeats?: WarmUpPeakRepeats;
  // longNote only; absent on blocks saved before the exercise existed.
  noteName?: WarmUpLongNoteName;
  noteOctave?: WarmUpLongNoteOctave;
  longNoteMeasures?: WarmUpLongNoteMeasures;
  longNoteRepeats?: WarmUpLongNoteRepeats;
}

export interface PauseBlock {
  type: 'pause';
  measures: PauseMeasures;
}

export type RoutineBlock = ExerciseBlock | PauseBlock;

export interface Routine {
  id: string;
  title: string;
  /**
   * The instrument this routine is built for. Chosen when the routine is created and
   * read-only thereafter: changing it would invalidate blocks whose exercise the new
   * instrument cannot do, and the Add Exercise picker already prevents such a block
   * from being created in the first place, so there is nothing to re-validate.
   *
   * Routines stored before instruments existed normalise to `piano` on read.
   */
  instrument: InstrumentId;
  blocks: RoutineBlock[];
  createdAt: string;
  lastOpenedAt?: string; // ISO 8601; undefined for routines never opened after this field was added
}

export function validateRoutine(blocks: RoutineBlock[]): string | null {
  if (blocks.length === 0) return 'noBlocks';
  const hasExercise = blocks.some((b) => b.type !== 'pause');
  if (!hasExercise) return 'noBlocks';
  if (blocks[blocks.length - 1]?.type === 'pause') return 'pauseAtEnd';
  return null;
}

import type { WarmUpBpm, WarmUpHand, WarmUpOctaves, WarmUpScaleMode } from './warmup';

export const PAUSE_MEASURES = [1, 2, 3, 4] as const;
export type PauseMeasures = (typeof PAUSE_MEASURES)[number];

export interface ExerciseBlock {
  type: 'hanon' | 'scales' | 'arpeggio' | 'chromatic' | 'fiveScale' | 'drill45';
  pitchClass: number;
  mode: WarmUpScaleMode;
  hand: WarmUpHand;
  bpm: WarmUpBpm;
  octaves: WarmUpOctaves;
}

export interface PauseBlock {
  type: 'pause';
  measures: PauseMeasures;
}

export type RoutineBlock = ExerciseBlock | PauseBlock;

export interface Routine {
  id: string;
  title: string;
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

export type WarmUpType = 'hanon' | 'scales';
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

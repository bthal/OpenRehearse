/**
 * Target-speed (playback tempo) bounds and helpers — pure, no Tone/OSMD/React.
 *
 * A piece's "target speed" is the 100% reference the PlayView speed selector
 * multiplies by ×0.5 / ×0.75 / ×1.0. It defaults to the tempo read from the
 * MusicXML on import (see `scrapeTempoBpm`) but the user may override it.
 *
 * Bounds are 40–240 BPM, chosen so every selectable speed lands inside the
 * WebView synth's own clamp of [20, 240] (`setTempoBpm` in score-web/playback):
 *   - ×0.5 of the minimum (40) = 20 → the engine floor
 *   - ×1.0 of the maximum (240) = 240 → the engine ceiling
 * Keeping the target inside this range guarantees the BPM we display always
 * equals the BPM the engine actually plays (no silent clamp mismatch).
 */
export const MIN_TARGET_BPM = 40;
export const MAX_TARGET_BPM = 240;

/** True when `bpm` is a whole number within the allowed target-speed range. */
export function isValidTargetBpm(bpm: number): boolean {
  return Number.isInteger(bpm) && bpm >= MIN_TARGET_BPM && bpm <= MAX_TARGET_BPM;
}

/** Rounds and clamps an arbitrary BPM into the valid target-speed range. */
export function clampTargetBpm(bpm: number): number {
  return Math.min(MAX_TARGET_BPM, Math.max(MIN_TARGET_BPM, Math.round(bpm)));
}

/**
 * Controls which warm-up exercises appear in the dashboard for this build.
 * Set an entry to false to hide it entirely; set to true to show it.
 * Changing a flag here does not affect user-created routines that reference
 * the exercise (those continue to work regardless of this flag).
 */
export const WARMUP_FEATURES = {
  hanon: true,
  scales: true,
  arpeggio: true,
  chromatic: true,
  fiveScale: true,
  drill45: false,
} as const satisfies Record<string, boolean>;

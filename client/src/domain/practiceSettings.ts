// The three practice settings a passage can be worked on with: which hand(s) sound,
// how fast, whether the metronome clicks, and whether the notes are muted.
//
// They live in the domain rather than in `playViewStore` because a saved bit stores
// them (see `domain/bits.ts`), and the domain layer may not import from state.
// `playViewStore` re-exports them, so screens keep importing from where they always
// have.

export type ActiveHand = 'both' | 'right' | 'left';

export const ACTIVE_HANDS: ActiveHand[] = ['both', 'left', 'right'];

export type TempoMultiplier = 0.5 | 0.75 | 1.0;

export const TEMPO_MULTIPLIERS: TempoMultiplier[] = [0.5, 0.75, 1.0];

/** The three settings as one value, which is what a bit stores and restores. */
export interface PracticeSettings {
  hand: ActiveHand;
  tempoMultiplier: TempoMultiplier;
  metronome: boolean;
  /**
   * Whether the notes are silenced — the cursor still runs and the metronome still
   * clicks, so the student can play along to the scroll. Independent of `hand`, so
   * unmuting brings back exactly the hand that was chosen.
   */
  muted: boolean;
}

export const DEFAULT_PRACTICE_SETTINGS: PracticeSettings = {
  hand: 'both',
  tempoMultiplier: 1.0,
  metronome: false,
  muted: false,
};

/**
 * Coerces a value that has been round-tripped through disk back into the union.
 *
 * Both coercions fall back to the default rather than rejecting the whole record:
 * a bit with an unreadable hand is still a usable loop, and losing the passage
 * because one field rotted would be the worse failure.
 */
export function coerceHand(value: unknown): ActiveHand {
  return ACTIVE_HANDS.includes(value as ActiveHand)
    ? (value as ActiveHand)
    : DEFAULT_PRACTICE_SETTINGS.hand;
}

export function coerceTempoMultiplier(value: unknown): TempoMultiplier {
  return TEMPO_MULTIPLIERS.includes(value as TempoMultiplier)
    ? (value as TempoMultiplier)
    : DEFAULT_PRACTICE_SETTINGS.tempoMultiplier;
}

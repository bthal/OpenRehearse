/**
 * How long a tied note should sound — pure, no Tone/OSMD/React.
 *
 * A tie means "one sound": the chain is struck once and held for the notes'
 * *combined* length. Playback extraction therefore skips every continuation
 * note and sounds only the chain's start — which is exactly why the start
 * note's own `Length` is the wrong number to hold for. OSMD keeps each note's
 * individual length in `Note.Length` and the combined value on the tie itself
 * (`Tie.Duration`), so a two-measure tied whole note reads `Length` = 1 whole
 * but `Tie.Duration` = 2. Sounding `Length` cuts such a note to a half of its
 * notated value (a third for a three-measure tie, a quarter for four).
 *
 * Structurally typed rather than importing OSMD's `Note`, which keeps the
 * domain layer free of score-web dependencies (see AGENTS.md module map).
 */

/** The part of OSMD's `Note` this rule reads. */
export interface TieDurationNote {
  Length: { RealValue: number };
  NoteTie?: { StartNote: unknown; Duration?: { RealValue: number } } | null;
}

/**
 * The length `note` should sound for, in whole notes.
 *
 * Continuation notes return 0: the chain's start note already holds their time,
 * so sounding them again would double-attack the pitch. Callers skip them
 * anyway — returning 0 means a caller that forgets gets silence rather than a
 * stutter.
 */
export function soundingLengthWholes(note: TieDurationNote): number {
  const tie = note.NoteTie;
  if (!tie) return note.Length.RealValue;
  if (tie.StartNote !== note) return 0;
  const chained = tie.Duration?.RealValue;
  // A tie carrying no usable duration falls back to the note's own length: a
  // short sound is a better failure than a silent one.
  return typeof chained === 'number' && chained > 0 ? chained : note.Length.RealValue;
}

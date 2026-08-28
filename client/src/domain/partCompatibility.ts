/**
 * Which instruments may practise which part.
 *
 * One rule, applied in three places — the import picker, the read-time repair, and
 * the specs that describe both: **a monophonic instrument may only be assigned to a
 * monophonic part.** A clarinet plays one note at a time, so a two-staff piano score
 * assigned to it would sound every note of every chord through the clarinet sampler —
 * a small orchestra of clarinets, which is not what anybody asked for.
 *
 * The refusal is deliberate and is not softened into a top-note-only reduction:
 * silently playing something other than what the score shows is a worse answer than
 * an instrument the user can see is unavailable, and why.
 *
 * Piano has no constraint and accepts everything, which is what keeps the import flow
 * from ever dead-ending: whatever the file holds, at least one instrument is legal.
 *
 * Lives here rather than in `instrumentRegistry.ts` because it is a rule *about* the
 * registry and the notation together; the registry stays a table.
 */
import {
  INSTRUMENT_IDS,
  INSTRUMENT_REGISTRY,
  DEFAULT_INSTRUMENT,
  type InstrumentId,
} from './instrumentRegistry';
import type { PolyphonyReason, ScorePart } from './musicxml';

/** What the compatibility rule needs to know about a part. */
export type PartLike = Pick<ScorePart, 'monophonic' | 'polyphonyReason'>;

/**
 * Whether `instrument` can practise `part`.
 *
 * Refuses only on a stored `monophonic: false`. An absent flag — a part written
 * before the check existed, or one whose body could not be read — is *not* evidence
 * of polyphony, and treating it as such would retroactively demote pieces that have
 * been working. "Nobody looked" leaves the choice alone; see `repairPieceInstrument`.
 */
export function instrumentAllowsPart(
  instrument: InstrumentId,
  part: PartLike | undefined,
): boolean {
  if (INSTRUMENT_REGISTRY[instrument].staffLayout !== 'single') return true;
  return part?.monophonic !== false;
}

/**
 * Why `instrument` cannot practise `part`, or `null` when it can.
 *
 * The reason is the part's, not the instrument's: it is what the import picker prints
 * beside a disabled option so the refusal reads as a fact about the score rather than
 * an unexplained restriction.
 */
export function partRefusalReason(
  instrument: InstrumentId,
  part: PartLike | undefined,
): PolyphonyReason | null {
  if (instrumentAllowsPart(instrument, part)) return null;
  // `monophonic === false` without a reason is a part stored by a build that recorded
  // the verdict but not the label; chords are the commonest cause, but claiming one we
  // did not observe would be a guess, so callers get the generic case.
  return part?.polyphonyReason ?? null;
}

/** The instruments that may practise this part, in registry display order. */
export function legalInstrumentsForPart(part: PartLike | undefined): InstrumentId[] {
  return INSTRUMENT_IDS.filter((id) => instrumentAllowsPart(id, part));
}

/**
 * The part a piece is practising, given its stored part list and chosen part id.
 *
 * A single-part score stores no `partId` — the piece means "the whole score" — so the
 * one entry is the answer. Anything else needs an explicit match; a `partId` naming a
 * part that is no longer in the list resolves to nothing rather than to the first one.
 */
export function practisedPart(
  parts: readonly ScorePart[] | undefined,
  partId: string | undefined,
): ScorePart | undefined {
  if (!parts || parts.length === 0) return undefined;
  if (partId != null && partId !== '') return parts.find((p) => p.id === partId);
  return parts.length === 1 ? parts[0] : undefined;
}

/**
 * The instrument a stored piece may actually be practised on.
 *
 * The piece's instrument is immutable after import, so this is not an edit — it is the
 * repository's normalise-on-read seam, in the same spirit as `normaliseSections` and
 * `normaliseInstrumentId`. A row that predates the compatibility rule, or one written
 * by a build that let a clarinet be assigned to a piano score, would otherwise play
 * every note of every chord through a one-note sampler on the next open.
 *
 * Falls back to the default instrument, which accepts everything, and only when the
 * stored part says outright that it is polyphonic. A piece whose part carries no flag
 * is left exactly as it is: it has been working, and a guess is not an improvement.
 */
export function repairPieceInstrument(
  instrument: InstrumentId,
  parts: readonly ScorePart[] | undefined,
  partId: string | undefined,
): InstrumentId {
  const part = practisedPart(parts, partId);
  return instrumentAllowsPart(instrument, part) ? instrument : DEFAULT_INSTRUMENT;
}

import type { Bit } from './bits';
import type { InstrumentId } from './instrumentRegistry';
import type { ScorePart } from './musicxml';
import type { Section } from './sections';

export interface Piece {
  id: string;
  title: string;
  composer: string | null;
  /**
   * The instrument this piece is practised on. Governs the samples it sounds through,
   * the pitch it sounds at, and whether the hand filter means anything.
   *
   * Not optional past the repository: pieces stored before instruments existed are
   * normalised to `piano` on read (`normaliseInstrumentId`), the same contract
   * `sections` and `bits` get, so nothing downstream defends against `undefined`.
   */
  instrument: InstrumentId;
  /**
   * The MusicXML part id being practised, for a score with more than one part.
   * `undefined` for single-part scores and for anything imported before part
   * selection existed — both mean "the whole score".
   *
   * The part **id**, never its position: positions shift between exports of the same
   * score, ids do not. Nothing is stripped from the stored XML; this is a filter, so
   * the choice stays changeable and accompaniment stays possible later.
   */
  partId?: string;
  /**
   * The score's `<part-list>`, read once at import — the same
   * compute-at-import-so-nothing-re-parses-the-score contract `sections` has, and it
   * earns its place for the same reason: the edit modal has to offer the part picker
   * with real labels, and re-reading a 5 MB file to draw a dropdown would be absurd.
   *
   * Length drives the question: more than one part and the user must choose, because
   * the app cannot know which line they practise. Absent on anything imported before
   * part selection existed, which is treated as "nothing to choose".
   */
  parts?: ScorePart[];
  /**
   * Whether the instrument is settled rather than assumed.
   *
   * Detection returns null when the notation says nothing, and a confident wrong guess
   * is worse here than a question — so an unsettled piece is *incomplete* and the
   * "Input needed" modal asks, exactly as it does for a missing composer. Legacy rows
   * normalise to true: they were piano pieces and always were.
   */
  instrumentConfirmed?: boolean;
  /**
   * Semitones added to the engraved score so it is readable on `instrument` — why the
   * notes moved, not a preference. Derived at import from the instrument and the
   * file's `<transpose>` element (`defaultBaseTranspose`) and never edited directly;
   * the user's own shifts go to `transposePracticeSemitones`.
   *
   * Defaults to 0, which is also what every piano piece has.
   */
  transposeBaseSemitones?: number;
  /**
   * Semitones the user added on top, to drill the piece in another key. Editable, and
   * what the modal's Reset control returns to 0 — leaving the base in place, so reset
   * on a clarinet piece means "back to how I read this", not "back to concert pitch".
   */
  transposePracticeSemitones?: number;
  /** Basename of the XML file in app-private storage — absolute path is a storage concern. */
  xmlFilename: string;
  importedAt: string; // ISO 8601
  lastOpenedAt?: string; // ISO 8601; undefined for pieces never opened after this field was added
  /**
   * Score tempo (quarter-note BPM) read from the MusicXML at import. Shown to
   * the user as the file's original speed. Undefined for pieces imported before
   * this field existed.
   */
  importedBpm?: number;
  /**
   * User-chosen target speed (quarter-note BPM) that overrides `importedBpm` as
   * the 100% reference for the PlayView speed selector. Undefined → use
   * `importedBpm`. See `domain/tempo.ts` for the valid range.
   */
  targetBpm?: number;
  /**
   * The piece's sections in score order, seeded by detection at import and editable
   * by the user thereafter. A tiling: no gaps, no overlaps, every measure in exactly
   * one section, so a section is described by where it starts and nothing else.
   *
   * Optional only for a piece in flight during import. Anything that has been through
   * `PieceRepository` has run `normaliseSections` and carries at least one section —
   * a piece whose form we cannot read gets one section spanning the whole score, not
   * zero. What used to be the "no sections" case is now the single-section case, and
   * the PlayView keys off `length > 1` to decide whether to show a label at all.
   *
   * See `domain/sections.ts`, `domain/sectionEditing.ts` and
   * `specs/features/section-detection.md`.
   */
  sections?: Section[];
  /**
   * Loop regions the user saved on this piece, in no particular order — bits are
   * nameless and unordered, and the marker strip derives its own layout from their
   * spans (`domain/bits.ts`).
   *
   * Optional for the same reason `sections` is: a piece in flight during import has
   * none yet. Anything that has been through `PieceRepository` has run `normaliseBits`
   * and carries an array, empty or not.
   */
  bits?: Bit[];
}

/**
 * A piece is "complete" once it has the metadata the app requires before it can
 * be practised: a title, a composer, and a playback speed — either read from the
 * file (`importedBpm`) or set by the user (`targetBpm`). Imports missing any of
 * these prompt the user to supply them before the piece is usable.
 */
export function isPieceComplete(piece: Piece): boolean {
  const hasTitle = piece.title.trim() !== '';
  const hasComposer = (piece.composer ?? '').trim() !== '';
  const hasSpeed = piece.importedBpm != null || piece.targetBpm != null;
  return hasTitle && hasComposer && hasSpeed && hasInstrument(piece) && hasPart(piece);
}

/** The instrument is settled — detected confidently, or chosen by the user. */
export function hasInstrument(piece: Piece): boolean {
  return piece.instrumentConfirmed !== false;
}

/**
 * A part is chosen, or there was never anything to choose.
 *
 * Single-part scores and anything imported before part selection existed both mean
 * "the whole score", so only a genuinely multi-part piece can be missing an answer.
 */
export function hasPart(piece: Piece): boolean {
  const parts = piece.parts ?? [];
  return parts.length <= 1 || (piece.partId ?? '') !== '';
}

/**
 * Semitones the engraved score is shifted by: why the notes moved, plus whatever the
 * user added on top.
 *
 * Both fields are optional on disk and default to 0, so this is also the one place
 * that knows a piece with neither is simply untransposed. The UI shows this sum in a
 * single stepper; the two components stay separate underneath so Reset can clear the
 * user's experiment without also discarding the reading transposition — which on a
 * clarinet piece is the difference between "back to how I read this" and "back to
 * concert pitch". See `specs/features/instruments.md` § Transposition.
 */
export function engravedTranspose(piece: Piece): number {
  return (piece.transposeBaseSemitones ?? 0) + (piece.transposePracticeSemitones ?? 0);
}

/** Whether Reset would change anything — i.e. the user has shifted this piece at all. */
export function hasPracticeTranspose(piece: Piece): boolean {
  return (piece.transposePracticeSemitones ?? 0) !== 0;
}

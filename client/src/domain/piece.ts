import type { Bit } from './bits';
import type { TempoMultiplier } from './practiceSettings';
import type { Section } from './sections';

export interface Piece {
  id: string;
  title: string;
  composer: string | null;
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
   * The speed the piece was last practised at, so reopening it resumes where the
   * practice left off instead of snapping back to full speed. Undefined for pieces
   * imported before the field existed, which read as ×1.0.
   *
   * Only the piece's own speed: a bit carries its own, and leaving a bit restores this
   * one. The active hand is deliberately *not* stored — it returns to both hands on
   * every open, because a piece left in one hand gives no clue on screen why the other
   * has gone silent.
   */
  tempoMultiplier?: TempoMultiplier;
  /**
   * Whether the metronome clicks for this piece, restored on open like
   * `tempoMultiplier`. Undefined for pieces imported before the field existed, which
   * read as off.
   */
  metronome?: boolean;
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
  return hasTitle && hasComposer && hasSpeed;
}

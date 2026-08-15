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
   * Formal sections detected from the notation at import time, in score order.
   *
   * Three states, all meaningful:
   * - `undefined` — never analysed (imported before detection existed). No label.
   * - `[]` — analysed, no readable form. No label; a piece we cannot parse into
   *   sections has none, rather than one section spanning the whole score.
   * - non-empty — always at least two sections.
   *
   * See `domain/sections.ts` and `specs/features/section-detection.md`.
   */
  sections?: Section[];
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

/** Loop region in musical time. Unit is determined by the score renderer (Phase 3). */
export interface Bit {
  pieceId: string;
  start: number;
  end: number;
}

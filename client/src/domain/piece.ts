export interface Piece {
  id: string;
  title: string;
  composer: string | null;
  /** Basename of the XML file in app-private storage — absolute path is a storage concern. */
  xmlFilename: string;
  importedAt: string; // ISO 8601
}

/** Loop region in musical time. Unit is determined by the score renderer (Phase 3). */
export interface Bit {
  pieceId: string;
  start: number;
  end: number;
}

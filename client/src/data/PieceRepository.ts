import type { Piece } from '@domain/piece';

/**
 * Storage contract for pieces. The mobile implementation uses expo-sqlite +
 * expo-file-system. A future web implementation would use IndexedDB / OPFS
 * behind the same interface — only src/data/index.ts needs to change.
 */
export interface PieceRepository {
  /** Pieces come back with normalised sections: at least one, fully tiling, valid colors. */
  list(): Promise<Piece[]>;
  /** As `list`, for one piece. */
  get(id: string): Promise<Piece | null>;
  /** Persists piece metadata and its XML content to device storage. */
  save(piece: Piece, xmlContent: string): Promise<void>;
  /**
   * Updates editable metadata (title, composer, target speed, sections) — never
   * touches the XML file. A piece whose `sections` is undefined leaves the stored
   * sections alone rather than clearing them.
   */
  update(piece: Piece): Promise<void>;
  /** Records the current timestamp as lastOpenedAt for the given piece. */
  touch(id: string, at: string): Promise<void>;
  delete(id: string): Promise<void>;
  /** Returns the XML content for a piece previously saved via save(). */
  readXml(piece: Piece): Promise<string>;
}

import type { Piece } from '@domain/piece';

/**
 * Storage contract for pieces. The mobile implementation uses expo-sqlite +
 * expo-file-system. A future web implementation would use IndexedDB / OPFS
 * behind the same interface — only src/data/index.ts needs to change.
 */
export interface PieceRepository {
  list(): Promise<Piece[]>;
  get(id: string): Promise<Piece | null>;
  /** Persists piece metadata and its XML content to device storage. */
  save(piece: Piece, xmlContent: string): Promise<void>;
  delete(id: string): Promise<void>;
  /** Returns the XML content for a piece previously saved via save(). */
  readXml(piece: Piece): Promise<string>;
}

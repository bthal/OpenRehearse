/**
 * Single seam for the storage implementation.
 * To target web: swap ExpoLocalPieceRepository for a WebLocalPieceRepository here.
 * No screen or domain code needs to change.
 */
import { ExpoLocalPieceRepository } from './ExpoLocalPieceRepository';

export type { PieceRepository } from './PieceRepository';
export type { PickedFile } from './filePicker';
export { pickXmlFile } from './filePicker';

export const pieceRepository = new ExpoLocalPieceRepository();

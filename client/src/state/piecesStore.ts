import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import type { Piece } from '@domain/piece';
import { scrapeMusicXmlMetadata, validateMusicXml } from '@domain/musicxml';
import type { PickedFile } from '@data/index';
import { pieceRepository } from '@data/index';

function errorMessage(code: ReturnType<typeof validateMusicXml>): string {
  switch (code) {
    case 'NOT_XML':
      return "This file isn't valid XML. Only uncompressed MusicXML (.xml) files are supported.";
    case 'NOT_MUSICXML':
      return "This XML file doesn't appear to be MusicXML. Make sure you're importing a MusicXML score file.";
    case 'UNSUPPORTED_VERSION':
      return 'Only MusicXML versions 2.x, 3.x, and 4.x are supported.';
    case 'FILE_TOO_LARGE':
      return 'This file is too large to import. Maximum supported size is 5 MB.';
    default:
      return 'Import failed. Please try again.';
  }
}

interface PiecesState {
  piecesById: Record<string, Piece>;
  pieceIds: string[]; // sorted importedAt descending
  isLoading: boolean;
  importError: string | null;

  loadPieces: () => Promise<void>;
  importPiece: (file: PickedFile, fallbackTitle: string) => Promise<string | null>;
  updatePiece: (id: string, updates: { title: string; composer: string | null }) => Promise<void>;
  deletePiece: (id: string) => Promise<void>;
  clearImportError: () => void;
}

export const usePiecesStore = create<PiecesState>()((set, get) => ({
  piecesById: {},
  pieceIds: [],
  isLoading: false,
  importError: null,

  loadPieces: async () => {
    set({ isLoading: true });
    try {
      const pieces = await pieceRepository.list();
      const piecesById: Record<string, Piece> = {};
      for (const p of pieces) piecesById[p.id] = p;
      set({ piecesById, pieceIds: pieces.map((p) => p.id), isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  importPiece: async (file, fallbackTitle) => {
    set({ isLoading: true, importError: null });

    const validationError = validateMusicXml(file.content);
    if (validationError !== null) {
      set({ isLoading: false, importError: errorMessage(validationError) });
      return null;
    }

    const metadata = scrapeMusicXmlMetadata(file.content);
    const title = metadata.title || fallbackTitle;
    const id = Crypto.randomUUID();
    const piece: Piece = {
      id,
      title,
      composer: metadata.composer,
      xmlFilename: id + '.xml',
      importedAt: new Date().toISOString(),
    };

    try {
      await pieceRepository.save(piece, file.content);
    } catch {
      set({ isLoading: false, importError: 'Failed to save piece. Please try again.' });
      return null;
    }

    const { piecesById, pieceIds } = get();
    set({
      piecesById: { ...piecesById, [id]: piece },
      pieceIds: [id, ...pieceIds],
      isLoading: false,
    });
    return id;
  },

  updatePiece: async (id, updates) => {
    const { piecesById } = get();
    const existing = piecesById[id];
    if (!existing) return;
    const updated: Piece = { ...existing, ...updates };
    await pieceRepository.update(updated);
    set({ piecesById: { ...piecesById, [id]: updated } });
  },

  deletePiece: async (id) => {
    await pieceRepository.delete(id);
    const { piecesById, pieceIds } = get();
    const next = { ...piecesById };
    delete next[id];
    set({ piecesById: next, pieceIds: pieceIds.filter((i) => i !== id) });
  },

  clearImportError: () => set({ importError: null }),
}));

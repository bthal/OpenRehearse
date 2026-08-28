import * as Crypto from 'expo-crypto';
import { create } from 'zustand';

import type { Bit } from '@domain/bits';
import { guessImportInstrument, readingTransposeFor } from '@domain/instrumentDetect';
import { DEFAULT_INSTRUMENT, type InstrumentId } from '@domain/instrumentRegistry';
import type { Piece } from '@domain/piece';
import {
  scrapeMusicXmlMetadata,
  scrapeScoreParts,
  scrapeTempoBpm,
  validateMusicXml,
} from '@domain/musicxml';
import { sectionsFromXml } from '@domain/sectionEditing';
import type { Section } from '@domain/sections';
import { SectionColors } from '@theme/colors';
import type { PickedFile } from '@data/index';
import { pieceRepository } from '@data/index';

function errorMessage(code: ReturnType<typeof validateMusicXml>): string {
  switch (code) {
    case 'NOT_XML':
      return "This file isn't valid XML. Only MusicXML (.xml) or compressed MusicXML (.mxl) files are supported.";
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
  pieceIds: string[]; // sorted by lastOpenedAt ?? importedAt descending
  isLoading: boolean;
  importError: string | null;

  loadPieces: () => Promise<void>;
  importPiece: (file: PickedFile, fallbackTitle: string) => Promise<string | null>;
  updatePiece: (
    id: string,
    updates: {
      title: string;
      composer: string | null;
      targetBpm?: number;
      /** Omit to leave the piece's sections untouched. */
      sections?: Section[];
      /**
       * The user's own transposition. The reading transposition is derived at import
       * and is deliberately not editable here — the modal shows their sum but only
       * ever writes this half, so Reset can clear an experiment without discarding
       * why the notes moved in the first place.
       */
      transposePracticeSemitones?: number;
      /**
       * Set together, and never independently: choosing a part can change which
       * instrument the score is for, and both change the reading transposition, so
       * the caller recomputes all three at once.
       */
      instrument?: InstrumentId;
      instrumentConfirmed?: boolean;
      partId?: string;
      transposeBaseSemitones?: number;
    },
  ) => Promise<void>;
  /**
   * Replaces a piece's bits. Separate from `updatePiece` because the PlayView writes
   * bits on its own — creating one, deleting one, or changing one's practice settings —
   * and has no business restating the title and composer to do it.
   */
  /**
   * Settles the instrument and the practised part together, and re-derives the reading
   * transposition from the score.
   *
   * Separate from `updatePiece` because it is the one edit that has to go back to the
   * XML: the reading transposition depends on the chosen part's `<transpose>`, and the
   * modal has no business reading a 5 MB file to work that out. The user's practice
   * offset is deliberately left alone — changing which part you practise does not undo
   * a key you chose to drill in.
   */
  setInstrumentAndPart: (
    id: string,
    instrument: InstrumentId,
    partId: string | undefined,
  ) => Promise<void>;
  setBits: (id: string, bits: Bit[]) => Promise<void>;
  touchPiece: (id: string) => Promise<void>;
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
    const importedBpm = scrapeTempoBpm(file.content);
    const parts = scrapeScoreParts(file.content);
    const guess = guessImportInstrument(file.content, parts);
    const piece: Piece = {
      id,
      title,
      composer: metadata.composer,
      xmlFilename: id + '.xml',
      // Detection pre-selects; it does not decide. The modal asks whenever the
      // selection leaves more than one legal instrument — which is every single-line
      // score, however confident detection was, and no two-staff one. An unsettled
      // piece is stored as piano so the field is never absent, but instrumentConfirmed
      // keeps it incomplete until someone decides.
      instrument: guess.instrument ?? DEFAULT_INSTRUMENT,
      instrumentConfirmed: !guess.mustAskInstrument,
      ...(parts.length > 0 ? { parts } : {}),
      // Why the notes would move: read from the part the user will practise, once
      // that is known. Recomputed on the modal's save if they pick differently.
      transposeBaseSemitones: readingTransposeFor(
        file.content,
        guess.instrument ?? DEFAULT_INSTRUMENT,
        guess.partId,
      ),
      importedAt: new Date().toISOString(),
      // Only set when the file actually declares a tempo — a tempo-less score
      // keeps importedBpm undefined and plays at OSMD's own default.
      ...(importedBpm != null ? { importedBpm } : {}),
      // Normalised here rather than on read, because this object goes straight into
      // the store and to save() without passing through rowToPiece. A score with no
      // readable form gets one whole-piece section, not none — the PlayView simply
      // does not label a piece that has a single section.
      sections: sectionsFromXml(file.content, SectionColors),
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
    // Spreading `updates` would clobber sections to undefined whenever the key is
    // present but unset, which is the common case: most edits do not touch sections.
    const updated: Piece = { ...existing, ...updates };
    if (updates.sections === undefined) updated.sections = existing.sections;
    // Bits are never part of a metadata edit — they are written through `setBits` — so
    // carry them across rather than letting `update()` see undefined and skip the column.
    updated.bits = existing.bits;
    await pieceRepository.update(updated);
    set({ piecesById: { ...piecesById, [id]: updated } });
  },

  setInstrumentAndPart: async (id, instrument, partId) => {
    const { piecesById } = get();
    const existing = piecesById[id];
    if (!existing) return;
    let transposeBaseSemitones = existing.transposeBaseSemitones ?? 0;
    try {
      const xml = await pieceRepository.readXml(existing);
      transposeBaseSemitones = readingTransposeFor(xml, instrument, partId);
    } catch {
      // An unreadable score should not block the choice: keep the existing reading
      // transposition rather than silently resetting it to 0.
    }
    const updated: Piece = {
      ...existing,
      instrument,
      instrumentConfirmed: true,
      ...(partId ? { partId } : {}),
      transposeBaseSemitones,
    };
    await pieceRepository.update(updated);
    set({ piecesById: { ...piecesById, [id]: updated } });
  },

  setBits: async (id, bits) => {
    const { piecesById } = get();
    const existing = piecesById[id];
    if (!existing) return;
    const updated: Piece = { ...existing, bits };
    await pieceRepository.update(updated);
    set({ piecesById: { ...piecesById, [id]: updated } });
  },

  touchPiece: async (id) => {
    const { piecesById, pieceIds } = get();
    const existing = piecesById[id];
    if (!existing) return;
    const at = new Date().toISOString();
    await pieceRepository.touch(id, at);
    const updated: Piece = { ...existing, lastOpenedAt: at };
    const nextById = { ...piecesById, [id]: updated };
    const nextIds = [...pieceIds].sort((a, b) => {
      const pa = nextById[a];
      const pb = nextById[b];
      const ta = pa?.lastOpenedAt ?? pa?.importedAt ?? '';
      const tb = pb?.lastOpenedAt ?? pb?.importedAt ?? '';
      return tb.localeCompare(ta);
    });
    set({ piecesById: nextById, pieceIds: nextIds });
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

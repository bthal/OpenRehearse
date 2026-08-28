import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';

import { normaliseBits, type Bit } from '@domain/bits';
import { normaliseInstrumentId } from '@domain/instrumentRegistry';
import type { ScorePart } from '@domain/musicxml';
import type { Piece } from '@domain/piece';
import { normaliseSections } from '@domain/sectionEditing';
import type { Section } from '@domain/sections';
// The one place storage reaches for the theme: section colors became part of the
// persisted record when sections became editable, so filling a missing one on read
// needs the palette that used to be applied at render time.
import { SectionColors } from '@theme/colors';
import { getAppDatabase } from './db';
import type { PieceRepository } from './PieceRepository';

const XML_DIR = (FileSystem.documentDirectory ?? '') + 'pieces/';

interface PieceRow {
  id: string;
  title: string;
  composer: string | null;
  xml_filename: string;
  imported_at: string;
  last_opened_at: string | null;
  imported_bpm: number | null;
  target_bpm: number | null;
  /** JSON-encoded Section[]; NULL for pieces imported before detection existed. */
  sections: string | null;
  /** JSON-encoded Bit[]; NULL until the piece's first bit is saved. */
  bits: string | null;
  /** InstrumentId; NULL for pieces imported before instruments existed (= piano). */
  instrument: string | null;
  /** MusicXML part id being practised; NULL means the whole score. */
  part_id: string | null;
  /** Semitones making the score readable on the instrument; NULL = 0. */
  transpose_base: number | null;
  /** Semitones the user added on top; NULL = 0. */
  transpose_practice: number | null;
  /** JSON-encoded ScorePart[]; NULL for pieces imported before part selection. */
  parts: string | null;
  /** 0/1; NULL for legacy rows, which were piano pieces and always were. */
  instrument_confirmed: number | null;
}

export class ExpoLocalPieceRepository implements PieceRepository {
  private db: SQLite.SQLiteDatabase | null = null;

  /** Opens DB and runs migrations on first call; cached thereafter. */
  private async getDb(): Promise<SQLite.SQLiteDatabase> {
    if (this.db) return this.db;
    const db = await getAppDatabase();
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pieces (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        composer TEXT,
        xml_filename TEXT NOT NULL,
        imported_at TEXT NOT NULL
      );
      -- Forward migration: the user-authored fingering feature was removed; drop its
      -- table so existing installs don't carry the orphaned data.
      DROP TABLE IF EXISTS piece_fingerings;
    `);
    // Migrations: additive columns for existing installs. Each ALTER throws if
    // the column already exists — safe to ignore per column.
    for (const sql of [
      'ALTER TABLE pieces ADD COLUMN last_opened_at TEXT',
      'ALTER TABLE pieces ADD COLUMN imported_bpm INTEGER',
      'ALTER TABLE pieces ADD COLUMN target_bpm INTEGER',
      'ALTER TABLE pieces ADD COLUMN sections TEXT',
      'ALTER TABLE pieces ADD COLUMN bits TEXT',
      'ALTER TABLE pieces ADD COLUMN instrument TEXT',
      'ALTER TABLE pieces ADD COLUMN part_id TEXT',
      'ALTER TABLE pieces ADD COLUMN transpose_base INTEGER',
      'ALTER TABLE pieces ADD COLUMN transpose_practice INTEGER',
      'ALTER TABLE pieces ADD COLUMN parts TEXT',
      'ALTER TABLE pieces ADD COLUMN instrument_confirmed INTEGER',
    ]) {
      try {
        await db.execAsync(sql);
      } catch {
        // column already exists — safe to ignore
      }
    }
    this.db = db;
    return db;
  }

  private xmlPath(xmlFilename: string): string {
    return XML_DIR + xmlFilename;
  }

  private static readonly SELECT_COLUMNS =
    'id, title, composer, xml_filename, imported_at, last_opened_at, imported_bpm, target_bpm, sections, bits, instrument, part_id, transpose_base, transpose_practice, parts, instrument_confirmed';

  /**
   * A corrupt sections blob degrades the piece to "never analysed" rather than
   * breaking the pieces list — the label is a nicety, the library is not.
   */
  private static parseSections(raw: string | null): Section[] | undefined {
    if (raw == null) return undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Section[]) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * A corrupt bits blob costs the user their saved loops, not their piece — the same
   * trade `parseSections` makes, and for the same reason.
   */
  private static parseBits(raw: string | null): Bit[] {
    if (raw == null) return [];
    try {
      return normaliseBits(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  private static parseParts(raw: string | null): ScorePart[] | undefined {
    if (raw == null) return undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ScorePart[]) : undefined;
    } catch {
      return undefined;
    }
  }

  private static rowToPiece(r: PieceRow): Piece {
    // Normalising on read is what lets every consumer past this point assume a
    // well-formed tiling with valid colors, with no migration and no re-parsing of
    // the score at startup. A null column — a piece imported before sections existed,
    // one whose form we could not read, or a corrupt blob — becomes a single
    // whole-piece section here, and the column stays null until the user saves.
    const sections = normaliseSections(
      ExpoLocalPieceRepository.parseSections(r.sections),
      SectionColors,
    );
    return {
      id: r.id,
      title: r.title,
      composer: r.composer,
      xmlFilename: r.xml_filename,
      importedAt: r.imported_at,
      ...(r.last_opened_at ? { lastOpenedAt: r.last_opened_at } : {}),
      ...(r.imported_bpm != null ? { importedBpm: r.imported_bpm } : {}),
      ...(r.target_bpm != null ? { targetBpm: r.target_bpm } : {}),
      sections,
      // Normalised on read like sections, so nothing downstream has to defend against a
      // half-written bit. A null column stays null until the user saves their first bit.
      bits: ExpoLocalPieceRepository.parseBits(r.bits),
      // Normalised on read like sections and bits: a NULL column (imported before
      // instruments existed) and a rotted one both become piano, so nothing past this
      // point has to ask whether a piece has an instrument.
      instrument: normaliseInstrumentId(r.instrument),
      // A corrupt parts blob costs the part picker its labels, not the piece — the
      // same trade parseSections makes.
      ...(ExpoLocalPieceRepository.parseParts(r.parts)
        ? { parts: ExpoLocalPieceRepository.parseParts(r.parts) as ScorePart[] }
        : {}),
      // NULL means a legacy row: those were piano pieces and never needed asking.
      instrumentConfirmed: r.instrument_confirmed == null ? true : r.instrument_confirmed === 1,
      ...(r.part_id ? { partId: r.part_id } : {}),
      ...(r.transpose_base != null ? { transposeBaseSemitones: r.transpose_base } : {}),
      ...(r.transpose_practice != null ? { transposePracticeSemitones: r.transpose_practice } : {}),
    };
  }

  async list(): Promise<Piece[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<PieceRow>(
      `SELECT ${ExpoLocalPieceRepository.SELECT_COLUMNS} FROM pieces ORDER BY COALESCE(last_opened_at, imported_at) DESC`,
    );
    return rows.map(ExpoLocalPieceRepository.rowToPiece);
  }

  async get(id: string): Promise<Piece | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<PieceRow>(
      `SELECT ${ExpoLocalPieceRepository.SELECT_COLUMNS} FROM pieces WHERE id = ?`,
      id,
    );
    return row ? ExpoLocalPieceRepository.rowToPiece(row) : null;
  }

  async touch(id: string, at: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync('UPDATE pieces SET last_opened_at = ? WHERE id = ?', at, id);
  }

  async save(piece: Piece, xmlContent: string): Promise<void> {
    // Ensure pieces directory exists
    await FileSystem.makeDirectoryAsync(XML_DIR, { intermediates: true });

    const path = this.xmlPath(piece.xmlFilename);
    await FileSystem.writeAsStringAsync(path, xmlContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    try {
      const db = await this.getDb();
      await db.runAsync(
        'INSERT INTO pieces (id, title, composer, xml_filename, imported_at, imported_bpm, target_bpm, sections, bits, instrument, part_id, transpose_base, transpose_practice, parts, instrument_confirmed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        piece.id,
        piece.title,
        piece.composer ?? null,
        piece.xmlFilename,
        piece.importedAt,
        piece.importedBpm ?? null,
        piece.targetBpm ?? null,
        piece.sections ? JSON.stringify(piece.sections) : null,
        piece.bits && piece.bits.length > 0 ? JSON.stringify(piece.bits) : null,
        piece.instrument,
        piece.partId ?? null,
        piece.transposeBaseSemitones ?? null,
        piece.transposePracticeSemitones ?? null,
        piece.parts ? JSON.stringify(piece.parts) : null,
        piece.instrumentConfirmed === false ? 0 : 1,
      );
    } catch (err) {
      // Roll back the file write to avoid orphaned XML files
      await FileSystem.deleteAsync(path, { idempotent: true });
      throw err;
    }
  }

  async update(piece: Piece): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      // COALESCE so update() can add or replace sections but never erase them: a caller
      // holding a Piece that never went through rowToPiece has `sections` undefined,
      // and that must leave the stored blob alone rather than wiping the user's edits.
      // Same COALESCE guard for bits, with one difference that matters: an *empty*
      // array is still written, as '[]'. Deleting a piece's last bit has to be able to
      // clear the column, so only `undefined` means "leave it alone".
      // Instrument, part and both transpositions take the same COALESCE guard for the
      // same reason: a caller holding a Piece that never went through rowToPiece has
      // them undefined, and that has to leave the stored values alone rather than
      // resetting the user's clarinet piece to piano at concert pitch.
      'UPDATE pieces SET title = ?, composer = ?, target_bpm = ?, sections = COALESCE(?, sections), bits = COALESCE(?, bits), instrument = COALESCE(?, instrument), part_id = COALESCE(?, part_id), transpose_base = COALESCE(?, transpose_base), transpose_practice = COALESCE(?, transpose_practice), parts = COALESCE(?, parts), instrument_confirmed = COALESCE(?, instrument_confirmed) WHERE id = ?',
      piece.title,
      piece.composer ?? null,
      piece.targetBpm ?? null,
      piece.sections ? JSON.stringify(piece.sections) : null,
      piece.bits ? JSON.stringify(piece.bits) : null,
      piece.instrument ?? null,
      piece.partId ?? null,
      piece.transposeBaseSemitones ?? null,
      piece.transposePracticeSemitones ?? null,
      piece.parts ? JSON.stringify(piece.parts) : null,
      piece.instrumentConfirmed == null ? null : piece.instrumentConfirmed ? 1 : 0,
      piece.id,
    );
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    const piece = await this.get(id);
    await db.runAsync('DELETE FROM pieces WHERE id = ?', id);
    if (piece) {
      await FileSystem.deleteAsync(this.xmlPath(piece.xmlFilename), { idempotent: true });
    }
  }

  async readXml(piece: Piece): Promise<string> {
    return FileSystem.readAsStringAsync(this.xmlPath(piece.xmlFilename), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }
}

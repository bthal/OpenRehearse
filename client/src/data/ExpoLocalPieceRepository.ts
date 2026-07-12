import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';

import type { Piece } from '@domain/piece';
import type { PieceRepository } from './PieceRepository';

const DB_NAME = 'openrehearse.db';
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
}

export class ExpoLocalPieceRepository implements PieceRepository {
  private db: SQLite.SQLiteDatabase | null = null;

  /** Opens DB and runs migrations on first call; cached thereafter. */
  private async getDb(): Promise<SQLite.SQLiteDatabase> {
    if (this.db) return this.db;
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pieces (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        composer TEXT,
        xml_filename TEXT NOT NULL,
        imported_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS piece_fingerings (
        piece_id TEXT PRIMARY KEY,
        map_json TEXT NOT NULL
      );
    `);
    // Migrations: additive columns for existing installs. Each ALTER throws if
    // the column already exists — safe to ignore per column.
    for (const sql of [
      'ALTER TABLE pieces ADD COLUMN last_opened_at TEXT',
      'ALTER TABLE pieces ADD COLUMN imported_bpm INTEGER',
      'ALTER TABLE pieces ADD COLUMN target_bpm INTEGER',
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
    'id, title, composer, xml_filename, imported_at, last_opened_at, imported_bpm, target_bpm';

  private static rowToPiece(r: PieceRow): Piece {
    return {
      id: r.id,
      title: r.title,
      composer: r.composer,
      xmlFilename: r.xml_filename,
      importedAt: r.imported_at,
      ...(r.last_opened_at ? { lastOpenedAt: r.last_opened_at } : {}),
      ...(r.imported_bpm != null ? { importedBpm: r.imported_bpm } : {}),
      ...(r.target_bpm != null ? { targetBpm: r.target_bpm } : {}),
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
        'INSERT INTO pieces (id, title, composer, xml_filename, imported_at, imported_bpm, target_bpm) VALUES (?, ?, ?, ?, ?, ?, ?)',
        piece.id,
        piece.title,
        piece.composer ?? null,
        piece.xmlFilename,
        piece.importedAt,
        piece.importedBpm ?? null,
        piece.targetBpm ?? null,
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
      'UPDATE pieces SET title = ?, composer = ?, target_bpm = ? WHERE id = ?',
      piece.title,
      piece.composer ?? null,
      piece.targetBpm ?? null,
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

  async readFingering(pieceId: string): Promise<Record<string, number>> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{ map_json: string }>(
      'SELECT map_json FROM piece_fingerings WHERE piece_id = ?',
      pieceId,
    );
    return row ? (JSON.parse(row.map_json) as Record<string, number>) : {};
  }

  async saveFingering(pieceId: string, map: Record<string, number>): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO piece_fingerings (piece_id, map_json) VALUES (?, ?)',
      pieceId,
      JSON.stringify(map),
    );
  }
}

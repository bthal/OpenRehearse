import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';

import type { Piece } from '@domain/piece';
import type { PieceRepository } from './PieceRepository';

const DB_NAME = 'unger.db';
const XML_DIR = (FileSystem.documentDirectory ?? '') + 'pieces/';

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
    `);
    this.db = db;
    return db;
  }

  private xmlPath(xmlFilename: string): string {
    return XML_DIR + xmlFilename;
  }

  async list(): Promise<Piece[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<{
      id: string;
      title: string;
      composer: string | null;
      xml_filename: string;
      imported_at: string;
    }>(
      'SELECT id, title, composer, xml_filename, imported_at FROM pieces ORDER BY imported_at DESC',
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      composer: r.composer,
      xmlFilename: r.xml_filename,
      importedAt: r.imported_at,
    }));
  }

  async get(id: string): Promise<Piece | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<{
      id: string;
      title: string;
      composer: string | null;
      xml_filename: string;
      imported_at: string;
    }>('SELECT id, title, composer, xml_filename, imported_at FROM pieces WHERE id = ?', id);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      composer: row.composer,
      xmlFilename: row.xml_filename,
      importedAt: row.imported_at,
    };
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
        'INSERT INTO pieces (id, title, composer, xml_filename, imported_at) VALUES (?, ?, ?, ?, ?)',
        piece.id,
        piece.title,
        piece.composer ?? null,
        piece.xmlFilename,
        piece.importedAt,
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
      'UPDATE pieces SET title = ?, composer = ? WHERE id = ?',
      piece.title,
      piece.composer ?? null,
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

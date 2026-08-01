import * as SQLite from 'expo-sqlite';

/**
 * Name of the single on-device SQLite database. Every repository that needs
 * relational storage opens this same file (pieces, practice history, …) so the
 * app keeps one database to reason about — and to wipe on uninstall.
 */
export const DB_NAME = 'openrehearse.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * The one open handle on {@link DB_NAME}, shared by every repository.
 *
 * Separate connections on the same file compete for the write lock, so an
 * overlapping write (say the periodic practice flush landing while a piece is
 * imported) fails with `SQLITE_BUSY`. On a single connection those statements
 * queue instead. WAL keeps a reader from blocking behind a writer, and the busy
 * timeout absorbs the remaining contention rather than erroring out.
 *
 * Each repository still owns its own schema: call this, then create/migrate the
 * tables that repository needs.
 */
export function getAppDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
      return db;
    })().catch((err: unknown) => {
      dbPromise = null; // let a later call retry instead of caching the failure
      throw err;
    });
  }
  return dbPromise;
}

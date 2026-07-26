import * as SQLite from 'expo-sqlite';

import type { PracticeDelta } from '@domain/practiceTime';
import { DB_NAME } from './db';

/**
 * Durable practice history: one row per local calendar day holding the total
 * seconds of active playback. Day granularity is all the dashboard heatmap
 * needs, and it keeps the table tiny (≤365 rows/year) with no session churn.
 *
 * Local-only, like every other store in the app — nothing here is uploaded.
 */
interface PracticeDayRow {
  day: string;
  seconds: number;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Opens the shared DB and creates the practice table on first use. */
function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS practice_daily (
          day TEXT PRIMARY KEY,
          seconds INTEGER NOT NULL DEFAULT 0
        );
      `);
      return db;
    })().catch((err: unknown) => {
      dbPromise = null; // let a later call retry instead of caching the failure
      throw err;
    });
  }
  return dbPromise;
}

/**
 * Adds elapsed practice seconds to their days, creating rows as needed.
 * Additive on purpose: several flushes land on the same day as a session runs.
 */
export async function addPracticeSeconds(deltas: readonly PracticeDelta[]): Promise<void> {
  if (deltas.length === 0) return;
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const { day, seconds } of deltas) {
      if (seconds <= 0) continue;
      await db.runAsync(
        `INSERT INTO practice_daily (day, seconds) VALUES (?, ?)
         ON CONFLICT(day) DO UPDATE SET seconds = seconds + excluded.seconds`,
        day,
        Math.round(seconds),
      );
    }
  });
}

/**
 * Daily totals as a `YYYY-MM-DD` → seconds map.
 * `sinceDay` (inclusive, same key format) limits the range the heatmap needs.
 */
export async function loadPracticeDailySeconds(sinceDay?: string): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = sinceDay
    ? await db.getAllAsync<PracticeDayRow>(
        'SELECT day, seconds FROM practice_daily WHERE day >= ? ORDER BY day',
        sinceDay,
      )
    : await db.getAllAsync<PracticeDayRow>('SELECT day, seconds FROM practice_daily ORDER BY day');

  const totals: Record<string, number> = {};
  for (const row of rows) totals[row.day] = row.seconds;
  return totals;
}

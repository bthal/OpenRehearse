import * as SQLite from 'expo-sqlite';

import type { PracticeDelta } from '@domain/practiceTime';
import { getAppDatabase } from './db';

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

/** Takes the shared DB handle and creates the practice table on first use. */
function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await getAppDatabase();
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
 *
 * All the days in one call go into a single multi-row upsert, which SQLite runs
 * in its own implicit transaction. An explicit `BEGIN` would be wrong here: the
 * handle is shared with the other repositories, so it would also capture — and
 * on failure roll back — whatever unrelated write happened to be in flight.
 */
export async function addPracticeSeconds(deltas: readonly PracticeDelta[]): Promise<void> {
  const byDay = new Map<string, number>();
  for (const { day, seconds } of deltas) {
    if (seconds <= 0) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + Math.round(seconds));
  }
  if (byDay.size === 0) return;

  const rows = [...byDay];
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO practice_daily (day, seconds) VALUES ${rows.map(() => '(?, ?)').join(', ')}
     ON CONFLICT(day) DO UPDATE SET seconds = seconds + excluded.seconds`,
    ...rows.flat(),
  );
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

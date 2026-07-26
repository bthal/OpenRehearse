/**
 * Name of the single on-device SQLite database. Every repository that needs
 * relational storage opens this same file (pieces, practice history, …) so the
 * app keeps one database to reason about — and to wipe on uninstall.
 */
export const DB_NAME = 'openrehearse.db';

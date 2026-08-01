# Feature: Offline & local storage

## Goal

**Strong offline behavior**: after import, the user can open the dashboard and PlayView **without network**.

## What is stored locally (MVP)

- **MusicXML** content or a **copy** of the user's file in app-private storage.
- **Piece metadata**: stable id, display title, composer, import timestamp, and other fields scraped from XML on import.
- **Practice history**: total seconds of active playback per local calendar day
  (`practice_daily` table), feeding the dashboard heatmap.

## What is not stored on server (MVP)

- **No** MusicXML or rendered assets uploaded to any backend.
- **No** cross-device sync of pieces.
- **No** auth or user accounts in MVP.

## Implementation hints

- Abstract behind `LocalPieceRepository` (save, list, get, delete) so future cloud sync can add a `RemotePieceRepository` without rewriting screens.
- Consider **SQLite** or **file-system JSON index** for metadata; binary XML as files on disk.
- One SQLite file for everything relational, opened through **one shared connection**
  (`src/data/db.ts` owns both the name and the handle) so overlapping writes queue instead of
  competing for the write lock; each repository creates its own tables with
  `CREATE TABLE IF NOT EXISTS` on first use.

## Acceptance criteria

- [ ] Airplane mode: dashboard lists local pieces; PlayView plays (subject to WebView cache behavior — ensure bundle assets offline).
- [ ] Uninstall = data loss is acceptable for MVP unless we add export later.

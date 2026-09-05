# Feature: Offline & local storage

## Goal

**Strong offline behavior**: after import, the user can open the dashboard and PlayView **without network**.

## What is stored locally (MVP)

- **MusicXML** content or a **copy** of the user's file in app-private storage.
- **Piece metadata**: stable id, display title, composer, import timestamp, and other fields scraped from XML on import.
- **Detected sections**: the piece's formal sections as JSON on the `pieces` row (`sections`
  column), computed once at import so PlayView never re-parses the score.
- **Practice history**: total seconds of active playback per local calendar day
  (`practice_daily` table), feeding the dashboard heatmap.

## What ships in the app

- **Instrument samples** for every supported instrument, bundled in the APK
  (`client/assets/samples/`). These used to be fetched from a CDN and cached by the WebView, which
  made offline playback true only by accident — a cache eviction or a first play in airplane mode
  meant silence. See `specs/features/instruments.md` § Audio.

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

- [ ] Airplane mode on a **fresh install**: dashboard lists local pieces and PlayView plays. No
      warm cache is required — nothing the app plays is fetched at runtime.
- [ ] Uninstall = data loss is acceptable for MVP unless we add export later.

# Feature: Offline & local storage

## Goal

**Strong offline behavior**: after import, the user can open the dashboard and PlayView **without network**.

## What is stored locally (MVP)

- **MusicXML** content or a **copy** of the user’s file in app-private storage.
- **Piece metadata**: stable id, display title, import timestamp, optional fields from XML (`work-title`, etc.).

## What is not stored on server (MVP)

- **No** MusicXML or rendered assets uploaded to Supabase or other backends.
- **No** cross-device sync of pieces.

## Auth interaction

- Supabase session may require network for **first login** or **refresh**; core practice features must **degrade gracefully**: local pieces still listed and playable when offline if files exist.

## Implementation hints

- Abstract behind `LocalPieceRepository` (save, list, get, delete) so future cloud sync can add a `RemotePieceRepository` without rewriting screens.
- Consider **SQLite** or **file-system JSON index** for metadata; binary XML as files on disk.

## Acceptance criteria

- [ ] Airplane mode: dashboard lists local pieces; PlayView plays (subject to WebView cache behavior — ensure bundle assets offline).
- [ ] Uninstall = data loss is acceptable for MVP unless we add export later.

# Feature: Import (MusicXML)

## Goal

Let users add **pieces** from **uncompressed MusicXML 2.x–4.x** files.

## Accepted format

- **Extension**: `.xml` (uncompressed).
- **Rejected** with explicit messaging: `.mxl`, `.musicxml`, `.mid`, PDF, images, compressed archives.
- **Version**: **MusicXML 2.x–4.x** — if parser cannot confirm a supported version, reject with a clear error.

## Flow

1. User picks file (Android document picker / SAF).
2. Read file as UTF-8 text (handle BOM); size limit TBD (document in code, e.g. max MB).
3. **Validate**: well-formed XML; root / DOCTYPE checks for MusicXML; version check.
4. **Scrape metadata**: extract `work-title`, `movement-title`, `composer` for display.
5. Persist **full XML** (or path to copied file) under app storage; save **metadata** record (id, title, composer, createdAt, localUri or internal path).
6. Navigate or toast success.

## Errors

- Not XML / parse error.
- Unsupported MusicXML version or format.
- File too large.
- OSMD load failure — surface as import failure or "preview failed" with option to delete record (implementation choice; prefer honest failure).

## Copyright / product note

- Import is **user-initiated**; app does not host a score catalog. On-device storage aligns with `overview.md` risk posture.

## Acceptance criteria

- [ ] Only `.xml` MusicXML 2.x–4.x is advertised in UI copy.
- [ ] Invalid inputs never corrupt the local piece index.
- [ ] Imported piece is available offline immediately after import.
- [ ] Title (and composer if present) are scraped and stored on import.

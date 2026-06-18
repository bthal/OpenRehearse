# Feature: Import (MusicXML)

## Goal

Let users add **pieces** from **MusicXML 2.x–4.x** files, both uncompressed (`.xml`) and compressed (`.mxl`).

## Accepted format

- **Extensions**: `.xml` (uncompressed) and `.mxl` (compressed MusicXML / ZIP).
- **Rejected** with explicit messaging: `.musicxml`, `.mid`, PDF, images, and other archives.
- **Version**: **MusicXML 2.x–4.x** — if parser cannot confirm a supported version, reject with a clear error.
- **MXL decompression**: `.mxl` archives are decompressed on-device before validation; the extracted XML goes through the same pipeline as `.xml` files.

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

- [ ] Both `.xml` and `.mxl` MusicXML 2.x–4.x files can be imported.
- [ ] Invalid inputs never corrupt the local piece index.
- [ ] Imported piece is available offline immediately after import.
- [ ] Title (and composer if present) are scraped and stored on import.

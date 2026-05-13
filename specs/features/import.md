# Feature: Import (MusicXML)

## Goal

Let users add **pieces** from **uncompressed MusicXML 3.x** files.

## Accepted format

- **Extension**: `.xml` (uncompressed).
- **Rejected** with explicit messaging: `.mxl`, `.musicxml`, `.mid`, PDF, images, compressed archives.
- **Version**: **MusicXML 3.x** only — if parser cannot confirm 3.x, reject or warn per implementation policy (prefer **strict reject** for MVP predictability).

## Flow

1. User picks file (Android document picker / SAF).
2. Read file as UTF-8 text (handle BOM); size limit TBD (document in code, e.g. max MB).
3. **Validate**: well-formed XML; root / DOCTYPE checks for MusicXML; optional schema or lightweight checks.
4. Persist **full XML** (or path to copied file) under app storage; save **metadata** record (id, title, createdAt, localUri or internal path).
5. Navigate or toast success.

## Errors

- Not XML / parse error.
- Wrong MusicXML version.
- File too large.
- OSMD load failure — surface as import failure or “preview failed” with option to delete record (implementation choice; prefer honest failure).

## Copyright / product note

- Import is **user-initiated**; app does not host a score catalog. On-device storage aligns with `overview.md` risk posture.

## Acceptance criteria

- [ ] Only uncompressed 3.x pipeline is advertised in UI copy.
- [ ] Invalid inputs never corrupt the local piece index.
- [ ] Imported piece is available offline immediately after import.

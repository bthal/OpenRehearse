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

## Post-MVP: PDF import via OMR

PDF import is explicitly out of scope for MVP. On-device OMR at production quality (Audiveris-level) requires a JVM + OpenCV + ML models and cannot be bundled into an Android APK at a reasonable size. The only viable path is a server-side conversion endpoint.

When this is re-opened, the intended flow is:

1. User picks a `.pdf` file via the same file picker.
2. App uploads the PDF to a conversion endpoint (Audiveris or equivalent).
3. Endpoint returns MXL; app stores it locally and discards the upload.
4. The resulting MXL enters the normal import pipeline (validate → scrape → persist).

**Edge cases that must be handled at that point:**
- PDF is not sheet music (text doc, images) — surface as "No sheet music detected".
- Handwritten score — warn user before upload; OMR accuracy will be low.
- Low-resolution scan (< ~200 DPI) — surface as "Scan quality too low".
- Password-protected PDF — surface as "File is password-protected".
- Very large PDF (50+ pages) — show progress and set a server-side timeout.
- OMR produces structurally valid but musically wrong MXL — cannot be detected automatically; user sees the rendered score.
- Multi-piece PDFs — import as a single score for MVP of this feature; splitting is a later concern.
- Mixed-content PDFs (preface pages + music) — document as known limitation.

The import UI extension point is already implicit in the file picker: widen the accepted MIME types / extensions, branch on `.pdf`, and route to the conversion service before entering the existing MXL pipeline.

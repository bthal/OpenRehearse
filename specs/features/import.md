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
4. **Scrape metadata**: extract `work-title`, `movement-title`, `composer`, and tempo
   (`scrapeTempoBpm` → `importedBpm`) for display and playback.
5. **Detect sections** from the notation (`detectSectionsSafely`; see
   `specs/features/section-detection.md`). This is best-effort and **never fails an import** — an
   unreadable form stores an empty list and the piece simply shows no section label.
6. Persist **full XML** (or path to copied file) under app storage; save **metadata** record (id, title, composer, createdAt, localUri or internal path).
7. **Read the parts, and what each one is** (`scrapeScoreParts`). The `<part-list>` is stored on
   the piece (like `sections`) so the modal can offer the picker without re-reading the score, and
   each entry carries whether that part is a single line of music — `<staves>` absent or 1, no
   `<chord/>`, one distinct `<voice>`. That verdict is settled here, once, because every later
   reader needs it and none of them may open a 5 MB file to get it: **listing the dashboard must
   never parse a score.** See `instruments.md`.
8. **Detect the instrument** (`domain/instrumentDetect.ts`). The part name is
   trusted first — it is the engraver's own statement of intent and the only signal many
   exports carry — then the GM `<midi-program>` (72 = clarinet, 1–8 = piano). `<transpose>` is
   **not** a signal: a chromatic of −2 is a Bb clarinet, a Bb trumpet and a soprano sax alike, so
   it identifies a transposition and never an instrument. Detection returns *nothing* rather than
   a fallback when the notation says nothing, because a confident wrong guess is worse here than a
   question — and a detection the chosen part cannot support is dropped outright.
9. **Complete required metadata**: a piece needs a title, a composer, and a target speed
   (`isPieceComplete`), plus a settled **instrument** and — for a score with more than one part —
   a chosen **part**. If the file omits any of these (e.g. no tempo marking, no composer), open
   the edit modal in **"Input needed"** mode — non-dismissable, missing fields marked, the
   **Import** button disabled until all are provided. A fully-described file imports with no
   prompt. A **Cancel** action in this mode discards the in-progress piece (nothing is kept).

   The instrument and the part are asked in that order, and under these rules:

   - **Part first, then instrument.** Which line the user practises is what decides which
     instruments are possible; asking the instrument first puts a question nothing has yet
     constrained. A multi-part score always asks which line, however confident detection is:
     picking the first would quietly hand a clarinettist the flute part.
   - **A single-staff instrument may only take a monophonic part** (`instruments.md`). Illegal
     options are shown **disabled with the reason** — "two staves", "contains chords" — never
     hidden, so a clarinettist learns that the score is what rules their instrument out. The
     selection is **refused, never reduced**: there is no top-note-only fallback.
   - **The modal asks about the instrument unless exactly one is legal.** A two-staff score has one
     legal answer and imports silently; a single-line score always asks, however confident
     detection was, because that is the only case where a wrong answer is possible and
     irreversible. Detection pre-selects; it does not decide.
   - Neither is editable afterwards — see `instruments.md` § Instrument on a piece.

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
- [ ] Title, composer, and tempo are scraped and stored on import.
- [x] Sections are detected and stored on import; detection failure never blocks the import.
- [ ] A file missing title, composer, or tempo opens a non-dismissable "Input needed" modal; import completes only once all required fields are provided.
- [ ] Any single-line score opens the modal with the instrument picker; a two-staff score imports
      with no instrument prompt.
- [ ] A multi-part score always shows the part picker, before the instrument picker, and only the
      chosen part renders and sounds.
- [ ] Choosing a two-staff part shows the clarinet disabled, labelled "two staves"; it can never be
      selected, and no reduced playback is offered instead.

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

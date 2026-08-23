# Feature: Pieces domain model

## Entities

### Piece

- `id` (uuid)
- `title` (string; fallback filename or `movement-title` / `work-title` from XML)
- `localStorageKey` or filesystem path to XML copy
- `importedAt` (ISO timestamp)
- Optional: `composer` from XML metadata
- Optional: `importedBpm` — score tempo (quarter-note BPM) read from the XML at import
  (`scrapeTempoBpm`); surfaced to the user as the file's original speed
- Optional: `targetBpm` — user-chosen target speed that overrides `importedBpm` as the PlayView
  100% reference; valid range and helpers live in `domain/tempo.ts`
- Optional: `sections` — the piece's sections in score order, seeded by detection at import
  (`domain/sections.ts`) and editable by the user thereafter (`domain/sectionEditing.ts`; see
  `specs/features/section-detection.md`). A tiling: no gaps, no overlaps, every measure in
  exactly one section, so a section carries a start and no end. Optional only for a piece in
  flight during import — anything returned by `PieceRepository` has run `normaliseSections` and
  carries at least one section, each with a valid `#RRGGBB` color.

### Bit (saved loop)

A loop the user saved on a piece, so a passage does not have to be drawn again next
session. Stored as a JSON array on the piece (`Piece.bits`), normalised on read like
`sections`. Full behaviour: `specs/features/playview.md` § "Bits (saved loops)".

- `id` (uuid) — minted natively, because `crypto.randomUUID` cannot be relied on in every
  WebView this ships to and the handle has to survive being written to disk. An array
  index is not a handle: deleting a bit would silently rename every one after it.
- `startTicks`, `endTicks` — half-open `[start, end)` in the **unrolled playback
  timeline**, invariant `startTicks < endTicks`. This is the **musical coordinate** the
  rule below demands: the same one `Tone.Transport.loopStart/loopEnd` take and
  `loopFromSteps` produces, and a pure function of the XML, which is immutable after
  import.
  - Measure + beat was the other candidate and was rejected: it resolves through
    `firstTicksBySourceIndex`, which keeps only a measure's *first* visit, so it cannot
    address a position on the second pass of a repeat.
  - Transient on-screen loop placement stays pixel-based: the live region in `playback.ts`
    (`loopRegion`) deliberately holds both `aPx`/`bPx` and `aTicks`/`bTicks`, and the
    placement math in `domain/loop.ts` works in score pixels. Only the ticks are stored.
- `hand`, `tempoMultiplier`, `metronome` — the practice settings the bit was saved with,
  restored on entering it and written back when changed from inside it
  (`domain/practiceSettings.ts`). Count-in stays global.
- **One bit per engraved span.** Duplicate detection compares the resolved *pixel* span,
  not ticks, so repeated bars — engraved once, played twice — hold at most one bit. Bits
  are nameless, and two markers on the same pixels would leave one unreachable.
- **Exactly one bit armed at a time**, and an armed bit owns the single active loop. There
  is never both a loop and a bit.

## Zustand

- Keep **normalized** state: `piecesById`, `pieceIds` in `piecesStore`; `activePieceId` and
  `activeBitId` (nullable) in `playViewStore`, which is where the PlayView's own state lives.
- Bits are written through a dedicated `piecesStore.setBits(id, bits)` rather than
  `updatePiece`: the PlayView creates, deletes and re-tunes bits on its own and has no
  business restating the title and composer to do it.

## Extensibility (future)

- **Named** bits, hierarchical decks, per-bit practice statistics, instrument profiles —
  extend this model with new fields (or promote `bits` to its own table) without renaming
  **Piece** / **Bit**. Bits are deliberately nameless today: see
  `specs/features/playview.md`.

## Acceptance criteria

- [x] Domain helpers (loop validation, ordering, bit normalisation and marker-row packing)
  are **unit tested** without WebView (`domain/__tests__/bits.test.ts`,
  `score-web/__tests__/bitResolve.test.ts`).

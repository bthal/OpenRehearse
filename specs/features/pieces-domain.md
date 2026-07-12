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

### Bit (active loop)

- Attached to **one** piece at a time in UI; only **one** active `bit` globally in MVP.
- Represent boundaries in **musical coordinates** understood by OSMD / playback (e.g. `Timestamp` from OSMD, or measure + beat + voice), **not** raw pixels.
- `start`, `end` with invariant `start < end`; validation rejects invalid ranges.

## Zustand

- Keep **normalized** state: `piecesById`, `pieceIds`, `activePieceId`, `activeBit` (nullable).
- Actions: `addPiece`, `removePiece`, `setActiveBit`, `clearBit`, `setTempo`.

## Extensibility (future)

- Multiple named bits per piece, hierarchical decks, instrument profiles — extend this model with new tables/fields without renaming **Piece** / **Bit**.

## Acceptance criteria

- [ ] Domain helpers (loop validation, ordering) are **unit tested** without WebView.

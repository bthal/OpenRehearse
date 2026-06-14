# Feature: PlayView

## Goal

Single screen where the user **reads**, **hears** (synthesized), and **practices** a piece with **one active loop** and **adjustable tempo**.

## Rendering

- **OpenSheetMusicDisplay** inside **WebView** (see `architecture.md`).
- **OSMD standard cursor**, moving **smoothly** with the playback position — not jumping discretely note-to-note. Use OSMD's documented cursor / playback integration; do not replace with a hand-drawn caret unless OSMD proves insufficient (then ADR required).
- **Piece title** engraved in the score header by OSMD using `work-title` / `movement-title` from the imported MusicXML.

## Playback & tempo

- Audio is **synthesized from the score** (same musical source as notation).
- **Score BPM** is read from the MusicXML (`cursor.Iterator.CurrentBpm`; fallback 120). The user
  adjusts speed via a **×0.5 / ×0.75 / ×1.0 multiplier selector** — effective BPM is shown above
  the selector. Chosen approach: multiplier over arbitrary BPM input (simpler UX, directly tied
  to the composer's intent).

## Loop ("bit") — MVP rules

- **Exactly one** active loop at a time; defining a new loop **replaces** the previous.
- Loop handles (start and end) are **continuously draggable** — smooth drag to any position along the score timeline; no forced snap to note boundaries in MVP.
- On reaching the **end** of the bit during playback: **immediate jump** to the **start** of the bit (no ritardando across wrap; wrap is transport-level).

## Native UI (shell)

- Transport: **play / pause / stop**.
- **Speed selector**: ×0.5 / ×0.75 / ×1.0 segmented control; effective BPM shown above it.
- Loop controls: draggable start/end handles; clear loop button.
- Error states: corrupt XML, unsupported constructs — user-visible message + retry.

## State (Zustand)

Slices: `activePieceId`, `webViewReady`, `isLoadingScore`, `scoreError`, `isPlaying`,
`scoreBpm` (from MusicXML), `tempoMultiplier` (×0.5/×0.75/×1.0), `loop: { start, end } | null`.

## Acceptance criteria

- [x] Opening a piece shows rendered notation with piece title in score header. *(Phase 2)*
- [x] OSMD cursor moves smoothly with playback — no discrete per-note jumping. *(Phase 3)*
- [x] Play/pause drives **synth + OSMD cursor** without obvious systematic drift under normal scores. *(Phase 3)*
- [x] Changing tempo updates playback speed and cursor alignment. *(Phase 3)*
- [x] Realistic piano audio (Salamander Grand Piano via CDN; cached offline after first play). *(Phase 3b)*
- [x] Score BPM read from MusicXML; speed selector ×0.5/×0.75/×1.0 applied as multiplier. *(Phase 3b)*
- [x] Cursor visible at position 0 after load and after stop; smooth left-slide between beats. *(Phase 3b)*
- [ ] User can set **one** loop by dragging handles; playback wraps with **immediate jump**. *(Phase 4)*
- [x] Works **offline** once the piece is loaded from local storage. *(Phase 2)*

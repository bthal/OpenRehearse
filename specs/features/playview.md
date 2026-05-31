# Feature: PlayView

## Goal

Single screen where the user **reads**, **hears** (synthesized), and **practices** a piece with **one active loop** and **adjustable tempo**.

## Rendering

- **OpenSheetMusicDisplay** inside **WebView** (see `architecture.md`).
- **OSMD standard cursor**, moving **smoothly** with the playback position — not jumping discretely note-to-note. Use OSMD's documented cursor / playback integration; do not replace with a hand-drawn caret unless OSMD proves insufficient (then ADR required).
- **Piece title** engraved in the score header by OSMD using `work-title` / `movement-title` from the imported MusicXML.

## Playback & tempo

- Audio is **synthesized from the score** (same musical source as notation).
- **Tempo** is user-adjustable in **BPM** from the first shippable PlayView slice; applies globally to the current transport for that session (respect score tempo changes later if needed; MVP may use **global BPM multiplier** or **absolute BPM** — pick one and document in code).

## Loop ("bit") — MVP rules

- **Exactly one** active loop at a time; defining a new loop **replaces** the previous.
- Loop handles (start and end) are **continuously draggable** — smooth drag to any position along the score timeline; no forced snap to note boundaries in MVP.
- On reaching the **end** of the bit during playback: **immediate jump** to the **start** of the bit (no ritardando across wrap; wrap is transport-level).

## Native UI (shell)

- Transport: **play / pause** (and **seek** if trivial with synth).
- **Tempo** control (slider or stepper + numeric BPM).
- Loop controls: draggable start/end handles; clear loop button.
- Error states: corrupt XML, unsupported constructs — user-visible message + retry.

## State (Zustand)

Suggested slices: `activePieceId`, `playback` (`isPlaying`, `position`), `tempoBpm`, `loop: { start, end } | null`, `webViewReady`.

## Acceptance criteria

- [ ] Opening a piece shows rendered notation with piece title in score header.
- [ ] OSMD cursor moves smoothly with playback — no discrete per-note jumping.
- [ ] Play/pause drives **synth + OSMD cursor** without obvious systematic drift under normal scores.
- [ ] Changing BPM updates playback speed and cursor alignment.
- [ ] User can set **one** loop by dragging handles; playback wraps with **immediate jump**.
- [ ] Works **offline** once the piece is loaded from local storage.

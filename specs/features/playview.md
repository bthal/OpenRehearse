# Feature: PlayView

## Goal

Single screen where the user **reads**, **hears** (synthesized), and **practices** a piece with **one active loop** and **adjustable tempo**.

## Rendering

- **OpenSheetMusicDisplay** inside **WebView** (see `architecture.md`).
- **OSMD standard cursor** — use OSMD’s documented cursor / playback integration; do not replace with a hand-drawn caret unless OSMD proves insufficient (then ADR required).

## Playback & tempo

- Audio is **synthesized from the score** (same musical source as notation).
- **Tempo** is user-adjustable in **BPM** from the first shippable PlayView slice; applies globally to the current transport for that session (respect score tempo changes later if needed; MVP may use **global BPM multiplier** or **absolute BPM** — pick one and document in code).

## Loop (“bit”) — MVP rules

- **Exactly one** active loop at a time; defining a new loop **replaces** the previous.
- Loop endpoints are **between notes** (musical boundaries): no cutting through a sustained note; selection UX should snap or validate to valid boundaries.
- On reaching the **end** of the bit during playback: **immediate jump** to the **start** of the bit (no ritardando across wrap unless score dictates; wrap is transport-level).

## Native UI (shell)

- Transport: **play / pause** (and **seek** if trivial with synth).
- **Tempo** control (slider or stepper + numeric BPM).
- Loop controls: set start, set end, clear loop; optional “set loop from selection” depending on OSMD APIs.
- Error states: corrupt XML, unsupported constructs — user-visible message + retry.

## State (Zustand)

Suggested slices: `activePieceId`, `playback` (`isPlaying`, `position`), `tempoBpm`, `loop: { start, end } | null`, `webViewReady`.

## Acceptance criteria

- [ ] Opening a piece shows rendered notation.
- [ ] Play/pause drives **synth + OSMD cursor** without obvious systematic drift under normal scores.
- [ ] Changing BPM updates playback speed and cursor alignment.
- [ ] User can set **one** loop with between-note boundaries; playback wraps with **immediate jump**.
- [ ] Works **offline** once the piece is loaded from local storage.

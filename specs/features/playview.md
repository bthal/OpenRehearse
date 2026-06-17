# Feature: PlayView

## Goal

Single screen where the user **reads**, **hears** (synthesized), and **practices** a piece with **one active loop** and **adjustable tempo**.

## Score display modes

Two display modes are defined; **MVP implements one-line mode only** (no UI toggle yet — it is a global preference for future exposure).

### Standard mode (backlog)
OSMD renders the piece across multiple systems, laid out vertically. Score scrolls vertically with playback. This is OSMD's default rendering.

### One-line mode (MVP)
The entire piece is rendered in a **single horizontal line** — all measures laid out left-to-right on one infinite row (OSMD configured for single-system layout).

- **Cursor is pinned to the horizontal center** of the screen at all times.
- During playback the score scrolls horizontally so the cursor stays at the correct position.
- **Manual horizontal scroll**: the score moves with the finger; vertical scroll is not possible.
  - Manual scroll **stops playback**.
  - After lifting the finger, the score **decelerates with momentum** before stopping.
  - The cursor stays centered and corresponds to the scrolled-to position in the piece.
  - On next **play**: if no loop is set, playback resumes from the cursor's current position; if a loop is set, the cursor smoothly scrolls to the loop start and playback begins from there.

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

- **Exactly one** active loop at a time.
- **Creating a loop**: tap the loop button in the toolbar. A loop is immediately placed starting at the **current cursor position**, extending a fixed pixel span forward (constant `LOOP_DEFAULT_PX`). The loop button icon changes to **×** while a loop is active.
- **Deleting a loop**: tap the loop button again (showing ×). The loop is removed entirely.
- **Visual representation**:
  - Both handles (A = start, B = end) render as draggable markers on the score.
  - The region between A and B is shaded.
- **Handle dragging**:
  - Handles can be placed at **any continuous position** within the piece — no snap to beats or measures.
  - A may not be dragged past B; B may not be dragged past A. A **minimum pixel gap** (`LOOP_MIN_GAP_PX`, constant) is enforced between the two handles.
  - While dragging a handle, the score **scrolls to follow** the handle being dragged so it stays visible.
- **Playback wrap**: on reaching B, playback **immediately jumps** to A (no fade or ritardando).

## Toolbar

- Positioned **vertically on the left side** of the PlayView screen, overlaid on the score —
  no separate header row.
- Controls (top to bottom):
  - **Back button** — navigates back to the Dashboard.
  - **Loop button** (icon: loop-icon when inactive; × when active)
  - **Play / Pause**
  - **Metronome toggle** — when enabled, clicks every quarter note; first beat of each measure
    accented (higher pitch, louder). Works for any time signature.
  - **Speed selector** — expanding picker: collapses to active label + chevron; expands on tap
    to show ×0.5 / ×0.75 / ×1.0; effective BPM shown below.

## State (Zustand)

Slices: `activePieceId`, `webViewReady`, `isLoadingScore`, `scoreError`, `isPlaying`,
`scoreBpm` (from MusicXML), `tempoMultiplier` (×0.5/×0.75/×1.0), `metronomeOn: boolean`,
`loop: { start, end } | null`,
`displayMode: 'one-line' | 'standard'` (global preference; `'one-line'` in MVP, no UI to change it yet).

## Acceptance criteria

- [x] Opening a piece shows rendered notation with piece title in score header. *(Phase 2)*
- [x] OSMD cursor moves smoothly with playback — no discrete per-note jumping. *(Phase 3)*
- [x] Play/pause drives **synth + OSMD cursor** without obvious systematic drift under normal scores. *(Phase 3)*
- [x] Changing tempo updates playback speed and cursor alignment. *(Phase 3)*
- [x] Realistic piano audio (Salamander Grand Piano via CDN; cached offline after first play). *(Phase 3b)*
- [x] Score BPM read from MusicXML; speed selector ×0.5/×0.75/×1.0 applied as multiplier. *(Phase 3b)*
- [x] Cursor visible at position 0 after load and after stop; smooth left-slide between beats. *(Phase 3b)*
- [x] Score renders in one-line mode (single horizontal system; cursor pinned to center). *(Phase 4)*
- [x] Manual horizontal scroll pauses playback; play resumes from scrolled position, or from loop start if a loop is active. *(Phase 4)*
- [x] Toolbar renders vertically on the left. *(Phase 4)*
- [x] Tapping loop button creates loop at cursor with fixed pixel span (`LOOP_DEFAULT_PX`);
  also pauses playback if running. Tapping again (× icon) removes it. *(Phase 4/5)*
- [x] Manual scroll has momentum: score decelerates after lift; `MOMENTUM_DECELERATION`
  constant in `playback.ts` controls glide length. *(Phase 5)*
- [x] Loop handles are continuously draggable; A/B minimum gap (`LOOP_MIN_GAP_PX`) enforced. *(Phase 4)*
- [x] Dragging a handle auto-scrolls the view to keep the active handle visible. *(Phase 4)*
- [x] Playback wraps from B to A with immediate jump. *(Phase 4)*
- [x] No separate title/composer header; back button lives at the top of the toolbar. *(Phase 5)*
- [x] Speed picker collapses to active label; expands on tap; closes after selection. *(Phase 5)*
- [x] Metronome toggle present; clicks every quarter note; first-beat accent correct for any
  time signature. *(Phase 5)*
- [ ] Works **offline** once the piece is loaded from local storage. *(Phase 2)*

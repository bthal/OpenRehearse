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
  - **Positions are discretised to the note grid.** Scrolling is continuous, but the position it
    resolves to is always a **note onset**. While the finger moves and throughout the momentum
    coast, a **vertical preview line** the height of the staff system marks the onset nearest the
    centre line — paler and thinner than the cursor, so it reads as a target rather than a second
    playhead. When the coast settles (or on lift with no fling) the score **glides** until that
    onset sits exactly under the cursor, and the line fades out as the two meet.
  - The nearest onset wins, not the preceding one: scrolling most of the way to the next note lands
    on it.
  - On next **play**: if no loop is set, playback resumes from the cursor's current position — which
    is already exactly on a note, so **nothing moves when playback starts**. If a loop is set, the
    cursor smoothly scrolls to the loop start and playback begins from there.

## Rendering

- **OpenSheetMusicDisplay** inside **WebView** (see `architecture.md`).
- **OSMD standard cursor**, moving **smoothly** with the playback position — not jumping discretely note-to-note. Use OSMD's documented cursor / playback integration; do not replace with a hand-drawn caret unless OSMD proves insufficient (then ADR required).
- OSMD title, subtitle, composer, lyricist, and copyright rendering are **suppressed**
  (`RenderTitle = false` etc. in EngravingRules; `drawTitle`/`drawComposer` constructor options).
  The native Dashboard shows piece metadata; the WebView displays notation only.
  Suppressing metadata eliminates the large `systemTop` offset that otherwise complicates
  vertical centering.

## Playback & tempo

- Audio is **synthesized from the score** (same musical source as notation).
- **Score BPM** is read from the MusicXML (`cursor.Iterator.CurrentBpm`; fallback 120). The user
  adjusts speed via a **×0.5 / ×0.75 / ×1.0 multiplier selector** — effective BPM is shown above
  the selector. Chosen approach: multiplier over arbitrary BPM input (simpler UX, directly tied
  to the composer's intent).
- **Target speed** is the 100% reference the multiplier scales. It defaults to the tempo read from
  the file at import (`importedBpm`) but can be overridden per piece in the edit modal
  (`targetBpm`) — e.g. import at 100 BPM offers 50/75/100; setting the target to 80 offers
  40/60/80. The reference resolves to `targetBpm ?? importedBpm ?? scoreBpm`; effective BPM =
  reference × multiplier. Bounds are **40–240** (`domain/tempo.ts`), chosen so every selectable
  speed stays inside the synth's `[20, 240]` clamp and the displayed BPM always equals playback.

## Loop ("bit") — MVP rules

- **Exactly one** active loop at a time.
- **Creating a loop**: tap the loop button in the toolbar. A loop is immediately placed starting at the **current cursor position**, extending a fixed pixel span forward (constant `LOOP_DEFAULT_PX`). Near the end of the piece a full-width loop no longer fits ahead of the cursor: B is then anchored at the last note and A derived backwards, so the loop **keeps its standard width and its start lands before the cursor** rather than being shortened. Placement math is pure (`domain/loop.ts`). The loop button icon changes to **×** while a loop is active.
- **Deleting a loop**: tap the loop button again (showing ×). The loop is removed entirely.
- **Visual representation**:
  - Both handles (A = start, B = end) render as draggable markers on the score.
  - Each handle's **outer** corners (facing away from the loop) are rounded so the pair frames the region; the grip glyph is a darker seagrass than the handle body so it reads clearly.
  - The region between A and B is shaded.
- **Creation animation**: the loop **unfurls out of the cursor**. Every overlay element that is not already at the cursor slides from the cursor line to its final position (`LOOP_UNFURL_MS`, ease-out) — the end handle to the right, and in the near-end case the start handle to the left. A handle that genuinely starts at the cursor is placed directly and does not animate.
- **Loop bounds are half-open `[A, B)`**: the note under A is the **first note played**; the note
  under B is the **first note not played**. Both handles therefore cover excluded material — A's
  body sits to the left of its note, B's sits on the note it excludes — so the pair reads as a
  bracket around the region.
- **End of the piece**: a virtual target at the **final barline** sits past the last onset, so
  dragging B fully right includes the final note in the loop.
- **Handle dragging**:
  - Dragging is **continuous** — the handle follows the finger — but the position is **discretised
    to the note grid immediately**. The same **preview line** used by manual scroll marks the onset
    the handle will land on; on release the handle and the shaded region **glide** onto it.
  - The nearest onset wins. Audio loop bounds update as soon as the preview crosses to a new onset,
    not on release.
  - A loop must span at least **one quarter note**, measured in musical time and independent of the
    meter — a pixel gap is meaningless once positions are discrete, since the same distance spans
    several notes in a run of semiquavers and less than one in a bar of whole notes. The consequence
    is that a passage shorter than a quarter cannot be looped on its own.
  - A handle refused by that minimum **stops at the limit** rather than following the finger past it.
    If the minimum cannot be met ahead of A, B anchors at the end of the piece and **A is pushed
    backwards** — the same rule loop creation already uses near the end.
  - While dragging a handle, the score **scrolls to follow** the handle being dragged so it stays visible.
- **Playback wrap**: on reaching B, playback **immediately jumps** to A (no fade or ritardando).

## Toolbar

- Positioned **vertically on the left side** of the PlayView screen, **vertically centered**,
  overlaid on the score — no separate header row.
- Controls (top to bottom):
  - **Back button** — navigates back to the Dashboard.
  - **Loop button** (icon: loop-icon when inactive; × when active)
  - **Play / Pause**
  - **Metronome toggle** — when enabled, clicks every quarter note; first beat of each measure
    accented (higher pitch, louder). Works for any time signature.
  - **Hand selector** — collapses to current selection label + hand icon (teal when filtering
    active); tapping expands a spring-animated panel over the score with **Both / Right / Left**
    buttons. Selecting a hand closes the panel without resuming playback. Cursor position is
    preserved on change. Staff heuristic: MusicXML `<staff>1</staff>` = right hand (treble),
    `<staff>2</staff>` = left hand (bass). Inactive staff notes are greyed in the score and
    silenced in audio.
  - **Speed selector** — collapses to current speed label + effective BPM; tapping shows a
    speedometer icon and **pauses playback**; expands a horizontal spring-animated panel over
    the score with ×0.5 / ×0.75 / ×1.0 text buttons. Selecting a speed closes the panel.

## Section label

- A label in the **upper-right** corner names the section the cursor is currently in: bold white
  text on the section's color, fading out at the left and right ends. Inert (tapping does nothing).
- **Playing** rolls it up to a thin strip of that color — same width, no text. **Pausing** unrolls
  it. Only the height animates, so it reads as one object rather than a swap.
- Pinned in absolute screen space above the WebView, at a fixed width so names slide through a
  stable frame.
- **Swiped** horizontally to move one section, while **paused** and while **no loop is active**. It
  is a pager: dragging rightward brings the earlier section in from the left, names travel with the
  finger, and the two sections' colors crossfade. One swipe moves exactly one section; at the first
  and last it rubber-bands and springs back.
- The name follows the score **continuously while panning**, not only once the scroll settles.
- **Nothing is rendered** when the piece has no detected sections.
- Every junction between two sections is also marked **in the score**, under the notation: the two
  sections' colors fade away from a shared seam.
- Full rules, colors and the anacrusis junction offset: `specs/features/section-detection.md`.

## State (Zustand)

Slices: `activePieceId`, `webViewReady`, `isLoadingScore`, `scoreError`, `isPlaying`,
`scoreBpm` (from MusicXML), `tempoMultiplier` (×0.5/×0.75/×1.0), `metronomeOn: boolean`,
`activeHand: 'both' | 'right' | 'left'` (resets to `'both'` on piece unmount),
`currentSectionIndex: number | null` (driven by `SECTION_INDEX` from the WebView, which owns position),
`loop: { start, end } | null`,
`displayMode: 'one-line' | 'standard'` (global preference; `'one-line'` in MVP, no UI to change it yet).

## Acceptance criteria

- [x] Opening a piece shows rendered notation; OSMD title/metadata suppressed. *(Phase 2)*
- [x] OSMD cursor moves smoothly with playback — no discrete per-note jumping. *(Phase 3)*
- [x] Play/pause drives **synth + OSMD cursor** without obvious systematic drift under normal scores. *(Phase 3)*
- [x] Changing tempo updates playback speed and cursor alignment. *(Phase 3)*
- [x] Realistic piano audio (Salamander Grand Piano via CDN; cached offline after first play). *(Phase 3b)*
- [x] Score BPM read from MusicXML; speed selector ×0.5/×0.75/×1.0 applied as multiplier. *(Phase 3b)*
- [x] Target speed defaults to the imported tempo and is adjustable per piece; the speed selector
  scales the target (`targetBpm ?? importedBpm ?? scoreBpm` × multiplier).
- [x] Cursor visible at position 0 after load and after stop; smooth left-slide between beats. *(Phase 3b)*
- [x] Score renders in one-line mode (single horizontal system; cursor pinned to center). *(Phase 4)*
- [x] Manual horizontal scroll pauses playback; play resumes from scrolled position, or from loop start if a loop is active. *(Phase 4)*
- [x] Scrolling and handle dragging are discretised to the note grid: a system-height preview line
  marks the nearest onset while the finger moves and while momentum coasts, and the score or handle
  glides onto it on settle. Pressing play after positioning by hand moves nothing.
- [x] Toolbar renders vertically on the left. *(Phase 4)*
- [x] Tapping loop button creates loop at cursor with fixed pixel span (`LOOP_DEFAULT_PX`);
  also pauses playback if running. Tapping again (× icon) removes it. *(Phase 4/5)*
- [x] Manual scroll has momentum: score decelerates after lift; `MOMENTUM_DECELERATION`
  constant in `playback.ts` controls glide length. *(Phase 5)*
- [x] Loop handles are continuously draggable and snap to note onsets on release; bounds are
  half-open `[A, B)`, the minimum loop is one quarter note, and dragging B to the final barline
  includes the last note.
- [x] Dragging a handle auto-scrolls the view to keep the active handle visible. *(Phase 4)*
- [x] Playback wraps from B to A with immediate jump. *(Phase 4)*
- [x] Cursor is visually clamped to the loop region [A, B]; never drifts into handle areas.
- [x] Tapping the score (outside a handle) toggles play/pause.
- [x] Creating or editing a loop pauses playback; play after any create/edit always seeks to A first.
- [x] Handles clamp to the first onset and the final-barline target (not raw SVG width). Loop placed
  near the end of the piece anchors B at the end and derives A backward by `LOOP_DEFAULT_PX`,
  so the start lands before the cursor instead of the loop being shortened (`domain/loop.ts`),
  and the placement is then resolved onto the grid (`domain/scoreGrid.ts`).
- [x] On creation the loop unfurls out of the cursor: handles not already at the cursor animate
  outward to their final positions; one at the cursor does not animate.
- [x] Loop handles have rounded outer corners and a darker grip glyph than the handle body.
- [x] No separate title/composer header; back button lives at the top of the toolbar. *(Phase 5)*
- [x] Speed picker collapses to active label; tapping pauses playback and expands a horizontal
  animated overlay; closes after selection. *(Phase 5)*
- [x] Metronome toggle present; clicks every quarter note; first-beat accent correct for any
  time signature. *(Phase 5)*
- [x] Hand selector (Both/Right/Left): selected staff plays audio and notes stay black;
  inactive staff notes greyed (`#B0B0B0`); switching hand preserves cursor position.
- [x] Section label shows the current section in the upper-right corner, and is absent entirely
      for a piece with no detected sections.
- [x] Swiping the label moves exactly one section, and is inert while playing or while a loop
      is armed.
- [x] The label rolls up to a strip while playing and unrolls on pause, animated in both directions.
- [x] Section junctions are marked in the score with a two-sided color fade and a crisp seam.
- [ ] Works **offline** once the piece is loaded from local storage. *(Phase 2)*

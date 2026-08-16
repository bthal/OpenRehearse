# Feature: Settings

## Goal

A single place for app-wide preferences, reached from the Dashboard. Settings are **local to the
device** and persist across restarts (no account, no sync).

## MVP UI

- **Entry point**: a **cog icon** (MDI) on the Dashboard, just **below** the "OpenRehearse" brand
  title, on the **right-hand side**. Tapping it opens the Settings modal.
- **Modal**: styled like the piece-edit modal (same card, header with title + close ✕). Each
  control applies **immediately** on selection and persists — there is no separate Save step.

## Settings

### Count-in

Measures of metronome beats played **before** a piece, routine, or new loop starts, to give the
player time to find the pulse.

- Options: **None** (default), **1**, **2** — a segmented selector.
- The number of beats follows the **meter**: one 4/4 measure = 4 beats, one 2/4 measure = 2 beats,
  so "2 measures" is 8 beats in 4/4 and 4 beats in 2/4.
- **Preludes (anacrusis) are part of the last counted measure**: with a count-in of 1 measure and a
  1-beat pickup in 4/4, the metronome clicks 3 beats and the prelude sounds on the 4th beat, when
  playback begins.
- **A loop that starts partway through a measure is treated the same way**: the beats from the
  measure's downbeat up to the loop start are folded into the last counted measure, so the loop
  enters on its natural beat and the count-in's downbeats stay aligned with the loop's bar grid
  (e.g. a loop starting on beat 3 of 4/4 with a 2-measure count-in clicks 6 beats, then the loop
  enters). A loop starting on a downbeat counts full measures.
- The count-in is a metronome pre-roll regardless of whether the metronome toggle is on; once
  playback starts, the metronome only continues if it is enabled.
- Count-in fires only on a **fresh start** (top of a piece/routine, or when a loop (re)starts from
  its A handle) — not when resuming a mid-piece/mid-loop pause.
- **Tapping the score during the count-in cancels it.** The clicks stop, the toolbar and play button
  come back, and the playhead stays exactly where the pre-roll was counting into — the top of the
  piece, or the loop's A handle. Pressing play again counts in from the beginning; a cancelled
  count-in is never silently skipped, even though the playhead is sitting where a resumed pause
  would leave it. Dragging the score or a loop handle cancels it the same way.
- The same holds for the wait before the first sound on a cold start, while the piano samples load:
  the screen is already in its playing state, so a tap there cancels rather than starting a second
  playback on top of the first.

## Behavior

- Persisted on-device as `settings.json` (same store pattern as routines); never uploaded.
- Applies across pieces, routines, and warm-ups (they share one playback engine).

## Acceptance criteria

- [ ] Cog below the brand title opens the Settings modal; ✕ / tap-outside closes it.
- [ ] Count-in choice (None/1/2) persists across app restarts.
- [ ] With count-in = 1, a piece with no pickup gets one full measure of clicks before the first
      note; with count-in = 2, two measures.
- [ ] Beat count tracks the meter (e.g. 3/4 → 3 clicks per counted measure).
- [ ] A pickup measure is absorbed into the last counted measure (clicks + prelude = one measure).
- [ ] Starting a newly created loop counts in the meter's measures before the loop's first note.
- [ ] Resuming a mid-piece pause does not count in.
- [x] Tapping during the count-in cancels it instead of starting a second one; the playhead stays at
      the piece top or the loop's A handle, and the next play counts in again from the beginning.

# Feature: Dashboard

## Goal

Home surface listing the user's **pieces** and entry points to **import** and **open PlayView**.

## MVP UI

- **Brand header**: "OpenRehearse" in italic serif at the top of the screen.
- **Settings**: a **cog icon** (MDI) just below the brand title, on the right, opens the Settings
  modal (see `settings.md`).
- **Instrument scope**: a control in that same row, beside the info and cog icons, opening a modal
  with **All / Piano / Clarinet in B♭**. Unlike its icon-only neighbours it shows an **icon plus
  the current scope's label** — a filter that persists across launches has to advertise its state,
  or a filtered library is indistinguishable from an empty one.
  - It filters the **warm-ups, routines and pieces this screen lists, and nothing else**: no effect
    on the PlayView, on the practice heatmap, or on what a new import may become. A pure view
    filter with no side effects, which is what makes it safe to leave on.
  - **Persisted across launches**, in `settings.json` beside the other app settings. A fresh
    install defaults to **All**.
  - Changing it **clears any active row selection**, so a bulk Remove can never act on rows that
    have just left the screen.
  - Every piece, routine and warm-up row carries a small **text chip** naming its instrument —
    text rather than an icon, and shown under a filtered scope too, so a row says what it is
    without the reader having to remember what is selected.
  - A section whose filtered list is empty **keeps its heading** and shows one quiet line ("No
    clarinet pieces yet") rather than collapsing.
- **Warm-ups** section: Hanon I and Scales quick-launch rows.
- **Pieces** section:
  - **Privacy note** always visible above the list: "Your files stay on this device — nothing is uploaded."
  - **Import .mxl-File** button (outlined, white background) always in the section header.
  - **List** of pieces: title (from MusicXML metadata), optional composer.
  - **Empty state**: simple label when no pieces and not loading.
  - **Skeleton row** appears below the list while an import is in progress.
- **Stats** section at the **very bottom**, in this order:
  - **Two streak figures** side by side under the heading — **current streak** and **longest
    streak**. Each carries its unit — "3 days", "1 day" — in the same bold navy accent as the
    number, rather than leaving a bare figure to be read off its caption; the captions sit
    underneath, small and black. A day counts towards a streak once it holds any practice at all.
    The current streak runs through yesterday when today has not been started yet, so an unplayed
    morning does not read as a broken streak.
  - A day-based **heatmap** (GitHub-contributions style) of practice time, one cell per day,
    coloured on the app's navy ramp from "no practice" to the darkest brand shade. Weeks run
    Monday-first; the visible window is as many trailing weeks as fit the screen. See
    "Practice-time tracking" below.
  - **One day is always selected**, and a caption on the **right of the legend row**, level with
    the Less→More scale, names it and gives its total — "Today, 15 Aug · 42 min", or a weekday and
    date for any other day. Days with nothing recorded read "no practice"; days holding only
    seconds read "under a minute", since their cell is drawn empty.
  - **Tapping a cell selects that day.** The selected cell is marked with a dark ring drawn in the
    gap around it, so the day keeps its own intensity colour.
  - The selection is **not durable**: it returns to the present day whenever the dashboard is
    reopened, the app is resumed, or the date rolls over at midnight.

## Row interactions

- **Tap row** (normal mode) → navigate to **PlayView**.
- **Long-tap row** → enter **selection mode** (short vibration feedback); that piece becomes selected.
- **Tap in selection mode** → toggle selection on that row. Deselecting all exits selection mode and restores the import button.
- **1 piece selected**: header shows **Remove** and **Edit** action buttons.
- **2+ pieces selected**: header shows only **Remove**.

## Edit / Delete

- **Edit**: enter selection mode with one piece → tap Edit → modal to change **title**, **composer**, and **target speed** (BPM). The **instrument** and, for a multi-part score, the **part** appear as a read-only line: both are settled at import and never change afterwards (see `instruments.md`). The modal shows the tempo read from the file on import for reference. Title, composer, and target speed are all **required** — missing fields are marked and Save stays disabled until each is valid.
- **Input needed** (import): when an imported file lacks a required field, the same modal opens automatically in a non-dismissable "Input needed" state (no close button; **Import** button gated on completeness). A **Cancel** button discards the in-progress piece and returns to the dashboard.
- **Sections**: the edit modal carries a **Sections** block listing one row per section as a table — swatch, name, and the measures it covers — above a **Reset to detected** button. The score is read when the modal opens, to map printed measure numbers. A row rests in display mode and opens into an editor on tap; the editor carries the name, the "from"/"to" measures, an always-visible hue picker, and Split / Delete / Cancel / Done. Sections tile the piece, so a row's "to" field and the next row's "from" field are the same junction — editing either moves both, and **Cancel restores the whole list**, since one junction move changes two sections. **Done** only closes the row editor; the modal's Save is the only thing that persists. Splitting takes the section's last measure as a new section and drops the caret into its cleared "from" field. Deleting asks which neighbour absorbs the measures, except at the ends of the piece where only one answer exists. Measure fields commit on blur, and Save stays disabled while any of them holds text that does not resolve. See `specs/features/section-detection.md`.
- **Delete**: enter selection mode → tap Remove → native confirm dialog → piece(s) removed from library.

## Practice-time tracking

- Practice time accrues **only while playback is actively playing**, on all three practice
  surfaces: the piece play view, routines, and warm-up exercises. Pausing or stopping stops the
  clock; leaving a screen mid-play keeps the time already accrued.
- Overlapping playback from the two playback stores counts **once** — the durable figure is real
  elapsed playing time, not the sum of two timers.
- Totals are aggregated per **local calendar day** and persisted on-device (SQLite), so a session
  that runs past midnight is split across both days.
- Time spent **out of the foreground** is never practice: backgrounding the app banks what the
  session has earned and stops the clock, which restarts only on return and only if playback is
  still running.
- The heatmap grades a day by **minutes played**, and the dashboard re-reads history on focus so
  time practised in the play view shows up on return.

## Behavior

- Reflect **local** data only (no remote list; no auth).
- After successful import, **refresh list**.

## Acceptance criteria

- [x] All imported pieces appear after app restart (persisted storage).
- [x] Import and open flow works without network.
- [ ] Invalid files show clear error; valid 2.x–4.x XML imports successfully.
- [x] Long-tap enters selection mode with vibration; subsequent taps toggle selection.
- [x] Remove confirms then deletes selected piece(s); deselecting all exits selection mode.
- [x] Edit modal pre-fills title and composer; Save updates the row.
- [x] Edit modal lets the user set a target speed (validated whole-number BPM, 40–240) and shows the tempo read from the file on import.
- [x] Title, composer, and target speed are required; missing fields are marked and Save/Import is disabled until all are valid.
- [x] Importing a file missing any required field opens a non-dismissable "Input needed" modal that must be completed before the piece is usable.
- [x] The edit modal has a Sections block that edits section names, colors and bounds.
- [ ] Section edits made in the modal survive an app restart.
- [x] Privacy note and brand header visible at all times on the dashboard.
- [ ] The instrument scope filters warm-ups, routines and pieces; its trigger names the current
      scope; it survives a restart and defaults to All on a fresh install.
- [ ] Changing the scope clears any piece or routine selection.
- [ ] An empty filtered section keeps its heading and explains itself instead of disappearing.
- [ ] Every piece, routine and warm-up row shows its instrument badge, under All and under a
      named scope alike.
- [x] Practice heatmap sits at the very bottom of the Stats section, populated from tracked
      practice time and coloured from the app palette.
- [x] Current and longest streaks head the Stats section, each shown with its unit ("3 days"); an
      unplayed today does not break the current streak, and both read "0 days" before anything is
      practised.
- [x] The heatmap renders every week in full — none clipped at the edge — and the grid, heading,
      and Less→More legend all share the section's left edge.
- [x] Tapping a heatmap day names it and its practice total in the caption, and rings that cell;
      today is selected on arrival and the selection returns to today on re-entry or resume.
- [x] Play view, routines, and warm-ups all accumulate into the same daily total; pausing stops the
      clock; navigating away mid-play keeps the partial time; concurrent stores do not double-count.
- [x] Daily practice totals survive an app restart.
- [x] Backgrounding the app mid-play banks the time so far and counts nothing until it returns.

# Feature: Dashboard

## Goal

Home surface listing the user's **pieces** and entry points to **import** and **open PlayView**.

## MVP UI

- **Brand header**: "OpenRehearse" in italic serif at the top of the screen.
- **Settings**: a **cog icon** (MDI) just below the brand title, on the right, opens the Settings
  modal (see `settings.md`).
- **Warm-ups** section: Hanon I and Scales quick-launch rows.
- **Pieces** section:
  - **Privacy note** always visible above the list: "Your files stay on this device — nothing is uploaded."
  - **Import .mxl-File** button (outlined, white background) always in the section header.
  - **List** of pieces: title (from MusicXML metadata), optional composer.
  - **Empty state**: simple label when no pieces and not loading.
  - **Skeleton row** appears below the list while an import is in progress.

## Row interactions

- **Tap row** (normal mode) → navigate to **PlayView**.
- **Long-tap row** → enter **selection mode** (short vibration feedback); that piece becomes selected.
- **Tap in selection mode** → toggle selection on that row. Deselecting all exits selection mode and restores the import button.
- **1 piece selected**: header shows **Remove** and **Edit** action buttons.
- **2+ pieces selected**: header shows only **Remove**.

## Edit / Delete

- **Edit**: enter selection mode with one piece → tap Edit → modal to change **title**, **composer**, and **target speed** (BPM). The modal shows the tempo read from the file on import for reference. Title, composer, and target speed are all **required** — missing fields are marked and Save stays disabled until each is valid.
- **Input needed** (import): when an imported file lacks a required field, the same modal opens automatically in a non-dismissable "Input needed" state (no close button; **Import** button gated on completeness). A **Cancel** button discards the in-progress piece and returns to the dashboard.
- **Delete**: enter selection mode → tap Remove → native confirm dialog → piece(s) removed from library.

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
- [x] Privacy note and brand header visible at all times on the dashboard.

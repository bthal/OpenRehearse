# Feature: Dashboard

## Goal

Home surface listing the user's **pieces** and entry points to **import** and **open PlayView**.

## MVP UI

- **List** of pieces: title (from MusicXML metadata), optional composer, import date.
- **Import** button → file picker for **`.xml`** (MusicXML 2.x–4.x uncompressed only).
- **Tap row** → navigate to **PlayView** with that piece id.
- **Tap pencil on a row** → modal to edit **title** and **composer** (not the XML source); **Delete** removes the piece from library with confirmation.
- **Empty state** when no pieces: short explanation + import CTA.

## Behavior

- Reflect **local** data only (no remote list; no auth).
- After successful import, **refresh list** and optionally deep-link to PlayView.

## Acceptance criteria

- [x] All imported pieces appear after app restart (persisted storage).
- [x] Import and open flow works without network.
- [ ] Invalid files show clear error; valid 2.x–4.x XML imports successfully.
- [x] Edit modal pre-fills title and composer; Save updates the row; Delete removes with confirmation.

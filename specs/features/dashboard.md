# Feature: Dashboard

## Goal

Home surface listing the user’s **pieces** and entry points to **import** and **open PlayView**.

## MVP UI

- **List** of pieces: title (from MusicXML metadata if present), optional composer, import date.
- **Import** button → file picker for **`.xml`** (MusicXML 3.x uncompressed only).
- **Tap row** → navigate to **PlayView** with that piece id.
- **Empty state** when no pieces: short explanation + import CTA.

## Behavior

- Reflect **local** data only in MVP (no remote list).
- After successful import, **refresh list** and optionally deep-link to PlayView.

## Acceptance criteria

- [ ] All imported pieces appear after app restart (persisted storage).
- [ ] Import and open flow works without network.
- [ ] Invalid files show clear error; valid 3.x XML imports successfully.

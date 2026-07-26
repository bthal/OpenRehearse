
# Roadmap

Phases are **sequential**; within a phase, items can be parallelized when they do not block each other.

## Phase 0 — Repository & quality baseline

- [x] Initialize **React Native** TypeScript project (Android target first; keep iOS-capable structure).
- [x] **NativeWind** configured; **ESLint** + **Prettier** + strict TS; CI or local script to `lint` / `format:check`.
- [x] Document dev workflow (emulator, physical device) in root README (short pointer to specs).

## Phase 1 — Local pieces (no auth)

- [x] **On-device storage** abstraction for imported pieces (metadata + XML path or content).
- [x] **Dashboard**: list pieces, empty state, navigate to PlayView.
- [x] **Import**: file picker, accept **`.xml` MusicXML 2.x–4.x** only; validate/reject with clear errors; scrape title + composer.

## Phase 2 — PlayView shell + WebView OSMD

- [x] WebView bundle: load XML, render with **OSMD**, expose `LOAD_XML` / `ERROR`.
- [x] **PlayView** screen: pass XML to WebView; display piece title via OSMD; basic zoom/scroll if OSMD provides; loading/error UI.

## Phase 3 — Cursor + synthesized audio + tempo

- [x] Integrate **synthesized playback** from score in WebView; single transport.
- [x] Wire **OSMD standard cursor** to playback — **smooth continuous movement**.
- [x] **Adjustable tempo (BPM)** from UI; applies to synth + cursor from first shippable slice.

## Phase 4 — Single active loop

- [x] Loop start/end handles are **continuously draggable** along the score timeline.
- [x] **Immediate jump** on loop wrap; only **one** active loop at a time.
- [x] UI to set/adjust/clear loop; visual indication of loop region per OSMD capabilities.

## Phase 5 — Hardening & Android release prep

- [ ] Offline regression pass (airplane mode).
- [ ] Large-score performance smoke tests; memory caps / friendly failure.

## Later (post-MVP backlog)

- [x] **Metronome** aligned with transport; oscillator click track in WebView with downbeat detection; toolbar toggle.
- [x] **Practice-time tracking** with a day-based heatmap at the bottom of the dashboard; see `specs/features/dashboard.md` § "Practice-time tracking".
- **Saved bits** / multiple loops / hierarchical practice (per original vision).
- **iOS** build and TestFlight when ready.
- **Auth & cross-device sync** — only after scope is explicitly re-opened; not in MVP.
- **PDF import via OMR** — requires a server-side Audiveris (or equivalent) endpoint; on-device OMR is not feasible at production quality. See `specs/features/import.md` § "Post-MVP: PDF import via OMR" for the full design and edge-case inventory.

## Dependency graph (short)

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
```

# Roadmap

Phases are **sequential**; within a phase, items can be parallelized when they do not block each other.

## Phase 0 — Repository & quality baseline

- [ ] Initialize **React Native** TypeScript project (Android target first; keep iOS-capable structure).
- [ ] **ESLint** + **Prettier** + strict TS; CI or local script to `lint` / `format:check`.
- [ ] Document dev workflow (emulator, physical device) in root README (short pointer to specs).

## Phase 1 — Local pieces (no auth)

- [ ] **On-device storage** abstraction for imported pieces (metadata + XML path or content).
- [ ] **Dashboard**: list pieces, empty state, navigate to PlayView.
- [ ] **Import**: file picker, accept **`.xml` MusicXML 3.x** only; validate/reject with clear errors.

## Phase 2 — PlayView shell + WebView OSMD

- [ ] WebView bundle: load XML, render with **OSMD**, expose `LOAD_XML` / `ERROR`.
- [ ] **PlayView** screen: pass XML to WebView; basic zoom/scroll if OSMD provides; loading/error UI.

## Phase 3 — Cursor + synthesized audio + tempo

- [ ] Integrate **synthesized playback** from score in WebView; single transport.
- [ ] Wire **OSMD standard cursor** to playback.
- [ ] **Adjustable tempo (BPM)** from UI; applies to synth + cursor from first shippable slice.

## Phase 4 — Single active loop (“bit”)

- [ ] Define **bit** boundaries **between notes** (musical anchors, not pixel picking).
- [ ] **Immediate jump** on loop wrap; only **one** active loop at a time.
- [ ] UI to set/adjust/clear loop; visual indication of loop region per OSMD capabilities.

## Phase 5 — Supabase Auth

- [ ] **Supabase Auth** sign-up/sign-in (email magic link or password — choose one minimal flow).
- [ ] Gate optional cloud features; **pieces remain local** (no sync of XML).
- [ ] Optional: store **user row** + `last_active_at` in Postgres for future use.

## Phase 6 — Hardening & Android release prep

- [ ] Offline regression pass (airplane mode).
- [ ] Large-score performance smoke tests; memory caps / friendly failure.
- [ ] Play Store checklist (if distributing).

## Later (post-MVP backlog)

- **Metronome** aligned with transport (native or WebView click).
- **Saved bits** / multiple loops / hierarchical practice (per original vision).
- **iOS** build and TestFlight when ready.
- **Cross-device sync** — only after legal/product review; not default.

## Dependency graph (short)

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4
                                    ↘ Phase 5 (can start after Phase 1 for auth UI stub)
Phase 6 after 3–5 stable
```

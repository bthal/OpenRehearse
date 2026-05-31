# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Primary agent guide

**Read `AGENTS.md` before any substantive change.** It has the required-reading matrix by task, module map, non-negotiables, documentation update rules, and the commit workflow. This file adds Claude Code-specific orientation only.

## What this is

Practice companion for piano students: import MusicXML, render score via OSMD, synthesized audio from notation, OSMD cursor aligned with playback, one active loop ("bit") for focused repetition. Offline after import. Scores stay on-device (no upload).

This is the **mobile-first branch** — Android-first React Native app. The `main` branch is a web-first Expo Web implementation; architecture here differs: RN native shell + WebView hosting OSMD/Tone.js instead of direct browser integration.

## Architecture

```
RN native shell (Expo/RN screens, Zustand)
    └── WebView
            └── score-web bundle (OSMD + Tone.js, one musical clock)
                    ↕ postMessage / injected JS
```

- **OSMD** renders MusicXML and drives the cursor (smooth continuous movement); runs inside WebView (web stack only)
- **Tone.js** (or equivalent) synthesizes audio from the same clock as OSMD — one transport, no dual-clock drift
- **Zustand** owns app state: pieces list, `activePieceId`, playback transport, tempo, loop range
- **NativeWind** for all styling — light mode only; dark mode is a non-goal
- **MDI** (Material Design Icons) — only icon library used
- **Domain logic** (loop bounds, BPM math, MusicXML validation) is pure TypeScript with no RN/OSMD/Tone imports

## Intended module layout (implement as work proceeds)

| Path | Responsibility |
|------|----------------|
| `domain/` | Piece, Bit, musical time, loop validation, tempo — pure TS |
| `native/` | RN screens (Dashboard, PlayView), navigation, file pickers, local DB |
| `score-web/` | OSMD + synth bundle; WebView bridge via `{ type, payload }` messages |

Dependency rule: **screens → state → domain**; domain never imports from score-web or native layers.

## Commands

App code lives under `client/` once scaffolded. Until then, no build commands apply.

| Command | Purpose |
|---------|---------|
| `cd client && npm ci` | Install dependencies |
| `cd client && npm run android` | Start Metro + launch on Android device/emulator |
| `cd client && npm run lint` | ESLint |
| `cd client && npm run format:check` | Prettier check |
| `cd client && npm run typecheck` | `tsc --noEmit` |
| `cd client && npm run test` | Jest unit tests |
| `cd client && npm run ci` | lint + format + typecheck + test (run before committing client/ changes) |

## Commit messages

Conventional Commits enforced by commitlint at repo root. Allowed types: `wip feat fix chore docs refactor test perf specs build ci`.

**Body line limit: every line ≤ 100 characters** — the hook rejects long lines, not just long headers. Use multiple `-m` flags, one short sentence each. Do not amend on hook failure; fix and create a new commit.

```bash
git commit -m "feat(playview): add BPM stepper" \
  -m "Wire Zustand tempoBpm slice to the WebView SET_TEMPO_BPM message." \
  -m "Default 80 BPM; clamp 20–240."
```

## Non-negotiables (from `AGENTS.md`)

- MusicXML: **uncompressed `.xml`, 2.x–4.x** — reject `.mxl` and non-XML formats explicitly
- Scores: **local device only** in MVP — never upload MusicXML to any server
- Loops: **one active loop**; handles **continuously draggable**; **immediate jump** at wrap
- Cursor: **OSMD standard cursor**, **smooth continuous movement** — prefer OSMD APIs over custom overlays
- State: **Zustand** (not TanStack Query)
- Styling: **NativeWind** throughout; **light mode only**
- Icons: **MDI only**
- Android-first; keep iOS viable (no Android-only APIs in `domain/` or shared code)

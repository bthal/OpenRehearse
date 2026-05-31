# Architecture

## High-level shape

- **Client**: **React Native** (TypeScript), **Android-first** for builds and store targets; structure and dependencies chosen so **iOS remains viable** with minimal rework (no Android-only APIs in shared core, use `Platform` sparingly, test on RN's cross-platform abstractions).
- **Sheet rendering**: **OpenSheetMusicDisplay (OSMD)** inside a **WebView** (OSMD targets the web stack). The WebView hosts a small bridge bundle: load MusicXML string, render, expose **cursor** and **playback** hooks to native via `postMessage` / injected JS.
- **Audio**: **Synthesized from the score** in the same WebView context as OSMD (e.g. **Tone.js** + soundfont or similar) so **one musical clock** drives both **note onsets** and **cursor updates**. Avoid drifting dual clocks between native `AudioEngine` and OSMD unless lower latency on native is proven necessary.
- **State**: **Zustand** for app and PlayView state (pieces list, active piece, tempo, loop range, playback transport). No TanStack Query.
- **Styling**: **NativeWind** (Tailwind for React Native) throughout. **Light mode only**; dark mode is a non-goal.
- **Icons**: **MDI** (Material Design Icons) — no other icon sets.
- **Auth & cloud**: **Non-goal for MVP.** No Supabase, no login flow, no server-side user rows. Scores stay on-device.
- **Tooling**: **TypeScript (strict)**, **ESLint** + **Prettier**; tests for pure domain logic (Jest).

## Why WebView + OSMD

- OSMD is the most practical path for **MusicXML 2.x–4.x** rendering and **standard cursor** support in a RN app without maintaining native engraving.
- OSMD also drives the **title** display — scrape `work-title` / `movement-title` from XML on import; OSMD engraves it in the score header in PlayView.
- **Risk**: WebView ↔ RN bridge latency. Mitigation: keep **playback master** in one place (Web recommended for MVP), thin native UI shell.

## Module boundaries (suggested packages / folders)

| Area | Responsibility |
|------|----------------|
| `client/src/domain/` | Pure TS: Pieces, Bits, musical time, loop validation, tempo |
| `client/src/data/` | LocalPieceRepository, file pickers, XML cache |
| `client/src/state/` | Zustand stores (piecesStore, playViewStore) |
| `client/app/` | Expo Router screens (Dashboard, PlayView) |
| `client/components/` | Shared UI — NativeWind + MDI icons |
| `client/score-web/` | OSMD + Tone.js bundle, message protocol `{ type, payload }` |

## Message protocol (illustrative)

Define a **versioned** JSON schema between RN and WebView, e.g.:

- `LOAD_XML` — payload: string or base64 MusicXML
- `SET_TEMPO_BPM`
- `SET_LOOP` — continuous time range (see `features/playview.md`)
- `PLAY` / `PAUSE` / `SEEK`
- `CURSOR_TICK` / `NOTE_ON` (optional, for native metronome later)
- `ERROR` — parse/render failures

## Apple compatibility (while Android-only)

- Use **React Native** APIs supported on both platforms.
- File system: abstract storage behind an interface (`LocalPieceRepository`) so paths differ per OS later.

## Security & privacy

- **No MusicXML upload** in MVP reduces server-side copyright exposure.
- No server-side user data in MVP (no Supabase, no backend).

## Open technical choices (to resolve in first implementation PR)

- Exact **synth** library and **soundfont** size vs. APK size.
- Whether **WebView** hosts both OSMD + Tone.js or native audio is driven by **scheduled events** from WebView (second path is harder; default: all in Web).

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

## Build, CI, and distribution

- **Distribution**: a **signed APK attached to a GitHub Release**, installed by sideloading. **No
  Play Store in MVP** — no store account, no review latency, no staged rollout, and no Data Safety
  declarations. The trade-off is that users must enable unknown-source installs and there is no
  automatic update channel.
- **Signing**: the Android keystore lives with **EAS**, not in CI. Because releases are sideloaded,
  that key is the app's permanent identity — an install can only be upgraded in place by an APK
  signed with the same key.
- **Builds**: run on **EAS cloud** (`preview` profile → APK). CI never holds signing material. The
  free tier allows 15 Android builds per month, so builds are spent on releases only.
- **Version source of truth**: `client/package.json` `version`. `app.json`'s `expo.version` and the
  integer `android.versionCode` are **derived** from it, never hand-edited.
- **Release gate**: releases are cut by merging a release-please pull request, and published by a
  human after sideloading and smoke-testing the APK. Merging a feature PR ships nothing on its own.
- **Generated code**: `client/src/score-web/html.ts` (the bundled OSMD + Tone.js surface) is built
  at install time and is **not** in version control.

See [`../README.md`](../README.md#releasing) for the operator's view and
[`../compound-docs/release-pipeline.md`](../compound-docs/release-pipeline.md) for the traps.

## Why WebView + OSMD

- OSMD is the most practical path for **MusicXML 2.x–4.x** rendering and **standard cursor** support in a RN app without maintaining native engraving.
- OSMD also drives the **title** display — scrape `work-title` / `movement-title` from XML on import; OSMD engraves it in the score header in PlayView.
- **Risk**: WebView ↔ RN bridge latency. Mitigation: keep **playback master** in one place (Web recommended for MVP), thin native UI shell.

## Module boundaries (suggested packages / folders)

| Area | Responsibility |
|------|----------------|
| `client/src/domain/` | Pure TS: Pieces, Bits, musical time, loop validation, tempo, the instrument registry and detection |
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

- ~~Exact **synth** library and **soundfont** size vs. APK size.~~ Resolved: Tone.Sampler with
  bundled per-note MP3s, thinned to about one per minor third, ~2.4 MB for two instruments. See
  `features/instruments.md` § Audio.
- Whether **WebView** hosts both OSMD + Tone.js or native audio is driven by **scheduled events** from WebView (second path is harder; default: all in Web).

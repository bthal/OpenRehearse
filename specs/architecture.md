# Architecture

## High-level shape

- **Client**: **React Native** (TypeScript), **Android-first** for builds and store targets; structure and dependencies chosen so **iOS remains viable** with minimal rework (no Android-only APIs in shared core, use `Platform` sparingly, test on RN’s cross-platform abstractions).
- **Sheet rendering**: **OpenSheetMusicDisplay (OSMD)** inside a **WebView** (OSMD targets the web stack). The WebView hosts a small bridge bundle: load MusicXML string, render, expose **cursor** and **playback** hooks to native via `postMessage` / injected JS.
- **Audio**: **Synthesized from the score** in the same WebView context as OSMD **or** a tightly coupled sibling module so **one musical clock** drives both **note onsets** and **cursor updates**. Prefer a established stack (e.g. **Tone.js** + soundfont or similar) with a clear **tempo** parameter in BPM; avoid drifting dual clocks between native `AudioEngine` and OSMD unless we later prove lower latency on native.
- **State**: **Zustand** for app and PlayView state (pieces list, active piece, tempo, loop range, playback transport). Avoid TanStack Query for now; use simple `fetch`/Supabase client patterns or manual cache where needed.
- **Auth & optional cloud**: **Supabase Auth** for sign-in. **Supabase Postgres** for relational data **only when** we need server-side rows (e.g. user profile, entitlements). **Sheet XML content stays on device** per product decision — not uploaded as file blobs in MVP.
- **Tooling**: **TypeScript (strict)**, **ESLint** + **Prettier**; tests for pure domain logic (Vitest or Jest depending on RN template — document in repo when chosen).

## Why WebView + OSMD

- OSMD is the most practical path for **MusicXML 3.x** rendering and **standard cursor** support in a RN app without maintaining native engraving.
- **Risk**: WebView ↔ RN bridge latency. Mitigation: keep **playback master** in one place (Web recommended for MVP), thin native UI shell.

## Module boundaries (suggested packages / folders)

| Area | Responsibility |
|------|----------------|
| `domain/` | Piece, Bit, musical time (measure/beat or OSMD timestamps), loop validation, tempo |
| `native/` | RN screens (Dashboard, PlayView), navigation, file pickers, local DB |
| `score-web/` | OSMD + synth bundle, message protocol `{ type, payload }` |
| `integrations/supabase/` | Auth session, optional RPC; no score blob upload in MVP |

## Message protocol (illustrative)

Define a **versioned** JSON schema between RN and WebView, e.g.:

- `LOAD_XML` — payload: string or base64 MusicXML
- `SET_TEMPO_BPM`
- `SET_LOOP` — musical range (see `features/playview.md`)
- `PLAY` / `PAUSE` / `SEEK`
- `CURSOR_TICK` / `NOTE_ON` (optional, for native metronome later)
- `ERROR` — parse/render failures

## Apple compatibility (while Android-only)

- Use **React Native** APIs supported on both platforms.
- Avoid **Google-only** auth flows without an Apple-ready story if we ever ship iOS (Supabase + OAuth is fine; document provider matrix in `features/auth.md`).
- File system: abstract storage behind an interface (`LocalPieceRepository`) so paths differ per OS later.

## Security & privacy

- **No MusicXML upload** in MVP reduces server-side copyright exposure.
- Supabase: store only what is necessary (user id, email, optional settings). **No score content** on server unless explicitly re-scoped later with legal review.

## Open technical choices (to resolve in first implementation PR)

- Exact **synth** library and **soundfont** size vs. APK size.
- Whether **WebView** hosts both OSMD + Tone.js or native audio is driven by **scheduled events** from WebView (second path is harder; default: all in Web).

# Agent guide (coding agents)

This is the single agent guide for the repository — Claude Code, Cursor and anything else read
this file. There is deliberately no `CLAUDE.md`.

This repository uses **`specs/`** as the source of truth for product intent and technical direction. **Read it before large or ambiguous changes.**

## What this is

Practice companion for instrumentalists: import MusicXML, render the score via OSMD, synthesize
audio from the notation, keep the OSMD cursor aligned with playback, and loop one active passage (a
"bit") for focused repetition. Piano and Bb clarinet ship; a piece carries its instrument, the part
being practised, and its transposition. Offline — sample sets are bundled and nothing is fetched at
runtime. Scores stay on-device — never uploaded.

```
RN native shell (Expo Router screens, Zustand)
    └── WebView
            └── score-web bundle (OSMD + Tone.js, one musical clock)
                    ↕ postMessage / injected JS
```

One transport drives both OSMD's cursor and Tone.js playback — there is no second clock to drift
against. Domain logic (loop bounds, BPM math, MusicXML validation) is pure TypeScript with no
RN/OSMD/Tone imports. See `specs/architecture.md` for the authoritative version.

## Required reading (by task)

| If you are working on… | Read first |
|------------------------|------------|
| Overall product & scope | `specs/overview.md`, `specs/mission.md` |
| Stack & boundaries | `specs/architecture.md` |
| Order of work | `specs/roadmap.md` |
| Screens & flows | `specs/features/dashboard.md`, `specs/features/playview.md` |
| Practice-time tracking & heatmap | `specs/features/dashboard.md`, `compound-docs/practice-tracking.md` |
| Settings & count-in | `specs/features/settings.md`, `compound-docs/tone-playback.md` (count-in) |
| Files & MusicXML | `specs/features/import.md`, `compound-docs/expo-rn-setup.md` (picker & SAF traps) |
| Sections: detection, user editing & the PlayView label | `specs/features/section-detection.md`, `compound-docs/osmd-webview.md` |
| Bits (saved loops), the marker strip & the bit toolbar | `specs/features/playview.md`, `specs/features/pieces-domain.md`, `compound-docs/osmd-webview.md` |
| Play-surface overlays & animation | `specs/features/playview.md`, `compound-docs/expo-rn-setup.md` |
| Local data & offline | `specs/features/offline-storage.md` |
| Audio + cursor sync | `specs/features/playback-synthesis.md`, `specs/features/playview.md`, `compound-docs/tone-playback.md` |
| State & domain | `specs/features/pieces-domain.md` |
| Warm-up exercises | `specs/features/warmup.md`, `compound-docs/settings-persistence.md` (the measure-count memo key) |
| Instruments, transposition, part selection | `specs/features/instruments.md` |
| Routines (build + playback) | `specs/features/warmup.md` (Routines section) |
| Adding a persisted setting | `compound-docs/settings-persistence.md` |
| Samples, sounding pitch, offline audio | `specs/features/instruments.md` § Audio, `compound-docs/tone-playback.md` |
| Colours, typography, logo, icons | `specs/brand.md`, `compound-docs/brand-assets.md` |

## Module map (where code goes)

| Path | Responsibility |
|------|----------------|
| `specs/` | Product intent, acceptance criteria, MVP boundaries — **authority for what to build** |
| `compound-docs/` | Implementation memory (landmines, failed approaches) — **authority for how not to break things** |
| `client/src/domain/` | Pure TypeScript: loop math, MusicXML validation, tempo, ties, complexity caps — **no** Tone/OSMD/React |
| `client/src/data/` | `LocalPieceRepository`, XML cache, file pickers — storage adapters |
| `client/src/state/` | Zustand stores — one `*Store.ts` per concern (see the directory for the current set) |
| `client/src/i18n/` | String catalogue (`locales/en.json`) and i18next init — import as side-effect only |
| `client/score-web/` | OSMD surface, playback controller, cursor/loop web UI, Tone.js integration — **web-only**; outside the app tsconfig and untested, so keep pure logic out of it |
| `client/src/score-web/` | The native↔WebView seam: message protocol, generated `html.ts`, and pure WebView logic that needs typechecking and tests |
| `client/app/` | Expo Router screens (Dashboard, PlayView route) |
| `client/components/` | Shared UI (`AppIcon`, toolbars, modals) — NativeWind + MDI icons |
| `client/assets/brand/` | Logo marks, lockups, and the unmodified CC BY reference — **generated**, do not hand-edit |
| `scripts/brand/` | Generators for the brand assets + the palette contrast check |

Dependency flow: **screens → score-web / state → domain**. Domain never imports from score-web or app layers.

## Commands (from repo root unless noted)

All app scripts run from **`client/`** (see [`README.md`](README.md) for full detail).

| Command | Purpose |
|---------|---------|
| `npm ci` (repo root) | Install commitlint + husky; activates the git hooks |
| `npm run sync-version` (repo root) | Sync `client/app.json` version + versionCode from `client/package.json` |
| `npm run sync-version:check` (repo root) | Fail if they have drifted (same check CI runs) |
| `cd client && npm ci` | Install app dependencies |
| `cd client && npm run android` | Start Metro + launch on Android device/emulator |
| `cd client && npm run lint` | ESLint |
| `cd client && npm run format:check` | Prettier check |
| `cd client && npm run typecheck` | `tsc --noEmit` |
| `cd client && npm run test` | Jest unit tests |
| `cd client && npm run bundle:score-web` | Rebuild the WebView bundle only (no reinstall) |
| `cd client && npm run ci` | lint + format + typecheck + test + score-web bundle |

## Commit messages

Conventional Commits, enforced by commitlint at the repo root (`commitlint.config.mjs` wired
through `.husky/commit-msg`). Run `npm ci` at the root once to activate the hooks.

Allowed types: `wip feat fix chore docs refactor test perf specs build ci`. `revert` and `style`
are **not** allowed — a `git revert` needs its generated message rewritten as `fix:` or `chore:`.

**Every line must be ≤ 100 characters** — the hook rejects long body lines, not just long headers.
Use multiple `-m` flags, one short sentence each. Do not amend on hook failure; fix it and make a
new commit.

```bash
git commit -m "feat(playview): add BPM stepper" \
  -m "Wire Zustand tempoBpm slice to the WebView SET_TEMPO_BPM message." \
  -m "Default 80 BPM; clamp 20–240."
```

**PRs are squash-merged**, so the PR title becomes the commit on `main`. CI lints it, and
release-please builds the changelog from it. Only `feat`, `fix` and `perf` produce a release.

The `pre-commit` hook runs the full `cd client && npm run ci`, but only when the commit touches
`client/`.

## CI and releases

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/ci.yml` | every PR + push to `main` | `client` quality gate, version sync |
| `.github/workflows/pr-title.yml` | PR opened/**edited**/synchronised | Conventional-Commit lint on the PR title (separate so a rename re-runs it) |
| `.github/workflows/release.yml` | push to `main`; `workflow_dispatch` for recovery | Maintains the release PR; on merge, tags, builds an APK on EAS and attaches it to a **draft** release |
| `.github/workflows/release-pr-sync.yml` | release-please PRs | Writes `client/app.json` version + versionCode into the release PR |

Two invariants worth knowing before you touch anything here:

- **`client/src/score-web/html.ts` is generated, gitignored, and must never be committed.** It is
  1.5 MB of bundled OSMD + Tone.js, rebuilt from `client/score-web/src/` by `postinstall` (and by
  `eas-build-post-install` on EAS). After editing anything under `client/score-web/src/`, run
  `cd client && npm run bundle:score-web` to see your change locally. `npm run ci` now ends with
  that same bundle step: `score-web/**` is outside tsc and Jest, so building it is the *only*
  check it gets, and without it a broken bundle reaches CI untouched. See
  [`compound-docs/release-pipeline.md`](compound-docs/release-pipeline.md) for why it works this way.
  Being gitignored also means **the bundle does not follow your branch** — a `git checkout` swaps
  `score-web/src/` and leaves the built `html.ts` behind, so the WebView can run code arbitrarily
  older than the native side calling into it. That fails partially and quietly: globals the old
  bundle already had still work, so the score loads and plays while the newer ones are missing,
  and `injectJavaScript` reports it only as an opaque `SCRIPT ERR: Script error. @0:0`. Two guards
  now exist — `prestart`/`preandroid`/`preios`/`preweb`/`preclear` rebuild before Metro starts, and
  `injectInstrumentAudio` checks for its global and surfaces an `ERROR` naming the fix. See the
  landmine section in [`compound-docs/osmd-webview.md`](compound-docs/osmd-webview.md).
- **`client/package.json` `version` is the single source of truth.** release-please edits only that
  file; `scripts/sync-app-version.mjs` derives `app.json`'s `version` and the integer
  `android.versionCode` (`major*10000 + minor*100 + patch`) from it. Never hand-edit `app.json`
  version fields.

Releasing is documented for humans in [`README.md`](README.md#releasing).

## Documentation update matrix

When your change affects… | Update…
---|---
User-visible behavior or MVP scope | Relevant `specs/features/*.md` (+ acceptance checkboxes)
Architecture, stack, or folder boundaries | `specs/architecture.md`, this file's module map
OSMD/Tone/loop/sync landmines or new traps | `compound-docs/` (create or update relevant doc)
Setup, scripts, Node version | `README.md`
Colours, typography, the logo, or app icons | `specs/brand.md` (+ `compound-docs/brand-assets.md` for new traps), and re-run `scripts/brand/palette.py`
Bundling a third-party asset or font | `THIRD_PARTY_NOTICES.md` — check the licence's attribution terms
CI, release pipeline, versioning | `README.md` (Releasing), this file's CI section
Agent routing, non-negotiables, required reading | This file (`AGENTS.md`)

The `/commit` command runs a guided pass over all of this: assess scope → read files → **propose edits → apply after user approval** → **`cd client && npm run ci`** when `client/` code changed → **git commit** (Conventional Commits + commitlint at repo root).

## Non-negotiables from specs

- **MusicXML**: **`.xml`** (uncompressed) and **`.mxl`** (compressed); both **2.x–4.x**; reject other formats clearly.
- **Scores**: **local device only** in MVP — **do not** upload MusicXML to any server.
- **Instruments**: `INSTRUMENT_REGISTRY` (`src/domain/instrumentRegistry.ts`) is the **only**
  enumeration — never switch on an instrument name. It owns the sample set, written range,
  staff layout, sounding interval and exercise list. Playback sounds the **sounding** pitch, not the
  written one. Sample sets are **bundled**, never fetched. Other parts of a multi-part score are
  **filtered, never stripped** — the XML is stored whole. A `staffLayout: 'single'` instrument may
  only be assigned to a **monophonic** part (no `<staves>` > 1, no `<chord/>`, one `<voice>`), the
  selection is **refused rather than reduced**, and a piece's instrument and part are **immutable
  after import**. The dashboard's instrument scope is a **view filter** over that screen only.
- **Loops**: **one** active loop; handles **continuously draggable** but **discretised to the note
  grid** (bounds are half-open `[A, B)`, minimum one quarter note); **immediate jump** at wrap.
  Saved loops ("**bits**") do not change that: a bit is *stored bounds plus practice settings*,
  and an armed bit owns the one active loop — there is never both a loop and a bit. A bit's
  handles are drawn but **inert**; bits have no edit, only delete-and-redraw. Persisted bounds
  are **ticks**, never pixels. See `specs/features/playview.md` § "Bits (saved loops)".
- **Cursor**: **OSMD standard cursor**, **smooth continuous movement** — prefer OSMD APIs over custom
  overlays. Manual positioning is continuous but resolves to a **note onset**, previewed by a guide
  line and settled with a glide — so playback never has to correct the position.
- **Note grid**: a measure's first onset is anchored to its **barline**, and that pixel
  (`CursorStep.pxLeft`) is shared by snapping, the overlays, the section seams and every *resting*
  position. **Never split those apart.** Playback motion is the one exception: it reads
  `CursorStep.notePxLeft` via `motionPxLeft`, and re-anchors only at a loop's A and at the step a
  fresh start began on — see `compound-docs/tone-playback.md`.
- **Tempo**: user-adjustable **from the first PlayView slice** that includes playback.
- **State**: **Zustand** (not TanStack Query) unless specs are formally amended.
- **Orientation**: PlayView → **landscape**; Dashboard → **portrait**. `app.json` uses `"default"`; each screen locks via `<Stack.Screen options>` (react-native-screens, no extra package).
- **Styling**: **NativeWind** throughout; **light mode only** — dark mode is a non-goal.
- **"Is it playing?" is `isPlaybackActive()`, never `Tone.Transport.state === 'started'`.** A
  count-in schedules the transport to start in the *future*, so the state getter reads `'stopped'`
  for the whole pre-roll — and again while `startPlayback` awaits the sample load. Both windows look
  like playback to the user. See `compound-docs/tone-playback.md`.
- **The tick you hand Tone is not the tick Tone stores.** Tone converts every tick position
  through seconds and back, floors the result, and adds the lost fraction to the audio time — so a
  note sounds on the beat but is *filed* up to one tick early. **Never compare a transport position
  against a musical tick**: read the filed tick from `gridTransportTicks`, and take loop bounds from
  `domain/transportTicks.ts`. Left uncorrected a loop's first note never sounds and its last one
  sounds on every pass. See `compound-docs/tone-playback.md`.
- **A scheduled audio event cannot be taken back.** Tone schedules ahead of the playhead, and a
  click is a raw Web Audio node started at a future time — `Transport.stop()` does not unschedule
  it. Anything that must not sound has to be **refused when it is scheduled**, inside the callback
  and against the event's own tick, never by stopping the transport later. Stopping from the RAF
  loop is doubly wrong: it is a frame late by construction and does not run at all when frames are
  throttled. See `compound-docs/tone-playback.md`.
- **Animation**: RN core `Animated` with **`useNativeDriver: false`**. Not a preference — a
  native-driven transform falls back to React's last committed value when it completes, which
  flickers on any component that does not re-render mid-animation. `react-native-reanimated` is
  installed but imported nowhere. See `compound-docs/expo-rn-setup.md`.
- **Play surfaces run edge to edge** — PlayView and warm-up are deliberately **not** wrapped in
  `SafeAreaView`; insetting them pads the screen in that view's own white, a blank band beside a
  landscape camera cutout. Overlays that must clear the cutout apply the insets themselves.
- **Icons**: **MDI only** — no other icon libraries.
- **Auth**: **non-goal for MVP** — no Supabase, no login flow.
- **Lint/format**: **ESLint** + **Prettier** must stay clean for touched files.
- **Platform**: **Android-first**; avoid Android-only patterns in shared code; keep **iOS viability** in mind.

## Workflow expectations

1. **Small diffs** — one logical change per PR/commit when possible.
2. **Tests** — add unit tests for **pure** logic (loop bounds, BPM math, XML validation helpers). E2E when the project has harness set up.
3. **Types** — `strict` TypeScript; avoid `any`; if unavoidable, comment **why** briefly.
4. **Strings** — every user-visible string must live in `client/src/i18n/locales/en.json` and be accessed via `t()` from `useTranslation()` (react-i18next). Never hard-code display text in `.tsx` files. Helper functions outside the component that need `t` should accept it as a parameter typed with a local alias (e.g. `type TFn = (key: string, opts?: Record<string, unknown>) => string`). Use i18next plural suffixes (`_one`, `_other`) with `{{count}}` interpolation for count-dependent labels; use `{{name}}` for other interpolations. MusicXML content (part names, element values) is not display text — those strings stay in the domain layer.
5. **Comments and human-readable docs** — Explain **why** something exists, **what constraints or invariants** matter, and **tradeoffs**, not a play-by-play of what each line does. When you change behavior, public contracts, or operational boundaries, **update the docs that future readers rely on** in the same change (especially **`specs/`** when product or architecture intent shifts; **`compound-docs/`** when implementation traps change; short README or module-level notes when setup or integration context would otherwise be tribal knowledge). Prefer one clear paragraph over scattered obvious comments; skip duplicating spec prose inside code unless a local pointer saves repeated confusion.
6. **Ambiguity** — if specs conflict with reality (OSMD API limits, etc.), **prefer updating `specs/` in the same change** with a short note rather than silent drift.

## When extending scope

- New user-visible behavior should be reflected in **`specs/features/*.md`** and **`specs/roadmap.md`** in the same effort (or ask the maintainer if product-only).

## Out of scope (do not implement without explicit spec update)

- Social / multiplayer features.
- Microphone or MIDI **evaluation** of user playing.
- Uploading or syncing **full scores** to the cloud (forbidden in MVP per specs).
- **Auth** of any kind (Supabase or otherwise) — non-goal for MVP.
- **Dark mode**.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.

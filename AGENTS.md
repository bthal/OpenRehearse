# Agent guide (coding agents)

This repository uses **`specs/`** as the source of truth for product intent and technical direction. **Read it before large or ambiguous changes.**

**Do not implement from** [`SUDELBUCH.md`](SUDELBUCH.md) — it is an idea scratch pad.

## Required reading (by task)

| If you are working on… | Read first |
|------------------------|------------|
| Overall product & scope | `specs/overview.md`, `specs/mission.md` |
| Stack & boundaries | `specs/architecture.md` |
| Order of work | `specs/roadmap.md` |
| Screens & flows | `specs/features/dashboard.md`, `specs/features/playview.md` |
| Settings & count-in | `specs/features/settings.md`, `compound-docs/tone-playback.md` (count-in) |
| Files & MusicXML | `specs/features/import.md` |
| Local data & offline | `specs/features/offline-storage.md`, `client/docs/offline-qa.md` |
| Audio + cursor sync | `specs/features/playback-synthesis.md`, `specs/features/playview.md` |
| State & domain | `specs/features/pieces-domain.md` |
| Warm-up exercises | `specs/features/warmup.md` |
| Routines (build + playback) | `specs/features/warmup.md` (Routines section) |

## Module map (where code goes)

| Path | Responsibility |
|------|----------------|
| `specs/` | Product intent, acceptance criteria, MVP boundaries — **authority for what to build** |
| `compound-docs/` | Implementation memory (landmines, failed approaches) — **authority for how not to break things** |
| `client/src/domain/` | Pure TypeScript: loop math, MusicXML validation, tempo, ties, complexity caps — **no** Tone/OSMD/React |
| `client/src/data/` | `LocalPieceRepository`, XML cache, file pickers — storage adapters |
| `client/src/state/` | Zustand stores (`piecesStore`, `playViewStore`, `routinesStore`, `settingsStore`) |
| `client/src/i18n/` | String catalogue (`locales/en.json`) and i18next init — import as side-effect only |
| `client/score-web/` | OSMD surface, playback controller, cursor/loop web UI, Tone.js integration — **web-only** |
| `client/app/` | Expo Router screens (Dashboard, PlayView route) |
| `client/components/` | Shared UI (`AppIcon`, toolbars, modals) — NativeWind + MDI icons |
| `client/docs/` | Manual QA checklists (`offline-qa.md`) |

Dependency flow: **screens → score-web / state → domain**. Domain never imports from score-web or app layers.

## Commands (from repo root unless noted)

All app scripts run from **`client/`** (see [`README.md`](README.md) for full detail).

| Command | Purpose |
|---------|---------|
| `cd client && npm ci` | Install app dependencies |
| `cd client && npm run android` | Start Metro + launch on Android device/emulator |
| `cd client && npm run lint` | ESLint |
| `cd client && npm run format:check` | Prettier check |
| `cd client && npm run typecheck` | `tsc --noEmit` |
| `cd client && npm run test` | Jest unit tests |
| `cd client && npm run ci` | lint + format + typecheck + test |

Commit messages: Conventional Commits via commitlint at repo root (`feat:`, `fix:`, `specs:`, …).

## Documentation update matrix

When your change affects… | Update…
---|---
User-visible behavior or MVP scope | Relevant `specs/features/*.md` (+ acceptance checkboxes)
Architecture, stack, or folder boundaries | `specs/architecture.md`, this file's module map
OSMD/Tone/loop/sync landmines or new traps | `compound-docs/` (create or update relevant doc)
Setup, scripts, Node version | `README.md`
Offline / static-export QA steps | `client/docs/offline-qa.md`
Agent routing, non-negotiables, required reading | This file (`AGENTS.md`)

Use the **commit** Cursor command (`.cursor/commands/commit.md`) for a guided pass: assess scope → read files → **propose edits → apply after user approval** → **`cd client && npm run ci`** when `client/` code changed → **git commit** (Conventional Commits + commitlint at repo root).

## Non-negotiables from specs

- **MusicXML**: **`.xml`** (uncompressed) and **`.mxl`** (compressed); both **2.x–4.x**; reject other formats clearly.
- **Scores**: **local device only** in MVP — **do not** upload MusicXML to any server.
- **Loops**: **one** active loop; handles **continuously draggable**; **immediate jump** at wrap.
- **Cursor**: **OSMD standard cursor**, **smooth continuous movement** — prefer OSMD APIs over custom overlays.
- **Tempo**: user-adjustable **from the first PlayView slice** that includes playback.
- **State**: **Zustand** (not TanStack Query) unless specs are formally amended.
- **Orientation**: PlayView → **landscape**; Dashboard → **portrait**. `app.json` uses `"default"`; each screen locks via `<Stack.Screen options>` (react-native-screens, no extra package).
- **Styling**: **NativeWind** throughout; **light mode only** — dark mode is a non-goal.
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
- Anything listed only in **`SUDELBUCH.md`**.

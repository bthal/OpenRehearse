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
| Files & MusicXML | `specs/features/import.md` |
| Local data & offline | `specs/features/offline-storage.md`, `client/docs/offline-qa.md` |
| Audio + cursor sync | `specs/features/playback-synthesis.md`, `specs/features/playview.md`, **`compound-docs/playback-osmd-tone.md`** |
| Auth | `specs/features/auth.md` |
| State & domain | `specs/features/pieces-domain.md` |

## Module map (where code goes)

| Path | Responsibility |
|------|----------------|
| `specs/` | Product intent, acceptance criteria, MVP boundaries — **authority for what to build** |
| `compound-docs/` | Implementation memory (landmines, failed approaches) — **authority for how not to break things** |
| `client/src/domain/` | Pure TypeScript: loop math, MusicXML validation, tempo, ties, complexity caps — **no** Tone/OSMD/React |
| `client/src/data/` | `LocalPieceRepository`, IndexedDB/XML cache, file pickers — storage adapters |
| `client/src/state/` | Zustand stores (`piecesStore`, `playViewStore`, `authStore`) |
| `client/score-web/` | OSMD surface, playback controller, cursor/loop web UI, Tone.js integration — **web-only** |
| `client/app/` | Expo Router screens (Dashboard, PlayView route, auth) |
| `client/components/` | Shared UI (`AppIcon`, toolbars, modals) |
| `client/integrations/supabase/` | Auth client, session storage — **no score blobs** |
| `client/docs/` | Manual QA checklists (`offline-qa.md`) |

Dependency flow: **screens → score-web / state → domain**. Domain never imports from score-web or app layers.

## Commands (from repo root unless noted)

All app scripts run from **`client/`** (see [`README.md`](README.md) for full detail).

| Command | Purpose |
|---------|---------|
| `cd client && npm ci` | Install app dependencies |
| `cd client && npm run web` | Dev server (Metro, port **8888**) |
| `cd client && npm run fetch-samples` | Download Salamander piano MP3s into `public/` |
| `cd client && npm run export:web` | Static web build → `client/dist/` |
| `cd client && npm run lint` | ESLint |
| `cd client && npm run format:check` | Prettier check |
| `cd client && npm run typecheck` | `tsc --noEmit` |
| `cd client && npm run test` | Jest unit tests |
| `cd client && npm run ci` | lint + format + typecheck + test |
| `docker compose run --rm ci` | Same checks in fixed Node image (optional) |

Commit messages: Conventional Commits via commitlint at repo root (`feat:`, `fix:`, `specs:`, …).

## Documentation update matrix

When your change affects… | Update…
---|---
User-visible behavior or MVP scope | Relevant `specs/features/*.md` (+ acceptance checkboxes)
Architecture, stack, or folder boundaries | `specs/architecture.md`, this file’s module map
OSMD/Tone/loop/sync landmines or new traps | `compound-docs/playback-osmd-tone.md` (or new compound-doc)
Setup, scripts, Node version, Docker CI | `README.md`
Offline / static-export QA steps | `client/docs/offline-qa.md`
Agent routing, non-negotiables, required reading | This file (`AGENTS.md`)

Use the **commit** Cursor command (`.cursor/commands/commit.md`) for a guided pass: assess scope → read files → **propose edits → apply after user approval** → **git commit** (Conventional Commits + commitlint at repo root).

## Non-negotiables from specs

- **MusicXML**: uncompressed **`.xml`**, **3.x** only; reject other formats clearly.
- **Scores**: **local device only** in MVP — **do not** upload MusicXML to Supabase or arbitrary servers.
- **Loops**: **one** active loop; boundaries **between notes**; **immediate jump** at wrap.
- **Cursor**: **OSMD standard cursor** — prefer OSMD APIs over custom overlays.
- **Tempo**: user-adjustable **from the first PlayView slice** that includes playback.
- **State**: **Zustand** (not TanStack Query) unless specs are formally amended.
- **Lint/format**: **ESLint** + **Prettier** must stay clean for touched files.
- **Platform**: **Android-first**; avoid Android-only patterns in shared code; keep **iOS viability** in mind.

## Workflow expectations

1. **Small diffs** — one logical change per PR/commit when possible.
2. **Tests** — add unit tests for **pure** logic (loop bounds, BPM math, XML validation helpers). E2E when the project has harness set up.
3. **Types** — `strict` TypeScript; avoid `any`; if unavoidable, comment **why** briefly.
4. **Comments and human-readable docs** — Explain **why** something exists, **what constraints or invariants** matter, and **tradeoffs**, not a play-by-play of what each line does. When you change behavior, public contracts, or operational boundaries, **update the docs that future readers rely on** in the same change (especially **`specs/`** when product or architecture intent shifts; **`compound-docs/`** when implementation traps change; short README or module-level notes when setup or integration context would otherwise be tribal knowledge). Prefer one clear paragraph over scattered obvious comments; skip duplicating spec prose inside code unless a local pointer saves repeated confusion.
5. **Secrets** — never commit Supabase service keys; use env / local config templates only.
6. **Ambiguity** — if specs conflict with reality (OSMD API limits, etc.), **prefer updating `specs/` in the same change** with a short note rather than silent drift.

## When extending scope

- New user-visible behavior should be reflected in **`specs/features/*.md`** and **`specs/roadmap.md`** in the same effort (or ask the maintainer if product-only).

## Out of scope (do not implement without explicit spec update)

- Social / multiplayer features.
- Microphone or MIDI **evaluation** of user playing.
- Uploading or syncing **full scores** to the cloud (forbidden in MVP per specs).
- Anything listed only in **`SUDELBUCH.md`**.

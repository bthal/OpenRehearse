# Agent guide (coding agents)

This repository uses **`specs/`** as the source of truth for product intent and technical direction. **Read it before large or ambiguous changes.**

## Required reading (by task)

| If you are working on… | Read first |
|------------------------|------------|
| Overall product & scope | `specs/overview.md`, `specs/mission.md` |
| Stack & boundaries | `specs/architecture.md` |
| Order of work | `specs/roadmap.md` |
| Screens & flows | `specs/features/dashboard.md`, `specs/features/playview.md` |
| Files & MusicXML | `specs/features/import.md` |
| Local data & offline | `specs/features/offline-storage.md` |
| Audio + cursor sync | `specs/features/playback-synthesis.md`, `specs/features/playview.md` |
| Auth | `specs/features/auth.md` |
| State & domain | `specs/features/pieces-domain.md` |

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
4. **Comments** — explain **why** and tradeoffs, not what the code literally does.
5. **Secrets** — never commit Supabase service keys; use env / local config templates only.
6. **Ambiguity** — if specs conflict with reality (OSMD API limits, etc.), **prefer updating `specs/` in the same change** with a short note rather than silent drift.

## When extending scope

- New user-visible behavior should be reflected in **`specs/features/*.md`** and **`specs/roadmap.md`** in the same effort (or ask the maintainer if product-only).

## Out of scope (do not implement without explicit spec update)

- Social / multiplayer features.
- Microphone or MIDI **evaluation** of user playing.
- Uploading or syncing **full scores** to the cloud (forbidden in MVP per specs).

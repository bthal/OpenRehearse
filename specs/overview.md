# Overview

## What the app does

1. **Dashboard** — Lists the user’s **pieces** and offers **import** of new scores (uncompressed MusicXML 3.x, `.xml`).
2. **PlayView** — Renders the score (via OpenSheetMusicDisplay), plays **synthesized** audio from the score, shows the **OSMD standard cursor**, and supports **one active loop** (“**bit**”) at a time. **Tempo is adjustable** from the first implementation.

## Terminology

| Term | Meaning |
|------|--------|
| **Piece** | One musical work in the user’s library (imported from MusicXML). |
| **Bit** | A contiguous segment of a piece used as the **single active loop** for practice (e.g. two measures or a short phrase). |

## MVP boundaries

- **One active loop** only (no multiple saved bits in MVP unless roadmap promotes it).
- **Loop behavior**: loop endpoints sit **between notes** (musical boundaries, not mid-note); on loop wrap, **immediate jump** back to the start of the bit.
- **Cursor**: **OSMD standard cursor** — follow OSMD’s built-in cursor API and timing integration rather than a custom overlay.
- **Import**: **Uncompressed MusicXML 3.x** (`.xml`) only — reject or clearly error on `.mxl`, compressed packages, or unsupported versions.
- **Audio**: **Synthesized from the score** (not user-provided MP3). Same clock/timeline as cursor where technically feasible.
- **Offline**: **Good offline support** — pieces and playback should work without network once imported; see `features/offline-storage.md`.
- **Scores on server**: **Not in MVP** — store scores **locally on the device** only; **no cross-device sync** of sheet files for now (reduces copyright surface and product scope). Supabase may still store **minimal metadata** if we add cloud features later; see `architecture.md`.

## Explicit non-goals

- Social / multiplayer / sharing between users.
- Microphone or MIDI **listening** to judge performance quality.
- Owning custom auth protocol design — **Supabase Auth** is the chosen path; agents wire it per `features/auth.md`.

## Future (not MVP)

- Speed presets, hierarchical bits, Anki-like training, other instruments (e.g. clarinet — single note line). These inform **modularity** now but are **out of scope** for first delivery unless `roadmap.md` pulls them in.

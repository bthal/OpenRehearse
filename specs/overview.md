# Overview

## What the app does

1. **Dashboard** — Lists the user's **pieces** and offers **import** of new scores (uncompressed MusicXML 2.x–4.x, `.xml`). A header control scopes the whole screen — warm-ups, routines and pieces — to one instrument or to all of them; it filters that screen and nothing else.
2. **PlayView** — Renders the score (via OpenSheetMusicDisplay), plays **synthesized** audio from the score, shows the **OSMD standard cursor** moving smoothly, displays the **piece title** engraved by OSMD, and supports **one active loop** ("**bit**") at a time. **Tempo is adjustable** from the first implementation.

## Terminology

| Term | Meaning |
|------|--------|
| **Piece** | One musical work in the user's library (imported from MusicXML). |
| **Bit** | A contiguous segment of a piece used as the **single active loop** for practice (e.g. two measures or a short phrase). |
| **Instrument** | What a piece or routine is practised on — piano or Bb clarinet. Decides the samples, the sounding pitch, the staff layout and which exercises exist. Settled at import and fixed thereafter; a one-line instrument only takes a one-line part. See `features/instruments.md`. |
| **Reading transposition** | Semitones added to the engraved score so it reads on your instrument. Derived at import; distinct from the practice transposition you choose yourself. |

## MVP boundaries

- **One active loop** only (no multiple saved bits in MVP unless roadmap promotes it).
- **Loop behavior**: loop handles are **continuously draggable** to any position; on loop wrap, **immediate jump** back to the start of the bit.
- **Cursor**: **OSMD standard cursor**, moving **smoothly** with playback — not jumping discretely per note.
- **Import**: **Uncompressed MusicXML 2.x–4.x** (`.xml`) only — reject or clearly error on `.mxl`, compressed packages, or unsupported formats.
- **Audio**: **Synthesized from the score** (not user-provided MP3). Same clock/timeline as cursor where technically feasible.
- **Offline**: **Good offline support** — pieces and playback should work without network once imported; see `features/offline-storage.md`.
- **Scores on server**: **Not in MVP** — store scores **locally on the device** only; **no cross-device sync** of sheet files for now.
- **Orientation**: **Landscape only** — the entire app is locked to landscape. Sheet music needs horizontal space; portrait is a non-goal.
- **Styling**: **NativeWind** (Tailwind for React Native) throughout. **Light mode only**; dark mode is a non-goal.
- **Icons**: **MDI** (Material Design Icons) only.
- **Title display**: scrape title from MusicXML metadata on import; engrave it in PlayView via OSMD.

## Explicit non-goals

- Social / multiplayer / sharing between users.
- Microphone or MIDI **listening** to judge performance quality.
- **Auth** and cloud sync — non-goal for MVP; scores are local only.
- **Dark mode**.

## Future (not MVP)

- Speed presets, hierarchical bits, Anki-like training. These inform **modularity** now but are **out of scope** for first delivery unless `roadmap.md` pulls them in.
- **Further instruments** beyond piano and Bb clarinet, and sounding the parts you are *not* practising as accompaniment. Both are designed for — see `features/instruments.md` — neither is built.

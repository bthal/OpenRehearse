---
tags: [osmd, tone, playback, cursor, loop, tempo, metronome]
category: reference
---

# Playback, OSMD & Tone.js — Field Notes

**Date:** 2026-05-19 | **Owners:** `client/score-web/`, `client/src/domain/` (portable logic only)

## Summary

Field notes on the web PlayView playback stack: OpenSheetMusicDisplay (notation + cursor element), Tone.js Transport (master clock), Salamander piano samples, loop clipping, and smooth cursor interpolation. Use this when changing anything that touches **timing**, **cursor position**, **audio scheduling**, or **loop wrap**.

Product rules live in `specs/features/playview.md` and `specs/features/playback-synthesis.md`. This doc captures **non-obvious implementation choices** and **landmines**.

## Architecture (one clock)

```
OSMD render + cursor iterator
        ↓ buildPlaybackSteps (once per score load / cache miss)
PlaybackStep[]  { timeMs, durationMs, frequenciesHz, cursorLayout, stepIndex, … }
        ↓ clip + optional loop-end boundary step
activeSteps → Tone.Part (audio) + SmoothCursorDriver (visual, RAF + Transport time)
        ↑
Tone.Transport  ← single master timeline (ms via seconds * 1000)
```

- **Web MVP:** OSMD, Tone, and the React shell share **one browser JS context** — no WebView bridge (`specs/architecture.md`).
- **Loop overlay** (`score-web/loop/`) is **selection/visual only**. Clip, wrap, synth scheduling, and transport seek live in `scorePlaybackController.web.ts` + portable `src/domain/playbackLoop.ts`.

## Key decisions

- **`Tone.Transport` is the master clock.** Cursor pixel position is derived each animation frame from transport elapsed time (`SmoothCursorDriver`), interpolating between precomputed `cursorLayout` snapshots per iterator step. Audio events are scheduled on the same timeline via `Tone.Part`.
- **Iterator `cursor.next()` only when the active step index changes** — not every frame. Calling `next()` every RAF desynchronizes layout from interpolation and is expensive on large scores.
- **User BPM drives the timeline; score tempo markings are ignored during build.** `buildPlaybackSteps` sets `sheet.IgnoreTempoInstructions = true` and computes wall time from the user’s session BPM (40–240). Playback speed segments (0.5× / 0.75× / 1.0×) multiply that base (`tempoBpmForPlaybackSpeed` in `src/domain/tempoBpm.ts`).
- **Speed change rescales cached steps — no second OSMD walk.** `rescalePlaybackSteps` adjusts `timeMs` / `durationMs` only; geometry and pitch data are BPM-independent. Full `buildPlaybackSteps` runs again only on score remount or cache miss (`playbackStepCache.web.ts`).
- **Loops are half-open on step indices: `[startStepIndex, endStepIndex)`.** At least one step must lie inside the bit (`isValidBitRange` in `src/domain/bit.ts`). Drag-to-select uses `loopRangeFromAnchorSteps` (order-independent).
- **Loop wrap is immediate at transport level.** When `transport.seconds * 1000 >= loopEndMs`, `wrapLoop()` seeks transport to 0, releases stuck notes, and resyncs cursor + metronome — no ritardando across the boundary.
- **Silent boundary step at loop end for cursor reach.** Clipped steps omit the exclusive end index; `withLoopEndCursorBoundary` appends a zero-pitch step at `loopEndTimeMs` so the smooth cursor can reach handle B before wrap (`loopActiveSteps.web.ts`).
- **OSMD standard cursor, repainted — not a custom overlay for playback.** `applyOsmdCursorColor.web.ts` paints OSMD’s `<img>` cursor as a mauve pill over the full music-system band (+20% vertical protrusion). The loop highlight is a separate HTML layer.
- **Tie continuations must not retrigger synthesis.** Second and later noteheads in a tie are filtered in `buildPlaybackSteps` via `isTieContinuationNote`; tie starts use full tie duration for scheduling (`src/domain/playbackTie.ts`).
- **One shared Salamander sampler per tab.** `acquireSharedPianoSampler` / `releaseSharedPianoSampler` refcount avoids reloading MP3s on every piece open. Samples are same-origin under `client/public/audio/salamander/`.
- **Portable domain logic stays in `client/src/domain/`.** Loop math, BPM helpers, tie detection, XML validation, complexity caps — **no** Tone/OSMD imports there (future native shells).

## Failed approaches / landmines

- **🎯 LANDMINE: Dual clocks (separate timers for cursor vs audio).** Any design that advances OSMD’s iterator on `setInterval` while Tone runs independently will drift. Never do: drive cursor from `performance.now()` without anchoring to `Tone.getTransport().seconds`.
- **🎯 LANDMINE: Re-walking OSMD on every speed-segment tap.** Large scores block the main thread for seconds. Use `reprepareAtTempo` + `rescalePlaybackSteps` with `preserveTransport: true` when the step cache is warm.
- **🎯 LANDMINE: Putting Tone/OSMD in `src/domain/`.** Breaks portability for future native targets. Keep web adapters in `score-web/`; keep pure functions in `domain/`.
- **🎯 LANDMINE: Loop end inclusive on the last note’s step index.** End handle sits on the **exclusive** boundary (first step *outside* the bit). Clip with `[start, end)`; use `loopEndTimeMs` for wrap time, not the last included note’s end unless at score end.
- **🎯 LANDMINE: Custom DOM cursor overlay instead of OSMD’s cursor element.** Spec requires OSMD standard cursor APIs. Loop handles are overlay; playback caret is OSMD’s element, repainted.
- **🎯 LANDMINE: Forgetting `sampler.releaseAll()` on loop wrap / stop.** Leaves hanging notes when transport seeks backward. `wrapLoop`, `stop`, and `pause` paths must release the sampler.
- **🎯 LANDMINE: Measuring cursor layout without clearing band height metadata.** `clearCursorBandHeightPx` before `readCursorLayout` during step build — stale pill metadata skews layout snapshots used for interpolation.
- **🎯 LANDMINE: Uploading MusicXML to Supabase or any server.** Forbidden in MVP (`specs/overview.md`, `AGENTS.md`). Local persistence only via `LocalPieceRepository` / IndexedDB on web.
- **Confusing import caps with playback caps.** Import rejects on `MAX_SCORE_MEASURES` / `MAX_SCORE_NOTES` (XML parse). Opening PlayView can still fail with `ScoreTooHeavyError` when OSMD iterator steps exceed `MAX_PLAYBACK_STEPS` — rests and chord splits inflate step count beyond raw note count.

## Gotchas

- **`buildPlaybackStepsAsync` yields to the main thread** (`setTimeout(0)`) in chunks so long scores show progress and avoid “page not responding”. Prefer async path on PlayView open for large-but-allowed scores.
- **Metronome clicks only while transport is started.** Pause/stop must silence clicks; enabling metronome while stopped applies on next Play (`metronomeEngine.web.ts`).
- **Metronome quarter resolution uses clipped `activeSteps`** so loop practice stays aligned with the visible timeline.
- **Repeats:** `ensurePlaybackHonorsRepeats` runs before the cursor walk — playback path should match engraved repeat structure.
- **Offline audio:** Salamander MP3s must be fetched (`npm run fetch-samples`) and served from `public/`; static export QA is in `client/docs/offline-qa.md` (Metro dev is not a valid offline test harness).

## Related files

| Area | Path |
|------|------|
| Playback controller | `client/score-web/playback/scorePlaybackController.web.ts` |
| Step build | `client/score-web/playback/buildPlaybackSteps.web.ts` |
| Smooth cursor | `client/score-web/playback/smoothCursorDriver.web.ts` |
| Loop clip (portable) | `client/src/domain/playbackLoop.ts`, `client/src/domain/bit.ts` |
| Tempo / rescale | `client/src/domain/tempoBpm.ts`, `client/src/domain/rescalePlaybackSteps.ts` |
| Loop overlay UI | `client/score-web/loop/LoopRegionOverlay.web.tsx` |
| PlayView state | `client/src/state/playViewStore.ts` |
| Specs | `specs/features/playview.md`, `specs/features/playback-synthesis.md` |

## When to append here

Add a **Failed Approaches** or **LANDMINE** entry when:

- OSMD or Tone behavior surprised you (layout, iterator, Transport state).
- A “simple” fix caused cursor/audio drift or loop wrap bugs.
- A reviewer suggestion would violate the one-clock or half-open loop model.

Cross-link the PR or commit in the new entry. Update `specs/` when **product** behavior changes; update this file when **implementation wisdom** changes.

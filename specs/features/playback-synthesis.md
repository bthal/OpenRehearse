# Feature: Playback & synthesis

## Goal

Play **audio derived from the score** (not external recordings) so that **notation**, **cursor**, and **heard notes** share one **musical timeline**.

## MVP approach

- Run **synthesis in the WebView** alongside OSMD (e.g. **Tone.js** + soundfont or equivalent) so scheduling and OSMD cursor updates share the same **JS clock** / **Transport** abstraction.
- **Tempo**: user-controlled **BPM** exposed from day one; changing BPM **re-schedules** or **recomputes** note onsets for current playback model.

## Loop interaction

- Transport respects **active bit** boundaries: when playback position reaches **end of bit**, **seek immediately** to **start of bit** (see `playview.md`).

## Future (not MVP)

- Native audio path for lower latency (requires careful sync with OSMD — ADR if pursued).
- **Metronome** channel mixed with synth (see `roadmap.md`).

## Acceptance criteria

- [x] Note onsets audibly align with cursor for representative scores (manual QA checklist in repo optional).
- [x] Tempo change does not leave orphan scheduled events (no stuck notes after pause/stop).

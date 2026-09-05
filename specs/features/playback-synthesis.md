# Feature: Playback & synthesis

## Goal

Play **audio derived from the score** (not external recordings) so that **notation**, **cursor**, and **heard notes** share one **musical timeline**.

## MVP approach

- Run **synthesis in the WebView** alongside OSMD (e.g. **Tone.js** + soundfont or equivalent) so scheduling and OSMD cursor updates share the same **JS clock** / **Transport** abstraction.
- **Tempo**: user-controlled **BPM** exposed from day one; changing BPM **re-schedules** or **recomputes** note onsets for current playback model.

## Loop interaction

- Transport respects **active bit** boundaries: when playback position reaches **end of bit**, **seek immediately** to **start of bit** (see `playview.md`).
- `[A, B)` holds in audio as well as in geometry: the bit's **start** onset sounds on every
  pass, its **end** onset never does.

## End of the piece

- **The closing measure is not a special case.** It is measured the way every other measure is —
  its own written length, plus any fermata inside it — so the final note sounds for exactly its
  value and playback ends on the **engraved closing barline**, not at some fixed distance past the
  last onset.
- The **metronome stops with the piece**: its last click is the last beat falling strictly inside
  the closing measure. A click on the closing barline would be the downbeat of a measure that does
  not exist. It has to be refused when it is *scheduled*, not when the transport stops — see
  `compound-docs/tone-playback.md`.

## Count-in

- Optional metronome **pre-roll** of 1 or 2 measures before a fresh start of a piece, routine, or
  loop (setting in `settings.md`; off by default). Beats follow the meter; a prelude (anacrusis) is
  folded into the last counted measure. Implementation notes in `compound-docs/tone-playback.md`.

## Future (not MVP)

- Native audio path for lower latency (requires careful sync with OSMD — ADR if pursued).

## Acceptance criteria

- [x] Note onsets audibly align with cursor for representative scores (manual QA checklist in repo optional).
- [x] Tempo change does not leave orphan scheduled events (no stuck notes after pause/stop).
- [x] Tied notes produce a single sustained sound (no double-attack at tie boundary).
- [x] Repeat barlines are honored: playback cycles through the repeated section.
- [x] Fermata notes sound longer; subsequent notes are delayed so the hold is audible.
- [x] Arpeggiated chords roll from low to high (or high to low per marking).
- [x] Metronome toggleable from toolbar; quarter-note click track; downbeats louder/higher-pitch; correct for any time signature.
- [x] The final note sounds its written length (times the fermata multiplier where marked) and
  playback ends on the closing barline — a piece closing on a semibreve does not stop early, and one
  closing on a quaver does not run on.
- [x] The metronome's last click is the last beat inside the piece: no extra beat as it ends, and
  none at all once it has.
- [x] The onset at the playback position sounds: starting a piece, arming a bit, or playing from
  a position the user panned to attacks that onset's own notes.
- [ ] Count-in (when enabled) plays the meter's beats for 1 or 2 measures before a fresh start; a prelude is absorbed into the last counted measure; the first note lands on the beat.

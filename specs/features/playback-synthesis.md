# Feature: Playback & synthesis

## Goal

Play **audio derived from the score** (not external recordings) so that **notation**, **cursor**, and **heard notes** share one **musical timeline**.

## MVP approach

- Run **synthesis in the WebView** alongside OSMD (e.g. **Tone.js** + soundfont or equivalent) so scheduling and OSMD cursor updates share the same **JS clock** / **Transport** abstraction.
- **Tempo**: user-controlled **BPM** exposed from day one; changing BPM **re-schedules** or **recomputes** note onsets for current playback model.

## Samples

- Both sample sets are **bundled in the APK** and resolved through `expo-asset`; nothing is fetched
  at runtime. Piano is Salamander (CC BY 3.0), clarinet is FluidR3_GM (CC BY 3.0) — see
  `THIRD_PARTY_NOTICES.md`.
- Samples are handed to the WebView **before** the score loads, because the Sampler is constructed
  during the load. See `compound-docs/tone-playback.md`.
- Playback sounds the **sounding** pitch, not the written one: the practised instrument's interval
  (0 for piano, −2 for a Bb clarinet) is added before the note is named, so the app can be played
  along with. See `specs/features/instruments.md`.

### Known limitation: notes cannot outlast their sample

`Tone.Sampler` does not loop a buffer, so a note stops sounding when its sample runs out. The
bundled clarinet samples are **3.13 s** flat one-shots with no decay, so any clarinet note longer
than that truncates — a whole note below ~77 BPM, and every long-tone drill. Piano is unaffected in
practice because its samples decay to inaudibility first. Remedies all trade audio quality against
the ~2.4 MB bundled-audio budget; see `compound-docs/tone-playback.md` before attempting one.

## Loop interaction

- Transport respects **active bit** boundaries: when playback position reaches **end of bit**, **seek immediately** to **start of bit** (see `playview.md`).

## Count-in

- Optional metronome **pre-roll** of 1 or 2 measures before a fresh start of a piece, routine, or
  loop (setting in `settings.md`; off by default). Beats follow the meter; a prelude (anacrusis) is
  folded into the last counted measure. Implementation notes in `compound-docs/tone-playback.md`.

## Future (not MVP)

- Native audio path for lower latency (requires careful sync with OSMD — ADR if pursued).
- Sounding the parts you are *not* practising as a piano-reduction accompaniment. The extraction
  pass would emit two note streams instead of one; note that hiding a part via `Instrument.Visible`
  also silences it, so accompaniment must use the independent `Audible` flag.

## Acceptance criteria

- [x] Note onsets audibly align with cursor for representative scores (manual QA checklist in repo optional).
- [x] Tempo change does not leave orphan scheduled events (no stuck notes after pause/stop).
- [x] Tied notes produce a single sustained sound (no double-attack at tie boundary) held for the
      chain's **combined** length, not the first note's.
- [x] Repeat barlines are honored: playback cycles through the repeated section.
- [x] Fermata notes sound longer; subsequent notes are delayed so the hold is audible.
- [x] Arpeggiated chords roll from low to high (or high to low per marking).
- [ ] Playback works with no network on a fresh install, for every bundled instrument.
- [x] Metronome toggleable from toolbar; quarter-note click track; downbeats louder/higher-pitch; correct for any time signature.
- [ ] Count-in (when enabled) plays the meter's beats for 1 or 2 measures before a fresh start; a prelude is absorbed into the last counted measure; the first note lands on the beat.

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

### Sustained instruments loop their samples

A note may be longer than the recording it is played from. The bundled clarinet samples are
**3.13 s** flat one-shots, so before this every clarinet note past that length simply stopped.

An instrument whose samples are loopable declares a **`sustainLoop`** in the registry (see
`instruments.md`). Its buffers are **pre-blended once at load** — the material just before the loop
end is equal-power crossfaded toward the material just before the loop start — so that Web Audio's
own `loop`/`loopStart`/`loopEnd` wrap without a click. Nothing overlaps at runtime; there is still
one voice per note. `Tone.Sampler` has no loop option at all, so a looping instrument goes through
a small dedicated player instead, and a one-shot instrument (the piano) keeps the Sampler unchanged.

A **piano note is meant to stop**, and piano must never loop: a Salamander sample has decayed to
near-silence long before it ends, so looping it would sustain a dead tail.

The seam is inaudible as a click but is not perfectly transparent in level: one set of loop bounds
covers a whole sample set, so the two blended copies meet at an effectively random phase per pitch
and the seam swells or combs by a couple of dB (worst case around 7 dB on one note of the clarinet
set) over its 0.2 s. This is not tunable away with a single set of bounds — see
`compound-docs/tone-playback.md`.

### Starting inside a held note

Playback can begin at a position part-way through a note — a tied chain gives the playhead somewhere
to park that is not the note's own onset, and a two-measure long tone makes that ordinary rather
than exotic.

The note **rejoins itself**: only the remaining length sounds, and the sample starts as far into
itself as the note has already been held, so there is no second attack in the middle of one
continuous tone. On a looping instrument the resume point is usually past the end of the recording
altogether, so it is folded back into the loop region. A one-shot sample that has already run out
sounds nothing, because it has genuinely stopped.

This applies to every instrument and to every way of arriving there: moving the playhead and
pressing play, resuming a pause taken mid-note, and a bit looping back to an **A** handle that sits
inside a held note. In a loop the note stops at **B** rather than running its own length, so the
next pass sounds it afresh instead of layering a second copy over the first.

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
- Sounding the parts you are *not* practising as a piano-reduction accompaniment. The extraction
  pass would emit two note streams instead of one; note that hiding a part via `Instrument.Visible`
  also silences it, so accompaniment must use the independent `Audible` flag.

## Acceptance criteria

- [x] Note onsets audibly align with cursor for representative scores (manual QA checklist in repo optional).
- [x] Tempo change does not leave orphan scheduled events (no stuck notes after pause/stop).
- [x] Tied notes produce a single sustained sound (no double-attack at tie boundary) held for the
      chain's **combined** length, not the first note's.
- [ ] A clarinet note longer than 3.13 s keeps sounding for its full written length, with no click
      at the loop wrap and no re-attack.
- [ ] Piano playback is unchanged: notes decay and stop as before, and no piano sample loops.
- [ ] Starting or resuming playback inside a held note sounds the rest of that note, with no
      re-attack — on the clarinet and the piano alike.
- [ ] A bit whose A handle falls inside a held note sounds that note on every pass, not just the
      first, and repeated passes do not stack copies of it.
- [x] Repeat barlines are honored: playback cycles through the repeated section.
- [x] Fermata notes sound longer; subsequent notes are delayed so the hold is audible.
- [x] Arpeggiated chords roll from low to high (or high to low per marking).
- [ ] Playback works with no network on a fresh install, for every bundled instrument.
- [x] Metronome toggleable from toolbar; quarter-note click track; downbeats louder/higher-pitch; correct for any time signature.
- [x] The final note sounds its written length (times the fermata multiplier where marked) and
  playback ends on the closing barline — a piece closing on a semibreve does not stop early, and one
  closing on a quaver does not run on.
- [x] The metronome's last click is the last beat inside the piece: no extra beat as it ends, and
  none at all once it has.
- [x] The onset at the playback position sounds: starting a piece, arming a bit, or playing from
  a position the user panned to attacks that onset's own notes.
- [ ] Count-in (when enabled) plays the meter's beats for 1 or 2 measures before a fresh start; a prelude is absorbed into the last counted measure; the first note lands on the beat.

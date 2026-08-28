# Feature: Instruments

## Goal

Practise a score on the instrument you actually play. A piece carries the instrument it is for,
sounds through that instrument's samples, and can be transposed so a wind player reads the notes
their instrument requires. Warm-ups and routines are scoped to an instrument and offer only the
exercises that instrument can do.

The app ships **piano** and **Bb clarinet**. The seams are registry-shaped so a third instrument is
data plus a sample set, not a refactor — but the catalogue is deliberately not open-ended, because
the cost of an instrument is its samples, its range and its exercise set, none of which the type
system provides.

## The instrument registry

`domain/instrumentRegistry.ts` is the single source of truth, in the same spirit as
`WARM_UP_REGISTRY` (see `warmup.md`). Every consumer reads what it needs off a descriptor; nothing
else enumerates instruments.

Each descriptor carries:

| Field | Meaning |
|-------|---------|
| `labelKey` | i18n key for the display name |
| `shortLabelKey` | i18n key for the name in a chip or a button ("Clarinet") |
| `samples` | Sample set id + the note→file map for `Tone.Sampler` |
| `writtenRange` | Lowest and highest **written** MIDI note the instrument reads |
| `transposeSemitones` | Sounding pitch relative to written. `0` for piano, `-2` for Bb clarinet |
| `staffLayout` | `'grand'` or `'single'` — how generated exercise scores are engraved |
| `exercises` | The `WarmUpType`s this instrument supports |

`InstrumentId` is derived from the registry's keys, exactly as `WarmUpType` is derived from
`WARM_UP_REGISTRY`.

### Shipped instruments

| | Piano | Bb clarinet |
|---|---|---|
| `transposeSemitones` | 0 | −2 |
| `staffLayout` | `grand` | `single` |
| `writtenRange` | A0–C8 | E3–C7 |
| `exercises` | all six | `scales`, `chromatic` |

The clarinet's exercise set is deliberately narrow. `drill45` is structurally impossible — it is two
simultaneous voices per hand. Hanon is monophonic per hand and would render, but it exists to train
piano finger independence and its printed fingerings are piano fingerings, so it is excluded as
musically pointless rather than technically impossible. Arpeggios and 5-finger scales are playable
on a clarinet and are a candidate for the next slice; they are out now only to keep this one small.

## What a part must be for an instrument to play it

A MusicXML part is **monophonic** iff, scoped to that part: `<staves>` is absent or `1`, no
`<chord/>` appears, and there is exactly one distinct `<voice>` value. All three conditions are
needed and none implies another — a single-staff part can carry chords, a chordless part can carry
two voices.

**An instrument whose `staffLayout` is `single` may only be assigned to a monophonic part.** Piano
has no constraint and accepts everything, which is what stops the import flow from ever
dead-ending: whatever the file holds, at least one instrument is legal.

The refusal is not softened into a top-note-only reduction. Playing something other than what the
score plainly shows is a worse answer than an option the user can see is unavailable, and why. The
consequence is deliberate and permanent at this granularity: none of the repo's piano test scores
can be a clarinet piece, and "practise the piano melody on clarinet" is out of scope.

Granularity is **part-only**. There is no staff or voice selection, and adding one would reopen
every question this rule closes.

The verdict is computed once at import (`scrapePartPolyphony`) and stored as `monophonic` on each
entry of `Piece.parts`, with the first reason — `staves`, `chords`, `voices` — beside it for
labelling. Storing it is what keeps every later check row-local: **listing the dashboard must never
parse a score.** The flag is optional on `ScorePart`, because it is genuinely absent on parts
written by earlier builds; absent means "nobody looked", never "polyphonic".

## Instrument on a piece

`Piece.instrument: InstrumentId`. Pieces stored before this field existed normalise to `'piano'` at
the repository boundary, the way `normaliseSections` and `normaliseBits` already work — so nothing
downstream ever sees `undefined`, and no data migration runs.

**The instrument is immutable after import.** So is the practised part. There is no "change
instrument" action and no escape hatch: both are what the piece *is*, not settings on it, and a
piece that could change instrument could be changed into one its own score cannot support. Getting
it wrong is repaired by re-importing the file, which costs one dialogue.

The repository extends its normalise-on-read seam to the rule: if a stored instrument is
`single`-staff but the chosen part's stored `monophonic` flag is `false`, the piece reads as piano.
A piece whose part carries **no** stored flag is left exactly as it is — it has been working, and a
guess is not an improvement.

The dashboard carries a **global instrument scope** — All / Piano / Clarinet — which filters the
warm-ups, routines and pieces it lists and **nothing else**. It is a pure view filter: no effect on
the PlayView, on the practice heatmap, or on what a new import may become. See `dashboard.md`.

## Transposition

Three distinct operations hide under the word. The model separates them:

```
engraved = source + transposeBase + transposePractice
sounding = engraved + instrument.transposeSemitones
```

- **`Piece.transposeBaseSemitones`** — why the notes moved: the offset that makes this score
  readable on this instrument. Written once at import, never edited directly.
- **`Piece.transposePracticeSemitones`** — a deliberate shift to drill the piece in another key.
  Defaults to `0`, persisted, user-editable.
- **`instrument.transposeSemitones`** — the instrument's own interval, from the registry. Applies to
  **playback only**; it never moves the notation.

### Why playback sounds the sounding pitch

The app is something you play along with. A Bb clarinet sounds a major 2nd below what it reads, so
if the app sounded written pitch through clarinet samples it would be a whole tone above the player
reading the same notes off the same screen. Sounding pitch is what makes the app a duet partner.

The interval comes from the **registry**, not from the file's `<transpose>` element. Using the file
would double-count the moment a concert-pitch score is assigned to a transposing instrument.

### Deriving the base at import

A correctly exported clarinet part is *already* written in the transposed key and needs no help; a
concert-pitch melody needs the full interval. The `<transpose>` element is the signal the engraver
actually wrote, and it distinguishes the two:

| At import | `transposeBaseSemitones` |
|-----------|--------------------------|
| Part carries `<transpose>` | `0` — the score already reads correctly |
| No `<transpose>`, transposing instrument | The instrument's interval, negated (`+2` for Bb clarinet) |
| Piano | `0` |

Scraping happens in `domain/musicxml.ts` at import. OSMD exposes the same value as
`Instrument.PlaybackTranspose` after load, but the domain layer must not depend on OSMD, and the
base is needed before the WebView ever sees the file.

### UI

One stepper row in the piece edit modal, showing `base + practice`. Editing it writes only to
`transposePractice`. A **Reset** control sets `transposePractice` to `0`, returning to the
import-derived default — which for a clarinet piece means "back to how I read this", not "back to
concert pitch".

There is **no PlayView transpose control.** Both edits happen on the dashboard, so the OSMD
re-render they force never has to survive a live session: PlayView always opens on an already-settled
transposition.

### Scope

Transposition applies to **pieces only**. Warm-ups are generated from parameters, so their Key
control already expresses "practise this in D" completely; a transposition on top would produce the
same notes by a second route. Routines inherit that argument.

### Out-of-range notes still sound

Playback keeps a wide absolute gate against garbage data, but does not silence notes that fall
outside the instrument's `writtenRange`. A practice transposition that quietly dropped its top notes
would be a broken exercise, and silence would contradict what the score plainly shows. The sampler
pitch-shifts; `writtenRange` governs what the app *offers*, not what it permits.

## Multi-part scores

`Piece.partId` names the part being practised — the MusicXML part **id**, not its position, because
positions are not stable across re-exports.

The other parts are **filtered, not destroyed**. The full XML is stored untouched; at load the
practised instrument is passed explicitly to `NotesUnderCursor(instrument)`, and the others are
hidden for rendering. Nothing is rewritten, so turning the hidden parts into accompaniment remains
open without a re-import — which is the reason to keep the whole file even though the practised
part itself is fixed at import.

Note for that future: `Instrument.Visible = false` cascades to every Voice, and OSMD's
visible-entry collection gates on `Voice.Visible` — so hiding a part also silences it. Accompaniment
must use the independent `Audible` flag instead.

**Sections still come from `part[0]`.** Form is a property of the score, not of one player's line —
barlines, repeats and key changes are shared across parts in any well-formed score, and the
rehearsal-mark rules already merge across all of them. `Section.startMeasureIndex` keeps its
documented meaning (see `section-detection.md`).

## Import

Instrument and part are settled during import, through the existing "Input needed" modal
(`import.md` step 7) rather than a new flow.

- **The part is asked first**, then the instrument. Which line you practise is what decides which
  instruments are possible; asking the instrument first puts a question that nothing has yet
  constrained. A multi-part file always shows the part picker, regardless of detection confidence —
  the app cannot guess which line you intend to practise. Single-part files skip it.
- **Instruments the chosen part rules out are shown disabled, with the reason** ("two staves",
  "contains chords") — never hidden. A clarinettist who cannot find their instrument has to learn
  that the score is the reason, not the app.
- **The modal asks about the instrument unless exactly one is legal for the selection.** That is
  not the same as "unless detection was confident", and the difference is the point:
  - A two-staff score has one legal answer, so nothing is asked, however silent the file is about
    what it is for. It imports as today.
  - A single-line score **always** asks, however confident detection was, because that is the only
    case where a wrong answer is both possible and irreversible. **Detection pre-selects; it does
    not decide.**
- **Detection** reads the part name first, then the GM `<midi-program>` (72 = clarinet). A
  detection the chosen part cannot support is dropped. `<transpose>` is not a signal — see
  `import.md`.
- Neither is editable afterwards.

## Warm-ups and routines

- Warm-up rows follow the **dashboard's instrument scope**, not a control of their own. Under a
  named instrument the section lists that instrument's exercises; under **All** an exercise appears
  once per instrument that has it, **grouped by exercise** — Scales (Piano), Scales (Clarinet),
  Chromatic (Piano), Chromatic (Clarinet). Grouping by instrument instead would bury the second
  Scales row far below the first, and the question a warming-up player asks is "where are my
  scales".
- Tapping a warm-up row passes its instrument to the warm-up screen as a **route parameter**. It
  does not change the persisted scope: the dashboard filter is a filter, not a mode.
- Warm-up settings are keyed by **instrument + exercise** rather than exercise alone: clarinet
  scales keep their own key and octave count, because they are a different exercise in a different
  register. The store is indexed by instrument, since there is no "current" one to swap on.
- Generators read `staffLayout` and emit one staff or two. `hand` is simply not in a single-staff
  instrument's `params`, which `WARM_UP_REGISTRY` already knows how to honour — no special-casing.
- **Octave counts adapt to the range.** The generator anchors each exercise in the instrument's own
  register instead of a fixed octave, and the octaves picker offers only values that fit the
  selected key. The UI never offers an impossible combination, so there is no error state.
- **A routine's instrument is chosen at creation and read-only thereafter.** The editor shows a
  picker while the routine is new — pre-selected from the dashboard scope when that scope names an
  instrument, and left to the user under All — and a read-only "For {instrument}" line once it
  exists. Switching before the first save drops blocks the new instrument cannot play, which keeps
  the same invariant the Add Exercise picker enforces: a routine never holds a block its instrument
  cannot do, so nothing has to be validated at save or playback time. Routines stored before this
  field existed normalise to `'piano'`.

## Audio

- Both sample sets are **bundled into the APK**; nothing is fetched at runtime. This also fixes an
  existing defect: piano samples were loaded from a CDN and survived offline only by HTTP-cache
  accident, contradicting `offline-storage.md`.
- **Clarinet**: FluidR3_GM, **CC BY 3.0** — the same licence posture as the Salamander piano set and
  every other bundled asset. Per-note mp3 files in the layout `Tone.Sampler` already expects.
- Both sets are **thinned to roughly one sample per minor third**. Salamander is already spaced that
  way, so the piano sound is unchanged by construction — all 29 of its samples ship, at roughly
  1.9 MB. The clarinet is thinned from 88 chromatic files to 17 spanning C3–C7 sounding, at 435 KB.
  **Total added to the APK is about 2.3 MB**, which matters on a sideloaded release with no update
  channel.
- Samples reach the WebView as `file://` URIs resolved through **`expo-asset`**, the same mechanism
  `seedDemoData.ts` already uses for the bundled demo score. This works on iOS, which
  `android_asset` would not. It requires `allowFileAccess` on the WebView, which defaults to `false`
  in react-native-webview and must be set explicitly.

## PlayView

- The **hand filter appears only when the rendered part has two staves**, reported from the WebView
  after load rather than inferred from the instrument. One rule covers both the clarinet and the odd
  single-line file imported as a piano piece, and it is the same signal the hand-colouring pass
  needs — that pass currently assumes staff indices 0 and 1 exist.
- Everything else — bits, sections, loops, metronome, count-in, the marker strip — is unchanged.

## Practice tracking

`practice_daily` gains an instrument column so the split can be reconstructed later, but the
dashboard shows **one combined heatmap**. Practice is practice; two sparser grids would weaken the
one thing the heatmap is for.

## Acceptance criteria

- [ ] A clarinet piece imports, renders, and plays through clarinet samples.
- [ ] Playback of a clarinet piece sounds a major 2nd below the written notes.
- [ ] A concert-pitch score assigned to Bb clarinet imports with a base transposition of +2 and
      renders in the transposed key; an already-transposed clarinet part imports with 0.
- [ ] The transposition stepper shows base + practice; Reset returns to the base, not to zero.
- [ ] A multi-part score shows a part picker, before the instrument picker; only the chosen part
      renders and sounds.
- [ ] A two-staff score cannot be assigned to the clarinet: the option is shown disabled, with
      "two staves" as the reason.
- [ ] A single-line score always asks which instrument it is for; a two-staff one never does.
- [ ] The piece edit modal states the instrument and the part and offers no way to change either.
- [ ] A stored clarinet piece whose part is recorded as polyphonic reads back as a piano piece.
- [ ] Warm-up section offers only scales and chromatic for clarinet, on a single staff, with no hand
      control.
- [ ] The dashboard scope filters warm-ups, routines and pieces, survives a restart, defaults to
      All on a fresh install, and changes nothing outside that screen.
- [ ] Under All, each exercise appears once per instrument that has it, grouped by exercise.
- [ ] Opening a warm-up row from All does not change the persisted scope.
- [ ] Changing the scope clears any row selection.
- [ ] Octave options offered for a clarinet exercise never exceed its written range.
- [ ] Warm-up settings for clarinet and piano are remembered independently.
- [ ] A routine created for clarinet cannot contain a Hanon or 4-5 drill block.
- [ ] Existing pieces and routines open unchanged, as piano.
- [ ] Playback works in airplane mode on a fresh install, for both instruments.
- [ ] The hand filter is hidden on any single-staff score.

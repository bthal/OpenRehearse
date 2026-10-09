# Research: guitar notation, rendering and file sources

> Status: **research, not a spec.** Gathered 2026-10-09 before any guitar work started. Nothing
> here is a commitment until it lands in `specs/features/*.md`. Library versions and site access
> terms change, so re-check them before relying on a specific claim.

## Why this exists

Guitar is the first instrument where the staff we already render is not the notation most players
read. Strumming and picking are each taught with their own notations. Most guitar material is
also distributed in formats other than MusicXML. This note records what exists, what could render
it inside our WebView, and where users would get files, so later guitar work starts from facts
rather than re-research.

## Decisions so far

- **OSMD stays the renderer.** It renders MusicXML TAB staves, which keeps the one musical clock,
  `CursorStep`, loop and bit snapping, and sections unchanged.
- **Import: MusicXML and Guitar Pro.** GP files are **converted to MusicXML at import**, so the
  stored piece is still MusicXML and the "store the XML whole" and one-clock rules hold. The
  current MusicXML-only rule (`specs/features/import.md`, `AGENTS.md` non-negotiables) is amended
  when GP import is built, not before. The most likely converter is alphaTab used as a parser only
  (see below).
- **Chord-sheet import (ChordPro / pasted text) is out of scope for now.** It remains the natural
  feed for a strum lane later.
- **Copyrighted songs are never committed as fixtures.** Pop and folk test pieces stay local. A
  committed guitar demo follows the precedent of `client/assets/demo/bach-prelude-c-major-bwv846.mxl`
  and is a public-domain classical piece (for example *Romanza*, Tárrega's *Lágrima*, or a Carcassi
  étude) authored with a TAB staff.

## 1. Kinds of guitar notation

| Notation | What it shows | Used for | MusicXML encoding |
|---|---|---|---|
| Standard staff (treble clef, sounds an octave lower) | Pitch and rhythm | Classical, jazz reading | Already supported |
| Tablature (TAB): one line per string, frets as numbers | Where to play | Picking, riffs, solos, fingerstyle | `<staff-details>` tuning, `<technical><string>/<fret>` |
| Rhythmic TAB: TAB with stems and beams | Where and when | Most modern tab books | TAB with durations |
| Standard + TAB pair (two linked staves) | Both | Method books, Guitar Pro default | A two-staff part |
| Slash / rhythm notation: slash noteheads under chord symbols | Strum rhythm only | Comping, lead sheets | `<notehead>slash</notehead>` + `<harmony>` |
| Strum patterns: ↓ ↑ (or D/U) on a beat grid, with accents and muted (x) strums | Strum direction and rhythm | Beginner strumming | Partial: `<down-bow>`/`<up-bow>`, `<arpeggiate direction>`. There is no "pattern" object. |
| Chord diagrams (fretboxes) | Left-hand shape | Learning chords | `<frame>` inside `<harmony>` |
| Chords over lyrics | Chords and words, no rhythm | Songs | Partial. ChordPro is the usual format. |
| Technique marks: H, P, slide, bend, vibrato, P.M., dead note, harmonics, let ring | Articulation | Picking style | Mostly `<technical>` |
| Picking-hand marks: ⊓ / V pick direction; p-i-m-a fingering | Picking direction or finger | Alternate picking, fingerstyle | `<down-bow>`/`<up-bow>`, `<pluck>` |

**Picking** is served by TAB, alone or paired with standard notation. **Strumming** is served by
slash notation plus a strum-direction lane, with chord diagrams at each change.

## 2. Rendering libraries

| Library | Licence | Guitar coverage | Fit |
|---|---|---|---|
| **OSMD** (in use; 2.2.x) | BSD-3 | TAB staves: fret numbers, chords placed on strings, bends, slides, H/P/sl. text, grace notes, X noteheads. Click, `setColor` and `getSVGGElement` work on TAB notes (2.2.0). Chord symbols, measure-repeat slashes. | **Best fit.** Gaps: fretbox (`<frame>`) rendering, slash-rhythm polish, no GP import. |
| **alphaTab** (1.8.4 stable; 1.9 alpha) | MPL-2.0 | Built for guitar. Imports GP 3–7, MusicXML, CapXML and alphaTex. TAB, standard, slash and numbered staves; nearly all techniques, including brush and pick strokes. Own SoundFont synth and cursor; `playbackRange`, `isLooping`, `playbackSpeed`, metronome and count-in volume, `playedBeatChanged`. | Strongest guitar renderer, but it brings a **second clock and cursor**, which conflicts with `specs/architecture.md`. As an **import-only GP parser** it fits. |
| **VexFlow** (OSMD's engine) | MIT | Low-level `TabStave`/`TabNote`, stroke and bend modifiers | Only useful for hand-drawing a custom strip |
| **Verovio** (MEI) | LGPL-3 | Guitar TAB is recent (MEI 5.1 features, 5.2+); has MusicXML import | A third engine with no advantage over OSMD here; large WASM |
| **abcjs** | MIT | Auto TAB line for ABC input, with tuning and capo | ABC, not MusicXML. Not a fit. |
| **SVGuitar** / VexChords / Fretzee | MIT | Chord diagrams only | Good add-on for fretboxes |

**No library renders a beginner strum lane** (beat grid, ↓↑, accents, mutes) as a first-class
object. The plan is a custom SVG strip, the same way the marker strip and the loop overlays are
custom. It would be driven by a pure-domain strum-pattern model on the same Tone clock.

## 3. Where users get guitar files

Unlike piano, **free guitar MusicXML is the exception.** Ranked by how much material exists:

| Source type | Where | Format | Rhythm? | Access |
|---|---|---|---|---|
| Chords over lyrics | Ultimate Guitar, e-chords, ukutabs, Chordie | Text / ChordPro | No | Free; the largest body of material |
| ASCII text tab | Ultimate Guitar, guitartabsexplorer, 911tabs, Classtab | Text | Rarely | Free |
| Guitar Pro | Songsterr (GP-based catalogue), UG "Guitar Pro" tabs, GProTab | `.gp` `.gp5` `.gpx` | Yes | Mostly behind a login or paywall |
| MuseScore.com | User uploads, some with TAB | `.mscz` → MusicXML | Yes | Free account covers public-domain and original works only; Pro for the rest; "Official" scores can't be downloaded |
| Printed / PDF songbooks | Voggenreiter, Hal Leonard, Musicnotes | PDF | Yes | Paid; OMR (`transcribe-score`) could convert them |
| Public-domain classical | IMSLP, Delcamp, Mutopia | PDF, sometimes MIDI or LilyPond | Yes | Free; MusicXML is rare |

What this means for the design:
1. **Strumming does not need a score file.** Players practise from a chord progression, and
   "chords + a strum pattern" maps directly onto a strum lane.
2. **Picking needs rhythmic TAB, which mostly means Guitar Pro.** That is why GP import is in
   scope. The workaround without it is MuseScore 4 desktop: open the GP file, add a TAB staff,
   export MusicXML. That workaround is too much friction to be the only path.
3. **Text tab without rhythm can't drive a cursor synced to a clock.** It is out of scope, or at
   most a later free-tempo view.
4. ChordPro's strum-grid directive (`start_of_strum`) is still a beta spec, so we shouldn't depend
   on it.

### Suggested test pieces (local only — all under copyright)

- **Gute Nacht Freunde** (Reinhard Mey): text tab and a chord sheet online. Notation plus TAB in
  the Voggenreiter songbook *Von Anfang an*. No GP or MusicXML found.
- **Like Real People Do** (Hozier): a Songsterr entry (so GP exists, behind a login), a fingerstyle
  TAB in **open G** (a useful alternate-tuning test), a paid Musicnotes arrangement, and chord
  sheets.
- **Novels** (Rusty Clanton): Ultimate Guitar text tab (capo 4) and chord sheets (capo 3/4). Text
  only.

## 4. Open questions for the spike

- Does alphaTab ship a MusicXML exporter? If not, how large is a mapping from its `Score` model to
  `<staff-details>` tuning, `<technical><string>/<fret>`, techniques, capo and tempo? MuseScore 4's
  GP → MusicXML export of the same file is the reference output. What is the bundle-size cost?
- How well does OSMD 2.2 render real TAB files? Does the cursor step correctly on a TAB staff? Do
  slash noteheads and stroke marks render?
- Guitar is polyphonic on one staff, so the `staffLayout: 'single'` ⇒ monophonic rule in
  `specs/features/instruments.md` needs a new layout rather than an exception.
- Registry entry: six strings in standard tuning, sounding an octave below written, capo and
  alternate tunings, and a nylon or steel sample set to bundle.

## Sources

- OSMD changelog (TAB entries 1.8.9 → 2.2.0): https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/blob/develop/CHANGELOG.md
- alphaTab: https://github.com/CoderLine/alphaTab · https://alphatab.net/docs/introduction · https://www.nuget.org/packages/AlphaTab/
- MEI / Verovio tablature: https://music-encoding.org/guidelines/v4/content/tablature.html
- abcjs tablature: https://docs.abcjs.net/visual/tablature
- SVGuitar: https://npmjs.com/package/svguitar · VexChords: https://github.com/0xfe/vexchords · Fretzee: https://cdn.jsdelivr.net/npm/fretzee@0.3.6/README.md
- MuseScore download tiers: https://intercom.help/musescore/en/articles/8535931
- ChordPro strum directive (beta): https://chordpro.org/beta/directives-env_strum
- ASCII tab → MusicXML: https://github.com/algorithmiker/scoreman
- Song sources: https://www.guitartabsexplorer.com/mey-reinhard/gute-nacht-freunde-tab ·
  https://www.thomann.de/ie/voggenreiter_reinhard_mey_von_anfang_an.htm ·
  https://www.intellimusica.com/like-real-people-do/ ·
  https://www.songsterr.com/a/wsa/hozier-tabs-a52183 ·
  https://tabs.ultimate-guitar.com/r/rusty_clanton/novels_tab.htm

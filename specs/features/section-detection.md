# Feature: Section detection (notation-derived)

> **Status: implemented.** Detection lives in `client/src/domain/sections.ts` (pure TS, no
> RN/OSMD/Tone imports); the PlayView label and navigation are described under
> "PlayView integration" below.

## Goal

Split an imported piece into **formal sections** (Intro / Refrain / Trio / strain / …)

This reads **only what the engraver wrote into the MusicXML**: rehearsal marks, repeat brackets,
double barlines, key/meter changes, section words. It is deterministic, cheap, and either produces a
confident answer or **explicitly declines**.

### Does not emit A / B / A′ letters

A′ means "similar to A but varied", which is a **content** claim. Tier 1 has no similarity measure, so
letters would be positional cosplay of an analysis it did not perform. Tier 1 emits score-given `name`s,
or `ordinal` for the UI to render as "Section 3".

## Measure indexing rules

MusicXML measure `number` is a **display string**, not an index. Real cases in `testfiles/`:

- `chopin`, `heute-abend`, `maple-leaf-rag` all begin with `<measure number="0" implicit="yes">` — an anacrusis.
- `heute-abend` places a rehearsal mark **on that pickup measure** (`Intro` @ `number="0"`).
- Numbers can repeat or carry suffixes (`12a`) in other files.

Therefore: index everything by **0-based array position**; carry the display `number` through for the UI;
never parse `number` as an integer for arithmetic.

## Signal rules

Each rule contributes a **candidate boundary** = "a new section starts at measure index *i*", with a weight.

| # | Rule | Boundary at | Weight |
|---|------|-------------|--------|
| R1 | `<rehearsal>` in measure *i* | *i* | **10** |
| R2 | `<repeat direction="forward">` (left barline) in measure *i* | *i* | 8 |
| R3 | `<repeat direction="backward">` in measure *i* | after the **ending run** (see R3a) | 8 |
| R4 | Right barline `bar-style` = `light-light` at end of measure *i* | *i + 1* | 6 |
| R5 | `<key><fifths>` in measure *i* differs from the value in force | *i* | 5 |
| R6 | `<time>` in measure *i* differs from the meter in force | *i* | 5 |
| R7 | `<words>` in measure *i* matching the **section vocabulary** | *i* | 7 |
| R8 | `<segno>`, `<coda>`, or `<sound dacapo/dalsegno/fine/coda>` in measure *i* | *i* | 7 |

### R3a — endings belong to the section that precedes them

A backward repeat is *not* the end of the section when ending brackets follow it. `heute-abend`:

```
idx5   heavy-light, repeat forward          ← Refrain starts
idx8   ending 1 start/stop, repeat backward
idx9   ending 2 start, discontinue
idx10  (still ending-2 material)
idx11  rehearsal "Strophe 1"                ← next section starts here
```

Rule: after a backward repeat at *i*, scan forward while measures carry `<ending>` markers or lie inside
an open ending run; the boundary is the first measure after that run. Never emit a boundary **on** an
`<ending>` measure. Without this rule the file yields 12 spurious sections instead of 8.

### R5/R6 — suppress excursions that revert

Ignore a key or meter change that **returns to the previous value within 4 measures**. This is the rule
that saves the Chopin nocturne, whose meter goes `12/8 → 6/4` (idx33) `→ 2/4` (idx35) `→ 12/8` (idx36):
a *senza tempo* cadenza, not three sections. With the rule, Chopin correctly yields **zero** boundaries.

Contrast `waltz-for-nala`, whose key changes sit at idx 18, 34, 50, 66, 82, 98 — a perfect 16-measure
grid, none reverting quickly. All six survive and all six are real.

### R7 — section vocabulary is a whitelist, never a blacklist

Match case-insensitively, whole-token, against an explicit list:

```
Intro, Introduction, Vorspiel, Verse, Strophe, Chorus, Refrain, Bridge, Interlude, Zwischenspiel,
Outro, Coda, Trio, Menuetto, Minuet, Scherzo, Da Capo, D.C., Dal Segno, D.S., Fine,
Variation, Var., Theme, Thema, Exposition, Development, Recapitulation, Solo, Tag, Vamp, Turnaround
```

**Tempo and expression terms are never a boundary signal on their own** — `Andante`, `Allegro`,
`Senza tempo`, `a tempo`, `rit.`, `dolce`, dynamics, pedal marks. A tempo term may *corroborate* a
boundary that another rule already found, but contributes weight 0 by itself.

### Explicitly not signals

- `<print new-system>` / `<print new-page>` — engraving, not form. `adele` has 15 system breaks and zero
  sections; `bach` has 10 and zero. Using layout would shred every file into systems.
- `<ending>` brackets (see R3a), fermatas, whole-bar rests, dynamics, slur or pedal boundaries.
- `light-heavy` / `heavy-light` barlines **that belong to a repeat** — already counted by R2/R3.
  A bare `light-heavy` mid-piece (no repeat) is treated as R4.

## Assembly algorithm

1. **Collect** candidates from R1–R8 over `part[0]`; also scan other parts for R1/R7/R8 and merge, since
   engravers sometimes attach rehearsal marks to one staff only.
2. **Merge** candidates within **±1 measure** into a single boundary; union their sources; score =
   sum of weights, **capped at 15**. This is load-bearing: `maple-leaf-rag` has `light-light` at the end of
   idx67 *and* a key change + forward repeat at idx68 — three sources, one boundary.
3. **Seed** a boundary at the first measure index (0) and a terminator after the last measure. The
   opening boundary is implicit and needs no score.
4. **Threshold**: drop interior candidates scoring **< 5**.
5. **Minimum length**: if two surviving boundaries are **< 4 measures** apart, keep the higher-scoring one
   (ties → the earlier). Exception: the **first** and **last** sections may be as short as 1 measure, so
   pickups, intros and codas survive.
6. **Cap** at 12 sections; if more survive, keep the highest-scoring boundaries.
7. **Name** each section: the text of its `<rehearsal>` if present, else its matched section word, else `null`.
   When a `<words>` label supplies the name, the **engraved text** is kept (`Verse 1`, not `verse`)
   unless it runs past 32 characters, at which point it is prose and the vocabulary term is used.

### Declining is a result

If fewer than **two** boundaries survive, `detectSections` returns an **empty list**. A score whose
form we cannot read has *no* sections — never one section spanning the whole piece. Everything
downstream keys off that empty list to render nothing.

Note that with the current weights (minimum 5) the threshold in step 4 never drops a lone candidate;
it only matters if a rule weighted below 5 is ever added.

## Verified against the corpus

`detectSections` reproduces every count this document claims, checked against the local
(gitignored) `testfiles/` scores:

| File | Result |
|------|--------|
| `heute-abend` | **8** sections: Intro, Refrain, Strophe 1, Refrain, Interlude, Strophe 2, Refrain, Outro |
| `chopin` | **0** — the `12/8 → 6/4 → 2/4 → 12/8` cadenza is suppressed by R5/R6 |
| `waltz-for-nala` | 6 boundaries at idx 18/34/50/66/82/98, all surviving |
| `maple-leaf-rag` | idx67 `light-light` + idx68 key change and forward repeat merge into **one** boundary; `TRIO` picked up by R7 |
| `adele`, `bach` | **0** — system breaks correctly ignored |

Unit tests use inline XML fixtures only: `testfiles/` is gitignored and unavailable in CI.

## PlayView integration

### The label

A small label in the **upper-right** corner of the score area names the section the cursor is
currently in. It responds to a horizontal **swipe** (see Navigation) but never to a tap: a tap on it
falls through to the score beneath, which toggles playback.

- **Name**: the section's score-given `name`, else the ordinal `Section N` (1-based). Large and
  bold, always in **white**.
- **Ground**: the section's color, at full strength across the middle and fading to transparent at
  the left and right ends.
- **Two states.** Paused, the label is expanded and shows the name. Playing, it rolls up to a thin
  **strip** — the label's own top edge, same width and same color, with no text. Only the height
  moves, while the contents cross-fade, so it reads as one object rolling up rather than a swap. The
  name is not readable during playback; the color alone carries which section is running.
- **Fixed geometry**: one width for every section, pinned in absolute screen space above the WebView
  (`elevation` as well as `zIndex`, or Android renders the WebView over it).
- **Nothing is shown** when the piece has no sections. There is no "whole piece" label.
- The name updates **continuously while the score is panned**, not once the scroll settles.

### Junctions marked in the score

Each junction between two sections is also drawn into the score itself, under the notation: the
outgoing section's color fades away to the left of the junction, the incoming section's fades away to
the right, and the two meet at a crisp two-pixel seam carrying one pixel of each color.

- **Junctions only.** A mark sits *between* two sections, so *n* sections produce *n−1* marks; the
  opening of the piece is not marked.
- The fade reaches roughly **half a measure** to each side, measured from the engraving rather than
  assumed, and is held at low opacity so it never competes with the notes or with a loop's shade.
- Marks sit at the same resolved junction the label and the swipe use — always a barline, per the
  pickup policy below — so all three agree about where a section begins.

### Colors

Sections walk a categorical palette (`SectionColors` in `client/src/theme/colors.ts`, mirrored as
`section.*` in `tailwind.config.js`) in order, except that **a repeated name reuses the color it was
already given** — both `Refrain` sections share a hue, which is the point of coloring them at all.
Unnamed sections are not the same section as each other, so each takes the next slot.

These are saturated hues rather than brand tints: the color carries information, and tints of a
single hue cannot be told apart at a glance. Because the label always draws **white** text, every
entry is held at a lightness that carries white at roughly 4.5:1 — which is why the ochre and olive
entries are much darker than their nominal hue suggests. Any hue added here must be checked against
white first.

They are written as **hex**, unlike the `hsl()` used elsewhere in `colors.ts`, because the same
string crosses three color parsers: React Native styles, the SVG gradient behind the label, and a CSS
gradient inside the WebView, which receives the palette verbatim over `SET_SECTIONS`. The source hue
is kept in a comment beside each entry.

### Navigation

The label is **swiped** horizontally to move between sections, jumping to the **start of the previous
/ next section** — strictly, with no "restart the current section" behaviour.

It behaves as a pager: the names travel with the finger, so dragging **rightward** brings the
*earlier* section in from the left and dragging leftward brings the next one in from the right. The
ground **crossfades** between the two sections' colors as the drag progresses. A swipe commits past
about a quarter of the label's width, or on a flick; short of that it settles back.

**One swipe is one section.** The only cells that exist are the two immediate neighbours, so the
gesture cannot be ridden further than one section in either direction, however far the finger
travels. Past the first or last section the label follows the finger at reduced distance and springs
back, so the gesture is visibly received even where there is nothing to move to.

The label is a **fixed width** so that names slide through a stable frame; a box that resized itself
to each name would reshape at the end of every swipe. Long names truncate.

The gesture is only claimed once a drag is clearly horizontal, so a tap still falls through to the
score beneath. It stands down entirely while **playing**, and while a **loop is active**: arming a
bit is a deliberate "stay here" gesture, and seeking out of it would either strand the user or be
silently undone when the transport snaps back to the loop's A handle.

Because a swipe is the only pointer affordance, the label also exposes the same two moves as
increment/decrement **accessibility actions**.

### Pickups are not compensated for

**Sections always start on a barline.** Junctions are never shifted to absorb an upbeat.

- A **pickup at the start of the piece** is simply part of the first section — it is measure index
  0, which is where the first section begins anyway.
- An **upbeat leading into an interior section** is left in the section *before* the one it
  musically belongs to. This is a known inaccuracy, accepted for now.

The reason is that the offset cannot be inferred. An earlier implementation measured the opening
anacrusis and shifted every junction back by it whenever the bar before a junction looked like a
real upbeat (onsets in the window, nothing sustaining across it). But nothing in the notation says
whether a piece's opening pickup implies one at every later section, or whether an interior upbeat
is the same length as the opening one, so the offset was as often wrong as right — and being wrong
put the junction mid-measure, where it visibly disagreed with the engraving. Landing on the barline
is at least predictable and always matches something the user can see.

Consequently the WebView needs no note-duration analysis for sections: a section's tick is the tick
of its measure, and the domain module only ever emits 0-based measure indices.

**Resolution is against the printed score, not the playback timeline.** The two differ: OSMD's
cursor follows repeats, so a repeated measure occurs more than once on the timeline. A section's
index refers to the page, and resolves to the tick that measure **first** sounds at. See
`compound-docs/tone-playback.md`.

## Persistence and scope

- Detected sections are stored on the `Piece` (`sections` column, JSON) at **import time**. See
  `specs/features/pieces-domain.md`.
- Detection **never fails an import** — `detectSectionsSafely` degrades to `[]`.
- Sections **seed** the user's own list; they are not the final word. Detection runs once, at
  import. Nothing re-runs it afterwards except an explicit "Reset to detected".

## Editing

Detection is a heuristic, and students know their own piece's form better than the rule engine
does. Sections are user-owned after import, edited from a collapsible **Sections** block in the
piece edit modal (`components/sections/`). Pure logic lives in `domain/sectionEditing.ts`.

- Sections **tile** the piece: no gaps, no overlaps, every measure in exactly one section. A
  section is therefore described by its start alone, which is why `Section` has no `end` field.
  The editable things are the n-1 **junctions**; moving one always changes exactly two sections,
  and the first section's start and the last section's end are pinned to the ends of the piece.
- The invariants are: at least one section, starts strictly ascending from 0, and every section
  at least one measure. `MIN_SECTION_MEASURES`, `MAX_SECTIONS` and `MIN_BOUNDARY_SCORE` are
  **detector** tunables and deliberately do not constrain user-authored sections.
- Every piece has **at least one** section. `normaliseSections` runs on every repository read, so
  a null column — a pre-feature import, an unreadable score, a corrupt blob — becomes one
  whole-piece section in memory. The column stays null until the user saves; there is no
  migration and no re-parsing at startup. What used to be "no sections" is now the
  single-section case, and PlayView keys off `length > 1` to decide whether to show a label.
- `Section.color` is **stored**, not derived at render. Name matching still happens, but as an
  event: renaming onto an existing section's name adopts its color, and otherwise the color is
  left alone. Structural edits never repaint a row the user did not touch. Colors are validated
  as `#RRGGBB` on read, because the string is concatenated into a CSS gradient in the WebView.
- Users type the **printed** measure number. No arithmetic relates it to the array index — a
  pickup score numbers measure 0 at index 0, numbers repeat, carry suffixes like `9a`, and jump
  across multirests — so `domain/measureMap.ts` reads the mapping out of the score when the
  modal opens. A score whose measures cannot be read degrades to rename, recolor and delete
  only. The map also supplies the measure count, which is what lets a stored boundary sitting
  past the end of the score be dropped on load.
- Names are stored **exactly as typed** while editing and trimmed on commit. Trimming per
  keystroke deletes the space in "Da Capo" the moment it is typed.
- The WebView resolves section starts to ticks, drops what it cannot place, and re-sorts — so a
  web-side index is not a native-side index. `src/score-web/sectionResolve.ts` carries the
  original position through both, and is the tested part of that path; `score-web/` itself is
  outside the app's tsconfig and has no test setup.
- A user-authored or user-moved boundary carries `sources: []` and no `score`. There is
  deliberately no `'USER'` member of `SectionSource`: `WEIGHTS` is keyed by that type, and a
  user-placed boundary has no rule weight to give it.
- The color picker is hue-only, at constant OKLCH lightness (`domain/oklch.ts`), so every
  reachable color holds white text at 4.5:1 by construction rather than by validation.

## Acceptance criteria

- [x] Sections are detected at import and persisted with the piece.
- [ ] A score with no readable form yields one whole-piece section, and PlayView shows no label.
- [ ] Section edits survive an app restart.
- [x] Sections can be renamed, recolored, resized, split and deleted.
- [x] Editing a section's end moves the next section's start, and vice versa.
- [x] Deleting a section hands its measures to a neighbour — chosen by the user in the middle of
      the piece, and to the only candidate at either end.
- [x] Every color reachable from the picker carries white text at 4.5:1.
- [x] The label names the current section, or `Section N` when the score gives no name.
- [x] A repeated section name keeps the same color throughout the piece.
- [x] Swiping the label jumps to the previous/next section start, one section per swipe.
- [x] The swipe rubber-bands and springs back at the first and last section.
- [x] The swipe is inert while playing and while a loop is active.
- [x] Every section junction lands on a barline; an upbeat leading into a section stays in the
      section before it.
- [x] A junction after a repeat resolves to its printed measure, not to a later pass over an
      earlier one.
- [x] Junctions do not move when the active hand changes.
- [x] The label's ground fades out to the left and right.
- [x] Names travel with the finger and the two sections' colors crossfade during a swipe.
- [x] Playing rolls the label up to a bare strip and pausing unrolls it, animated both ways.
- [x] Every junction between two sections is marked in the score, two-sided, with a crisp seam.
- [x] The opening of the piece carries no mark; *n* sections produce *n−1* marks.
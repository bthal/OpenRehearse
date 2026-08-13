# Feature: Section detection (notation-derived)

> **Status: proposal.**

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
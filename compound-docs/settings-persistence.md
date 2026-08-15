# Persisted settings landmines

Traps found while persisting user settings to JSON on device (`src/state/warmupStore.ts` →
`warmup-settings.json`, and any store that follows the same load-merge-save shape). Check here
before adding a field to anything that is read back off disk.

## Adding a field to a persisted slice: merge per slice, not per top-level key

**LANDMINE:** a settings file is merged into the defaults on load. A merge that spreads only the
top level replaces each nested slice **wholesale**, so a field added later reads `undefined` — but
only for users who already have the file. Fresh installs get the full defaults and look fine,
which is exactly why this survives testing and ships.

```ts
// Wrong: `saved.drill45` replaces DEFAULTS.drill45 entirely, dropping any newly added key.
return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<WarmUpSettings>) };
```

```ts
// Right: every slice keeps its defaults as the floor.
const saved = JSON.parse(raw) as Partial<WarmUpSettings>;
return {
  hanon: { ...DEFAULTS.hanon, ...saved.hanon },
  // …one line per exercise…
  drill45: { ...DEFAULTS.drill45, ...saved.drill45 },
};
```

The symptom is nasty to trace from a bug report: the setting works on the reporter's colleague's
phone (fresh install) and is `undefined` on theirs. When adding a slice, add its line here too —
an omitted key silently reverts that exercise to defaults on every launch.

## Persisted domain objects: clamp in the generator, don't trust the type

**CONSTRAINT:** routines are stored as JSON (`ExerciseBlock[]`) and hydrated straight back into
typed objects. TypeScript describes what *new* blocks look like; it says nothing about blocks
written by an older build. A field added to `ExerciseBlock` is genuinely absent there.

Two rules that follow:

- Type such a field **optional** (`peakRepeats?:`). Marking it required is a lie the compiler
  cannot check across a disk round-trip, and it forces meaningless values onto unrelated blocks.
- Clamp in the pure domain function that consumes it, not at the UI edge — the generator is the
  one choke point every caller (warm-up screen, routine playback, duration estimate) goes through.
  See `expandDrill45Melody` in `src/domain/warmupMusicXml.ts`: it rounds, clamps to the option
  range, and treats `undefined`/`0` as the default rather than throwing or emitting a malformed
  score.

Keep the option list (`WARMUP_PEAK_REPEATS`) the single source of the clamp ceiling, so widening
the choices in the UI cannot silently disagree with what the generator will accept.

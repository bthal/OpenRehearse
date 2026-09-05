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

## A memo key hand-enumerating a persisted parameter set collides silently

`measureCount` in `warmupRegistry.ts` memoises "how many measures does this exercise produce",
because routine playback asks three times over (duration estimate, tempo schedule, score
assembly). Its cache key was a template string listing the parameters by hand:

```typescript
const cacheKey = `${type}|${p.exercise}|${p.pitchClass}|${p.mode}|${p.hand}|${p.octaves}|${p.peakRepeats}`;
```

Adding a parameter to `ExerciseParams` does not make this miss the cache. It makes it **collide**:
two blocks differing only in the new field hash identically, and the second silently gets the
first's length. Nothing throws. The failure surfaces a layer away, as a routine whose tempo
schedule drifts against its own score from that block onward — the cursor running a bar ahead.

This is the same class of bug as the wholesale slice merge above: a hand-maintained mirror of a
shape that grows. The fix makes the compiler maintain it instead:

```typescript
const CACHE_KEY_FIELDS: Record<keyof Omit<ExerciseParams, 'bpm'>, true> = { ... };
const CACHE_KEY_ORDER = Object.keys(CACHE_KEY_FIELDS) as (keyof ScoreParams)[];
```

A new field now fails to compile until it is listed. `bpm` is excluded deliberately — tempo never
affects which notes exist, which is the whole reason `ScoreParams` omits it.

The existing contract test does not catch this. `warmupRegistry.test.ts` sweeps key × hand ×
octaves, and none of those affect a long note, so it passed throughout. A memo over a persisted
parameter set needs its own regression test asserting that each field actually varies the result.
## Practice settings that live on the piece: coerce on read, never write from inside a bit

`Piece.tempoMultiplier` and `Piece.metronome` are the speed and click the piece was last
practised at, restored when it opens. Three things about them are not visible in the types.

- **The column is looser than the union.** `tempo_multiplier` is a bare SQLite `REAL`, so
  `rowToPiece` puts it through `coerceTempoMultiplier`: a value the selector no longer offers —
  an old ×0.6, a rounding artefact — reads as ×1.0 instead of stranding the piece at a tempo
  the UI cannot get back from. The same trade as a corrupt sections blob: degrade the field,
  keep the piece.
- **A bit's settings must not leak onto the piece.** Inside an armed bit the multiplier and the
  metronome belong to the bit (`writeBackToActiveBit` stores them), and leaving it restores the
  piece's own values from `preBitSettings`. The piece write is therefore guarded on
  `activeBitIdRef.current === null`. Without the guard, visiting one slow bit would silently
  save the whole piece slow.
- **The hand is deliberately not persisted.** It returns to both hands on every open. A piece
  reopened in one hand gives no clue on screen why the other has gone silent, and restoring it
  is one tap.

Restore runs **once per piece id**, behind a ref guard, and fires as soon as the piece arrives
from the store — before `SCORE_BPM` lands, so the message handler's `reference × multiplier`
already carries the restored value and the piece opens at the right tempo with nothing extra
injected. Re-running it whenever the piece object changes would fight the user instead: every
persist replaces that object in `piecesStore`.

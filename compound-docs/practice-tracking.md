# Practice-time tracking + heatmap landmines

Traps found while wiring practice-time tracking (`src/domain/practiceTime.ts`,
`src/state/practiceTracker.ts`) and the dashboard heatmap (`components/PracticeHeatmap.tsx`).
Check here before touching either.

## Two stores drive playback — track both, count wall clock once

**CONSTRAINT:** `isPlaying` lives in **two** stores: `playViewStore` drives *both* the piece play
view and routines, `warmupStore` drives the warm-up exercises. All three surfaces are practice.

`PracticeClock` therefore measures the **union** of both stores' playing intervals: one open
segment from "first source started" to "last source stopped". Summing two independent timers
would double-count wall-clock time if the stores ever play at once. Do not "simplify" this into
per-source timers.

## No per-screen tracking code — the stores are the seam

**PATTERN:** Every play surface already resets its store on unmount (`reset()` /
`resetPlayback()`), which sets `isPlaying: false`. A single subscriber on the two stores
(`startPracticeTracking()`, mounted once in `app/_layout.tsx`) therefore sees navigate-away as a
normal stop and banks the partial time. No screen needs tracking code of its own — keep it that
way.

Time is also banked on a 60s tick, so a session that crosses local midnight is split across both
days and an app kill mid-play loses at most a minute.

## Leaving the foreground is a **stop**, not a flush

**LANDMINE:** the play surfaces do not stop playback when the app is backgrounded, and neither
store sets `isPlaying: false`. Merely flushing on the AppState change would leave the segment open,
so locking the phone for three hours and then tapping stop banks three hours of phantom practice —
and the 60s tick banks it minute by minute in the meantime.

**Fix:** `PracticeClock.suspend(nowMs)` / `resume(nowMs)`, driven from the AppState listener in
`startPracticeTracking()`:

- any non-`active` status → `suspend()`: banks the open segment and closes it, so nothing accrues
  while backgrounded and being killed there loses nothing;
- back to `active` → `resume()`: opens a **fresh** segment from that moment, and only if a source is
  still playing.

`suspend()` keeps the set of playing sources, so the union semantics survive a background span: a
store that stops while suspended is dropped from the set (and cannot restart the clock), while the
other one still resumes. `flush()` is a no-op while suspended — a suspended clock must have no open
segment.

## The focus-effect reload must **merge**, not replace

**LANDMINE:** the dashboard re-reads history on focus, which races the write from the session the
user just finished — `recordPractice()` updates memory first and its `INSERT` may still be in
flight when the `SELECT` runs, so the query returns pre-session rows.

**Fix:** `loadPracticeHistory()` folds the snapshot in with `mergePracticeTotals()`, keeping the
larger value per day. Day totals only ever grow, so the larger value is always the fresher one.
Do not go back to `set({ dailySeconds: queried })` — it makes the session that just ended vanish
from the heatmap.

## One shared SQLite connection — do not `BEGIN` on it

`src/data/db.ts` hands out a single connection (`getAppDatabase()`) for every repository, with WAL
and a busy timeout; separate connections on the same file fail with `SQLITE_BUSY` when a practice
flush overlaps a piece write.

**LANDMINE:** that makes an explicit transaction dangerous. `withTransactionAsync()` issues a bare
`BEGIN` on the shared handle, so it also captures — and on failure rolls back — whatever unrelated
write happens to be in flight, and `withExclusiveTransactionAsync()` opens a *second* connection,
which is the problem it is meant to avoid. `addPracticeSeconds()` therefore uses one multi-row
upsert per call and lets SQLite provide the implicit transaction.

## Heatmap window: recompute "today" or a mounted dashboard freezes it

**LANDMINE:** the dashboard is the root route and stays mounted. Memoising `startDate`/`endDate` on
the grid width alone freezes the window at the day it was first rendered, so practice after
midnight has no cell to land in and silently disappears — undoing the midnight split above.

**Fix:** the `useTodayKey()` hook holds today's key in state and re-arms a timer at each local
midnight; the window memo takes it as a dep. Reading `Date.now()` straight from the render body is
not an option — `react-hooks/purity` rejects it.

## Heatmap date keys: a bare `YYYY-MM-DD` string is parsed as **UTC**

**LANDMINE:** `@symbiot.dev/react-native-heatmap` matches its `data` record keys to cells with
date-fns `isSameDay(key, cellDate)`, and a date-only string parses as UTC midnight per the ES
spec. Anywhere west of UTC that lands on the **previous** local day, shifting the whole grid:

```ts
// TZ=America/New_York
isSameDay('2026-05-04', new Date(2026, 4, 4, 12)); // false  ← silently off by a day
isSameDay('2026-05-04T00:00:00', new Date(2026, 4, 4, 12)); // true
```

**Fix:** feed keys with an explicit local midnight (`` `${day}T00:00:00` ``). The stored day keys
themselves (SQLite `practice_daily.day`, `practiceDayKey()`) are local-time and stay bare.

## `cellColor` keys are count thresholds, not level indices

The library resolves a cell's colour to the **highest `cellColor` key ≤ the cell's count**, so the
keys are thresholds in whatever unit `data` counts (practice **minutes** here). A count of `0`
matches no key and falls back to `cellDefaultColor`. Pin `theme.scheme: 'light'` — the library
otherwise follows `Appearance.getColorScheme()` and would pick its dark palette on a dark-mode
device, which the app does not support.

## The 8px content inset overflows the library's own viewport — the last week gets clipped

**LANDMINE:** `HorizontalHeatMap` puts its 8px left inset on the scroll view's *contentContainer*
but caps that scroll view at `maxWidth: <bare grid width>` — a value that excludes the inset. The
content is therefore always `8 - cellGap` px wider than the viewport holding it, and because the
grid renders with `scrollable={false}`, those pixels are **clipped, not scrollable**: the trailing
week loses its right edge. The library's container is also a centring flex row
(`justifyContent: 'center'`), which floats the whole grid a few more pixels right of the heading.

**Failed approach:** reserving the inset by subtracting it from the available width in
`weeksThatFit()`. It cannot work — dropping a week shrinks the content *and* the viewport cap by
the same `CELL_SIZE + CELL_GAP`, so the overflow is invariant. Measured across six screen widths
(320–1024), the clip stayed exactly 5px at every one. The clipping happens inside the library's
own scroll view, so no choice of week count can reach it.

**Fix:** pass `scrollStyle={{ paddingLeft: 0 }}` — a public prop the library merges **last** into
its content container style — and wrap the grid in an `items-start` view so the centring row hugs
its content instead of stretching. `weeksThatFit()` then models the painted width: `n` weeks paint
`n * (CELL_SIZE + CELL_GAP) - CELL_GAP` wide, because the library draws the grid one gap narrower
than it reserves.

Layout regressions here are invisible to colour-based tests, so the geometry is asserted directly
in `components/__tests__/PracticeHeatmap.test.tsx`: content width must fit inside the scroll
view's `maxWidth`, and the left inset must be 0.

## The package is ESM-only — Jest needs it in `transformIgnorePatterns`

**LANDMINE:** `@symbiot.dev/react-native-heatmap` ships only `index.esm.js` (`"type": "module"`).
Metro handles it natively, but Jest fails with `Cannot use import statement outside a module`
until the package is added to the `transformIgnorePatterns` allowlist in `jest.config.js`.

No native setup beyond `react-native-svg` (already a dependency) and `date-fns`.

## Asserting cell colours in tests

`react-native-svg` converts a `fill` string into `{ type, payload }` with an **ARGB int** payload,
so rendered cells cannot be compared against CSS colour strings. Compare against
`processColor(color)` from `react-native` (see `components/__tests__/PracticeHeatmap.test.tsx`).

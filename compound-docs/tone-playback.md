# Tone.js + OSMD playback landmines (Phase 3 / Phase 3b)

Traps found during Phase 3 implementation. Check here before touching `score-web/src/playback.ts`
or the `build.mjs` esbuild config.

## Tone.js `browser` field resolves to UMD bundle — no named exports

**LANDMINE:** Tone.js v14 sets `"browser": "build/Tone.js"` in `package.json`. esbuild with
`platform: 'browser'` (the default for a web target) picks up the `browser` field, which points
to the UMD/IIFE bundle. That bundle wraps everything in a closure and exports nothing. Every
`import * as Tone from 'tone'` member is `undefined`, and esbuild emits
"Import will always be undefined" warnings.

**Fix:** Override the field resolution order in `build.mjs`:
```javascript
mainFields: ['module', 'main'],
```
Tone.js's `module` field (`build/esm/index.js`) is the named-export ESM build. With `mainFields`
set, esbuild ignores the `browser` field and bundles the ESM sources correctly.

## Tone.js tick notation (`"Xi"`) for tempo-relative scheduling

**PATTERN:** To schedule note events relative to musical time (so BPM changes automatically
rescale all future onsets), use Tone.js's internal tick notation `"Xi"` where `X = beats *
Tone.Transport.PPQ`:

```typescript
const TONE_PPQ = 192; // Tone.js default PPQ — must match Tone.Transport.PPQ
const onsetTicks = Math.round(quarterBeatPosition * TONE_PPQ);

part = new Tone.Part(callback, [{ time: `${onsetTicks}i`, ... }]);
part.start(0);
```

Using seconds (`"Xs"`) would make BPM changes ineffective — the note times would be fixed in
wall-clock time. Ticks advance at a rate determined by the current BPM, so changing
`Tone.Transport.bpm.value` immediately affects when future events fire.

## `Tone.Part` survives `Transport.stop()` + `Transport.start()` without `cancel()`

**PATTERN:** After `Tone.Transport.stop()` (position resets to 0), a `Part` that was started at
transport time 0 (`part.start(0)`) replays from the beginning on the next `Transport.start()`.
Do **not** call `Tone.Transport.cancel(0)` between a stop and a re-play — `cancel()` removes
the Part's registered events, requiring a full `part.dispose()` + `new Tone.Part(...)` to replay.

Only call `cancel()` (via `part.dispose()`) when tearing down the PlaybackController entirely
(e.g. new piece load or component unmount).

## AudioContext autoplay in React Native WebView

**PATTERN:** Web Audio API's `AudioContext` starts in the `'suspended'` state and typically
requires a user gesture to `resume()`. In a React Native WebView on Android the restriction is
usually less strict than in a browser tab — calling `await Tone.start()` (which calls
`AudioContext.resume()`) programmatically from `injectJavaScript` typically succeeds because the
WebView is controlled by the native app, not the browser's autoplay policy.

Add `mediaPlaybackRequiresUserAction={false}` to the `<WebView>` prop to also allow inline media
elements to play without a gesture, but note this prop is **not** the same as permitting Web Audio
— it only affects HTML `<audio>`/`<video>` elements.

If audio fails to play on a specific Android device/WebView version, the most reliable fix is to
call `Tone.start()` inside a tap handler (e.g. tap anywhere on the WebView), then proceed with
`Transport.start()`.

## OSMD cursor note extraction: use `cursor.NotesUnderCursor()` not manual `VoiceEntry` iteration

**PATTERN:** `cursor.NotesUnderCursor()` returns all `Note[]` at the current cursor position
across all voices and instruments. It is simpler and safer than iterating `VoicesUnderCursor()`
→ `VoiceEntry.Notes` manually.

Filter before scheduling:
```typescript
const notes = osmd.cursor.NotesUnderCursor();
for (const note of notes) {
  if (note.isRest() || note.IsGraceNote) continue; // skip rests and grace notes
  if (note.halfTone <= 0 || note.halfTone > 127) continue; // sanity-check MIDI range
  ...
}
```

`Note.halfTone` is the transposed MIDI-pitch-equivalent value (C4 = 60 matching standard MIDI).
For non-transposing instruments (piano) it equals the concert pitch.

## OSMD cursor halftone alignment with MIDI

**PATTERN:** `Note.halfTone` in OSMD maps directly to standard MIDI pitch values.
For concert-pitch instruments: C4 = 60, A4 = 69. The formula is:
`halfTone = fundamentalNote (NoteEnum) + accidentalHalfTones + (octave + 1) * 12`
where OSMD's octave numbering uses XML standard (C4 = octave 4).

This means `Tone.Frequency(note.halfTone, 'midi').toFrequency()` gives the correct Hz value
directly, with no offset.

## Tone.Sampler with Salamander piano samples (CDN, WebView cache)

**PATTERN:** `Tone.Sampler` pitch-shifts between recorded samples to cover the full piano range.
The Salamander Grand Piano sample set hosted by the Tone.js team CDN provides 30 samples (A0–C8)
at adequate quality. On first play, the WebView fetches and caches them; subsequent offline plays
use the HTTP cache.

Sharp notes use filename conventions: `D#1 → Ds1.mp3`, `F#1 → Fs1.mp3` (no `#`, use `s`).

```typescript
const PIANO_URLS: Record<string, string> = {
  A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
  // ... through A7, C8
};
const sampler = new Tone.Sampler({
  urls: PIANO_URLS,
  release: 1,
  baseUrl: 'https://tonejs.github.io/audio/salamander/',
}).toDestination();
await Tone.loaded(); // wait before starting transport or audio is silent
```

**LANDMINE:** On Android, the WebView `baseUrl` is usually `'file:///android_asset/'` (needed for
large inline HTML). A `file://` origin cannot make HTTPS cross-origin requests under Android's
same-origin policy. This blocks the Sampler from fetching audio samples.

**Fix:** Set `allowUniversalAccessFromFileURLs={true}` on the `<WebView>` prop. This allows the
`file://` WebView origin to load HTTPS audio resources. Keep it scoped to internal WebView content;
never use it if the WebView can load untrusted third-party URLs.

## BPM from score: `cursor.Iterator.CurrentBpm`

**PATTERN:** Before iterating through the score to build timelines, read the tempo from the OSMD
iterator:

```typescript
osmd.cursor.reset();
const rawBpm = osmd.cursor.Iterator.CurrentBpm;
const scoreBpm = rawBpm > 0 && rawBpm < 400 ? rawBpm : 120;
```

Send the score BPM to native **before** sending `LOADED` so the native store has the BPM when
transport controls appear. Set `Tone.Transport.bpm.value = scoreBpm` in the WebView immediately;
native only needs to re-send if the user has a non-1.0 multiplier already selected.

## OSMD cursor invisible: `#osmd` needs `position: relative`

**LANDMINE:** OSMD appends the cursor element with `position: absolute` inside the `#osmd` div.
If `#osmd` has no positioning context (default `position: static`), the cursor positions itself
relative to the nearest positioned ancestor — usually the `<body>` — which places it at the wrong
coordinates.

**Fix:** Add `position: relative` to the `#osmd` CSS rule in `build.mjs`'s HTML template:

```javascript
<style>
  body { margin: 0; background: white; }
  #osmd { width: 100%; position: relative; }
</style>
```

## OSMD `Fraction.RealValue` is in whole notes — multiply by 4 for quarter notes

**LANDMINE:** `cursor.Iterator.currentTimeStamp.RealValue` and `Note.Length.RealValue` are both
expressed in **whole notes** (1.0 = one whole note = 4 quarter notes). Tone.js PPQ and tick math
use **quarter notes** as the base unit. Passing `RealValue` directly into tick calculations makes
every note event fire 4× too early and every note duration 4× too short — audio plays at 4×
speed.

**Fix:** Multiply by 4 when converting to Tone.js units:

```typescript
const WHOLE_TO_QUARTER = 4;
const quarters = osmd.cursor.Iterator.currentTimeStamp.RealValue * WHOLE_TO_QUARTER;
const durQ     = note.Length.RealValue * WHOLE_TO_QUARTER;
const ticks    = Math.round(quarters * Tone.Transport.PPQ); // correct tick position
```

This applies everywhere OSMD `Fraction.RealValue` feeds Tone.js scheduling or cursor sync math.

## `Transport.start(offset)` leaves state `'stopped'` during the offset window

**LANDMINE:** `Tone.Transport.state` is a getter that returns the transport state **at the
current audio context time**. Calling `Transport.start('+0.1')` schedules the transport to begin
100 ms in the future; immediately after the call, `state` still reads `'stopped'` because the
current time is before the scheduled start. Any RAF loop gated on `state !== 'started'` fires at
~16 ms, sees `'stopped'`, and exits — permanently. Audio plays correctly (the Part events are
scheduled with lookahead), but the cursor loop is dead.

**Fix:** Use `Transport.start()` with no offset:

```typescript
Tone.Transport.start(); // state becomes 'started' immediately
```

Tone.js's built-in 100 ms lookahead pre-schedules tick-0 events before they need to fire, so
removing the explicit offset does not cause missed notes.

## Cursor smooth movement via CSS `left` transition

**PATTERN:** OSMD's cursor element (`Cursor.cursorElement: HTMLImageElement`) uses
`position: absolute` with `style.left` and `style.top`. Applying a CSS transition on `left`
before each `cursor.next()` call produces smooth horizontal movement without custom animation:

```typescript
// before calling cursor.next() for a single-step advance:
const durSec = Math.max(0.04, (deltaQuarters * 60) / Tone.Transport.bpm.value);
cursorElement.style.transition = `left ${durSec.toFixed(3)}s linear`;
cursor.next(); // OSMD sets the new left; CSS transitions from old → new
```

Only transition `left` — leave `top` untransitioned so the cursor jumps instantly when moving to
a new staff line (system boundary). Multi-step catch-up advances (when the transport skips ahead)
use `transition: none` for an instant jump.

Access the element via:
```typescript
const el = (osmd.cursor as unknown as { cursorElement?: HTMLImageElement }).cursorElement;
```

`Cursor.cursorElement` is public in OSMD's type declarations but may require a cast depending on
how the types are imported.

## `cursor.reset()` + repeated `cursor.next()` for backward seeks

**KNOWN COST:** OSMD's cursor has no random-access seek — the only way to move backward is
`cursor.reset()` followed by N calls to `cursor.next()`. For a piece with N notes before the
target, this is O(N). In practice, backward seeks happen only on stop/replay (target = 0, so 0
`next()` calls) and are not called in the forward-play hot path. This is acceptable for MVP.

If large-score performance becomes a concern (e.g. re-seeking mid-piece), pre-build a list of
GraphicalNote DOM positions and use CSS `transform` to animate a custom caret instead of calling
`cursor.next()`. That approach requires an ADR (see `specs/features/playview.md`).

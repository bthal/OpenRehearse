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
const quarters = osmd.cursor.Iterator.CurrentEnrolledTimestamp.RealValue * WHOLE_TO_QUARTER;
const durQ     = note.Length.RealValue * WHOLE_TO_QUARTER;
const ticks    = Math.round(quarters * Tone.Transport.PPQ); // correct tick position
```

This applies everywhere OSMD `Fraction.RealValue` feeds Tone.js scheduling or cursor sync math.
See also: **OSMD repeats** section below for why `CurrentEnrolledTimestamp` is used instead of
`currentTimeStamp`.

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

## Cursor smooth movement: interpolation-based RAF (Phase 4)

**PATTERN (replaces CSS `left` transition):** The CSS `left` transition approach causes visible
misalignment in one-line mode: OSMD's cursor element jumps to the next beat position instantly
(since `cursor.next()` updates `style.left` immediately), while the CSS transition animates the
element over the next beat duration. In one-line mode the fixed `#cursor-line` div is always at
screen center, so the cursor element must stay there too — any lag is immediately obvious.

**Fix:** Use a 60fps RAF loop that interpolates between beat positions each frame, then sets
BOTH the cursor element's `style.left` AND the score's `translateX` to the same interpolated
pixel value:

```typescript
function animateCursorLoop(): void {
  const quartersElapsed = Tone.Transport.ticks / TONE_PPQ;
  // binary-search cursorSteps[] for the current beat
  const step = findStep(quartersElapsed);
  const currPx = cursorSteps[step].pxLeft;
  const nextPx = cursorSteps[step + 1]?.pxLeft ?? currPx;
  const fraction = (quartersElapsed - cursorSteps[step].quarters)
                 / (cursorSteps[step + 1]?.quarters - cursorSteps[step].quarters);
  const px = currPx + Math.min(1, fraction) * (nextPx - currPx);

  // Both the cursor element and the score translate to the same px — they stay aligned.
  cursorElement.style.left = `${px}px`;
  osmdEl.style.transform = `translateX(${viewportWidth / 2 - px}px)`;

  animFrameId = requestAnimationFrame(animateCursorLoop);
}
```

Key points:
- `cursorSteps[i].pxLeft` is captured at build time via `parseFloat(el.style.left || '0')`,
  **not** `el.offsetLeft` (which returns integers and rounds).
- OSMD iterator advancement (`cursor.next()`) is kept separate from translation; call it only
  when the step index changes.
- Never use `osmdEl.style.transition` for the score translateX — that re-introduces lag.

Access the cursor element:
```typescript
const el = (osmd.cursor as unknown as { cursorElement?: HTMLImageElement }).cursorElement;
```

## OSMD tied notes: skip continuation notes — only the start note triggers an attack

**LANDMINE:** `cursor.NotesUnderCursor()` returns ALL notes at the cursor position, including the
second (and later) notes of a tie. Scheduling a new `triggerAttackRelease` on a tie continuation
produces a double-attack — the note re-strikes audibly mid-sustain.

**Fix:** Skip any note whose tie's start note is not itself:

```typescript
if (note.NoteTie && note.NoteTie.StartNote !== note) continue;
```

`Tie.StartNote` is a public getter on OSMD's `Tie` class. `note.NoteTie` is falsy (null/undefined)
for non-tied notes despite being typed as `Tie` (not `Tie | undefined`), so the `&&` guard is
required.

## OSMD repeats: use `CurrentEnrolledTimestamp`, not `currentTimeStamp`

**LANDMINE:** `Iterator.currentTimeStamp` is an alias for `CurrentSourceTimestamp` — the note's
position in the **printed score**. On the second pass through a repeated section the source
timestamp is identical to the first pass. Scheduling with it causes both passes to fire at the same
Tone.js tick; the repeat sounds identical to no repeat at all.

`Iterator.CurrentEnrolledTimestamp` is the **unrolled** playback timeline (increases monotonically
across back-jumps). Use it for both note scheduling and cursor step timing:

```typescript
const quarters = osmd.cursor.Iterator.CurrentEnrolledTimestamp.RealValue * WHOLE_TO_QUARTER;
```

OSMD's cursor iterator follows repeats by default (`EngravingRules.CursorIgnoreRepetitions = false`).
`cursor.next()` performs back-jumps automatically; the enrolled timestamp correctly reflects the
resulting linear timeline offset so `Tone.Part` events and cursor steps are both sequenced
correctly.

## `cursor.reset()` + repeated `cursor.next()` for backward seeks

**KNOWN COST:** OSMD's cursor has no random-access seek — the only way to move backward is
`cursor.reset()` followed by N calls to `cursor.next()`. For a piece with N notes before the
target, this is O(N). In practice, backward seeks happen only on stop/replay (target = 0, so 0
`next()` calls) and are not called in the forward-play hot path. This is acceptable for MVP.

If large-score performance becomes a concern (e.g. re-seeking mid-piece), pre-build a list of
GraphicalNote DOM positions and use CSS `transform` to animate a custom caret instead of calling
`cursor.next()`. That approach requires an ADR (see `specs/features/playview.md`).

## One-line OSMD layout: `PageWidth` alone is not enough (Phase 4)

**LANDMINE:** Setting `osmd.EngravingRules.PageWidth = 10000` prevents automatic line wrapping
based on measure widths, but **MusicXML `<print new-system="yes"/>` and `<print new-page="yes"/>`
attributes still force system/page breaks** at mid-score. Pieces like Bach Prelude I (m.28) and
Mozart Rondo alla Turca (m.60) exhibit this.

**Fix:** Set all three rules before every `osmd.load()`:

```typescript
osmd.EngravingRules.PageWidth = 10000;
osmd.EngravingRules.NewSystemAtXMLNewSystemAttribute = false;  // ignore <print new-system>
osmd.EngravingRules.NewSystemAtXMLNewPageAttribute = false;    // ignore <print new-page>
osmd.EngravingRules.RenderSingleHorizontalStaffline = true;    // OSMD's own layout enforcer
```

All three must be set on every `__rn_load_xml` call (not just once at construction) because
`disposePlayback()` may reset rendering state between loads.

## OSMD cursor element dimensions: read `getAttribute('height')`, not `style.height` (Phase 4)

**LANDMINE:** In `Cursor.updateWidthAndStyle`, OSMD sets the cursor element's height as:
```javascript
r.height = 10 * systemHeightInUnits * zoom;  // sets the img IDL attribute, NOT style.height
```
`style.height` is never set. Reading `parseFloat(cEl.style.height || '0')` always returns 0.
`cEl.offsetHeight` and `getBoundingClientRect().height` both return the CSS-computed height,
which may reflect the parent container height rather than the staff system height if any
ancestor has an explicit height.

**Fix:** Read the HTML attribute value directly:
```typescript
const systemH = parseInt(cEl.getAttribute('height') ?? '0', 10);
```
This bypasses CSS-computed height and returns exactly what OSMD wrote.

Also: `style.top` IS set by OSMD (as `10 * y * zoom + "px"`), so `parseFloat(cEl.style.top)`
reliably gives the system's Y offset within the container.

## Vertical score positioning: OSMD title/composer offsets the system (Phase 4)

**LANDMINE:** OSMD renders title, composer, and subtitle above the staff system with top margins.
The cursor element's `style.top` gives the system Y offset (e.g. 179px for Prelude I, 600px+ for
scores with more metadata). Without correcting for this, the staff system can appear near the
bottom of the viewport or scroll off-screen entirely for metadata-heavy scores.

**Fix:** After `initPlayback` measures `systemTop` and `systemH`, vertically center the staff:

```typescript
const viewportHeight = window.innerHeight;
const centeredTop = Math.round((viewportHeight - systemH) / 2);
if (osmdEl) osmdEl.style.top = `${centeredTop - systemTop}px`;
```

This slides `#osmd` up so the staff system appears at `centeredTop` from the WebView top,
regardless of how much title/composer space OSMD allocated. The native header already displays
piece title and composer, so OSMD's title region scrolling off the top is acceptable.

Elements inside `#osmd` (loop handles, shade, OSMD cursor) are positioned relative to `#osmd`
and auto-correct without additional adjustment. The horizontal `translateX` on `#osmd` (for
score scrolling) is independent of `style.top` and is not affected.

## Loop overlay sizing: use cursor element, not `#osmd.offsetHeight` (Phase 4)

**LANDMINE:** The loop shade (`#loop-shade`) and handles (`.loop-handle`) are absolutely
positioned inside `#osmd`. Setting their `height: 100%` in CSS, or reading `#osmd.offsetHeight`
to set a JS height, both return the full SVG canvas height (viewport-height-sized) rather than
the staff system height. This makes the loop overlay span the full screen.

**Fix:** Use the cursor element's measurements from `getAttribute('height')` and `style.top`
for both `height` and `top` on all overlay elements:

```typescript
const systemTop = parseFloat(cEl.style.top || '0');
const systemH = parseInt(cEl.getAttribute('height') ?? '0', 10);
for (const el of [handleAEl, handleBEl, shadeEl]) {
  if (!el) continue;
  el.style.top = `${systemTop}px`;
  el.style.height = `${systemH}px`;
}
```

Set these in `initPlayback` immediately after `cursor.show()` (which triggers
`updateWidthAndStyle` internally and populates the cursor element's position data).
Do **not** set `height` in CSS — leave it unset so the JS values are unambiguous.

## LANDMINE: `score-web/src/` edits are invisible until the bundle is rebuilt

`score-web/build.mjs` compiles `src/index.ts` (and its imports: `playback.ts`, `types.ts`) into
`client/src/score-web/html.ts` — an auto-generated TypeScript module that the React Native app
embeds in the WebView. **Edits to source files produce no effect in the running app until the
bundle is rebuilt.**

```bash
cd client && npm run build:score-web
```

This is easy to miss because the source files look like live TypeScript. Always add a rebuild
step to any task that touches `client/score-web/src/**`.

## PATTERN: Metronome via `scheduleRepeat` + raw Web Audio oscillator per tick

Do **not** create a persistent `Tone.Synth` for the metronome. Synth nodes (and any
`Tone.AudioNode`) created while the `AudioContext` is still `suspended` (before the user's first
`Tone.start()` call) silently fail to produce sound — the node graph is built against a suspended
context and does not recover correctly after resume.

**Fix:** create a fresh `OscillatorNode` + `GainNode` pair inside each `scheduleRepeat` callback.
By the time the callback fires, the transport is running and `AudioContext` is active:

```typescript
metronomeEventId = Tone.Transport.scheduleRepeat((time) => {
  const ctx = Tone.getContext().rawContext as AudioContext;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = isDownbeat ? 1500 : 1000;
  gainNode.gain.setValueAtTime(isDownbeat ? 0.45 : 0.2, time);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.06);
}, '4n', 0);
```

Use `Tone.Transport.clear(id)` to cancel on toggle-off or dispose.

## LANDMINE: `'@4n'` quantize syntax is NOT valid as `scheduleRepeat`'s `startTime`

Tone.js's `'@4n'` notation ("next quarter-note boundary") works for `Transport.schedule()` but
**silently produces no events when passed as the `startTime` argument to `scheduleRepeat()`**
while the transport is running. The call appears to succeed (returns an ID) but nothing fires.

**Fix:** always pass `startTime = 0`. `scheduleRepeat` with `startTime = 0` fires at absolute
transport positions 0, 4n, 8n, … When the transport is already past 0, Tone.js skips all past
firings and fires at the next interval multiple — so the phase is always locked to the beat grid:

```typescript
// Transport at position 5.3n → first fire at 8n (next multiple of 4n from 0). ✓
metronomeEventId = Tone.Transport.scheduleRepeat(callback, '4n', 0);
```

## PATTERN: Downbeat detection via `Iterator.CurrentMeasure` reference tracking

`Tone.Transport.timeSignature` is always 4/4 by default — it is not read from the MusicXML.
Do **not** use modulo arithmetic against `timeSignature` to find downbeats; it will be wrong for
3/4, 6/8, 5/4, and mid-score signature changes.

**Fix:** during `buildTimelines`, compare `osmd.cursor.Iterator.CurrentMeasure` by object
reference across cursor steps. Each reference change is a new measure boundary; record that tick
position in a `Set<number>`:

```typescript
let lastMeasure: unknown = null;
const downbeatTicks = new Set<number>();

while (!osmd.cursor.Iterator.EndReached) {
  const quarters = osmd.cursor.Iterator.CurrentEnrolledTimestamp.RealValue * WHOLE_TO_QUARTER;
  const measure = osmd.cursor.Iterator.CurrentMeasure as unknown;
  if (measure !== lastMeasure) {
    lastMeasure = measure;
    downbeatTicks.add(Math.round(quarters * TONE_PPQ));
  }
  // ... rest of walk
}
```

In the metronome callback, snap the scheduled tick to the nearest beat and look it up:

```typescript
const ticks = Tone.Transport.getTicksAtTime(time);
const nearestBeat = Math.round(ticks / TONE_PPQ) * TONE_PPQ;
const isDownbeat = downbeatTicks.has(nearestBeat);
```

Works for any time signature and handles mid-score changes automatically.

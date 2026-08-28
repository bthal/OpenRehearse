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
  // OSMD halfTone is semitones from C0; add 12 for standard MIDI. Piano range: A0=9, C8=96.
  if (note.halfTone < 9 || note.halfTone > 115) continue;
  ...
  noteEvents.push({ ..., midi: note.halfTone + 12, ... });
}
```

`Note.halfTone` is semitones from C0 (OSMD convention) — one octave below standard MIDI.
Always add 12 before passing to any Tone.js MIDI function.

## LANDMINE: OSMD `Note.halfTone` is one octave below standard MIDI — add 12

**LANDMINE:** `Note.halfTone` in OSMD counts semitones from C0 (octave * 12 + fundamentalNote).
Standard MIDI counts from C-1 (C0 = 12, C4 = 60). OSMD's C4 = 48, which Tone.js maps to C3 —
every note plays one octave too low.

**Fix:** add 12 whenever feeding `halfTone` to a Tone.js MIDI function:

```typescript
const midi = note.halfTone + 12; // OSMD C0=0 → MIDI C0=12
const noteName = Tone.Frequency(midi, 'midi').toNote();
samplerRef.triggerAttackRelease(noteName, durSec, time);
```

Piano range after the offset: A0 = 21, C8 = 108 (standard MIDI).

## Tone.Sampler with bundled samples (expo-asset, not a CDN)

**PATTERN:** `Tone.Sampler` pitch-shifts between recorded samples to cover a full range, so a set
spaced about a minor third apart is enough. Both sets ship **inside the APK** under
`client/assets/samples/`, are resolved to `file://` URIs by `expo-asset`, and are pushed into the
WebView by `injectInstrumentAudio` *before* `__rn_load_xml` — the Sampler is constructed during the
load, so samples cannot arrive after it. `injectJavaScript` delivers in order, which is what makes
the two back-to-back calls safe.

```typescript
// native: src/score-web/instrumentAudio.ts
await injectInstrumentAudio((js) => webViewRef.current?.injectJavaScript(js), instrument);
webViewRef.current?.injectJavaScript(`window.__rn_load_xml(${JSON.stringify(xml)});void 0;`);

// web: playback.ts
sampler = new Tone.Sampler({ urls: sampleUrls, release: 1 }).toDestination();
await Tone.loaded(); // wait before starting transport or audio is silent
```

**HISTORY — why this changed.** Samples used to be fetched from `https://tonejs.github.io/audio/
salamander/` and kept only in the WebView's HTTP cache. That made "offline after import"
(`specs/features/offline-storage.md`) true by accident: a cache eviction, or a first play in
airplane mode, meant silence. Bundling costs ~2.4 MB of APK on a sideloaded release with no update
channel, and buys an offline story that is actually true.

**LANDMINE:** `allowFileAccess` defaults to **`false`** in react-native-webview and must be set
explicitly on every WebView that plays audio, or the Sampler silently fetches nothing. It is a
separate switch from `allowUniversalAccessFromFileURLs`, which is also still required: the WebView's
`baseUrl` is `file:///android_asset/`, and a `file://` origin needs universal access to read a
`file://` URI from a different directory.

**LANDMINE:** filename spelling is a per-set convention, not a global one. Salamander writes sharps
with `s` (`D#1` → `Ds1.mp3`); the FluidR3 clarinet uses flats (`Eb3.mp3`). The Sampler key must be
the note name Tone.js understands, so the mapping is written out explicitly in
`src/data/instrumentSamples.ts` — and Metro requires those `require()` paths to be literals anyway,
so the table cannot be generated. `missingSampleNotes` is tested against the registry so a note
declared but not bundled fails CI rather than going silent at runtime.

**Sounding vs written pitch.** The Part callback adds the instrument's `transposeSemitones` before
naming the note, so a Bb clarinet sounds a major 2nd below what is engraved. This is deliberate: the
app is something you play *along with*, and sounding written pitch would put it a whole tone above
the person reading the same notes. See `specs/features/instruments.md`.

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

## PATTERN: target speed drives the multiplier reference (native side)

The PlayView speed selector (×0.5/×0.75/×1.0) multiplies a **target speed**, not the raw score
BPM. The reference resolves to `piece.targetBpm ?? piece.importedBpm ?? scoreBpm`:

- `importedBpm` is scraped from the MusicXML at import (`domain/musicxml.ts` → `scrapeTempoBpm`):
  an explicit `<sound tempo>` wins, else the first `<metronome>` mark converted to quarter-note
  BPM. It is persisted on the piece so the edit modal can show the file's original speed without
  opening the score. A tempo-less score scrapes to `null` and leaves `importedBpm` **unset** — do
  not fabricate a default, because OSMD's own default for such a score is **100**, not 120, and
  forcing a scraped 120 onto the transport plays it ~20% too fast (regression fixed here).
- `targetBpm` is the user override set in the edit modal.

Native (`app/piece/[id].tsx`) sends `__rn_set_tempo(round(reference × multiplier))` on load — only
when it differs from the score's own BPM, so a piece with no override still plays at its native
tempo — and on every multiplier change. Because `setTempoBpm` clamps to **[20, 240]**, the target
range is bounded **40–240** (`domain/tempo.ts`): ×0.5 of the min (20) and ×1.0 of the max (240)
both land on the clamp edges, so the displayed effective BPM always equals what actually plays —
no silent clamp mismatch.

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

**Deliberate exception — the count-in.** The count-in feature *requires* a future start time so
the metronome pre-roll can sound before the first note (see "Count-in pre-roll" below). It keeps
the RAF loop alive across the offset window via a `countingIn` flag rather than dropping the
offset. Do **not** "simplify" `Tone.Transport.start(startAt + delaySec)` in `startPlayback` to a
bare `start()` — that removes the pre-roll gap and the piece begins immediately.

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

## LANDMINE: anything built by walking the cursor is in playback order, not score order

The same back-jumps mean **a repeated measure is visited more than once**. Any array appended to
inside the `while (!EndReached)` walk therefore holds one entry per *pass*, not per printed measure:
`measureMeta` in `playback.ts` is the unrolled timeline, not the page.

Indexing such an array with a printed-score measure number is silently correct up to the first
repeat and wrong after it — the failure is invisible on a score without repeats, which is exactly
what a first test file tends to be. Section boundaries hit this: they arrive from `domain/sections.ts`
as 0-based indices into the MusicXML measure list, and a boundary past a repeat resolved to the
second pass of an earlier measure.

Two safe ways to consume the walk:

- **Look up by tick, not by index** — `measureAtTicks()` scans for the last measure starting at or
  before a tick, so the duplicates are harmless.
- **Key by printed index while walking** — `Iterator.CurrentMeasureIndex` indexes
  `Sheet.SourceMeasures` (the printed score) and is rewound by the iterator on a back-jump, so
  recording only the first visit per index gives a printed-measure → tick table. This is what
  `firstTicksBySourceIndex` is.

Do not reach for `SourceMeasure.measureListIndex` instead: it is a graphical-layer field, whereas
`CurrentMeasureIndex` is literally the index the iterator uses to fetch `CurrentMeasure`
(`currentMeasure = musicSheet.SourceMeasures[currentMeasureIndex]`).

## LANDMINE: backward OSMD cursor seek inside RAF loop causes visual stall proportional to piece length

**LANDMINE:** OSMD has no random-access seek. Moving the cursor backward requires `cursor.reset()`
followed by N calls to `cursor.next()` to reach the target position. For a 30-measure piece with
a loop near the end, N can exceed 200; at ~0.5 ms per call this is 100+ ms of synchronous
main-thread work.

Every loop wrap triggers a backward seek from the loop-end step back to the loop-start step.
Calling this inside `animateCursorLoop` blocks the RAF frame from returning, so the visual update
(`el.style.left` + `translateX`) and Tone.js transport tick reads are both delayed. The lag grows
linearly with piece length — a short piece or early loop is fast; a 30+ measure piece with a loop
near the end stalls for hundreds of milliseconds per wrap. Deferring via `setTimeout(0)` does not
help: the stall moves to a macrotask that still blocks the next RAF frame from being scheduled.

**Fix:** Do not advance the OSMD cursor iterator inside the RAF hot path at all. The cursor
element's visual position is driven by `cursorSteps[step].pxLeft` written directly to
`el.style.left` every frame — OSMD's internal iterator state contributes nothing to rendered
output (the cursor element is `visibility: hidden`; we override its `style.left` every frame
anyway). In `animateCursorLoop`, only update `currentCursorStep = targetStep`. Reserve
`advanceCursorTo` for `startPlayback` and `_stopInternal`, where it runs before
`Transport.start()` and any synchronous cost is a one-time charge, not a per-wrap stall.

Track the actual OSMD cursor position in a separate `osmdActualIdx` variable (updated in
`advanceCursorTo`) so forward seeks from `startPlayback` can compute the right delta without
relying on `currentCursorStep` (which now reflects the visual step, not the OSMD iterator step).

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

**Primary fix (Phase 5):** Suppress OSMD metadata rendering entirely — set before every `load()`:
```typescript
osmd.EngravingRules.RenderTitle = false;
osmd.EngravingRules.RenderSubtitle = false;
osmd.EngravingRules.RenderComposer = false;
osmd.EngravingRules.RenderLyricist = false;
osmd.EngravingRules.RenderCopyright = false;
```
Also pass `drawTitle: false, drawComposer: false` in the `OpenSheetMusicDisplay` constructor.
The native layer shows piece metadata; the WebView shows notation only. Suppressing metadata
eliminates the `systemTop` offset for most scores.

**Secondary fix (belt-and-suspenders):** After `initPlayback` measures `systemTop` and `systemH`,
vertically center the staff in case any residual offset remains:

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
for (const el of [handleAEl, handleBEl, shadeEl, sectionMarksEl]) {
  if (!el) continue;
  el.style.top = `${systemTop}px`;
  el.style.height = `${systemH}px`;
}
```

The section-mark container (`#section-marks`) goes through the same call for the same reason. Its
children are the only overlay elements sized with `height: 100%` in CSS, and that is safe *because*
their parent's height is set here — they inherit the staff system height, not the SVG canvas.

Set these in `initPlayback` immediately after `cursor.show()` (which triggers
`updateWidthAndStyle` internally and populates the cursor element's position data).
Do **not** set `height` in CSS — leave it unset so the JS values are unambiguous.

## LANDMINE: `score-web/` edits are invisible until the bundle is rebuilt

`score-web/build.mjs` compiles `src/index.ts` (and its imports: `playback.ts`, `types.ts`) into
`client/src/score-web/html.ts` — an auto-generated TypeScript module that the React Native app
embeds in the WebView. The WebView's HTML shell — markup and CSS for the cursor line and the loop
overlay (`#loop-shade`, `.loop-handle`) — lives in the `HTML_TEMPLATE` literal inside `build.mjs`
itself, so template-only edits need the same rebuild. **No edit under `score-web/` takes effect in
the running app until the bundle is rebuilt.**

```bash
cd client && npm run build:score-web
```

This is easy to miss because the source files look like live TypeScript. Always add a rebuild
step to any task that touches `client/score-web/**`.

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

## LANDMINE: scroll clamp must use `cursorSteps` extremes, not raw `scoreWidth`

Clamping `translateX` to `[viewportWidth - scoreWidth, 0]` limits the score so its left edge
reaches the screen left and its right edge reaches the screen right. But the cursor line is fixed
at screen centre — at either boundary the cursor line sits over blank space, not a note.

**Fix:** clamp to `[viewportWidth/2 - pxLast, viewportWidth/2 - px0]` where `px0` and `pxLast`
are the pixel positions of the first and last cursor steps. Compute in `initPlayback` after
`buildTimelines`:

```typescript
const px0    = cursorSteps[0]?.pxLeft ?? 0;
const pxLast = cursorSteps[cursorSteps.length - 1]?.pxLeft ?? scoreWidth;
scrollMaxPx  = viewportWidth / 2 - px0;    // first note centred
scrollMinPx  = viewportWidth / 2 - pxLast; // last note centred
```

**Secondary LANDMINE (same root cause):** On load, `applyTranslate(viewportWidth/2 - px0)`
sets a positive `translateX` (first note at centre). The old clamp's max of `0` was lower than
this value, so any `touchmove` event — even a zero-delta tap — clamped the offset to `0` and
snapped the score to the left edge. The corrected `scrollMaxPx` bound is always ≥ the initial
translateX, so no snap occurs.

**Do not widen these bounds to the snap grid's terminal target.** The terminal exists so handle B
can reach past the final note; the *playhead* must never park there, because there is nothing to
play and nothing to snap to. `recomputeViewportMetrics` deliberately reads `cursorSteps` extremes,
not `snapGrid` extremes, and carries a comment saying so.

## Fermata: expand the tick timeline, don't just extend the note duration

**LANDMINE:** Extending `durQ` for a fermata note makes it sound longer, but the next note
is still scheduled at the original tick. The sustained tail is masked — the listener hears
the next note as "too early", not a held fermata.

**Fix:** Track a `tickShift` accumulator. After each fermata position, add
`round(normalDurQ * (FERMATA_MULTIPLIER - 1) * PPQ)` to `tickShift`. All subsequent note
events and cursor steps use `expandedQuarters = quarters + tickShift / PPQ` so the next
note only fires after the fermata expires.

No hold step is inserted. The interpolation between the fermata note's step and the next
note's step spans the full expanded duration, so the cursor drifts slowly toward the next
note during the hold instead of freezing on the fermata symbol — matching visual motion to
playback. `advanceCursorTo` uses `CursorStep.osmdIdx` — not the array index — to count
`cursor.next()` calls; each step has a unique `osmdIdx` so forward seeks work correctly.

**Detection:** `note.ParentVoiceEntry.Articulations` contains `Articulation` objects;
check `a.articulationEnum === ArticulationEnum.fermata` (10) or `invertedfermata` (11).
Both `ArticulationEnum` and `ArpeggioType` must be **value imports** (not `import type`)
from `opensheetmusicdisplay` since the enum members are needed at runtime.

## Arpeggio chord rolling: group by `VoiceEntry.Arpeggio`, stagger by `ArpeggioType`

**PATTERN:** `note.ParentVoiceEntry.Arpeggio` returns the chord's `Arpeggio` object.
Notes in the same voice entry share the same object reference — use it as a `Map` key.
Sort the group ascending (UP / directionless) or descending (DOWN types) by `halfTone`,
then schedule each note at `baseTicks + i * ARPEGGIO_STEP_TICKS`. Six ticks (~15 ms at
120 BPM) per step produces a perceptible roll without audibly delaying the chord.

## PATTERN: momentum scroll — EMA velocity + time-based exponential deceleration

Track drag velocity in `touchmove` with an exponential moving average so brief direction
reversals don't corrupt the end-of-drag velocity:

```typescript
const inst = (clientX - lastMoveX) / dt; // px/ms instantaneous
velocityPx  = velocityPx * 0.7 + inst * 0.3; // EMA (α = 0.3)
```

On `touchend`, if `|velocityPx| > 0.05`, fire a RAF loop with time-based deceleration so the
rate is frame-rate independent:

```typescript
const MOMENTUM_DECELERATION = 0.95; // per 16 ms — increase toward 1 for a longer glide

function step(now: number): void {
  const dt = Math.min(now - lastTime, 64); // cap: avoid jump after tab hide/show
  lastTime = now;
  velocity *= Math.pow(MOMENTUM_DECELERATION, dt / 16);
  if (Math.abs(velocity) < 0.05) { settleToNearestStep(true); return; }
  const next    = scrollOffsetPx + velocity * dt;
  const clamped = clampTranslate(next);
  applyTranslate(clamped);
  if (clamped !== next) { settleToNearestStep(true); return; } // boundary hit
  momentumFrameId = requestAnimationFrame(step);
}
```

The coast is unchanged by the snap work — it still runs free, and the preview line simply tracks the
nearest onset through it. Call `settleToNearestStep(true)` whenever momentum stops (naturally, at a
boundary, or on cancel); see the next entry for what that does and why the ordering matters.

## PATTERN: commit the logical position, animate only the pixels

**This is the fix for "the cursor jumps backwards when I press play after scrolling."**

The old `syncCursorToCenter` wrote `Tone.Transport.ticks`, `currentCursorStep` and the cursor
element's `style.left` to the snapped step — but never called `applyTranslate`. The score kept
whatever arbitrary offset the finger produced while the playhead had already been rounded back to
the previous note, and the first frame of `animateCursorLoop` yanked the score onto the snapped note.
The rounding was always backwards (`nearestStepToPx` was a floor search despite its name), so the
error only ever went one way.

`settleToNearestStep(animate)` commits the logical position **synchronously**, then animates only
`translateX`:

```typescript
const step = nearestGridIndex(cursorSteps, viewportWidth / 2 - scrollOffsetPx);
currentCursorStep = step;                       // 1. logical position, immediately
Tone.Transport.ticks = Math.round(target.quarters * TONE_PPQ);
if (el) el.style.left = `${target.pxLeft}px`;
emitSectionIfChanged(Tone.Transport.ticks);
startScoreGlide(step, hideSnapPreview);          // 2. pixels only
```

Two consequences worth keeping:

- Transport and translate can never disagree at rest, so the whole class of bug is structurally gone.
- **Pressing play mid-glide is safe.** `startPlayback` calls `cancelScoreGlide(true)`, the transport
  is already correct, and the RAF loop's first `applyTranslate` lands exactly where the glide was
  heading. Nothing jumps in either path.

The glide holds its target as a **step index**, not a translate value, and re-derives
`viewportWidth / 2 - pxLeft` every frame — a resize mid-flight would otherwise fly to an offset
computed for the old viewport.

**LANDMINE: the RAF cancellation matrix.** Four RAF loops now exist and three of them write
`scrollOffsetPx`, so they must be mutually exclusive:

| Loop | Variable | Writes translate |
|---|---|---|
| Playback cursor | `animFrameId` | yes |
| Momentum coast | `momentumFrameId` | yes |
| Settle glide | `glideFrameId` | yes |
| Handle drag | `dragRafId` (per handle) | yes, via edge-scroll |

`cancelScoreGlide(commit)` must run from `initTouchHandlers`' `touchstart` (abandon — the finger is
about to drive the score), both handles' `touchstart` (**commit**), `startPlayback` (commit),
`createLoop` (commit), `setActiveHand` (commit), `onViewportResize` (commit, *after*
`recomputeViewportMetrics`), `seekSection`, `_stopInternal` and `disposePlayback` (abandon).

**LANDMINE: cancelling a coast is not the same as resolving it.** Momentum moves *pixels only* —
the transport, `currentCursorStep` and the cursor element are not written until a settle runs. So
anything that acts on the playhead while momentum is live must call `settleFromCoast(animate)`, not
just `stopMomentum()`. Creating a loop mid-coast is the case that exposed this: `createLoop` snaps
its handles from the grid and so places them perfectly, while the score stayed parked between two
onsets and the cursor sat visibly behind handle A. `startPlayback` had the same shape — play from the
toolbar during a coast started from whatever tick the *previous* settle wrote, and the first RAF
frame dragged the score back there.

Which of the two to use:

| Caller | Call | Why |
|---|---|---|
| `createLoop` | `settleFromCoast(true)` | Cursor glides onto the grid while the loop unfurls from that same on-grid position |
| `startPlayback`, `setActiveHand` | `settleFromCoast(false)` | Both drive the translate themselves immediately after; a glide would just fight them |
| wrapper `touchstart` | `stopMomentum()` | The finger is taking over — resolving would be undone by the drag about to start |
| handle `touchstart` | `stopMomentum()` | A settle would slide the score under a finger holding a handle still, and editing a handle sets `loopModified` so the next play seeks to A anyway |
| `seekSection`, `_stopInternal`, `disposePlayback` | `stopMomentum()` | The position the coast was heading for is about to be replaced or rewound |

The nastiest of these is the **handle `touchstart`**: it calls `stopPropagation`, and the wrapper's
own handler bails on `.loop-handle` targets anyway, so nothing there cancels momentum or the glide.
Before this was added, grabbing a handle during a coast let the score keep sliding under a held
finger — and because `dragFrame` re-projects the finger through the *current* `scrollOffsetPx`, the
handle looked correct while the score drifted, which is very hard to read as a bug.

## Loop boundary ticks come from half-open grid indices

**PATTERN:** A loop is a half-open range of snap-grid indices — `aStep` is the first note played,
`bStep` the first target *not* played — and `loopFromSteps` derives pixels and ticks from that pair.
`loopRegion.aPx/bPx/aTicks/bTicks` are caches, never edited on their own.

That reading reproduces the tick rules the old pixel-based helpers were reaching for, without any of
their special cases:

- `aTicks` is an onset's own ticks. The deleted `pxToLoopStartTicks` used a *ceiling* search to get
  there, because a floor would have included notes just before A that the user meant to exclude.
  A now **is** a note, so there is nothing to round.
- `bTicks` is the ticks of the first excluded target — literally the deleted `pxToLoopEndTicks`'s
  "step AFTER the last included note" rule. Setting `loopEnd` to the last *included* note's ticks
  makes Tone fire the wrap at the moment that note is scheduled, so it never sounds.
- The old end-of-piece fallback (`totalQuarters * TONE_PPQ` when B was on the final note) is now the
  terminal target's own `quarters`. `buildSnapGrid` normalises it to at least
  `lastOnset + LOOP_MIN_QUARTERS`, which is what makes `clampLoopIndices` total: dragging B to the
  end always yields a legal loop, so the final note is always loopable.

`ceilStepToPx`, `pxToLoopStartTicks`, `pxToLoopEndTicks` and `nearestStepToPx` are all gone.
`ticksToStep` stays a floor search — the RAF interpolation depends on it.

**LANDMINE: never round-trip a step through ticks.** `ticksToStep(Math.round(q * TONE_PPQ))` floors
over `quarters`, and the `round` can go *up*, so the trip lands on the **previous** step wherever a
position is not an exact tick multiple — tuplets, mostly. `seekToStep(step, ticks?)` exists for this:
wherever the caller already knows the index, pass the index. `startPlayback`'s seek to loop A goes
through it, otherwise a loop starting on a triplet would begin one note early.

## A measure's first onset is anchored to its barline — one pixel, shared by everything

**PATTERN:** `buildTimelines` records each measure-opening step's barline (`measureBoundsPx`) and
`anchorToBarlines` (`domain/scoreGrid.ts`) writes the result straight into `CursorStep.pxLeft`.
There is exactly **one** pixel per grid point, read by the snap search, the preview line, the loop
overlay, `pxAtTicks` for section seams, the scroll clamp and the playback interpolation alike.

That single value is the whole point. The obvious alternative — a "notehead pixel" for playback and
a "barline pixel" for overlays — was designed and rejected: it parks the playhead ~22 px inside the
loop shade at every loop start and wrap, which is the same defect as the off-grid cursor bug that
motivated the grid in the first place, only permanent.

**The cost, measured on Bach BWV 846 (28 px per sixteenth as 1.0×; median shift 6.9 px, max 22.8):**

| step | before | after |
|---|---|---|
| into the barline (last note of the measure) | 1.50× | **1.25×** |
| out of the barline (downbeat) | 1.28× | **1.52×** |

The engraving already bulges either side of a barline; anchoring only redistributes the bulge, and
the result is not noticeable in practice. **Do not "smooth" even that** by reintroducing a second
pixel per step.

An earlier revision of this note claimed 0.71× / 2.06×. That was measured while `measureBoundsPx`
still carried the cursor's `- 1.5` offset (see `osmd-webview.md`), which inflated the shift from
6.9 px to 21.9 px. If you find figures in that range anywhere, the offset bug is back.

Two rules inside `anchorToBarlines` that are not decoration:

- **The opening measure is never anchored.** Its left edge is the edge of the engraving, so the
  playhead would sit left of the clef, and `scrollMaxPx` (which reads `cursorSteps[0].pxLeft`) would
  follow it there.
- **An anchor never reaches back past the previous onset**, except across a repeat's back-jump,
  where the pixel sequence descends and the previous step says nothing about how far left this one
  may go. That guard is what preserves the ascending-pixel invariant `nearestGridIndex`
  binary-searches on. On the prelude it never has to fire (34 anchored steps, 0 clamped), but a
  measure whose first entry carries accidentals has a 37.8 px inset against ~28 px steps, so it can.

## LANDMINE: `Iterator.EndReached` fires while cursor is still AT the final note

**LANDMINE:** Some OSMD builds set `cursor.Iterator.EndReached = true` while the cursor is still
positioned AT the final note — not past it. The standard `while (!EndReached)` walk exits before
pushing that position, so the final note is never captured in `cursorSteps`. Effects:
- Handle B cannot reach the last note's pixel position (it clamps to the second-to-last note).
- The cursor never visually reaches the final note during playback.
- The snap grid's terminal target is derived from the final onset, so a missing final step puts the
  end of the piece in the wrong place and the last note cannot be looped.

**Fix:** After the while-loop, check whether the cursor element's current `style.left` is strictly
beyond the last captured step's `pxLeft`. If so, capture it as an extra step:

```typescript
const finalPxLeft = parseFloat(el?.style.left ?? '0');
const lastCapturedPx = steps[steps.length - 1]?.pxLeft ?? -1;
if (finalPxLeft > lastCapturedPx) {
  const q = osmd.cursor.Iterator.CurrentEnrolledTimestamp.RealValue * WHOLE_TO_QUARTER;
  const expandedQ = q + tickShift / TONE_PPQ;
  lastExpandedQuarters = expandedQ;
  steps.push({ quarters: expandedQ, pxLeft: finalPxLeft, osmdIdx });
}
```

Place this immediately after the while-loop, before setting `totalQuarters`.

## PATTERN: `effectiveQE` snap — prevent cursor sitting at B for an extra RAF frame

When Tone's transport loops, `Transport.ticks` wraps from `bTicks` back to `aTicks` on the audio
thread. The main-thread RAF callback may fire one or more times while `Transport.ticks` still
reflects the old (pre-wrap) value, leaving the cursor visually parked at the B position for a
frame before jumping back.

**Fix:** Compute an `effectiveQE` (effective quarters elapsed) that snaps to `aTicks/TONE_PPQ`
the moment `quartersElapsed` reaches or passes `bTicks/TONE_PPQ`:

```typescript
const quartersElapsed = Tone.Transport.ticks / TONE_PPQ;
const effectiveQE =
  loopRegion !== null && quartersElapsed >= loopRegion.bTicks / TONE_PPQ
    ? loopRegion.aTicks / TONE_PPQ
    : quartersElapsed;
```

Use `effectiveQE` for the binary step search and the interpolation fraction. Also clamp the
interpolated pixel to `loopRegion.bPx` so the cursor never drifts into the handle-B area when
interpolating toward a next-step that lies outside the loop:

```typescript
const rawPx = currPx + fraction * (nextPx - currPx);
const interpolatedPx = loopRegion !== null ? Math.min(rawPx, loopRegion.bPx) : rawPx;
```

## LANDMINE: `dx` accumulation for handle drag breaks when edge-scroll runs concurrently

Computing `newPx = startPx + (clientX - startTouchX)` tracks the finger correctly while the
score is stationary, but fails the moment edge-scrolling shifts `scrollOffsetPx`: the score
moves while `startPx` stays fixed, so the handle drifts left relative to the finger on every
auto-scroll step.

**Fix:** project the finger's viewport position into score space on every frame using the
*current* `scrollOffsetPx`. Capture `startScrollOffset = scrollOffsetPx` at `touchstart`,
then in each frame:

```typescript
const initialOffset = startPx + startScrollOffset - startTouchX; // constant
newPx = clientX + initialOffset - scrollOffsetPx;
```

As `scrollOffsetPx` changes (edge scroll), `newPx` is recomputed to compensate, keeping the
handle locked to the finger in viewport space.

## LANDMINE: `bpm.setValueAtTime("Xi")` is broken for multi-tempo scores — use `Transport.schedule`

**LANDMINE:** Scheduling BPM changes in `initPlayback` via
`Tone.Transport.bpm.setValueAtTime(bpm, "Xi")` has three failure modes for routine playback:

1. **"One beat early":** `"Xi"` is converted to an absolute AudioContext time at call time.
   If sample loading takes ~1–2 s before `Transport.start()`, the deadline is already that many
   seconds in the past relative to when the transport actually starts — the BPM fires ~1 beat early
   at 40 BPM.

2. **Replay at wrong BPM:** AudioParam events are one-shot. After a full playthrough the
   AudioParam is stuck at the last tempo (e.g. 160 BPM). The next `Transport.start()` has no
   scheduled changes left; BPM stays at 160 for the entire replay.

3. **Wrong BPM when starting mid-score:** `initPlayback` only sets the initial BPM for tick 0.
   If the user scrolls to a later section and presses play, the BPM is at the initial value
   until the scheduled AudioParam change fires — which may be well into the score.

**Fix:** Register BPM changes via `Tone.Transport.schedule()` instead. Transport events fire
relative to transport ticks, replay correctly on every `Transport.start()`, and are skipped when
starting past their tick:

```typescript
for (const { ticks, bpm } of scheduledChanges) {
  const id = Tone.Transport.schedule((time) => {
    Tone.Transport.bpm.setValueAtTime(bpm, time);
  }, `${ticks}i`);
  tempoScheduleEventIds.push(id);
}
```

Before each `Transport.start()`, cancel stale AudioParam values and set the BPM for the current
position so the correct tempo is audible from the first note:

```typescript
Tone.Transport.bpm.cancelScheduledValues(0);
const posTicks = Tone.Transport.ticks;
let bpmForPos = initialBpmValue;
for (const { ticks, bpm } of tempoChangeSchedule) {
  if (ticks <= posTicks) bpmForPos = bpm;
  else break;
}
Tone.Transport.bpm.value = bpmForPos;
```

Track event IDs in `tempoScheduleEventIds[]` and clear with `Tone.Transport.clear(id)` in
`disposePlayback`. Also clear and re-register on every `initPlayback` call so stale events from
a previous score load don't accumulate.

## LANDMINE: `startPlayback()` BPM reset overwrites user-set tempo

**LANDMINE:** The BPM reset block in `startPlayback()` sets `Tone.Transport.bpm.value` to the
score-position tempo on every play — including resume after a speed-picker change. This overwrites
any multiplier or warm-up BPM that was applied via `setTempoBpm()`.

**Fix:** Track the user-set BPM in a module variable `userBpmOverride: number | null`. Set it in
`setTempoBpm()`; use `userBpmOverride ?? bpmForPos` in `startPlayback()`. Reset to `null` in
`initPlayback()` and `disposePlayback()`. Multi-tempo routines never call `setTempoBpm()`, so the
override stays `null` and score-position BPM is used unchanged.

## LANDMINE: read `Tone.Transport.ticks` before `bpm.value` assignment in `startPlayback()`

**LANDMINE:** The loop-seek condition in `startPlayback()` originally re-read `Tone.Transport.ticks`
after `Tone.Transport.bpm.value = X`. Changing BPM while the transport is paused can cause Tone.js
to recompute the paused tick position via the clock integral, producing a stale value that falls
outside `[aTicks, bTicks)`. This falsely triggered the loop-start jump on every pause/play or
speed-picker change.

**Fix:** Read `Tone.Transport.ticks` once into `posTicks` **before** `cancelScheduledValues()` and
`bpm.value` are set. Use `posTicks` for both the multi-tempo BPM lookup and the loop-seek condition
— no second read.

## PATTERN: run handle drag in a RAF loop, not only on `touchmove`

`touchmove` fires only when the finger moves. Edge-scrolling must continue even when the finger
is stationary near the viewport edge.

**Fix:** `touchmove` only updates a `currentClientX` variable (plus `e.preventDefault()`).
All scroll + handle-reposition logic runs in a `requestAnimationFrame` loop started on
`touchstart` and cancelled on `touchend`:

```typescript
function dragFrame(): void {
  // 1. proportional edge scroll — update scrollOffsetPx
  // 2. newPx = currentClientX + initialOffset - scrollOffsetPx
  // 3. clamp, update loopRegion, updateLoopOverlay()
  dragRafId = requestAnimationFrame(dragFrame);
}
el.addEventListener('touchstart', () => { dragRafId = requestAnimationFrame(dragFrame); });
el.addEventListener('touchmove',  (e) => { e.preventDefault(); currentClientX = e.touches[0].clientX; });
el.addEventListener('touchend',   () => { cancelAnimationFrame(dragRafId!); loopModified = true; });
```

Because auto-scroll runs before the `newPx` projection in each frame, `scrollOffsetPx` is
already up-to-date when the handle position is computed — no single-frame lag.

## PATTERN: OSMD `GraphicSheet` note coloring for hand filtering

To grey out one staff's notes without triggering a re-render, traverse the graphical tree and
call `note.setColor()` directly on each `GraphicalNote`:

```typescript
const coloringOpts = {
  applyToNoteheads: true, applyToBeams: true, applyToFlag: true,
  applyToStem: true, applyToLedgerLines: true,
};
for (const measureRow of osmd.GraphicSheet.MeasureList) {
  for (let si = 0; si < measureRow.length; si++) {
    const measure = measureRow[si];
    if (!measure) continue;
    const greyed = (activeHand === 'right' && si === 1) || (activeHand === 'left' && si === 0);
    for (const staffEntry of measure.staffEntries) {
      for (const voiceEntry of staffEntry.graphicalVoiceEntries) {
        for (const note of voiceEntry.notes) {
          note.setColor(greyed ? '#B0B0B0' : '#000000', coloringOpts);
        }
      }
    }
  }
}
```

Staff index mapping (0-based in `MeasureList`): `si === 0` → right hand (treble, MusicXML
`<staff>1</staff>`); `si === 1` → left hand (bass, `<staff>2</staff>`). This matches
`note.ParentStaff.idInMusicSheet` used to filter `noteEvents` in `buildTimelines`.

The coloring persists across `Transport.start/stop` cycles because it is applied to the
rendered SVG elements directly; it is re-applied on every `initPlayback` and on every
`setActiveHand` call.

## PATTERN: Rebuild `Tone.Part` without losing cursor position

When rebuilding the Part on a hand-filter change, save position state **before** `stopPlayback()`
resets it, then restore after Part creation:

```typescript
// 1. Capture before stop
const savedTicks = Tone.Transport.ticks;
const savedStep  = currentCursorStep; // -1 if never played
const savedScrollPx = scrollOffsetPx;

if (Tone.Transport.state !== 'stopped') stopPlayback();
// stopPlayback → _stopInternal sets: currentCursorStep=0, osmdActualIdx=0, Transport.ticks=0

// 2. Rebuild timelines (buildTimelines calls osmd.cursor.reset() at the end,
//    leaving osmdActualIdx=0 and the OSMD cursor at position 0)
const { noteEvents } = buildTimelines(osmdRef);

// 3. Rebuild Part (hand-filtered noteEvents, same sampler + tempo schedule)
part?.dispose();
part = new Tone.Part(..., noteEvents);
part.start(0);

// 4. Restore position
const step = Math.max(0, Math.min(savedStep < 0 ? 0 : savedStep, cursorSteps.length - 1));
Tone.Transport.ticks = savedTicks;
advanceCursorTo(step);   // advances from osmdActualIdx=0; must be called BEFORE setting currentCursorStep
currentCursorStep = step; // advanceCursorTo early-returns if targetStep === currentCursorStep
applyTranslate(savedScrollPx !== 0 ? savedScrollPx : scrollMaxPx);
```

Key ordering constraint: call `advanceCursorTo(step)` **before** assigning `currentCursorStep`,
because `advanceCursorTo` short-circuits when `targetStep === currentCursorStep`.

## PATTERN: Count-in pre-roll (metronome before a fresh start)

The count-in setting (0/1/2 measures, `settings.md`) plays N measures of metronome clicks before
a piece, routine, or loop begins. The pure schedule math lives in `src/domain/countIn.ts`
(`computeCountIn`); `playback.ts` supplies the meter/tempo it reads from OSMD.

**Meter + pickup come from OSMD `SourceMeasure`, captured in `buildTimelines`:**
```typescript
const sm = measure as { ActiveTimeSignature?: {...}; ImplicitMeasure?: boolean };
measureMeta.push({ startTicks, num: sm.ActiveTimeSignature.Numerator,
                   den: sm.ActiveTimeSignature.Denominator, implicit: sm.ImplicitMeasure });
```
Beats per measure = numerator; one beat = `(60/bpm) * (4/den)` seconds. A pickup is an
`ImplicitMeasure` first measure — its duration (`measureMeta[1].startTicks - measureMeta[0]`) is
folded into the LAST counted measure, so the audio starts that many beats early and the prelude
sounds as the tail of the count-in. A loop that starts partway through a measure is folded the same
way via `loopLeadInBeats(beatOffset, beatsPerMeasure)` — the beats from the measure's downbeat to
the loop start become the count-in's tail, so the loop enters on its natural beat and the count-in's
downbeats stay aligned with the loop's bar grid. A loop on a downbeat has no lead-in.

**Timing — clicks on the raw audio clock, transport deferred to a sample-accurate future time:**
```typescript
const startAt = ctx.currentTime + 0.12;               // small lead so click 1 isn't clipped
countInNodes = clicks.map((c) => playClick(ctx, startAt + c.offsetSec, c.accented));
countingIn = true;
Tone.Transport.start(startAt + delaySec);             // first note lands exactly on the beat
```

**LANDMINE (interacts with the `Transport.start(offset)` state trap above):** because the
transport is scheduled to start in the future, `Tone.Transport.state` reads `'stopped'` during the
pre-roll, which would kill the RAF cursor loop. The `countingIn` flag keeps `animateCursorLoop`
requesting frames (cursor parked at the start) until the transport actually starts; on the first
`'started'` frame it clears `countingIn` and drops `countInNodes` (so a later mid-piece pause is
not mistaken for a count-in abort).

**Eligibility — only a *fresh* start counts in**, never a resumed pause. The rule is pure and lives
in `domain/countIn.ts` as `isFreshStart` (tested): piece/routine when `posTicks <= firstStepTicks`;
loop when `startPlayback` seeks to the A handle (`didLoopSeek`), *or* when a cancelled count-in is
owed a retry (below). `countInMeasures` is set via `__rn_set_count_in` and, as a user setting, is
preserved across score reloads (`disposePlayback` keeps it).

**LANDMINE: `Tone.Transport.state` is not "is it playing?" — use `isPlaybackActive()`.** The state
getter reports the state *at now*, so throughout a count-in — whose transport start is scheduled in
the future — it reads `'stopped'`. There is a second blind window before it, while `startPlayback`
awaits `Tone.loaded()`, which is seconds on a cold first play. In both, the native shell has already
been told `'playing'` (the post moved to the top of `startPlayback` so the toolbar leaves on the
tap), so the user sees a playing screen and taps it to stop.

Six call sites tested `Tone.Transport.state === 'started'` and all six were wrong in those windows.
The tap handler was the one that bit: it read the tap as a *fresh start*, called `startPlayback()`
again, and scheduled a second pre-roll over the first — heard as two competing sets of clicks, one
more per tap. `isPlaybackActive()` (`state === 'started' || countingIn || startPending`) is now the
only sanctioned test; a raw state check in `playback.ts` is almost certainly a bug.

`startPending` needs a companion: a start parked on the `await` must not wake up and seize a
transport that has since been cancelled. Every cancel bumps a module `playToken`, and `startPlayback`
compares the token it captured before the await and returns if it has been superseded.

**Cancelling a pre-roll — `abortStart`, deliberately not `_stopInternal`.** Nothing has sounded, so
there is no position to freeze; but `_stopInternal` rewinds to the top of the piece, which is a
no-op at bar 1 and throws the score back from a loop's A handle to the start of the piece. Nothing
needs restoring visually either — `animateCursorLoop` parks itself during the pre-roll, so the score
is still where the start left it. Only the transport position does, because `Transport.stop()`
rewinds it as a side effect of cancelling the scheduled start; `countInOriginTicks` puts it back.

That leaves the playhead on A having never played a note — positionally identical to a pause taken
on A, which is exactly the case `isFreshStart` refuses. So the abort sets `countInReArmed`, honoured
by the next start only while `posTicks` is still `countInOriginTicks` (cancel, scroll elsewhere in
the loop, press play → an ordinary mid-loop resume again). Without it, cancelling a loop's count-in
would silently buy you a loop with no pre-roll.

## Sections: junction ticks, and why they must not come from `noteEvents`

`setSections(indices, colors)` turns 0-based measure indices into transport ticks once per load, then
`emitSectionIfChanged` posts `SECTION_INDEX` only when the index actually changes — about once per
section, never per frame, even though it is called from several per-frame paths.

There are **two** position sources, because the playhead moves in two different ways:

- **Playing** — `animateCursorLoop` passes the transport position (loop-aware `effectiveQE`).
- **Panning** — the transport has not moved, only the score has, so `emitSectionAtScrollOffset`
  derives the position from `scrollOffsetPx` via `nearestGridIndex(cursorSteps, viewportWidth / 2 -
  offset)`. It is called on every `touchmove` and every momentum frame. Relying on
  `settleToNearestStep` alone (which runs on lift and when momentum settles) makes the label lag the
  score visibly — the name only flips once the scroll stops, long after the centre line crossed the
  junction. It uses *nearest*, matching the preview line and the settle; flooring instead would let
  the label flip only after the glide had already landed, which reads as a different kind of lag.

`_stopInternal` also emits at tick 0: `Transport.stop()` rewinds, and without it a piece that plays
to the end leaves the label showing the final section while the cursor sits at the start.

**LANDMINE:** `noteEvents` is **filtered by `activeHand`**, and `setActiveHand` re-runs
`buildTimelines` to rebuild it. Deriving anything score-structural from it means that structure
silently changes when the user practises one hand. Section junctions did exactly this in an early
draft: switching to left-hand-only moved every junction, because the rest-separation test stopped
seeing the right-hand notes.

`buildTimelines` therefore also fills `noteSpans` — `{start, end}` per note in ticks, pushed
**before** the `activeHand` check, so it is identical for every hand setting:

```typescript
if (note.halfTone < 9 || note.halfTone > 115) continue;
const spanQ = note.Length.RealValue * WHOLE_TO_QUARTER;
if (spanQ > 0) spans.push({ start: baseTicks, end: baseTicks + Math.round(spanQ * TONE_PPQ) });
if (activeHand !== 'both') { /* … filter … */ }
```

**Anacrusis offset.** With a pickup (`measureMeta[0].implicit`), phrase starts sit
`measureMeta[1].startTicks` *before* each barline. `sectionStartTickFor` applies that offset only
when the upbeat is real: note onsets inside `[bar - anacrusis, bar)` **and** nothing sounding across
the window's start. Testing only for "notes in the window" fires almost always — a section normally
ends with a full measure — so it would be indistinguishable from an unconditional offset. Ticks
compare with a 1-tick epsilon because note ends are rounded.

**`seekToTicks` is the single seek primitive.** Transport ticks, the OSMD iterator
(`advanceCursorTo`), the cursor element's `style.left`, and `applyTranslate` all have to move
together; the loop-start seek in `startPlayback` and `seekSection` both go through it so they cannot
drift apart.

**Junction marks are static DOM, not per-frame drawing.** `renderSectionMarks` builds four absolutely
positioned divs per junction (two gradient ramps, two 1px seam lines) as children of `#section-marks`
inside `#osmd`. Because `#osmd` is what `applyTranslate` transforms, the marks scroll with the score
for free — there is no per-frame cost and nothing to keep in sync. They are rebuilt only when the
section list changes, and cleared in `disposePlayback` for the same reason the loop handles are: they
are positioned in score pixels, so surviving into the next score would paint them at stale
coordinates.

Marks sit at **junctions only** — between two sections, so *n* sections produce *n−1* marks and the
opening of the piece is unmarked. Each junction draws the outgoing section's color fading away to the
left and the incoming section's fading away to the right, meeting at a two-pixel seam (one pixel of
each) at full opacity. The seam is what keeps a junction visible when two neighbouring sections
happen to draw the same hue, which the gradients alone would blur into one continuous wash.

The fade reach is *measured*, not assumed: `fadeReachPx` converts half a measure of the junction's
own meter into pixels via `pxAtTicks`, then clamps to `[20, 130]`. Engraved measure widths vary by an
order of magnitude between a whole-note bar and a run of semiquavers, so a fixed pixel reach reads as
a different amount of music in different parts of the same score.

Gradients ramp to `transparent` rather than to an explicit zero-alpha color. CSS interpolates gradient
stops with premultiplied alpha, so `transparent` does not drag the ramp through grey; writing
`rgba(r,g,b,0)` instead would require parsing the palette string web-side for no gain.

# OSMD + WebView landmines (Phase 2)

Traps found during Phase 2 implementation. Check here before touching `score-web/src/` or the WebView bridge.

## `osmd.load()` must be awaited before `osmd.render()`

**LANDMINE:** `OpenSheetMusicDisplay.load()` returns a `Promise`. Calling `osmd.render()` synchronously after `osmd.load()` (without `await`) renders an empty or partially-parsed score with no error.

**Fix:**
```typescript
await osmd.load(xmlString); // await is mandatory
osmd.render();
```

## `originWhitelist={['*']}` required for inline HTML source

**LANDMINE:** When using `source={{ html: '...' }}` (inline HTML string) on `<WebView>`, Android WebView blocks the page load unless `originWhitelist` is explicitly widened. The default `['http://*', 'https://*']` does not cover `about:blank` (the origin of an inline HTML string), so the WebView silently shows a blank page.

**Fix:** Always set `originWhitelist={['*']}` when using `source={{ html }}`.

## `baseUrl` required for Android to load large inline HTML

**LANDMINE:** On Android, `source={{ html }}` calls `loadDataWithBaseURL(null, html, ...)`. Without a `baseUrl`, large HTML strings (≥ ~1 MB) load silently as a blank page — `onLoad`/`onLoadEnd` still fire, but the document is empty and no inline scripts execute.

**Fix:** Always include `baseUrl`:
```jsx
source={{ html: SCORE_WEB_HTML, baseUrl: 'file:///android_asset/' }}
```

## `webViewRef.current.postMessage()` is web→native only

**LANDMINE:** In react-native-webview, `webViewRef.current.postMessage(data)` sends a message **from the web page to native** (it is the imperative counterpart to `window.ReactNativeWebView.postMessage`). It does NOT deliver a message to the web page. The correct **native→web** channel is `injectJavaScript`.

**Fix:** Expose a named global in the web page bundle and call it via `injectJavaScript`:
```typescript
// score-web/src/index.ts
(window as unknown as { __rn_load_xml: (xml: string) => void }).__rn_load_xml = async (xml) => { ... };

// native [id].tsx
webViewRef.current?.injectJavaScript(`window.__rn_load_xml(${JSON.stringify(xml)});void 0;`);
```
`injectJavaScript` must end with `;void 0;` on Android to avoid evaluation-result issues.

## `DOMContentLoaded` never fires for inline scripts

**LANDMINE:** When an inline `<script>` runs, the page has already been parsed — `DOMContentLoaded` fired before the script began executing. `document.addEventListener('DOMContentLoaded', ...)` inside the script registers a listener that will never be called.

**Fix:** Use the WebView component's `onLoadEnd` prop on the native side instead of listening for `DOMContentLoaded` in the web bundle. `onLoadEnd` fires after the page (and all its inline scripts) have finished loading.
```jsx
<WebView onLoadEnd={() => setWebViewReady(true)} ... />
```

## OSMD constructor can throw and abort the entire IIFE

**LANDMINE:** The score-web bundle is an IIFE. If `new OpenSheetMusicDisplay(...)` (or any code before your entry-point assignment) throws, the IIFE aborts immediately — everything after the throw, including your `window.__rn_load_xml = ...` assignment, is never reached. The function will be `undefined` when called from `injectJavaScript`.

**Fix:** Assign the entry-point global **before** initialising OSMD, and wrap OSMD init in try-catch:
```typescript
let osmd: OpenSheetMusicDisplay | null = null;

window.__rn_load_xml = async (xml) => {
  if (!osmd) { postToNative({ type: 'ERROR', payload: 'OSMD not ready' }); return; }
  ...
};

// OSMD init below — safe to throw now
try {
  osmd = new OpenSheetMusicDisplay(container, { ... });
} catch (err) {
  postToNative({ type: 'ERROR', payload: String(err) });
}
```

## esbuild target must be `chrome58` or lower for Android WebView

**LANDMINE:** OSMD uses logical-assignment operators (`&&=`, `||=`) which are ES2021. The esbuild `es2020` target does not transform them. Android WebViews below Chrome 85 throw `SyntaxError: Unexpected token '='` when parsing the bundle, silently aborting the entire script.

**Fix:** Lower the esbuild target in `score-web/build.mjs`:
```javascript
target: ['chrome58'],
```
`chrome58` (2017) covers logical assignment, optional chaining, nullish coalescing, class fields, and async/await lowering for older engines.

## `String.replace(str, str)` corrupts bundles that contain `$&`

**LANDMINE:** `String.prototype.replace(searchStr, replacementStr)` treats special `$`-patterns in the replacement string: `$&` → insert the matched string, `` $` `` → insert the string before the match, `$'` → insert the string after the match. The minified OSMD bundle contains `$&` sequences (bitwise AND applied to a `$`-named variable), so naïve substitution of the bundle into an HTML template string corrupts ~15 sites in the output.

**Fix:** Use a function as the replacement argument — functions bypass all `$`-pattern interpretation:
```javascript
// WRONG — $& in bundleText is treated as a replacement specifier
html.replace('/* BUNDLE_PLACEHOLDER */', bundleText);

// CORRECT
html.replace('/* BUNDLE_PLACEHOLDER */', () => bundleText);
```

## `window.ReactNativeWebView` cast in strict TypeScript

**LANDMINE:** `window.ReactNativeWebView` is injected by `react-native-webview` at runtime and is not in the standard DOM type definitions. A direct cast `(window as { ReactNativeWebView: ... })` is rejected by TypeScript strict mode because `Window & typeof globalThis` is not a supertype of the narrowed form.

**Fix:** Double-cast via `unknown`:
```typescript
const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } })
  .ReactNativeWebView;
rn?.postMessage(JSON.stringify(msg));
```
Optional chaining (`?.`) means a missing injection is silently dropped instead of throwing at runtime.

## score-web build output must not be Prettier-formatted

**LANDMINE:** `src/score-web/html.ts` is a generated file containing a ~1 MB minified JS bundle inside a TypeScript template literal. Running Prettier over it is extremely slow and may corrupt the escape sequences inside the string (e.g., `\`` → `\\\``).

**Fix:** Add to `client/.prettierignore`:
```
src/score-web/html.ts
score-web/
```

## score-web/ must be excluded from the main tsconfig

**LANDMINE:** `client/tsconfig.json` has `"include": ["**/*.ts", ...]` which catches `score-web/src/*.ts`. Those files use DOM APIs (`document`, `window`, `MessageEvent`) that are not in the React Native TypeScript environment. Without excluding them, `tsc --noEmit` produces a cascade of "cannot find name 'document'" errors.

**Fix:** Add to `client/tsconfig.json`:
```json
"exclude": ["score-web/**", "node_modules"]
```
The `score-web/` project has its own `tsconfig.json` that declares `"lib": ["ES2020", "DOM"]`.

## score-web sub-project needs npm install before npm ci

**NOTE:** The build script (`npm run build:score-web`) uses `npm ci`, which requires `score-web/package-lock.json`. On first clone or after deleting `score-web/node_modules/`, run `cd score-web && npm install` once to generate the lock file, then commit it. Subsequent runs use `npm ci` for reproducible installs.

## Hiding the OSMD default cursor element

The OSMD cursor (`cursor.cursorElement`) is an `<img>` that renders as a green arrow at the current step. We use a custom `#cursor-line` div for the visual cursor instead.

**Fix:** After every `cursor.show()` call, set `visibility: hidden` on the element:
```typescript
function hideCursorEl(): void {
  const el = cursorEl(); // accesses cursor.cursorElement
  if (el) el.style.visibility = 'hidden';
}
```

Call `hideCursorEl()` immediately after every `cursor.show()` in `buildTimelines`,
`advanceCursorTo`, `_stopInternal`, and `initPlayback`. OSMD resets the element's
display on each `show()` call, so a single hide at init is not enough.

The element must remain in the DOM — `style.left` is read every frame for scroll math.
Use `visibility: hidden` (not `display: none`) so layout and position reads are unaffected.

## Loop overlay: CSS transitions need a style flush and must be torn down

**LANDMINE:** The loop overlay runs two CSS transitions through one helper,
`animateLoopOverlay(from, to)` in `playback.ts`: the create-time unfurl out of the cursor
(`unfurlLoopFromCursor`) and the settle onto the note grid after a handle is released
(`glideLoopOverlay`). Both set a start geometry, then the final geometry, with a CSS `transition` in
between. Both share `loopUnfurlTimeoutId` so a single `endLoopOverlayTransition()` kills either one.
Two traps:

1. On creation the handles go from `display: none` to `display: flex` in the same task. Without a
   forced style flush the browser coalesces the collapsed and final writes into one recalculation,
   so no transition runs and the loop pops into place. Read a layout property between the two
   writes: `void el.offsetWidth;` (it survives esbuild minification — verified in the bundle).
   Keep it unconditional even though the release settle starts from already-visible elements: it is
   free, and the failure mode — no animation at all — is silent.
2. Handle dragging rewrites `style.left` every RAF frame. A transition left on the element
   makes the handle lag behind the finger, so it must be cleared (`endLoopOverlayTransition`) when
   the animation ends, when a drag starts, and on clear/dispose. A handle grabbed *during* its own
   release settle is exactly this case.

## LANDMINE: do NOT copy the cursor's `- 1.5` when converting OSMD geometry

OSMD lays out in abstract units. The drawn position of anything is `10 * units * zoom` — verified
directly against VexFlow: for any measure that expression equals its `stave.getX()`.

OSMD's `Cursor.updateWidthAndStyle` looks like it disagrees:

```
left = 10 * (x - 1.5) * zoom      // default cursor type
```

**It does not.** The cursor element is an `<img>` **30 px wide**, and 1.5 units is half of it, so the
offset centres the image on the note. `cursorElement.style.left` is the left edge of a box, not a
point. The note grid reads it as a point deliberately — that is what puts the playhead just left of
a notehead instead of through it.

So a barline, which is drawn geometry and already a point, must use `10 * units * zoom` with **no**
offset. Copying the cursor's `- 1.5` onto it renders every seam, handle and settled cursor exactly
15 px left of the barline at zoom 1 — subtle enough to look like a layout quirk rather than a bug,
and this repo shipped it once for exactly that reason.

Two further traps in the same area:

- **`GraphicalMeasure.PositionAndShape.AbsolutePosition.x` is the barline**, measured *before*
  `beginInstructionsWidth`. Adding that width instead gives you the position after the clef, key and
  time signature — a different thing, and not what "start of measure" means.
- **`MeasureList` is keyed by the printed measure index**, which is what the iterator reports as
  `CurrentMeasureIndex`. Pick the staff row entry the way OSMD itself does in
  `Cursor.findVisibleGraphicalMeasure` — first entry whose `ParentStaff.isVisible()` — or a score
  with a hidden staff resolves to geometry that is never drawn.

Measured on Bach BWV 846 at zoom 1: VexFlow's own note-start inset is `stave.getNoteStartX() -
stave.getX()` = **5 px**, and a measure's first grid pixel ends up a median **6.9 px** right of its
barline (max 22.8 where accidentals widen the entry). None of that is an engraving margin — sweeping
`EngravingRules.MeasureLeftMargin` from 2.0 to 0.0 does not move it by a single pixel. It is
VexFlow's inset inside the stave and it cannot be configured away, which is why the note grid
anchors measure starts explicitly instead.

## Score-pixel overlays must be hidden **and** reset on dispose

`#loop-handle-a`, `#loop-handle-b`, `#loop-shade`, `#section-marks` and `#snap-preview` are all
children of `#osmd`, positioned in score pixels. That is what makes them scroll with the score for
free — `applyTranslate` transforms their parent — but it also means they survive `__rn_load_xml`
and would paint at stale coordinates over the next score. `disposePlayback` therefore clears the
marks' children, hides the handles and shade, and hides the preview *and* resets its `left`.

`#snap-preview` uses `transform: translateX(-50%)`, mirroring `#cursor-line`'s own centring, so the
target line and the playhead coincide exactly when the score is settled instead of resting a pixel
apart. `#osmd` has `will-change: transform` and so forms a stacking context: the preview's
`z-index: 9` orders it against the shade and handles inside `#osmd`, while `#cursor-line` — a
sibling of `#osmd-wrapper` — always paints above regardless, which is the order you want.

The bit marker strip joins that list, and brings one hazard the others do not have: the
strip is rebuilt from `resolvedBits`, and `activeBitId` is what puts the *native* toolbar
into bit mode. Leaving either behind across a load gives the next score a toolbar offering
to leave and delete a bit that is not armed. `disposePlayback` clears the container's
children, `bitsInput`, `resolvedBits`, `activeBitId` and `osmdOffsetTopPx`, and drops the
`hidden` class so a score loaded while the previous one was playing does not come up with
invisible markers. Clearing `activeBitId` is not enough on its own — see the load-effect
landmine below for why it has to be announced.

## WebView bridge message protocol

Web→Native: web page calls `window.ReactNativeWebView.postMessage(data)`; native receives via `onMessage` prop.

Native→Web: native calls `webViewRef.current.injectJavaScript(code)`; executed in the WebView's JS context.

Readiness signal: native's `onLoadEnd` fires after inline scripts have run and `window.__rn_load_xml` is defined. Do not rely on a `READY` postMessage from the web page — `DOMContentLoaded` will never fire for inline scripts (see above).

The two protocol type files (`client/src/score-web/messageProtocol.ts` and
`client/score-web/src/types.ts`) are **duplicated by hand** — `score-web/**` is excluded from the
app tsconfig, so nothing links them and nothing fails if they drift. Adding a message means editing
both, then rebuilding the bundle.

### `SET_SECTIONS` must be sent after `LOADED`, not with the XML

`__rn_set_sections` resolves 0-based measure indices against `firstTicksBySourceIndex`, which
`initPlayback` builds while walking the score. Injecting it alongside `__rn_load_xml` runs it
against the *previous* score's data (or none at all). PlayView therefore injects it from its
`LOADED` handler.

Native never computes section positions itself: it sends indices and receives `SECTION_INDEX` back.
Keeping the tick math on one side is what stops the label and the seek target from disagreeing.

### `SET_BITS` must be sent after `LOADED`, for the same reason

Bits are persisted in ticks and resolve against the note grid, which does not exist until
`initPlayback` has walked the cursor. Same rule as `SET_SECTIONS`, same failure if broken:
every bit silently resolves against an empty grid and no markers appear.

### There is no ENTER_BIT message, on purpose

Bits are entered by tapping a marker, and markers are DOM elements inside the WebView — so
the web side both detects the gesture and performs the entry, and native only ever hears
about it afterwards through `BIT_ENTERED`. An `ENTER_BIT` inbound message existed briefly
and was never injected by anything; it is gone. Native's half of the bit protocol is
`SET_BITS`, `CREATE_BIT` and `LEAVE_BIT` — the three things it genuinely originates.

### Bit ids are minted natively, not in the WebView

`window.crypto.randomUUID` is not dependable across the Android WebView versions this
ships to, and a bit's id has to survive being written to SQLite. So `CREATE_BIT` carries an
id native generated with `expo-crypto`, and the web side answers with `BIT_CREATED` holding
the two tick bounds — the half of the record only it can supply, since `loopRegion` lives
there. Neither side owns the whole bit.

### Bit markers must not claim the touch the way loop handles do

`.loop-handle` calls `stopPropagation()` on `touchstart` and owns the gesture. Doing the
same for a marker would be wrong: a marker is as wide as the passage it loops, so a long
bit would turn a large strip under the staff into a region the score cannot be dragged
from. Markers instead let the touch bubble to `#osmd-wrapper` and reuse its existing
tap-versus-drag test — the touchstart target is remembered, and only a touch that never
passed the movement threshold is read as entering the bit.

The corollary is that the container must be `pointer-events: none` with the punches
`pointer-events: auto`, so the gaps between markers stay transparent, and that hidden
markers must also be `pointer-events: none` — an `opacity: 0` element still answers hit
tests, and a marker is invisible exactly when tapping it would be wrong.

### An armed bit's handles are inert by an early return, not a flag

A bit's bounds cannot be edited — the way to change one is to delete it and draw it again.
The handles are still drawn (they frame the region), so the drag has to be refused: the
`touchstart` listener returns early when `activeBitId !== null`, *after* `stopPropagation`,
so the touch is still consumed by the handle and does not pan the score out from under the
finger. `initLoopHandles` runs once at init and is not conditional, which is why the guard
lives in the listener rather than at wiring time.

Refusing the drag is only half of it: an inert handle that still shows its grip glyph
advertises an interaction that does nothing. The `.inert` class hides the glyph, and it is
set and cleared through `setHandlesInert` at every place the handles are shown or hidden —
never inferred at render time — so it cannot drift from `activeBitId`.

**And bailing out of `touchstart` is not enough on its own.** The other three listeners on
the element still fire, and `touchend` glided the overlay from `continuousPx` — a value
only `touchstart` ever writes, so on the first touch of a session it was still `0`. Tapping
an inert handle therefore flew *both* handles in from the left edge of the score. The guard
is now a per-gesture `dragActive` flag set in `touchstart` and tested by every later
listener, rather than each one re-reading `activeBitId`: a flag cannot go stale mid-gesture,
and it makes "this gesture never started" the single thing they all agree on. Any early
return from a `touchstart` needs the same treatment.

### An embossed shape on white paper needs a body darker than the page

The bit markers are meant to read as the page pushed up from behind. The obvious recipe —
white fill, white `inset` highlight along the top, dark `inset` underneath — produces a
pill with **no visible top edge**, and it took a round of iteration to see why: a bump lit
from above is brightest on its upper slope, and on a white page there is nothing brighter
than the page for that slope to be. The highlight is white on white and the silhouette
simply stops.

Two cues fix it, and both are needed. The body drops a step below page white (`#F4F4F8`),
which gives the crown something to be bright against and gives the shape an outline-free
silhouette. And a **directional outer shadow above** the element renders the concave crease
where the flat page bends up into the bump — directional, so it reads as curvature rather
than as the border that made an earlier version look like a floating badge.

Generalises past this feature: any same-colour-as-background emboss needs the raised face
offset *away* from the background's own value, in whichever direction leaves room. On a
dark ground the same shape wants a body lighter than the page.

### The marker strip's exit travel is computed, not a CSS constant

Playing slides the strip below the bottom edge; `#osmd-wrapper`'s `overflow: hidden` is
what makes that genuinely off-screen. The distance cannot live in the stylesheet, because
it depends on how many marker rows are occupied — a one-row strip travels far less than a
three-row one. So `renderBitPunches` computes it alongside the row layout and
`applyPunchTransform` writes it.

Two consequences. The transform goes on the *container*, not the pills: one animated
property for the whole strip, and each pill keeps its own `top` so the rows stay in
formation on the way down. And visibility has to be tracked in a module flag rather than
read back off the DOM, because a relayout can happen while the strip is off screen — a bit
created during a count-in, a rotation mid-playback — and the new travel distance must be
applied without snapping the strip back into view.

Note also that an off-screen pill is *clipped, not hidden*: it would still answer a touch,
so the `hidden` class still has to switch `pointer-events` off.

### Long press on a marker shares the wrapper's gesture, and must consume it

Deleting a bit is a long press on its marker. The timer is armed in the wrapper's
`touchstart` (only when the target is a `.bit-punch` and nothing is playing) and cancelled
the moment the finger travels past the pan threshold, on lift, and on `touchcancel`.

The part worth remembering is the flag: once the timer has fired, `touchend` must return
*before* its tap branch. Otherwise one press both prompts for deletion and arms the bit —
two answers to one gesture, with a dialog over a score that just jumped.

### FAILED: greying the music outside an armed bit

Bits once greyed everything outside them, per onset — each `GraphicalStaffEntry`'s own
`AbsolutePosition.x` compared against the loop's pixel bounds, in a lighter grey than
`HAND_GREY` so the two kinds of de-emphasis stayed distinguishable.

It worked and it was removed anyway. `applyHandColors` walks the entire `GraphicSheet` and
calls `setColor` on every note; the hand filter pays that cost once per hand change, which
is rare and already a heavy operation. Entering and leaving a bit is neither — it is the
most frequent thing a user does in bit mode — and on a score long enough for bits to be
worth having, the walk is a visible interruption every time. Practice flow lost to a cue
the loop shade and the marker strip already gave.

If it is ever revived, the cost is the thing to solve first, not the colour: a partial walk
bounded to the measures whose pixels changed, or a CSS overlay that dims without touching
the notation at all.

### LANDMINE: never let the score-load effect depend on the `piece` object

`sendXml` closed over `piece` and the effect that calls it listed `sendXml` as a
dependency. Every write to the piece replaces the object in `piecesStore`, so that
arrangement reloaded the entire score on each write.

Harmless for as long as nothing on the PlayView wrote to the piece. Bits write constantly —
on create, on delete, and on every hand/speed/metronome change made from inside one — and
the failure was spectacular and looked nothing like its cause:

- a "Loading score" overlay flashing over the score mid-practice;
- `disposePlayback` wiping `loopRegion`, `resolvedBits` and the web-side `activeBitId`, so
  the loop shade, the handles and the whole marker strip vanished;
- the *native* `activeBitId` surviving all of it, so the toolbar stayed in bit mode;
- and the leave button doing nothing, because `leaveBit` returned early on a web-side
  `activeBitId` that was already null.

Two fixes, both needed. The effect is keyed on `piece?.xmlFilename` — the XML is immutable
after import, so its filename changing is the only thing that genuinely means "different
score" — and `sendXml` reads the piece from a ref so its own dependencies stay stable.
Separately, `disposePlayback` now *posts* `BIT_ENTERED: null` rather than only clearing its
own variable: `activeBitId` exists on both sides of the bridge, and any load has to disarm
both.

The general rule: on a screen that writes to the record it renders, an effect that reloads
something expensive must depend on the *identity* of what it loads, never on the record.

### The marker strip is horizontally score-relative and vertically viewport-relative

The pills live inside `#osmd` so the score's single `translateX` carries them over the bars
they loop for free — the same trick `#section-marks` uses. But they are pinned to the bottom
of the *screen*, which `#osmd` knows nothing about: it is absolutely positioned at a `top`
that `recomputeViewportMetrics` computes to centre the staff.

So the strip needs both frames. `osmdOffsetTopPx` mirrors whatever was written to
`osmdEl.style.top`, and `window.innerHeight - osmdOffsetTopPx` is the viewport's bottom edge
in `#osmd`'s own coordinates. Anything that moves the staff vertically has to re-lay the
strip out, which is why `onViewportResize` re-resolves the bits rather than only repainting
them.

### LANDMINE: a web-side section index is not a native-side section index

`setSections` **drops** any section it cannot place — `firstTicksBySourceIndex` is sparse, holding
only measures the OSMD cursor actually visited — and then **re-sorts** the survivors by tick. So
position *k* in the WebView's list is not position *k* in what native sent, and native looks
`SECTION_INDEX` up in its own `piece.sections` array. One drop shifts every index after it: the
label names the wrong section and the swipe lands in the wrong place.

This was invisible while sections came only from detection, whose boundaries are already ascending
and all resolvable. User-editable sections removed that guarantee — a hand-placed boundary can sit
on a measure the cursor never reaches.

The fix is to carry each entry's original position through both the drop and the sort, and translate
on the way out; `currentSectionIndex` stays a web-side index internally and is converted only where
it crosses the bridge.

**That logic lives in `client/src/score-web/sectionResolve.ts`, not in `playback.ts`, on purpose.**
`client/score-web/` is excluded from the app's tsconfig (`exclude: ["score-web/**"]`) and has no
test script of its own, so nothing in it is typechecked or unit-tested — the bundle is only ever
run through esbuild. Anything there whose failure is silent should be a pure module under
`client/src/score-web/`, which the app's tsconfig and Jest both cover; the bundler inlines it
across the directory boundary without complaint.

The payload is `{ measures, colors }`, not a bare index array: the WebView paints the junction marks
into the score and has no access to the native theme, so each section's palette entry travels with
its index. `colors` holds plain hex strings — `SectionColors` is written in hex precisely because
the same string has to survive React Native's style parser, `react-native-svg`'s gradient stops and
a CSS `linear-gradient()` inside the WebView, and hex is the only notation all three read alike.

## OSMD `FingeringPosition` default hides bass-clef fingerings

**LANDMINE:** `EngravingRules.FingeringPosition` defaults to `PlacementEnum.AboveOrBelow = 5`. When `calculateFingerings()` encounters `AboveOrBelow`, it overrides to `isUpperStaffOfInstrument() ? Above : Below`. Bass staves resolve to `Below` — fingerings are placed below the staff, outside the visible viewport (`overflow: hidden`).

Per-note XML `placement="above"` is read into `TechnicalInstruction.placement` by `createTechnicalInstruction`, but `calculateFingerings` ignores it — only the global rule is used.

**Fix:** Set `FingeringPosition` before each `osmd.load()`:
```typescript
osmd.EngravingRules.FingeringPosition = 0; // PlacementEnum.Above
```
This places all fingerings above their respective staff line. Bass fingerings appear between the staves; treble fingerings appear above.

## MusicXML `<backup>` skipped by `querySelectorAll('note')`

**LANDMINE:** In single-`<part>` piano MusicXML, treble notes appear first, then a `<backup>` element rewinds the time cursor, then bass notes follow. `querySelectorAll('note')` skips `<backup>`, so cumulative beat positions for bass notes stack on top of treble positions instead of being measured from the correct beat.

Consequence: beat positions computed from the XML don't match OSMD's `VoiceEntry.Timestamp`, so
any code that maps between XML notes and rendered notes (or that rewrites the XML at a given beat)
silently misses every bass note.

**Fix:** Iterate `measureEl.children` directly and handle `backup`/`forward` tags:
```typescript
let cumPos = 0;
let currentBeatPos = 0;
for (const child of Array.from(measureEl.children)) {
  const tag = child.tagName.toLowerCase();
  if (tag === 'backup') {
    const durEl = child.querySelector('duration');
    if (durEl) cumPos -= parseInt(durEl.textContent ?? '0', 10);
    continue;
  }
  if (tag === 'forward') {
    const durEl = child.querySelector('duration');
    if (durEl) cumPos += parseInt(durEl.textContent ?? '0', 10);
    continue;
  }
  if (tag !== 'note') continue;
  const isChord = !!child.querySelector('chord');
  if (!isChord) currentBeatPos = cumPos;
  // ... use currentBeatPos for the note ...
  if (!isChord) {
    const durEl = child.querySelector('duration');
    if (durEl) cumPos += parseInt(durEl.textContent ?? '0', 10);
  }
}
```

## `autoResize: false` means layout must be re-centered on viewport changes

**LANDMINE:** OSMD is initialised with `autoResize: false` (single-line layout sets `PageWidth`
manually per load). `initPlayback` therefore computes the score's vertical centering
(`#osmd` `style.top` from `window.innerHeight`) and horizontal scroll bounds **once, at load**.
Nothing recomputes them when the WebView's viewport changes size — e.g. leaving the landscape
routine/warm-up play view for the **portrait** routine editor and coming back. The score stays
centered for the previous (taller portrait) height and slides half-off the bottom of the screen.

**Fix:** A single `window.addEventListener('resize', …)` in `playback.ts` recomputes the
viewport-dependent values via `recomputeViewportMetrics()` (vertical centering + scroll bounds).
Intrinsic geometry (`systemTopPx`/`systemHeightPx`, cursor-step positions) is cached at load, so
this needs **no OSMD re-render** — do not re-enable `autoResize` (its full re-render is expensive
and breaks the manual single-line `PageWidth`).

**Note:** `score-web/**` is excluded from `client/tsconfig.json`, so `npm run typecheck` does
**not** cover `playback.ts`. Type-check it separately with `cd score-web && npx tsc --noEmit`, and
rebuild the bundle after any `score-web/` change (see “`score-web/` edits are invisible until the
bundle is rebuilt” in [`tone-playback.md`](tone-playback.md)).

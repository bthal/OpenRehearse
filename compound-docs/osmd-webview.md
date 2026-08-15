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

## WebView bridge message protocol

Web→Native: web page calls `window.ReactNativeWebView.postMessage(data)`; native receives via `onMessage` prop.

Native→Web: native calls `webViewRef.current.injectJavaScript(code)`; executed in the WebView's JS context.

Readiness signal: native's `onLoadEnd` fires after inline scripts have run and `window.__rn_load_xml` is defined. Do not rely on a `READY` postMessage from the web page — `DOMContentLoaded` will never fire for inline scripts (see above).

The two protocol type files (`client/src/score-web/messageProtocol.ts` and
`client/score-web/src/types.ts`) are **duplicated by hand** — `score-web/**` is excluded from the
app tsconfig, so nothing links them and nothing fails if they drift. Adding a message means editing
both, then rebuilding the bundle.

### `SET_SECTIONS` must be sent after `LOADED`, not with the XML

`__rn_set_sections` resolves 0-based measure indices against `measureMeta` and `noteSpans`, both of
which `initPlayback` builds while walking the score. Injecting it alongside `__rn_load_xml` runs it
against the *previous* score's data (or none at all). PlayView therefore injects it from its
`LOADED` handler.

Native never computes section positions itself: it sends indices and receives `SECTION_INDEX` back.
Keeping the tick math on one side is what stops the label and the seek target from disagreeing about
the anacrusis offset.

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

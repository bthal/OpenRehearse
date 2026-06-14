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

## WebView bridge message protocol

Web→Native: web page calls `window.ReactNativeWebView.postMessage(data)`; native receives via `onMessage` prop.

Native→Web: native calls `webViewRef.current.injectJavaScript(code)`; executed in the WebView's JS context.

Readiness signal: native's `onLoadEnd` fires after inline scripts have run and `window.__rn_load_xml` is defined. Do not rely on a `READY` postMessage from the web page — `DOMContentLoaded` will never fire for inline scripts (see above).

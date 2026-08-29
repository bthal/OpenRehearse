# Expo + React Native setup landmines

Traps hit during Phase 0 bootstrap. Check here before touching `client/package.json` or `babel.config.js`.

## expo-router version scheme changed at SDK 55

**LANDMINE:** `expo-router` no longer uses semver v3/v4/v5/v6. Starting with Expo SDK 55 it mirrors the SDK version number.

| Expo SDK | expo-router tag |
|----------|-----------------|
| 52       | `sdk-52` → `4.0.x` |
| 53       | `sdk-53` → `5.x` |
| 54       | `sdk-54` → `6.x` |
| 55+      | `sdk-55` → `55.x`, `sdk-56` → `56.x`, … |

`npm install expo-router` resolves `latest` which is correct, but `npm install expo-router@^4` installs the SDK-52 build — Metro starts but immediately crashes on typed-routes internals (`expo-router/internal/routing` not found).

**Fix:** `npm install expo-router@~56.0.0` (match the SDK major).

## nativewind/babel is not a Babel plugin

**LANDMINE:** `nativewind/babel` re-exports `react-native-css-interop/babel`, which is a **preset**, not a plugin. Putting it in `plugins: ['nativewind/babel']` triggers:

```
[BABEL] .plugins is not a valid Plugin property
```

**Fix:** Don't list it in `plugins` at all. The `jsxImportSource: 'nativewind'` option on `babel-preset-expo` is sufficient for NativeWind v4:

```js
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }]],
    plugins: ['react-native-reanimated/plugin'],
  };
};
```

## react-native-reanimated v4 requires react-native-worklets

**LANDMINE:** `react-native-reanimated@4.x` moved its worklet runtime to a separate package. Its Babel plugin (`react-native-reanimated/plugin`) simply re-exports `react-native-worklets/plugin`. If `react-native-worklets` is not installed, Metro crashes at transformer init with:

```
TypeError: Cannot read properties of undefined (reading 'transformFile')
```

This fails in 9ms (1 module) — the transformer worker itself dies before processing any app code.

**Fix:** Install alongside reanimated:

```bash
npm install react-native-worklets@^0.9.0 --legacy-peer-deps
```

## Native-driver animations flicker on release when nothing re-renders

**LANDMINE:** `useNativeDriver: true` drives the view directly only while the animation is
connected. On completion it releases, and the view falls back to the transform **React last
committed**. If the component did not re-render during the animation, that commit is the value from
before it started — so the view snaps back to its old position for a frame, right at the end.

Seen on the PlayView toolbar (`components/ToolbarShell.tsx`), which slides off the left edge on play.
Instrumented log, one play then one pause:

```
render #4 hidden=true  jsValue=0.0      ← last commit before leaving
START to=-106.7 … END finished=true     ← no renders in between
                                        → flashes back at 0 on release
render #5 hidden=false jsValue=-106.7   ← last commit before returning
START to=0 … END finished=true
                                        → blinks to -106.7 on release
```

Both flicker values are exactly what React had committed. Note the component re-renders **zero**
times across the ~190 ms slide, which is what makes the stale commit possible.

Two fixes that do **not** work, both tried:

- `value.addListener(() => {})`. It does keep the value's JS side current — but it never triggers a
  render, so React's *committed* prop stays stale and the fallback is unchanged. It also made the
  second direction's flicker visible.
- Assuming JS-thread contention and reasoning about frame drops. The log shows a healthy 10–12
  frames over ~190 ms on either driver; nothing was ever being starved.

**Fix:** `useNativeDriver: false` for any transform on a component that does not re-render while it
animates. A JS-driven value is the same value React reads, so the two cannot disagree on release.
This is why every `Animated` call in this app passes `false` — the width/height animations *must*,
and the transforms should.

**Diagnosing this class again:** log the render count with `value.__getValue()` in the render body,
plus a listener logging each frame. Renders absent between START and END, with a flicker at the last
committed value, is this bug. Renders *present* mid-animation with stale values would be the
different (and more commonly described) native-driver race.

## babel-preset-expo must be an explicit dependency

The blank Expo TypeScript template does not list `babel-preset-expo` in `package.json` — it's a transitive dep of `expo`. After upgrading `expo-router` to `~56.x` the module resolution changes and it can no longer be found transitively, causing Metro to fail on first transform.

**Fix:** Add it as a direct dependency:

```bash
npm install babel-preset-expo
```

---

## Phase 1 landmines

### expo-file-system SDK 56: functional API moved to /legacy

**LANDMINE:** `expo-file-system@56` replaced the functional API (`documentDirectory`, `readAsStringAsync`, `writeAsStringAsync`, etc.) with a class-based API (`File`, `Directory`, `Paths`). Importing from `expo-file-system` no longer exports these functions.

```
error  'documentDirectory' not found in imported namespace 'FileSystem'
```

**Fix:** Import from the subpath:

```ts
import * as FileSystem from 'expo-file-system/legacy';
```

The legacy API is fully supported and stable; the new class-based API is an addition, not a replacement yet.

### content:// URIs from document picker: use copyAsync, not fetch or readAsStringAsync

**LANDMINE:** `expo-document-picker` on Android returns `content://` URIs backed by the Storage Access Framework. Two approaches that do **not** work:

- `fetch(uri)` — throws `MalformedURLException: unknown protocol: content`
- `FileSystem.readAsStringAsync(contentUri)` — throws "isn't readable"

The correct approach uses `FileSystem.copyAsync()`, which calls Android's `ContentResolver.openInputStream()` under the hood and respects the temporary SAF read grant:

```ts
const tempPath = FileSystem.cacheDirectory + 'xml-import/' + Crypto.randomUUID() + '.xml';
await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
await FileSystem.copyAsync({ from: asset.uri, to: tempPath });
const content = await FileSystem.readAsStringAsync(tempPath, {
  encoding: FileSystem.EncodingType.UTF8,
});
// clean up
FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
```

Use a UUID temp filename — special characters in the original filename can cause path-encoding issues.

### crypto.randomUUID() is not a global in Hermes

**LANDMINE:** `crypto.randomUUID()` is not available as a bare global in Hermes (React Native 0.85). Calling it throws:

```
ReferenceError: Property 'crypto' doesn't exist
```

**Fix:** Use `expo-crypto`:

```ts
import * as Crypto from 'expo-crypto';
const id = Crypto.randomUUID();
```

Install: `npm install expo-crypto@~14.0.0 --legacy-peer-deps`

### Jest 30 incompatible with jest-expo@56

**LANDMINE:** `jest-expo@56` depends on `@jest/globals@^29`. Installing Jest 30 causes:

```
TypeError: this._moduleMocker.clearMocksOnScope is not a function
```

**Fix:** Pin Jest to v29:

```bash
npm install --save-dev jest@^29.0.0 --legacy-peer-deps
```

### Expo Router typedRoutes: generated types go stale

**LANDMINE:** When `"experiments": { "typedRoutes": true }` is set in `app.json`, Expo generates `.expo/types/router.d.ts` each time Metro starts. If you add a new route (e.g. `app/piece/[id].tsx`) without running Metro, the generated file still only lists the old routes, causing `tsc` to reject valid `router.push()` calls:

```
Type '"/piece/[id]"' is not assignable to type '"/" | "/_sitemap"'
```

**Fix for development:** Disable `typedRoutes` in `app.json` until the route structure stabilises, then re-enable and run `expo start` once to regenerate. If you keep it enabled, delete `.expo/types/router.d.ts` after adding new routes and let Metro regenerate it on next start.

### Test MusicXML files: push .mxl directly (both formats now accepted)

The app accepts both `.mxl` (compressed MusicXML) and `.xml` (uncompressed). Push either format to
device (`testfiles/` is the gitignored scratch directory this repo uses for real scores):

```bash
~/Library/Android/sdk/platform-tools/adb push testfiles/*.mxl /sdcard/Download/
~/Library/Android/sdk/platform-tools/adb push testfiles/*.xml /sdcard/Download/
```

Pushing a `.mxl` only *works* because the picker accepts `application/octet-stream` — see the
landmine at the end of this file. For a long while it did not, and the workaround in circulation
was renaming to `.mxl.zip`, which is why stray `*.mxl.zip` files turn up in `/sdcard/Download`.

If you need the uncompressed XML for other tooling, extract with:

```bash
for f in testfiles/*.mxl; do
  dir="${f%.mxl}_tmp" && mkdir -p "$dir" && unzip -o "$f" -d "$dir" > /dev/null
  rootfile=$(grep -o 'full-path="[^"]*\.xml"' "$dir/META-INF/container.xml" | head -1 \
    | sed 's/full-path="//;s/"//')
  cp "$dir/$rootfile" "${f%.mxl}.xml" && rm -rf "$dir"
done
```

### `Buffer` is not available in Hermes / React Native

**LANDMINE:** Node's `Buffer` global does not exist in the Hermes JS engine:

```
ReferenceError: Property 'Buffer' doesn't exist
```

**Fix:** Use the globally available `atob` / `btoa` for base64, and `TextDecoder` / `TextEncoder` for string↔bytes:

```ts
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// bytes → UTF-8 string
new TextDecoder('utf-8').decode(bytes);
```

Both `atob` and `TextDecoder` are available in RN ≥ 0.73 / Hermes. They are NOT available in Node.js < 18, so test files that call these helpers need a polyfill: `global.atob = (b64) => Buffer.from(b64, 'base64').toString('binary')`.

### Android SAF may strip or change the file extension in `asset.name`

**LANDMINE:** `expo-document-picker` on Android returns `asset.name` from the SAF display name, which can omit the extension or use a different one for MIME types the device doesn't recognise (e.g. `.mxl` files may come back named without an extension, or with `.zip`).

**Fix:** Do not rely solely on `asset.name.endsWith('.mxl')` for binary format detection. Check the file's magic bytes after copying to a temp path. ZIP files (including `.mxl`) start with `PK\x03\x04` (bytes `50 4B 03 04`):

```ts
function isZip(base64: string): boolean {
  const head = base64ToBytes(base64.slice(0, 8));
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}
```

### Android has no MIME type for `.mxl` — the picker greys the file out

**LANDMINE:** Android's `MimeTypeMap` has no entry for the `mxl` extension, so the Storage Access
Framework reports `application/octet-stream`. A `DocumentPicker.getDocumentAsync({ type: [...] })`
allowlist naming only the "correct" MusicXML types therefore greys out **every `.mxl` file on the
device**. The file cannot be selected at all, so none of the import pipeline runs and there is no
error message to read — which is what makes this expensive to diagnose.

Verified against the device's own MediaStore:

```bash
adb shell "content query --uri content://media/external/file \
  --projection _display_name:mime_type --where \"_display_name LIKE '%.mxl'\""
# .mxl      → mime_type=application/octet-stream   ✗ greyed out
# .mxl.zip  → mime_type=application/zip            ✓
# .xml      → mime_type=text/xml                   ✓
```

**The symptom hides the cause.** `.xml` files and any `.mxl` hand-renamed to `.mxl.zip` import
fine, so the app looks healthy and the bug presents as "these particular files are broken". It is
the extension, never the file: every `.mxl` that could not be picked parses correctly the moment it
reaches `extractXmlFromMxl`. If you find yourself comparing zip entry order, UTF-8 filename flags
or MusicXML versions between a working and a failing score, stop and check the MIME type first.

**Fix:** include `'application/octet-stream'` in the picker's `type` list (`src/data/filePicker.ts`).
Widening is safe because the picker's answer was never trusted anyway — the magic-byte sniff above
decides how to decode, and `validateMusicXml` rejects anything else with a message. A provider that
reports some other type for `.mxl` would still be greyed out; the escape hatch is `'*/*'`, at the
cost of listing every file on the device.

Covered by `src/data/__tests__/filePicker.test.ts`, which encodes the real Android extension→MIME
mapping so the allowlist cannot silently narrow again.

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

### Test MusicXML files: .mxl → .xml extraction

MuseScore and most repositories distribute scores as `.mxl` (compressed MusicXML — a ZIP containing the `.xml`). The app only accepts uncompressed `.xml`. To extract:

```bash
for f in test-mxls/*.mxl; do
  dir="${f%.mxl}_tmp" && mkdir -p "$dir" && unzip -o "$f" -d "$dir" > /dev/null
  rootfile=$(grep -o 'full-path="[^"]*\.xml"' "$dir/META-INF/container.xml" | head -1 | sed 's/full-path="//;s/"//')
  cp "$dir/$rootfile" "${f%.mxl}.xml" && rm -rf "$dir"
done
```

Push to a connected Android device for testing:

```bash
~/Library/Android/sdk/platform-tools/adb push test-mxls/*.xml /sdcard/Download/
```

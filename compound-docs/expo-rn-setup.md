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

# Unger — Piano Practice Companion

Import MusicXML scores, render them via OSMD, and loop passages ("bits") with synthesized playback.
Android-first React Native app. Offline after import — scores stay on device.

See [`specs/overview.md`](specs/overview.md) for product scope and [`specs/roadmap.md`](specs/roadmap.md) for phase plan.

## Dev setup

**Requirements:** Node 20+, Android Studio with an emulator or a physical Android device with USB debugging enabled.

```bash
# Install dependencies
cd client && npm ci

# Start Metro + launch on Android (emulator must already be running, or device connected)
npm run android

# Launch on iOS simulator (macOS only)
npm run ios
```

### Emulator quick-start

1. Open Android Studio → **Device Manager** → start a virtual device (API 33+ recommended).
2. Run `npm run android` from `client/` — Metro starts and the app is installed automatically.

### Physical device

1. Enable **Developer Options** on the device, then turn on **USB Debugging**.
2. Connect via USB; verify with `adb devices`.
3. Run `npm run android` — Metro uses the connected device.

## Quality scripts (run from `client/`)

| Command | What it does |
|---------|-------------|
| `npm run lint` | ESLint |
| `npm run format:check` | Prettier check (no writes) |
| `npm run format` | Prettier auto-fix |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Jest unit tests |
| `npm run ci` | lint + format:check + typecheck + test |

Run `npm run ci` before every commit that touches `client/`.

## Repository layout

```
specs/          Product intent and acceptance criteria (source of truth)
compound-docs/  Implementation memory — landmines, failed approaches
client/         React Native / Expo app
  app/          Expo Router screens
  src/domain/   Pure TypeScript — loop math, MusicXML validation, tempo
  src/data/     Storage adapters, file pickers, local DB
  src/state/    Zustand stores
  score-web/    OSMD + Tone.js WebView bundle
  components/   Shared UI (NativeWind + MDI icons)
```

See [`AGENTS.md`](AGENTS.md) for the coding-agent guide (required reading before non-trivial changes).

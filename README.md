# OpenRehearse — Piano Practice Companion

Import MusicXML scores, render them via OSMD, and loop passages ("bits") with synthesized playback.
Android-first React Native app. Offline after import — scores stay on device.

See [`specs/overview.md`](specs/overview.md) for product scope and [`specs/roadmap.md`](specs/roadmap.md) for phase plan.

## Dev setup

**Requirements:** Node 20+, Android Studio with an emulator or a physical Android device with USB debugging enabled.

```bash
# Install repo-root tooling once — this activates the commitlint / pre-commit git hooks
npm ci

# Install dependencies. This also bundles the OSMD + Tone.js WebView surface into
# client/src/score-web/html.ts via postinstall — that file is generated, not committed.
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
| `npm run build:score-web` | Rebuild `src/score-web/html.ts` after editing `score-web/src/` (also runs on install) |

Run `npm run ci` before every commit that touches `client/`.

## Releasing

Releases are **deliberate**: merging a PR to `main` never ships anything on its own.

1. **Land work on `main`** as usual. PRs are squash-merged, so the PR title becomes the commit
   message and the changelog entry — give it a real `feat:`/`fix:` title. Only `feat`, `fix` and
   `perf` cause a release.
2. **release-please keeps a standing PR** titled `chore(main): release X.Y.Z`, accumulating the
   changelog and the version bump. It sits there until you want to ship. A companion workflow
   writes `client/app.json`'s `version` and `android.versionCode` into that same PR.
3. **Merge the release PR** when you decide to release. That tags `vX.Y.Z`, creates a **draft**
   GitHub Release, triggers an EAS cloud build of the `preview` profile (APK), and attaches
   `openrehearse-X.Y.Z.apk` plus `SHA256SUMS.txt` to the draft.
4. **Smoke-test the APK on a real device** — install it, import
   `client/assets/demo/bach-prelude-c-major-bwv846.mxl`, confirm the score renders and the cursor
   tracks playback. Nothing in CI covers OSMD + Tone in a real WebView.
5. **Publish the draft release.**

If the EAS build fails after the tag already exists, re-run the **Release** workflow via
`workflow_dispatch` with that tag — it re-attaches assets without cutting a new version.

### Versioning

`client/package.json` `version` is the single source of truth. `scripts/sync-app-version.mjs`
derives `client/app.json`'s `expo.version` and the integer `expo.android.versionCode`
(`major*10000 + minor*100 + patch`, so `1.1.0` → `10100`). Never hand-edit those two fields; run
`npm run sync-version` at the repo root instead. CI enforces this.

The changelog lives at `client/CHANGELOG.md` (release-please owns it).

### One-time setup

These are the manual steps a maintainer must do; the pipeline cannot do them for you.

| Step | Why |
|---|---|
| `cd client && npx eas-cli login`, then `npx eas-cli credentials` → Android → export the keystore, store it offline | The signing key is the app's permanent identity. Lose it and existing installs can never be upgraded, only uninstalled and replaced. `eas-cli` is not a project dependency and is not installed globally — always invoke it with `npx`. |
| Repo secret `EXPO_TOKEN` (expo.dev → Account → Access tokens) | Lets the workflow trigger EAS builds. |
| Repo secret `RELEASE_PLEASE_TOKEN` — fine-grained PAT with `contents: write` + `pull-requests: write` | **Not optional.** PRs opened with the default `GITHUB_TOKEN` do not trigger workflow runs, so the release PR would get no CI and no version sync. |
| Settings → allow **squash merge only** | The whole changelog model assumes one commit per PR. |
| Branch protection on `main` → require the CI checks | The hooks are bypassable; this is the real gate. |

EAS free tier allows **15 Android builds per month**; this pipeline spends one per release.

## Repository layout

```
specs/          Product intent and acceptance criteria (source of truth)
compound-docs/  Implementation memory — landmines, failed approaches
scripts/brand/  Generators for the logo, lockups and app icons (+ palette check)
client/         React Native / Expo app
  app/          Expo Router screens
  src/domain/   Pure TypeScript — loop math, MusicXML validation, tempo
  src/data/     Storage adapters, file pickers, local DB
  src/state/    Zustand stores
  score-web/    OSMD + Tone.js WebView bundle
  components/   Shared UI (NativeWind + MDI icons)
  assets/brand/ Logo marks and lockups — generated, do not hand-edit
  assets/fonts/ Bundled Outfit SemiBold (SIL OFL)
```

See [`AGENTS.md`](AGENTS.md) for the coding-agent guide (required reading before non-trivial changes).

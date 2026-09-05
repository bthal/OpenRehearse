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
| `npm run ci` | lint + format:check + typecheck + test + score-web bundle |
| `npm run build:score-web` | Rebuild `src/score-web/html.ts` after editing `score-web/src/` (also runs on install) |
| `npm run bundle:score-web` | Same rebuild without reinstalling `score-web/node_modules` |

Run `npm run ci` before every commit that touches `client/`.

`src/score-web/html.ts` is generated and gitignored, so it does **not** change when you switch
branches — a bundle older than the native code fails as opaque `Script error. @0:0` lines plus
plausible-but-wrong behaviour, not as a crash. `npm run start`/`android`/`ios`/`web`/`clear` now
rebuild it first, so the local dev loop cannot drift.

## Releasing

Releases are **deliberate**: merging a PR to `main` never ships anything on its own, and no
bot opens a release PR. You pick the commit.

1. **Land work on `main`** as usual. PRs are squash-merged, so the PR title becomes the commit
   message and the changelog entry — give it a real `feat:`/`fix:` title.
2. **Run the `release` skill** in Claude Code, optionally naming a commit: `/release`, or
   `/release <sha>`. It defaults to the tip of `main`. The skill refuses any commit that is not
   an ancestor of `main` or whose CI run is not green.
3. **Confirm the version.** The skill reads the conventional commits since the last tag and
   proposes a bump (`feat` → minor, `fix`/`perf` → patch, `!` → major). Override it if you
   disagree. It then tags `vX.Y.Z`, creates a **draft** GitHub Release, rewrites the notes for
   a non-technical reader, and dispatches the **Release** workflow — an EAS cloud build of the
   `preview` profile (APK) that attaches `openrehearse-X.Y.Z.apk` plus `SHA256SUMS.txt` to the
   draft.
4. **Smoke-test the APK on a real device** — install it, import
   `client/assets/demo/bach-prelude-c-major-bwv846.mxl`, confirm the score renders and the cursor
   tracks playback. Nothing in CI covers OSMD + Tone in a real WebView.
5. **Publish the draft release.** The skill never does this for you.

If the EAS build fails after the tag already exists, `/release <tag>` re-attaches assets without
cutting a new version (or run the **Release** workflow via `workflow_dispatch` by hand).

### Versioning

**The git tag is the source of truth.** `client/package.json` and `client/app.json` carry `0.0.0`
placeholders and are never bumped — nothing is committed at release time, which is what lets any
commit be released. The **Release** workflow derives `expo.version` and the integer
`expo.android.versionCode` (`major*10000 + minor*100 + patch`, so `1.1.0` → `10100`) from the tag
and writes them into the CI workspace only. That encoding caps minor and patch at 99; the
workflow fails loudly rather than producing a colliding number.

Android refuses to install an APK whose `versionCode` is not greater than the installed one, so
tags must only ever go up.

The changelog is the [Releases page](https://github.com/bthal/OpenRehearse/releases); there is no
`CHANGELOG.md`.

### One-time setup

These are the manual steps a maintainer must do; the pipeline cannot do them for you.

| Step | Why |
|---|---|
| `cd client && npx eas-cli login`, then `npx eas-cli credentials` → Android → export the keystore, store it offline | The signing key is the app's permanent identity. Lose it and existing installs can never be upgraded, only uninstalled and replaced. `eas-cli` is not a project dependency and is not installed globally — always invoke it with `npx`. |
| Repo secret `EXPO_TOKEN` (expo.dev → Account → Access tokens) | Lets the workflow trigger EAS builds. |
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

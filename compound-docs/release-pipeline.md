# CI and release pipeline landmines

Traps hit while building `.github/workflows/`. Check here before touching CI, release-please,
versioning, or the score-web build. Human-facing instructions live in [`README.md`](../README.md#releasing).

## score-web/html.ts is generated at install time, never committed

`client/src/score-web/html.ts` is 1.5 MB of bundled OSMD + Tone.js, imported by three screens via
`@score-web/html`. It used to be committed, because EAS's cloud build only runs `npm ci` and
nothing invoked the bundler.

**Why that was wrong:** every score-web change rewrote the whole 1.5 MB blob into git history, and
a stale copy could ship silently — EAS would happily bundle whatever was committed.

**Fix:** generate it during install and gitignore it.

```json
// client/package.json
"postinstall": "npm run build:score-web",
"eas-build-post-install": "npm run build:score-web",
```

Both hooks are declared on purpose. `postinstall` covers local installs and CI; EAS documents
`eas-build-post-install` as its own post-install hook. On EAS both fire, so the bundle is built
twice — roughly 30 seconds wasted per release build, deliberately traded for not losing one of the
15 monthly build slots to a hook that silently did not run.

**LANDMINE (one-time, on pulling the commit that untracked it):** git deletes the file when you
move onto a commit where it is no longer tracked, so the first `git pull` after this change leaves
you with `Unable to resolve path to module '@score-web/html'` from ESLint and `tsc`. CI never sees
this because it always runs `npm ci`. Locally, run `cd client && npm run build:score-web`.

**LANDMINE:** do not add a drift check or a pre-commit rebuild for this file. A pre-commit rebuild
still puts the blob in git, requires auto-staging files the developer did not stage, and is
bypassable with `--no-verify`. Because three screens import the module, `typecheck` and `test` in
CI already fail loudly if generation did not happen. Drift is structurally impossible, not detected.

## Prettier must not police the generated CHANGELOG

**LANDMINE:** release-please writes `client/CHANGELOG.md`, and `client/package.json`'s
`format:check` runs `prettier --check .` across `client/`. release-please's markdown uses `*`
bullets and double blank lines; Prettier wants `-` and single. The result is that **every release
PR fails CI**, forever, on a file no human wrote and release-please rewrites on its next run.

**Fix:** `CHANGELOG.md` is listed in `client/.prettierignore`. Do not "fix" it by formatting the
file — release-please regenerates it from scratch each release and the fix would not survive.

## Pull requests opened with GITHUB_TOKEN do not trigger workflows

**LANDMINE:** GitHub deliberately suppresses workflow runs for events caused by the built-in
`GITHUB_TOKEN`, to prevent recursive triggering. release-please opens its release PR with whatever
token you give it, so with the default token that PR gets **no CI and no version sync** — it just
sits there looking green because nothing ran.

**Fix:** `secrets.RELEASE_PLEASE_TOKEN`, a fine-grained PAT scoped to this repo with
`contents: write` + `pull-requests: write`. The same reasoning applies in `release-pr-sync.yml`,
which pushes with the PAT so the resulting `synchronize` event re-runs CI on the fixed commit.

Fine-grained PATs expire, and when this one does the failure is silent: no release PR appears and
nothing errors. That is the standing cost of this approach.

## Tags pushed by release-please do not start a tag-triggered workflow

**LANDMINE:** same suppression rule. An `on: push: tags:` workflow will never fire for a tag
release-please created, so the obvious design — release-please tags, a separate workflow builds the
tag — silently never builds anything.

**Fix:** chain the build as a second job in the *same* workflow with
`needs: release-please` and `if: needs.release-please.outputs.release_created == 'true'`.

## release-please manifest mode prefixes its outputs with the package path

**LANDMINE:** with a `packages` entry at path `client`, the outputs are `client--tag_name`,
`client--release_created`, … not `tag_name`. Reading `steps.release.outputs.tag_name` yields an
empty string, so the build job's `if` is false and the release ships with no APK.

**Fix:** `${{ steps.release.outputs['client--tag_name'] }}`. Only `releases_created` (plural) is
un-prefixed and global.

## android.versionCode is monotonic, irreversible, and cannot be derived by release-please

Android refuses to install an APK whose `versionCode` is not greater than the installed one, and
there is no way to walk the number back once a build is public.

release-please only writes semver strings, so it cannot produce this integer. `scripts/sync-app-version.mjs`
derives it as `major*10000 + minor*100 + patch` (`1.0.0` → `10000`), which keeps it reconstructible
from any git tag rather than living in a counter outside the repo.

**LANDMINE:** that encoding caps minor and patch at **99**. The script fails loudly rather than
emitting a colliding number — widening it is a one-way door, because every already-published
versionCode has to stay below whatever comes next.

## Edit app.json by text replacement, not JSON.stringify

**LANDMINE:** `JSON.stringify(obj, null, 2)` expands `"assetBundlePatterns": ["assets/**/*"]` onto
multiple lines. Prettier collapses it back, so `npm run format:check` fails on a file the release
automation just wrote — a loop no human is in a position to break during a release.

**Fix:** `sync-app-version.mjs` replaces the two scalars in the raw text and re-parses to verify.
It refuses to run if either key does not appear exactly once, so a silent no-op cannot ship a wrong
version.

## Build provenance would be a lie here

`actions/attest-build-provenance` attests that a given runner produced a given artifact. Our APK is
built on EAS and merely *downloaded* by the runner, so an attestation would certify a download
while reading as a source-to-binary guarantee.

**Decision:** ship `SHA256SUMS.txt` and do not call it provenance. Revisit only if builds ever move
onto the runner itself.

## eas-cli is not installed anywhere

**LANDMINE:** `eas` is not a global binary and not a project dependency — `client/package.json`
invokes it as `npx eas-cli`. A bare `eas credentials` just gives `command not found`.

**Fix:** always `npx eas-cli <command>` from `client/`.

## The Android keystore is the app's permanent identity

EAS holds the signing keystore for `com.openrehearse.app`. Because releases are sideloaded APKs
rather than Play Store uploads, that key is the only thing letting an existing install upgrade in
place. Lose it and every user must uninstall and lose their local pieces and practice history.

Export it (`npx eas-cli credentials` → Android → download) and store the `.jks` **together with the
keystore password, key alias, and key password** — the file alone is useless. Keep it outside the
working tree; `client/.gitignore` ignores `*.jks`, but that is a safety net, not a filing system.

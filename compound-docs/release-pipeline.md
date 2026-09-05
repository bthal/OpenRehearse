# CI and release pipeline landmines

Traps hit while building `.github/workflows/`. Check here before touching CI, the `release`
skill, versioning, or the score-web build. Human-facing instructions live in
[`README.md`](../README.md#releasing).

The pipeline used to be driven by release-please, which maintained a standing release PR and
owned the version and the changelog. That is gone: `release.yml` is `workflow_dispatch`-only, the
git tag is the version, and a human points `.claude/skills/release/` at a commit. Landmines that
existed only to serve the bot PR have been deleted from this file along with it.

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

## A PR-title check must trigger on `edited`

**LANDMINE:** a bare `on: pull_request` defaults to `[opened, synchronize, reopened]`. `edited` is
not included, so renaming a PR to fix a failed title check does not re-run it — the PR stays red
with no way forward. Re-running the job by hand does not help either: a re-run replays the original
event payload, which still carries the **old** title.

**Fix:** the check lives in its own `pr-title.yml` with `types: [opened, edited, synchronize,
reopened]`. Keeping it out of `ci.yml` also stops a description edit from re-running jest.

**LANDMINE:** do not "solve" a related problem by adding `edited` to `ci.yml` and guarding the
heavy jobs with `if:`. A required status check that is *skipped* never reports a conclusion, so
branch protection blocks the merge forever.

## android.versionCode is monotonic and irreversible

Android refuses to install an APK whose `versionCode` is not greater than the installed one, and
there is no way to walk the number back once a build is public.

`release.yml` derives it from the tag as `major*10000 + minor*100 + patch` (`1.0.0` → `10000`),
which keeps it reconstructible from any tag rather than living in a counter outside the repo.

**LANDMINE:** that encoding caps minor and patch at **99**. The workflow fails loudly rather than
emitting a colliding number, and the `release` skill refuses such a version before tagging.
Widening it is a one-way door: every already-published versionCode has to stay below whatever
comes next.

## The version lives in the tag, so `build-apk` must not trust the tree

`client/package.json` and `client/app.json` carry `0.0.0` placeholders. Nothing is committed at
release time — that is precisely what lets an *already-existing* commit be released, since a bump
committed after the fact could never be inside the commit being tagged.

**LANDMINE:** `build-apk` checks out `ref: <tag>`, so every script in the workspace is the version
*that tag* contains. Calling `scripts/sync-app-version.mjs` there would run whatever the tag
happened to ship — and rebuilding a tag cut before this change would run a script that does not
take the flag at all. The derivation is therefore **inlined in the workflow**, where it is always
the current one.

That also removed the reason `sync-app-version.mjs` existed. It edited `app.json` by targeted text
replacement rather than `JSON.stringify` because `JSON.stringify(obj, null, 2)` expands
`"assetBundlePatterns": ["assets/**/*"]` onto multiple lines, Prettier collapses it back, and
`format:check` then fails on a file the automation just wrote. Nothing is committed now, no
Prettier run ever sees the edited file, and plain `jq` is fine.

## The CI-green check is a hard refusal, not a warning

The `release` skill refuses to tag a commit that is not an ancestor of `origin/main` or whose
`ci.yml` run is not `success`.

**Why it cannot be a prompt:** a tag is permanent, and each release spends one of 15 monthly EAS
build slots. `main` also has no branch protection, so nothing else stands between a local commit
and a tag. Downgrading either check to a confirmation removes the only gate.

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

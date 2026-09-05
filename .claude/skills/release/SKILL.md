---
name: release
description: Cut an OpenRehearse release for a specific commit — pick the version, tag it, open a draft GitHub Release with student-readable notes, and dispatch the APK build. Also rebuilds an APK for an existing tag and rewrites the notes on an existing draft. Use when the user asks to release, ship, cut a version, tag a release, re-attach a failed APK, or write release notes.
---

# Releasing OpenRehearse

Releases are deliberate. Landing a commit on `main` ships nothing — a human points this
skill at a commit and that commit becomes a release.

Everything here stops short of publishing. The human sideloads the APK, confirms a score
imports and plays, and publishes the draft themselves. Nothing in CI covers OSMD + Tone
in a real WebView, so that gate is the only real test.

## Pick a mode

| The user said | Mode |
|---|---|
| "release", "ship it", "cut 1.3.0", or gave a commit-ish | **A — cut a release** |
| gave a tag that already exists, or an APK failed to attach | **B — rebuild the APK** |
| "fix the notes", "rewrite the changelog", gave a draft tag | **C — rewrite notes** |

If Mode A's target commit already has a tag, switch to Mode B rather than cutting a
duplicate.

## Mode A — cut a release

1. **Resolve the commit.**

   ```bash
   git fetch origin --tags
   git rev-parse <commit-ish or origin/main>
   ```

   Default to `origin/main` when the user named no commit.

2. **Refuse if it is not on `main`.**

   ```bash
   git merge-base --is-ancestor <sha> origin/main
   ```

   A shipped APK must correspond to code that landed on `main`. If this fails, say so and
   stop — do not offer to tag it anyway.

3. **Refuse if CI is not green on that exact commit.**

   ```bash
   gh run list --commit <sha> --workflow=ci.yml --json conclusion,status,url --limit 1
   ```

   Require `conclusion: success`. A tag is permanent and an EAS build spends one of 15
   monthly slots — neither is worth burning on a commit that never passed. If the run is
   still in progress, say so and stop; the user can re-run this in a few minutes.

4. **Check for an existing tag** on that SHA (`git tag --points-at <sha>`). If one exists,
   switch to Mode B.

5. **Propose a version.**

   ```bash
   last="$(git describe --tags --abbrev=0 --match 'v*' <sha>)"
   git log --oneline "$last..<sha>"
   ```

   Bump from `$last`:

   - any `!` after the type, or `BREAKING CHANGE` in a body → **major**
   - else any `feat` → **minor**
   - else any `fix` or `perf` → **patch**
   - nothing releasable in the range → say so and stop

   Refuse a version whose minor or patch would exceed 99 — the `versionCode` encoding
   (`major*10000 + minor*100 + patch`) collides past that, and the workflow will reject it.

6. **Show the commit list and the proposed version. Wait.** The user confirms or names a
   different version. Never skip this — a tag cannot be taken back.

7. **Tag and push.**

   ```bash
   git tag -a vX.Y.Z <sha> -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

8. **Create the draft.**

   ```bash
   gh release create vX.Y.Z --draft --target <sha> --generate-notes
   ```

9. **Rewrite the body** using Mode C's steps, then continue.

10. **Dispatch the build** and report the run URL.

    ```bash
    gh workflow run release.yml -f tag=vX.Y.Z
    gh run list --workflow=release.yml --limit 1 --json url,status
    ```

11. **Tell the user what is left**: wait for the EAS build (~10–20 min) to attach
    `openrehearse-X.Y.Z.apk` and `SHA256SUMS.txt`, sideload it, import
    `client/assets/demo/bach-prelude-c-major-bwv846.mxl`, confirm the score renders and the
    cursor tracks playback, then publish the draft.

## Mode B — rebuild the APK for an existing tag

The recovery path when EAS failed after the tag already existed. It re-attaches assets
without cutting a new version.

1. Confirm the release is still a draft (`gh release view <tag> --json isDraft,tagName`).
   If it is published, stop — editing a published release changes what people already have.
2. If the user named a SHA and the tag points somewhere else
   (`git rev-list -n 1 <tag>`), say so loudly and stop. A tag that moved is a bigger
   problem than a missing APK.
3. `gh workflow run release.yml -f tag=<tag>`, then report the run URL.

Diagnose *why* the previous build failed with the `release-triage` skill before spending
another build slot.

## Mode C — rewrite notes on an existing draft

### Who reads these

Piano students and teachers, not contributors. They do not know what OSMD is, that a loop
is called a "bit" internally, or what a Zustand store does. They know: importing a score,
looping a passage, tempo, the cursor, warm-ups, routines, practice tracking.

### Steps

1. **Check it is a draft.**

   ```bash
   gh release view <tag> --json tagName,isDraft,body
   ```

   If it is not a draft, stop and say so — it is already published and editing it changes
   what people have read.

2. **Read the raw body.** `--generate-notes` lists every merged PR title with a link. That
   list is your only source of truth for *what shipped*.

3. **Understand each entry before describing it.** For anything whose user-facing effect is
   not obvious from the title, read the matching `specs/features/*.md`. If an entry's effect
   is still unclear, keep the original wording rather than inventing a benefit.

4. **Rewrite.** Group into `### New`, `### Fixed`, `### Under the hood`. One line each, in
   the vocabulary above. Drop entries with no user-visible effect from the top sections —
   they stay in the preserved full changelog.

5. **Preserve the machine list.** Append the original body verbatim:

   ```markdown
   <details><summary>Full changelog</summary>

   ...original generated body...

   </details>
   ```

6. **Add the install note** (these are sideloaded APKs, not a store install):

   ```markdown
   ## Install
   Download `openrehearse-<version>.apk`, verify it against `SHA256SUMS.txt`, then
   install it on your Android device. Upgrading over an existing install keeps your
   pieces and practice history.
   ```

7. **Show the user the full proposed body and wait for approval.** Only then:

   ```bash
   gh release edit <tag> --notes-file <file>
   ```

## Rules

- **Never publish a release.** Publishing is the human's device-smoke-test gate, in every
  mode.
- **Never tag a commit that is not a green ancestor of `main`.** Both checks are hard
  refusals, not warnings.
- **Never create a second tag for an already-tagged commit**, and never move an existing
  tag.
- **Never dispatch `release.yml` unasked.** Every run spends one of 15 monthly EAS builds.
- Never describe a feature that is not in the raw changelog. No inference from `specs/`
  about what "probably" shipped — specs describe intent, the changelog describes reality.
- No performance or reliability claims unless a commit actually measured one.
- Do not edit version numbers in `client/package.json` or `client/app.json`. They are
  `0.0.0` placeholders on purpose; the tag is the version and CI derives the real values
  from it.

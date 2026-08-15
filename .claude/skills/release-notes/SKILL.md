---
name: release-notes
description: Rewrite a draft GitHub Release's auto-generated changelog into notes a piano student can read. Use when a draft release exists and its body is still release-please's raw feat/fix list, or when the user asks to write, improve, or review release notes for OpenRehearse.
---

# Writing OpenRehearse release notes

Advisory only. The release pipeline works without this skill — it produces a perfectly
valid, if dry, changelog. Never block a release on this.

## Who reads these

Piano students and teachers, not contributors. They do not know what OSMD is, that a
loop is called a "bit" internally, or what a Zustand store does. They know: importing a
score, looping a passage, tempo, the cursor, warm-ups, routines, practice tracking.

## Steps

1. **Find the draft.**

   ```bash
   gh release list --limit 5
   gh release view <tag> --json tagName,isDraft,body
   ```

   If the release is not a draft, stop and say so — it is already published and editing
   it changes what people have read.

2. **Read the raw body.** release-please lists every `feat:`/`fix:` PR title with a
   commit link. That list is your only source of truth for *what shipped*.

3. **Understand each entry before describing it.** For anything whose user-facing effect
   is not obvious from the title, read the matching `specs/features/*.md`. If an entry's
   effect is still unclear, keep the original wording rather than inventing a benefit.

4. **Rewrite.** Group into `### New`, `### Fixed`, `### Under the hood`. One line each,
   in the vocabulary above. Drop entries with no user-visible effect from the top
   sections — they stay in the preserved full changelog.

5. **Preserve the machine list.** Append the original body verbatim:

   ```markdown
   <details><summary>Full changelog</summary>

   ...original release-please body...

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

   Do not publish the release. Publishing is the human's device-smoke-test gate.

## Rules

- Never describe a feature that is not in the raw changelog. No inference from `specs/`
  about what "probably" shipped — specs describe intent, the changelog describes reality.
- No performance or reliability claims unless a commit actually measured one.
- Do not touch `CHANGELOG.md`; release-please owns that file and will overwrite you.

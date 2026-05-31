Update project documentation for the current work, then create a git commit.

Review what changed in the current work session, update all affected documentation, and commit. Always read each file before editing. **Present proposed doc changes to the user for approval before writing** (unless they already approved in this thread).

## Documentation files

### 1. `specs/` (product source of truth)

**Purpose:** Product intent, acceptance criteria, MVP boundaries, non-goals.

**When to update:** User-visible behavior changes, new features in scope, amended technical direction (stack, storage, auth), acceptance criteria shipped or revised.

**Be careful:**

- **`specs/features/*.md`** — one feature area per file; keep acceptance checkboxes honest.
- **`specs/overview.md` / `specs/mission.md`** — only when scope or positioning shifts.
- **`specs/architecture.md`** — stack choices, module boundaries, Docker/CI posture.
- Do not duplicate long implementation prose here — point to `compound-docs/` for landmines.

### 2. `AGENTS.md` (agent routing)

**Purpose:** Required reading by task, non-negotiables, module map, commands, doc-update matrix.

**When to update:** New top-level folders, new required-reading rows, new non-negotiables, new compound-doc topics, changed quality-check commands.

**Be careful:** Keep concise — link to README and compound-docs instead of copying setup steps.

### 3. `compound-docs/` (implementation memory)

**Purpose:** Failed approaches, landmines, key decisions for non-obvious code paths.

**When to update:** OSMD/Tone/MusicXML/loop/sync lessons; "never do X" findings; trade-offs not obvious from specs.

**Be careful:**

- Append or extend the relevant topic file (e.g. `playback-osmd-tone.md`); add a new dated file only when the topic is distinct.
- Use **Failed Approaches** / **LANDMINE** sections; cross-link commits when helpful.

### 4. `README.md` (repo root)

**Purpose:** Clone, run, quality checks, contributing pointer.

**When to update:** New npm scripts, Node version, Docker CI usage, sample fetch, export/offline flow, env setup steps.

### 5. `client/docs/offline-qa.md`

**Purpose:** Manual QA checklist for static export, offline, viewport, large-score guards.

**When to update:** New manual QA steps, changed export/serve commands, new performance or offline requirements.

## Process

1. **Assess scope** — Which files above are affected by the session's changes?
2. **Read affected files** — Never edit blind.
3. **Draft changes** — Per file: what changes and why; get user approval if not already given.
4. **Apply** — Write doc edits.
5. **Quality gate** — Follow **Quality gate** below when applicable.
6. **Commit** — Follow **Git commit** below (required end step for this command).

## Quality gate

Run before staging when the session touched **`client/`** code, tests, or config that affects lint/typecheck/test (e.g. `eslint`, `tsconfig`, Jest).

From the **repository root**:

```bash
cd client && npm run ci
```

1. Fix failures; re-run until clean.
2. `npm run ci` includes **`npm run format`** (writes). If Prettier changed files, include them in the commit.
3. Optional Docker parity: `docker compose run --rm ci` (same script; use when local Node differs from CI).

**Skip** when the commit is **docs-only** under `specs/`, `compound-docs/`, `README.md`, `client/docs/`, or `AGENTS.md` with **no** `client/` source changes — unless the user asks to run CI anyway.

Do not commit with a failing quality gate.

## Git commit

Run from the **repository root**. Do not change git config. Do not skip hooks (`--no-verify`). Do not force-push. Do not amend unless the user explicitly asked and amend rules in project instructions apply.

### Before committing

In parallel:

- `git status`
- `git diff` (staged and unstaged)
- `git log -5 --oneline` (match existing style)

Do **not** stage or commit secrets (`.env`, credentials, keys). Warn the user if they appear in the diff.

### Commit message (commitlint / Husky)

[Conventional Commits](https://www.conventionalcommits.org/) — enforced by `commitlint.config.cjs` at repo root (extends `@commitlint/config-conventional`).

**Format:** `type: subject` or `type(scope): subject`

- **Allowed types** (lowercase only): `wip`, `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `specs`, `build`, `ci`
- **Subject:** imperative, concise, no trailing period; start lowercase after the colon space
- **Header (first line) max length:** **100 characters** total (including `type: ` or `type(scope): `)
- **Pick type by dominant change:**
  - `specs/` only or mainly → `specs:`
  - `compound-docs/`, `README.md`, `client/docs/`, `AGENTS.md` → `docs:`
  - Code + docs in one logical change → primary type (`feat:`, `fix:`, …) with subject covering the feature/fix; mention docs in body if needed
  - Tooling/scripts/CI only → `chore:`, `build:`, or `ci:`

**Examples (header only):** `feat: add MusicXML import`, `specs: clarify offline storage`, `docs: document OSMD cursor landmine`

#### Body line length (hook fails often — read this)

Commitlint rule **`body-max-line-length`**: **every line of the commit body** must be **≤ 100 characters**. This includes **each** `-m` paragraph on PowerShell, footer lines, and `Co-authored-by:` if present. One long paragraph in a single `-m` **will fail** even if the header is fine.

**Before `git commit`, draft the body as separate short lines** (aim for **≤ 80 characters** per line so you stay safe). Do **not** paste a single multi-sentence paragraph into one `-m`.

**Wrong** (one `-m`, ~200+ characters — rejected):

```powershell
git commit -m "feat(playview): add speed picker" -m "Replace the vertical speed stack with a speedometer that opens a portaled sliding row over the score and pauses on open."
```

**Right** (header + several short `-m` lines, each ≤ 100 characters):

```powershell
git commit -m "feat(playview): add two-step speed picker overlay on web" `
  -m "Replace the vertical speed stack with a portaled speedometer control." `
  -m "Opening pauses transport; speed choice slides closed without resume." `
  -m "Add S and C shortcuts; closed cell shows current speed label."
```

On PowerShell: use **multiple `-m "..."` flags** (one short sentence each). **Do not use heredocs** (`<<'EOF'`) — they are unreliable. **Do not use one long second `-m`** for the whole body.

If the hook reports `body-max-line-length`, split the offending line into more `-m` flags or shorten sentences; then run a **new** `git commit` (do not `--amend` unless amend rules apply).

### Commit steps (sequential)

1. Stage only relevant files (code + doc updates for this session). Omit unrelated untracked noise unless the user asked to include it.
2. **Draft the full message in the reply** (header + body lines with character counts ≤ 100) so mistakes are visible before the hook runs.
3. Commit using the PowerShell pattern above (header + one `-m` per body line).
4. `git status` after commit to confirm success.
5. If the **commit-msg hook rejects** the message, fix line length and create a **new** commit attempt — do not `--amend` unless amend rules apply.

Focus the message on **why**, not a file list.

## Arguments

$ARGUMENTS

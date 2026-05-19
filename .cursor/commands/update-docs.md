Update project documentation after code changes.

Review what changed in the current work session and update all affected documentation. Always read each file before editing. **Present proposed changes to the user for approval before writing.**

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

**When to update:** OSMD/Tone/MusicXML/loop/sync lessons; “never do X” findings; trade-offs not obvious from specs.

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

1. **Assess scope** — Which files above are affected by the session’s changes?
2. **Read affected files** — Never edit blind.
3. **Draft changes** — Per file: what changes and why.
4. **Present for approval** — Summarize proposed edits; list any issue creates/closes.
5. **Apply after approval** — Make edits in the same PR/commit series as the code when possible.

## Arguments

$ARGUMENTS

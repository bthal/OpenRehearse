# Brand asset generators

Regenerates everything in `client/assets/brand/` and the app icons in
`client/assets/`. The committed assets are byte-for-byte reproducible from these
scripts — if a run produces a diff you did not intend, something changed.

Rules and rationale live in [`specs/brand.md`](../../specs/brand.md); the failure
modes live in [`compound-docs/brand-assets.md`](../../compound-docs/brand-assets.md).

Python, not Node, because the work is geometry and font-table manipulation and the
output is static files — none of it belongs in the app's dependency tree.

## Requirements

| | |
|---|---|
| `rsvg-convert` | renders SVG to PNG (`brew install librsvg`) |
| `fonttools` | outlines the wordmark — **only** needed for `outline.py` |

`fonttools` is deliberately not a repo dependency. Install it in a throwaway venv:

```bash
python3 -m venv /tmp/brandvenv && /tmp/brandvenv/bin/pip install fonttools
```

## Full regeneration

Run from this directory, in order — `gen_lockups.py` reads the marks that
`gen_marks.py` writes:

```bash
python3 gen_marks.py && python3 gen_lockups.py && /tmp/brandvenv/bin/python outline.py ../../client/assets/brand/lockup-*.svg && python3 gen_icons.py
```

**`outline.py` is not optional.** `gen_lockups.py` emits `<text font-family="Outfit">`,
which renders correctly only where Outfit is installed. Committing a lockup in that
state means it silently falls back to Helvetica on every other machine. Verify with:

```bash
grep -l "<text" ../../client/assets/brand/*.svg
```

That must print nothing.

## The files

| Script | Produces |
|---|---|
| `gen_marks.py` | the four marks — circle, square, ring, bare |
| `gen_lockups.py` | the four lockups, wordmark still as `<text>` |
| `outline.py` | converts that `<text>` to paths, in place |
| `gen_icons.py` | the six app icon PNGs in `client/assets/` |
| `palette.py` | prints the colour ramps and **verifies every contrast ratio** |
| `reference-path.txt` | the source path data the marks are built from |

`palette.py` generates nothing — it is the check. Run it after touching any colour and
confirm it ends with `all checks passed`:

```bash
python3 palette.py
```

The values it prints are the same ones written into `client/tailwind.config.js` and
`client/src/theme/colors.ts`. Those two files are hand-maintained, so if you change a
ramp here you must copy it across — nothing enforces that automatically.

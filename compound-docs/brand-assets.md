# Brand asset + palette landmines

Traps found while replacing the seagrass palette with the navy identity
(`client/tailwind.config.js`, `client/src/theme/colors.ts`, `client/assets/brand/`).
Values and rationale live in [`specs/brand.md`](../specs/brand.md); this file is the
list of ways to break it.

## A blind token rename maps semantically wrong things together

**LANDMINE:** the migration was a near-perfect rename — `ash-grey-N` → `slate-N`,
`seagrass-N` → `navy-N`, `mauve-shadow-N` → `error-N` — and that is exactly what makes
it dangerous. `mauve-shadow` carried *two* unrelated jobs: destructive/error states,
**and** the app wordmark on the dashboard and about screens, which was decorative.
A clean `sed` turned the app's own title into `text-error-500`, i.e. bright red, with
no error anywhere in sight.

The same trick bit `src/score-web/html.ts`, where a comment reading "seagrass-700
(#3C5D57)" was rewritten to "navy-700 (#3C5D57)" while the hex stayed teal — a comment
that now actively lied.

**Rule:** after any palette rename, grep the *diff* for sites where the old token was
doing a job the new name does not describe. Renames are safe for ramps, never for
tokens that were overloaded.

## The palette was only half in the token layer

**LANDMINE:** roughly 50 call sites passed literal hex to `AppIcon` — stock Tailwind
greys (`#374151`, `#9CA3AF`, `#D1D5DB`) next to the old accent `#4B7A6E`. None of them
showed up in a search for `seagrass`, so a token-only migration would have left the
app half-rebranded and looking broken.

**CONSTRAINT:** `AppIcon` paints through an SVG `fill` prop, and `ActivityIndicator`
takes a `color` prop; neither accepts a Tailwind class. That is why `Colors` exists
alongside the Tailwind config. Icon shades belong in `Colors` (`icon`, `iconMuted`,
`iconDisabled`) — **never as a literal in a component.**

When auditing, search for `#[0-9A-Fa-f]{6}` and for `rgba(` separately: the old
loop-handle colour was hiding as `rgba(75,122,110,0.75)` and no hex search would have
found it.

## The WebView document cannot reference the token layer

**CONSTRAINT:** `src/score-web/html.ts` is a string handed to the WebView verbatim. It
has no access to Tailwind or to `Colors`, so its colours are necessarily literal —
the cursor line, the loop shade, the loop handles, and the grip glyphs.

These are the values most likely to be missed in a rebrand, because they look like
library internals. They are not. The minified OSMD bundle on the same line *is*
library internals — leave those alone.

Loop shade was also re-tuned from 20% to 12% alpha: against the old teal accent a 20%
wash read fine, but a navy shade at 20% sitting between navy handles read as one solid
band. Alpha values are hue-dependent; re-check them when the hue moves.

## SectionColors are data, not brand — leave them alone

**CONSTRAINT:** the eight categorical hues in `src/theme/colors.ts` survived this
rebrand untouched and should survive the next one. They encode "this is a different
section from the last one"; aligning them to the brand would destroy the only thing
they do. They also stay written as hex because they cross three parsers (RN styles,
`react-native-svg` gradient stops, and CSS inside the WebView) and hex is the only
notation all three read identically.

One new adjacency to know: `blue` (hue 214) now sits closer to the brand hue (240)
than it did to seagrass. It is still safe **only because section labels appear on
light PlayView surfaces and never against navy chrome.** If a section label ever lands
on navy, re-check `blue` before anything else.

## Variable fonts render at the wrong weight on Android

**LANDMINE:** the obvious way to bundle Outfit is the variable TTF from
`google/fonts` — one file, every weight. React Native on Android ignores the `wght`
axis, so that file renders at the default instance (400) and the wordmark silently
comes out light. Nothing errors.

**Rule:** bundle a *static* instance. `client/assets/fonts/Outfit-SemiBold.ttf` comes
from `Outfitio/Outfit-Fonts` and has no `fvar` table — that absence is the check.

Because only one weight ships and it is registered under the bare family name
`Outfit`, **never pair `font-brand` with `font-semibold` or `font-bold`**: Android
synthesises a fake bold on top of a face that is already 600. Same for `italic` —
Outfit has no italic, so the platform fakes an oblique.

Font loading is deliberately **not** gated: `useFonts` in `app/_layout.tsx` does not
hold rendering. The wordmark is two text nodes, so the worst case is a brief fallback
face on those two. Do not add a splash-screen gate for this.

## The ring mark dies below 48px

**LANDMINE:** `mark-ring.svg` is the reversed-out mark and looks strongest at large
sizes, which makes it tempting everywhere. Below ~32px its border thins into a grey
halo and the piano inside shrinks past reading. Measured, not guessed.

Use `mark-bare.svg` below 48px on navy. On light, `mark-square` holds to 20px and
`mark-circle` only to 24px — the favicon is square for that reason.

## Adaptive icon foreground is sized against the visible 66%, not the canvas

**LANDMINE:** Android launchers show only the middle 66% of the adaptive-icon canvas
(72dp of 108dp) and crop that to a device-specific mask. Sizing the foreground as if
the whole canvas were visible produces an icon clipped on every device with an
aggressive mask.

The piano sits at **0.40 of the canvas**, which is 0.40/0.66 = 61% of the visible
area — matching how the square mark sits at 0.60 of its own box.

Also: **no baked-in corner radius** on `icon.png`. Both platforms apply their own
mask, and a radius in the source gives a double-rounded edge.

## Lockup SVGs must be outlined before committing

**LANDMINE:** the lockup generator emits `<text font-family="Outfit">`, which only
renders correctly on a machine with Outfit installed. On any other machine — a
browser, a design tool, a teammate's laptop — it silently falls back to Helvetica and
the lockup is wrong in a way that looks intentional.

The committed files in `client/assets/brand/` contain paths. If you regenerate one,
outline it again. The check is `grep -l "<text" client/assets/brand/*.svg` returning
nothing.

## BrandMark duplicates the mark's path data

**LANDMINE:** `components/BrandMark.tsx` renders the circle logo by hand-porting the
path data *and* the placement transform out of `assets/brand/mark-circle.svg`. The
SVG is not imported: the app has no SVG transformer configured, and adding one to
move a single asset is not worth the build surface.

The cost is that **regenerating the mark does not update the component.** They drift
silently — nothing fails, no test catches it, and the app keeps shipping the previous
artwork while the committed SVG shows the new one.

After running `scripts/brand/gen_marks.py`, check them against each other:

```bash
python3 - <<'PY'
import re
svg = open('client/assets/brand/mark-circle.svg').read()
tsx = open('client/components/BrandMark.tsx').read()
norm = lambda s: re.sub(r'\s+', '', s)
a = re.search(r'<path fill="#FFFFFF" d="([^"]+)"', svg).group(1)
b = ''.join(re.findall(r"'([^']*)'", tsx.split('const PIANO_PATH =')[1].split(';')[0]))
print('path in sync:', norm(a) == norm(b))
PY
```

The transform must match too — `translate(115.2,115.2) scale(4.4)` places the 64-unit
reference path at 0.55 of the 512 viewBox. Compare numerically, not textually: the
generator writes `115.20` and `4.400000` where the component has `115.2` and `4.4`.

## The mark's licence is an obligation that travels

**CONSTRAINT:** the mark derives from a **CC BY** icon by Pixel Bazaar. Two things
must accompany it wherever it ships: credit with a link to the licence, and a
statement that it was modified. Recorded in `THIRD_PARTY_NOTICES.md`; if the mark
appears on a new surface, the attribution goes there too.

In-app this is discharged on the About screen, first row under Open-source notices
(`app/about.tsx`, strings `about.logoNotice` / `about.logoModified`). `NoticeRow`
grew an optional `note` for it, because CC BY needs the licence link *and* the
modification statement, and neither fits the `license · copyright` line.

CC BY is a copyright licence, not a trademark one — the mark is not exclusive to
OpenRehearse and cannot be made so. Don't plan around defending it.

## slate-400 is off-ramp on purpose

**CONSTRAINT:** `slate-400` sits at 58% lightness where an even ramp would put it at
62%. The muted tab icon and heatmap header text sit on this step against `slate-50`,
and 62% measures 2.81 against the 3.0 bar for non-text UI. The outgoing
`ash-grey-400` was 2.42, so this was a standing bug, not a regression introduced by
the ramp.

Regularising the ramp "for consistency" reintroduces it. Re-measure before moving it.

## Regenerating assets

Generators live in [`scripts/brand/`](../scripts/brand/) — see its README for the run
order and requirements. Every committed asset is byte-for-byte reproducible from them,
so an unexpected diff means something actually changed.

**The ramps are not generated into the app.** `scripts/brand/palette.py` computes and
*verifies* them, but `client/tailwind.config.js` and `client/src/theme/colors.ts` are
hand-maintained copies. Nothing enforces that they agree. After touching a colour, run
`palette.py`, confirm it ends with `all checks passed`, and copy the values across by
hand.

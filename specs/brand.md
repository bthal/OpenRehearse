# Brand and styling guidelines

Authority for **what OpenRehearse looks like**: the mark, the colour system, the
typeface, and the rules for using them. Change the values here in the same commit
you change `client/tailwind.config.js` or `client/src/theme/colors.ts`, or this file
stops being true and starts being decoration.

Implementation traps — the failure modes that are not obvious from reading the
values — live in [`compound-docs/brand-assets.md`](../compound-docs/brand-assets.md).

---

## 1. The mark

A piano octave printed as a **negative**: white is the ink, and the brand navy shows
through where the white keys would be. Four white keys and three black keys, with a
framed border.

### The four assets

| File (`client/assets/brand/`) | Use | Piano scale |
|---|---|---|
| `mark-circle.svg` | Primary mark on light grounds — avatars, letterheads, docs | 0.55 |
| `mark-square.svg` | App icon, favicon, anywhere a square tile is wanted | 0.60 |
| `mark-ring.svg` | Reversed out on navy, **48px and above** | 0.55 |
| `mark-bare.svg` | Reversed out on navy, **below 48px** | full bleed |

The artwork never changes between these. Only the container and the room the piano
gets inside it change.

### Size rules, measured

These came from rendering at true pixel sizes, not from judgement:

| Mark | Holds down to | Fails because |
|---|---|---|
| `mark-bare` | 16px | — most ink, fewest shapes |
| `mark-square` | 20px | soft at 16 |
| `mark-circle` | 24px | the circle's margin eats the piano below that |
| `mark-ring` | **48px** | the border thins into a grey halo and the piano shrinks past reading |

**The ring is a large-format asset.** This is the single most important rule here: on
navy, use the ring at 48px and up, and `mark-bare` below it. For a 16px favicon,
prefer the bare piano on a navy square over the circle.

### Circle sizing

The piano sits at **0.55** of the circle's diameter. A square inscribed in a circle
tops out at 1/√2 = 0.707 of the diameter, so 0.60 was already crowding the arc; 0.50
lost presence in the field. The square gets 0.60 because its corners are not
competing with an arc.

### Ring weight

The ring's border is drawn at **exactly the piano's own frame weight** — 2 units in
the reference's 64-unit box, so `scale × size × 2/64`. Matching them makes the mark
read as one stroke system rather than a glyph inside an unrelated circle. If the
piano scale changes, the ring weight has to move with it.

### Don't

- Don't recolour the mark. It is navy and white; there is no third tint and no gradient.
- Don't put the ring below 48px.
- Don't add a drop shadow, bevel, or outline glow.
- Don't stretch it — the artwork is square and stays square.
- Don't place the bare mark on a light ground; the ink is white.

---

## 2. Attribution — a shipping obligation, not a courtesy

The mark derives from an icon by **Pixel Bazaar**
(<https://www.svgrepo.com/author/pixelbazaar/>) via SVG Repo, licensed **CC BY**. The
unmodified source is kept at `client/assets/brand/reference-piano.svg`.

CC BY carries two obligations wherever the logo ships:

1. **Credit the author**, with a link to the licence.
2. **State that the work was modified.** It was — recoloured and placed on navy.

This is recorded in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) and shown to
users on the **About screen**, as the first entry under Open-source notices. If the
mark appears in a new surface (store listing, marketing site, README banner), the
attribution travels with it.

**Known limitation, deliberately accepted:** CC BY is a copyright licence, not a
trademark one. Anyone — including a competitor — may use the same icon, and the
licence cannot be revoked. The mark is therefore *not exclusive* to OpenRehearse.
Fine for an open-source app; do not build on an assumption of exclusivity.

---

## 3. Colour

Light app, navy chrome. `userInterfaceStyle` stays `"light"` — navy is the brand
colour, not the app surface. Sheet music is white paper, and a dark app rendering
white score pages looks broken.

### Brand ramp — `navy`

Hue 240 throughout. **950 is the only fixed point** (the supplied logo navy);
everything else is derived, easing saturation off toward the light end so the tints
stay usable as surfaces instead of drifting lilac.

| Step | Hex | Role |
|---|---|---|
| 50 | `#F5F5FC` | tinted surface |
| 100 | `#E7E7F8` | tinted surface |
| 200 | `#CDCDEE` | heatmap step 1 |
| 300 | `#AAAADF` | |
| 400 | `#7D7DCA` | heatmap step 2 |
| 500 | `#4646B9` | |
| **600** | **`#2E2E9E`** | **interactive** — buttons, links, active toggles, heatmap step 3 |
| 700 | `#181881` | pressed states, WebView loop-handle grips |
| 800 | `#0A0A61` | heatmap step 4 |
| 900 | `#030349` | |
| **950** | **`#000036`** | **brand ground** — logo, splash, app icon |

**600 is the interactive step, not 950.** The brand navy sits at 10.6% lightness; a
button painted in it reads as a black slab rather than something tappable. 600 stays
unmistakably the brand hue while looking pressable, and carries white at 10.5:1.

### Neutrals — `slate`

Pulled onto the brand hue (240) so they sit *with* the navy rather than beside it.
Replaces `ash-grey`.

| Step | Hex | Role |
|---|---|---|
| 50 | `#F7F7FA` | app background |
| 100 | `#EEEEF3` | heatmap empty cell, subtle fills |
| 200 | `#DCDCE5` | hairlines, borders |
| 300 | `#C0C0CE` | empty-state artwork |
| **400** | **`#8888A0`** | muted icons and captions |
| 500 | `#6E6E87` | secondary text |
| 600 | `#55556D` | |
| 700 | `#3D3D52` | default icon colour |
| 800 | `#2A2A3C` | |
| 900 | `#1A1A28` | |
| 950 | `#0E0E1B` | body text |

**`slate-400` is at 58% lightness, not the 62% an even ramp would give.** The muted
tab icon sits on this step against `slate-50`, and 62% lands at 2.81 — under the 3.0
bar for UI elements. The outgoing `ash-grey-400` was worse still at 2.42, so this is a
fix, not a port. Don't "regularise" the ramp without re-checking this.

### Semantics

Every step from 500 up carries white text at 4.5:1 or better. The 50s are surface
tints and carry no text.

| | 50 | 500 | 600 | 700 | 800 |
|---|---|---|---|---|---|
| `error` | `#FDECEE` | `#B81E2D` | `#A01825` | `#901420` | `#770D18` |
| `success` | `#EBFAF2` | `#0C7D45` | `#096C3B` | `#085E33` | `#054D29` |
| `warning` | `#FEF4E7` | `#A46104` | `#905604` | `#7D4A03` | `#643B02` |

Errors read as **red**. The retired `mauve-shadow` was decorative and under-signalled
destructive actions.

### Measured contrast

Every figure verified, not estimated:

| Pair | Ratio | Bar |
|---|---|---|
| `slate-950` body text on `slate-50` | 17.90 | 4.5 |
| `slate-500` caption on `slate-50` | 4.63 | 4.5 |
| `slate-400` muted icon on `slate-50` | 3.23 | 3.0 |
| white on `navy-600` (primary button) | 10.50 | 4.5 |
| white on `navy-950` (brand ground) | 19.94 | 4.5 |
| white on `error-500` | 6.44 | 4.5 |
| white on `success-500` | 5.20 | 4.5 |
| white on `warning-500` | 4.89 | 4.5 |

Heatmap step separation — each step against its neighbour, and `empty` against the
first filled step: 1.34, 2.40, 2.83, 1.63 (bar: 1.25). Below that a one-minute day
and a no-practice day look identical at cell size.

### Retired

`seagrass`, `ash-grey` and `mauve-shadow` are gone. Do not reintroduce them.

### Exempt: `SectionColors`

The eight categorical hues in `client/src/theme/colors.ts` **are not brand colours and
must not be aligned to the brand.** They encode information — "this is a different
section from the last one" — and tints of one hue cannot do that. Each is already
tuned to hold white text at roughly 4.5:1. They survived this rebrand untouched and
should survive the next one.

One consequence to know: the `blue` entry (hue 214) now sits nearer the brand hue
(240) than it did to the old seagrass. They stay tellable apart because section labels
only ever appear on light PlayView surfaces, never against navy chrome. If that
changes, re-check `blue` first.

---

## 4. Typography

**Outfit SemiBold**, SIL Open Font License. Bundled at
`client/assets/fonts/Outfit-SemiBold.ttf`, loaded in `client/app/_layout.tsx`, exposed
as the `font-brand` Tailwind class.

| | |
|---|---|
| Family | Outfit |
| Weight | 600 (SemiBold) — the only weight that ships |
| Tracking | `-0.020em` in the wordmark; `tracking-tight` in app text |
| Licence | SIL OFL — `client/assets/fonts/OFL.txt` |

### Rules

- **Never pair `font-brand` with `font-bold` or `font-semibold`.** Only one weight is
  bundled and it is already 600; asking for more makes Android synthesise a fake bold
  on top of it.
- **Never use italic.** Outfit ships no italic, so the platform fakes an oblique.
- Body and UI text use the platform system font. Outfit is for the wordmark and brand
  moments only — it is not a UI face here.

### Considered and rejected

All six candidates were OFL, which was the binding constraint since Expo bundles the
file. Widths are the ink width of "OpenRehearse" at size 100 / weight 600 with each
family's tracking applied.

| Family | Direction | Width |
|---|---|---|
| **Outfit** | Geometric | **644** |
| Figtree | Geometric | 642 |
| Inter | Grotesk | 639 |
| Manrope | Grotesk | 675 |
| Space Grotesk | Distinctive | 657 |
| Sora | Distinctive | 723 |

---

## 5. Lockups

Two arrangements, in `client/assets/brand/`:

| File | Arrangement |
|---|---|
| `lockup-horizontal.svg` | mark left, name right |
| `lockup-stacked.svg` | mark above, name beneath |
| `lockup-*-onnavy.svg` | the same two, reversed out using `mark-ring` |

### Geometry

Generated, not hand-placed, so any proportion can be re-cut.

| | Horizontal | Stacked |
|---|---|---|
| Wordmark size | 0.60 × mark width | 0.30 × mark width |
| Gap | 0.28 × mark width | 0.17 × mark width |
| Alignment | wordmark centred on **cap height** | centred |

The wordmark centres on cap height, not the full ink box: including the descender of
"p" pushes the word visibly high.

The navy lockups use the ringed mark rather than the bare piano, which gives them the
**same circular silhouette and identical dimensions** as the light versions — the two
are drop-in interchangeable.

### Clear space

Keep clear space of at least **half the mark's width** on every side of a lockup.
Nothing — type, rules, image edges — enters that margin.

### It is wider than it looks — check before centring

The lockup's total width is roughly **8.6 × the wordmark's font size**. That adds up
faster than it reads on a desktop mock:

| Wordmark | Lockup width | Fits centred in a 360dp phone (312px content)? |
|---|---|---|
| 36px | 308px | **No** — clips the final letter |
| 30px | 257px | Yes, 27px clear each side |
| 26px | 230px | Yes, 41px clear each side |

The dashboard header therefore sets the wordmark at **30px with a 50px mark**, and
carries nothing else in that row — an icon at either end needs ~38px, which 360dp
does not have to spare. Measure before putting the lockup beside anything.

### The wordmark is outlined

The lockup SVGs contain **paths, not `<text>`**. An SVG that names a font only renders
correctly where that font is installed, and these files get opened by browsers and
design tools that have never heard of Outfit. If you regenerate a lockup, outline it
again before committing.

---

## 6. App icons

| File (`client/assets/`) | Size | Content |
|---|---|---|
| `icon.png` | 1024 | full-bleed navy square, piano at 0.60 |
| `splash-icon.png` | 1024 | full-bleed navy square, piano at 0.52 |
| `android-icon-background.png` | 512 | solid `#000036` |
| `android-icon-foreground.png` | 512 | piano on transparency, 0.40 of canvas |
| `android-icon-monochrome.png` | 432 | same artwork; Android tints it by alpha |
| `favicon.png` | 48 | square mark — the circle is soft at this size |

**No baked-in corner radius.** iOS and Android apply their own mask; a radius in the
source produces a double-rounded edge.

**The 0.40 adaptive scale is deliberate.** Android launchers show only the middle 66%
of the canvas (72dp visible of 108dp) and crop that to a device-specific mask. At 0.40
the piano lands at 0.40/0.66 = 61% of the *visible* area, matching how the square mark
sits at 0.60 of its own box. Sizing the foreground as if the whole canvas were visible
is the classic way to get a clipped icon.

`app.json`'s `android.adaptiveIcon.backgroundColor` is `#000036` and must match
`android-icon-background.png`.

---

## 7. Where things live

```
client/assets/brand/      marks, lockups, and the unmodified reference
client/assets/fonts/      Outfit-SemiBold.ttf + OFL.txt
client/assets/*.png       generated app icons
client/tailwind.config.js the navy / slate / semantic ramps
client/src/theme/colors.ts imperative values for props that reject class names
```

Two layers exist because React Native props like `AppIcon`'s `color` and
`ActivityIndicator`'s `color` do not accept Tailwind class names. **Anything with a
class name goes through Tailwind; everything else goes through `Colors`.** Reaching
for a literal hex in a component is how the palette drifted out of the token layer
last time — around 50 call sites were carrying stock greys and the old accent
directly.

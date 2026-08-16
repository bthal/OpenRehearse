#!/usr/bin/env python3
"""Generate the two lockups -- name to the right of the mark, and name beneath it
-- for every candidate typeface, tight-cropped to true ink bounds.

Metrics come from Chrome's canvas measureText (actualBoundingBox*, with the
per-family tracking applied), captured at font-size 100 / weight 600. They are
hard-coded because rsvg-convert on macOS resolves fonts through CoreText and
never sees these files: rendering to measure silently returns Helvetica metrics
for all six families, which is indistinguishable from success.

Caveat: these SVGs use <text>, so they only render correctly where the font is
installed. Production assets need the wordmark converted to outlines.
"""

import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(REPO, "client", "assets", "brand")

NAVY = "#000036"
WHITE = "#FFFFFF"
WORD = "OpenRehearse"

# per 100px em, weight 600, tracking already applied.
#   l/rt : ink edges relative to the text origin (l is negative for all six,
#          meaning the ink starts just RIGHT of the origin)
#   asc  : ink top above the baseline;  desc: ink bottom below it
METRICS = {
    "Outfit":        dict(l=-3.58, rt=648.05, asc=72.30, desc=20.25, track=-0.020),
    "Figtree":       dict(l=-3.93, rt=645.86, asc=71.16, desc=20.00, track=-0.020),
    "Inter":         dict(l=-3.52, rt=642.92, asc=73.93, desc=20.41, track=-0.024),
    "Manrope":       dict(l=-3.00, rt=678.30, asc=73.50, desc=24.00, track=-0.022),
    "Space Grotesk": dict(l=-5.25, rt=662.74, asc=71.40, desc=20.00, track=-0.028),
    "Sora":          dict(l=-4.70, rt=727.95, asc=75.10, desc=20.00, track=-0.026),
}

# Every generated mark is square with its ink spanning the full box, so the mark
# needs no per-variant ink table. On navy the mark becomes the ringed version --
# same circular silhouette as the light-ground mark, so it needs no size
# compensation, unlike the bare piano it replaced.
LIGHT_MARK, NAVY_MARK = "circle", "ring"


def mark_inner(name):
    src = open(os.path.join(OUT, f"mark-{name}.svg")).read()
    return re.sub(r"^.*?<svg[^>]*>", "", src, flags=re.S).replace("</svg>", "").strip()


def place_mark(name, w, x, y_center):
    """Emit the mark at width w, vertically centred on y_center."""
    s = w / 512.0
    return (f'<g transform="translate({x:.2f},{y_center - w/2:.2f}) '
            f'scale({s:.6f})">{mark_inner(name)}</g>')


def text_el(font, F, x_ink_left, baseline, fill):
    m = METRICS[font]
    x0 = x_ink_left + m["l"] * F / 100.0      # shift so the ink starts at x_ink_left
    return (f'<text x="{x0:.2f}" y="{baseline:.2f}" font-family="{font}" '
            f'font-size="{F:.2f}" font-weight="600" '
            f'letter-spacing="{m["track"] * F:.3f}" fill="{fill}">{WORD}</text>')


def svg(body, w, h):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.2f} {h:.2f}" '
            f'width="{w:.2f}" height="{h:.2f}" role="img" '
            f'aria-label="OpenRehearse">\n  {body}\n</svg>\n')


def horizontal(font, reverse=False, S=120):
    m = METRICS[font]
    mw = S                                    # mark width; both grounds match
    F = mw * 0.60
    gap = mw * 0.28
    tw = (m["rt"] + m["l"]) * F / 100.0
    fill, name = (WHITE, NAVY_MARK) if reverse else (NAVY, LIGHT_MARK)

    H = mw
    mark = place_mark(name, mw, 0, H / 2)
    # Centre optically on cap height: including the 'p' descender in the
    # calculation pushes the whole word visibly high.
    baseline = H / 2 + m["asc"] * F / 200.0
    return svg(mark + text_el(font, F, mw + gap, baseline, fill), mw + gap + tw, H)


def stacked(font, reverse=False, S=140):
    m = METRICS[font]
    mw = S                                    # mark width; both grounds match
    F = mw * 0.30
    gap = mw * 0.17
    tw = (m["rt"] + m["l"]) * F / 100.0
    fill, name = (WHITE, NAVY_MARK) if reverse else (NAVY, LIGHT_MARK)

    W = max(mw, tw)
    mark = place_mark(name, mw, (W - mw) / 2, mw / 2)
    baseline = mw + gap + m["asc"] * F / 100.0
    H = baseline + m["desc"] * F / 100.0
    return svg(mark + text_el(font, F, (W - tw) / 2, baseline, fill), W, H)


if __name__ == "__main__":
    rows = []
    for font in METRICS:
        slug = font.lower().replace(" ", "-")
        for orient, fn in (("h", horizontal), ("v", stacked)):
            for reverse in (False, True):
                suffix = '-onnavy' if reverse else ''
                out = fn(font, reverse=reverse)
                # Only the chosen face is written into the repo; the other five
                # stay available by flipping CANONICAL below.
                if font != "Outfit":
                    continue
                names = [f"lockup-{'horizontal' if orient == 'h' else 'stacked'}{suffix}.svg"]
                for name in names:
                    open(os.path.join(OUT, name), "w").write(out)
                name = names[-1]
                vb = re.search(r'viewBox="([^"]+)"', out).group(1).split()
                rows.append((name, float(vb[2]), float(vb[3])))
    for n, w, h in rows:
        print(f"{n:42s} {w:7.1f} x {h:6.1f}")

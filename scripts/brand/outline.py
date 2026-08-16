#!/usr/bin/env python3
"""Convert the <text> in the lockup SVGs to real outlines.

An SVG that references a font by name only renders correctly where that font is
installed. These files ship in the repo and get opened by browsers, design tools
and READMEs, so the wordmark has to be paths.

Tracking is applied per glyph, matching the letter-spacing the <text> version
used, so the outlined result is metrically identical to what was reviewed.
"""

import os
import re

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
FONT = os.path.join(REPO, "client", "assets", "fonts", "Outfit-SemiBold.ttf")
WORD = "OpenRehearse"
TRACK = -0.020          # em, same value the <text> version carried


def word_path(font, size, x, baseline):
    """Return (path_data, advance_width) for WORD at `size`, ink starting at x."""
    upem = font["head"].unitsPerEm
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = size / upem
    parts, pen_x = [], 0.0

    for ch in WORD:
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[name].draw(pen)
        d = pen.getCommands()
        if d:
            # y is negated: font units go up from the baseline, SVG goes down.
            parts.append(
                f'<path transform="translate({x + pen_x * scale:.3f},{baseline:.3f}) '
                f'scale({scale:.6f},{-scale:.6f})" d="{d}"/>'
            )
        pen_x += gs[name].width + TRACK * upem

    return "".join(parts), pen_x * scale


def outline_file(path, font):
    src = open(path).read()
    m = re.search(
        r'<text x="([-\d.]+)" y="([-\d.]+)"[^>]*font-size="([\d.]+)"[^>]*'
        r'fill="(#[0-9A-Fa-f]{6})"[^>]*>([^<]*)</text>', src)
    if not m:
        return False
    x, baseline, size, fill = (float(m.group(1)), float(m.group(2)),
                               float(m.group(3)), m.group(4))

    # The <text> x already had the left side bearing backed out of it, so the
    # first glyph's own bearing must not be applied twice.
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upem = font["head"].unitsPerEm
    lsb = font["hmtx"][cmap[ord(WORD[0])]][1]
    x += lsb * size / upem

    d, _ = word_path(font, size, x, baseline)
    out = src[:m.start()] + f'<g fill="{fill}">{d}</g>' + src[m.end():]
    open(path, "w").write(out)
    return True


if __name__ == "__main__":
    font = TTFont(FONT)
    import sys
    for p in sys.argv[1:]:
        print(("outlined " if outline_file(p, font) else "no <text> in ") + os.path.basename(p))

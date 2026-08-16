#!/usr/bin/env python3
"""Render the app icon set from the mark, straight into client/assets/.

Sizes match whatever was already committed, so nothing downstream has to change.

Android adaptive icons are the fiddly ones: the launcher only ever shows the
middle 66% of the canvas (72dp visible out of 108dp), and it crops that to
whatever mask the device uses. So the piano goes in at 0.40 of the canvas, which
lands at 0.40/0.66 = 61% of the *visible* area -- matching how the square mark
sits at 0.60 of its own box.
"""

import os
import subprocess

from gen_marks import NAVY, SIZE, piano, square, svg

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(REPO, "client", "assets")

# Fraction of the canvas the piano occupies inside an adaptive-icon layer.
ADAPTIVE = 0.40


def flat_square(scale):
    """Full-bleed navy square, no rounded corners -- iOS and Android apply their
    own mask, so baking a radius in only risks a double-rounded edge."""
    g = f'<rect width="{SIZE}" height="{SIZE}" fill="{NAVY}"/>'
    return svg(g + piano(scale, SIZE), SIZE)


def transparent(scale):
    """Piano alone on transparency, for the adaptive foreground and monochrome
    layers. Android tints the monochrome layer by alpha, and the mark is already
    a flat white glyph, so the same artwork serves both."""
    return svg(piano(scale, SIZE), SIZE)


def solid(color):
    return svg(f'<rect width="{SIZE}" height="{SIZE}" fill="{color}"/>', SIZE)


ASSETS = [
    ("icon.png",                     1024, flat_square(0.60)),
    ("splash-icon.png",              1024, flat_square(0.52)),
    ("android-icon-background.png",   512, solid(NAVY)),
    ("android-icon-foreground.png",   512, transparent(ADAPTIVE)),
    ("android-icon-monochrome.png",   432, transparent(ADAPTIVE)),
    # 48px is below where the circle holds, so the favicon uses the square.
    ("favicon.png",                    48, flat_square(0.60)),
]


if __name__ == "__main__":
    tmp = os.path.join(HERE, "_icon.svg")
    for name, px, content in ASSETS:
        with open(tmp, "w") as f:
            f.write(content)
        subprocess.run(["rsvg-convert", "-w", str(px), "-h", str(px),
                        tmp, "-o", os.path.join(OUT, name)], check=True)
        print(f"wrote {name:32s} {px}x{px}")
    os.remove(tmp)

#!/usr/bin/env python3
"""Generate OpenRehearse logo drafts from the supplied reference piano icon.

The reference (reference-piano.svg, 64x64) is a single filled path: a rounded
square frame with four white keys cut out of it. Inverting is therefore just a
recolour -- the path becomes white and sits on the navy ground, so the frame,
the separators and the three black keys are the only ink, and the navy showing
through the cut-outs reads as the white keys.

The artwork itself is not redrawn. The only variable here is how it is framed:
how much room it gets inside the circle or the rounded square.
"""

import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(REPO, "client", "assets", "brand")

NAVY = "#000036"
WHITE = "#FFFFFF"

PATH = open(os.path.join(HERE, "reference-path.txt")).read().strip()
REF = 64.0                       # the reference viewBox is 64x64, ink edge to edge
SIZE = 512                       # output box


def piano(scale, size=SIZE):
    """The reference path, centred, its ink `scale` x the output box."""
    side = size * scale
    k = side / REF
    off = (size - side) / 2
    return (f'<g transform="translate({off:.2f},{off:.2f}) scale({k:.6f})">'
            f'<path fill="{WHITE}" d="{PATH}"/></g>')


def svg(body, size=SIZE, defs=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
            f'width="{size}" height="{size}" role="img" '
            f'aria-label="OpenRehearse">\n{defs}  {body}\n</svg>\n')


def circle(scale, size=SIZE):
    g = f'<circle cx="{size/2}" cy="{size/2}" r="{size/2}" fill="{NAVY}"/>'
    return svg(g + piano(scale, size), size)


def square(scale, size=SIZE, radius=0.22):
    g = (f'<rect width="{size}" height="{size}" rx="{size*radius:.2f}" '
         f'fill="{NAVY}"/>')
    return svg(g + piano(scale, size), size)


def bare(size=SIZE):
    return svg(piano(1.0, size), size)


# The reference's own frame is 2 units thick in a 64-unit box, so a piano drawn
# at `scale` carries a frame of scale * size * 2/64. Matching the ring to that
# keeps one stroke weight across the whole mark.
FRAME_RATIO = 2.0 / 64.0


def ring(scale, size=SIZE, weight=1.0):
    """Navy disc with a white border, piano inside -- the reversed-out mark.

    `weight` multiplies the ring stroke relative to the piano's own frame; 1.0
    means the border and the piano's frame are drawn at the same thickness.
    """
    sw = scale * size * FRAME_RATIO * weight
    r = size / 2 - sw / 2                 # outer edge of the stroke sits on the box edge
    g = (f'<circle cx="{size/2}" cy="{size/2}" r="{r:.2f}" fill="{NAVY}" '
         f'stroke="{WHITE}" stroke-width="{sw:.2f}"/>')
    return svg(g + piano(scale, size), size)


# A square inscribed in a circle can be at most 1/sqrt(2) = 0.707 of the
# diameter, so anything above ~0.68 starts crowding the arc.
VARIANTS = {
    # --- chosen ---------------------------------------------------------
    "circle":       ("Circle 0.55", circle(0.55)),
    "square":       ("Square 0.60", square(0.60)),
    # Reversed-out: the circle logo with a white border instead of a navy edge.
    # Large format only -- below ~32px the ring thins into a grey halo and the
    # bare piano is markedly more legible.
    "ring":         ("Ring 0.55", ring(0.55)),
    "bare":         ("Bare ink", bare()),
}


if __name__ == "__main__":
    for name, (_label, content) in VARIANTS.items():
        with open(os.path.join(OUT, f"mark-{name}.svg"), "w") as f:
            f.write(content)
        print("wrote", f"mark-{name}.svg")

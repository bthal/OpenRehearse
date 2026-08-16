#!/usr/bin/env python3
"""Derive the OpenRehearse navy palette and verify contrast.

Anything that carries white text must clear 4.5:1, and body text on the light
surface must clear 4.5:1 too -- the same bar src/theme/colors.ts already holds
SectionColors to.
"""

import colorsys


def hsl(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h / 360.0, l / 100.0, s / 100.0)
    return "#%02X%02X%02X" % (round(r * 255), round(g * 255), round(b * 255))


def rgb(hexs):
    hexs = hexs.lstrip("#")
    return tuple(int(hexs[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def lum(hexs):
    def ch(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in rgb(hexs))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


WHITE = "#FFFFFF"

# Brand ramp. 950 is pinned to the supplied navy; saturation eases off toward
# the light end so the tints stay usable as surfaces instead of going lilac.
NAVY = {
    50:  hsl(240, 60, 97.5),
    100: hsl(240, 55, 94),
    200: hsl(240, 50, 87),
    300: hsl(240, 45, 77),
    400: hsl(240, 42, 64),
    500: hsl(240, 45, 50),
    600: hsl(240, 55, 40),
    700: hsl(240, 68, 30),
    800: hsl(240, 82, 21),
    900: hsl(240, 92, 15),
    950: "#000036",          # supplied brand navy = hsl(240 100% 10.6%)
}

# Neutrals, pulled toward the brand hue so they sit with the navy rather than
# beside it. Replaces ash-grey.
SLATE = {
    50:  hsl(240, 20, 97.5),
    100: hsl(240, 18, 94.5),
    200: hsl(240, 15, 88),
    300: hsl(240, 13, 78),
    # 58, not 62: the tab-icon default sits at this step on the slate-50
    # surface, and 62 lands at 2.81 against the 3.0 bar for UI elements. The
    # outgoing ash-grey-400 had the same shortfall; no reason to port it over.
    400: hsl(240, 11, 58),
    500: hsl(240, 10, 48),
    600: hsl(240, 12, 38),
    700: hsl(240, 15, 28),
    800: hsl(240, 18, 20),
    900: hsl(240, 22, 13),
    950: hsl(240, 30, 8),
}

# Full semantic set. Each base must hold white; each 50 is a surface tint.
# Steps 500/600/800 exist so the outgoing mauve-shadow usages map across by
# number alone, keeping the migration a rename rather than a redesign.
SEMANTIC = {
    "error":   {50: hsl(354, 85, 96), 500: hsl(354, 72, 42),
                600: hsl(354, 74, 36), 700: hsl(354, 76, 32), 800: hsl(354, 80, 26)},
    "success": {50: hsl(150, 60, 95), 500: hsl(150, 82, 27),
                600: hsl(150, 84, 23), 700: hsl(150, 85, 20), 800: hsl(150, 88, 16)},
    "warning": {50: hsl(35, 90, 95),  500: hsl(35, 95, 33),
                600: hsl(35, 95, 29),  700: hsl(35, 96, 25),  800: hsl(35, 96, 20)},
}

# Heatmap: four navy steps from a light tint to the brand end, plus the neutral
# empty cell. Steps must stay separable from each other AND from `empty`.
HEATMAP = {
    "empty": SLATE[100],
    "ramp": [NAVY[200], NAVY[400], NAVY[600], NAVY[800]],
}


def show(name, ramp):
    print(f"\n{name}")
    print(f"  {'step':<6}{'hex':<10}{'on white':>9}{'white on':>10}  note")
    for k, v in ramp.items():
        cw, wc = ratio(v, WHITE), ratio(WHITE, v)
        note = ""
        if wc >= 4.5:
            note = "can hold white text"
        elif cw >= 4.5:
            note = "readable ON white"
        print(f"  {k:<6}{v:<10}{cw:>9.2f}{wc:>10.2f}  {note}")


if __name__ == "__main__":
    show("NAVY", NAVY)
    show("SLATE", SLATE)
    for n, r in SEMANTIC.items():
        show(n.upper(), r)

    print("\n--- checks that must pass ---")
    checks = [
        ("body text slate-950 on slate-50 surface", ratio(SLATE[950], SLATE[50]), 4.5),
        ("caption slate-500 on slate-50 surface",   ratio(SLATE[500], SLATE[50]), 4.5),
        ("white on primary navy-800",               ratio(WHITE, NAVY[800]), 4.5),
        ("white on navy-950 (brand ground)",        ratio(WHITE, NAVY[950]), 4.5),
        ("white on error-500",                      ratio(WHITE, SEMANTIC["error"][500]), 4.5),
        ("white on success-500",                    ratio(WHITE, SEMANTIC["success"][500]), 4.5),
        ("white on warning-500",                    ratio(WHITE, SEMANTIC["warning"][500]), 4.5),
        ("tab icon slate-400 on slate-50",          ratio(SLATE[400], SLATE[50]), 3.0),
    ]
    worst = 0
    for label, got, need in checks:
        ok = got >= need
        worst = max(worst, 0 if ok else 1)
        print(f"  [{'PASS' if ok else 'FAIL'}] {label:<42}{got:5.2f} (need {need})")

    print("\n--- heatmap step separation (adjacent steps) ---")
    seq = [HEATMAP["empty"]] + HEATMAP["ramp"]
    names = ["empty", "r1", "r2", "r3", "r4"]
    for i in range(len(seq) - 1):
        r = ratio(seq[i], seq[i + 1])
        ok = r >= 1.25
        worst = max(worst, 0 if ok else 1)
        print(f"  [{'PASS' if ok else 'FAIL'}] {names[i]:>5} -> {names[i+1]:<5}"
              f"{r:5.2f} (need 1.25)")

    print("\nRESULT:", "all checks passed" if worst == 0 else "FAILURES PRESENT")

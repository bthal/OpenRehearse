import {
  contrastWithBlack,
  hexToOklch,
  hueRamp,
  oklchToHex,
  rampColorAt,
  SECTION_HUE_CHROMA,
  SECTION_HUE_LIGHTNESS,
} from '../oklch';
import { SectionColors } from '../../theme/colors';

/**
 * A lightness floor, not a legibility one — the label's white text sits at roughly 2:1
 * on this palette by choice, so nothing here promises the text is readable. What this
 * pins is that the colors stay *light*: contrast against black rises with luminance, so
 * a floor here is a floor on how pale every reachable color is. A regression that
 * darkened the ramp back toward the old saturated mid-tones would trip it.
 */
const MIN_LIGHTNESS_CONTRAST = 6;

describe('oklchToHex', () => {
  it('always produces a 6-digit hex', () => {
    for (let h = 0; h < 360; h += 7) {
      expect(oklchToHex(SECTION_HUE_LIGHTNESS, SECTION_HUE_CHROMA, h)).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('clamps an unreachable chroma instead of emitting an out-of-range channel', () => {
    // No hue can carry chroma 5 in sRGB; the bisection has to pull it back to the boundary.
    for (let h = 0; h < 360; h += 30) {
      expect(oklchToHex(SECTION_HUE_LIGHTNESS, 5, h)).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('normalises hues outside 0-360', () => {
    expect(oklchToHex(SECTION_HUE_LIGHTNESS, SECTION_HUE_CHROMA, 370)).toBe(
      oklchToHex(SECTION_HUE_LIGHTNESS, SECTION_HUE_CHROMA, 10),
    );
    expect(oklchToHex(SECTION_HUE_LIGHTNESS, SECTION_HUE_CHROMA, -10)).toBe(
      oklchToHex(SECTION_HUE_LIGHTNESS, SECTION_HUE_CHROMA, 350),
    );
  });
});

describe('the hue ramp holds one lightness', () => {
  // This is the test the whole module exists for. The picker lets the user land on any
  // hue, so "every section color weighs the same" has to be a property of the ramp
  // rather than something checked after the fact.
  it('stays light at every one of 360 hues', () => {
    const failures: string[] = [];
    for (let h = 0; h < 360; h++) {
      const hex = oklchToHex(SECTION_HUE_LIGHTNESS, SECTION_HUE_CHROMA, h);
      const ratio = contrastWithBlack(hex);
      if (ratio < MIN_LIGHTNESS_CONTRAST) failures.push(`h=${h} ${hex} ${ratio.toFixed(2)}`);
    }
    expect(failures).toEqual([]);
  });

  it('keeps luminance in a narrow band, which is the point of fixing lightness', () => {
    const ratios = Array.from({ length: 360 }, (_, h) =>
      contrastWithBlack(oklchToHex(SECTION_HUE_LIGHTNESS, SECTION_HUE_CHROMA, h)),
    );
    // Constant OKLCH lightness should keep the spread small. A regression that reverted
    // to constant HSL lightness would blow this out well past 2x.
    expect(Math.max(...ratios) / Math.min(...ratios)).toBeLessThan(1.5);
  });
});

describe('contrastWithBlack', () => {
  it('reproduces known ratios for the shipped palette', () => {
    // Guards the luminance maths itself, independently of the ramp.
    expect(contrastWithBlack('#FF8FB6')).toBeCloseTo(9.9, 1); // magenta — the darkest preset
    expect(contrastWithBlack('#8BB9FF')).toBeCloseTo(10.5, 1); // blue
    expect(contrastWithBlack('#000000')).toBeCloseTo(1, 2);
  });

  it('returns 1 for a malformed color rather than throwing', () => {
    expect(contrastWithBlack('red')).toBe(1);
    expect(contrastWithBlack('#fff')).toBe(1);
  });
});

describe('the shipped palette', () => {
  // theme/colors.ts claims every entry is a light tint. Pin that claim.
  it('is light on every preset', () => {
    for (const hex of SectionColors) {
      expect(contrastWithBlack(hex)).toBeGreaterThanOrEqual(MIN_LIGHTNESS_CONTRAST);
    }
  });

  it('sits near the ramp lightness, which is why the ramp can replace hand-tuning', () => {
    for (const hex of SectionColors) {
      const oklch = hexToOklch(hex);
      expect(oklch).not.toBeNull();
      expect(Math.abs(oklch!.l - SECTION_HUE_LIGHTNESS)).toBeLessThan(0.05);
    }
  });
});

describe('hexToOklch', () => {
  it('round-trips a color generated at the ramp lightness', () => {
    for (let h = 0; h < 360; h += 45) {
      const hex = oklchToHex(SECTION_HUE_LIGHTNESS, SECTION_HUE_CHROMA, h);
      const back = hexToOklch(hex);
      expect(back).not.toBeNull();
      expect(back!.l).toBeCloseTo(SECTION_HUE_LIGHTNESS, 2);
      expect(oklchToHex(back!.l, back!.c, back!.h)).toBe(hex);
    }
  });

  it('rejects anything that is not a 6-digit hex', () => {
    expect(hexToOklch('#fff')).toBeNull();
    expect(hexToOklch('rgb(1,2,3)')).toBeNull();
    expect(hexToOklch('')).toBeNull();
  });
});

describe('hueRamp', () => {
  it('returns the requested number of distinct steps spanning the circle', () => {
    const ramp = hueRamp(48);
    expect(ramp).toHaveLength(48);
    expect(new Set(ramp).size).toBeGreaterThan(40);
    expect(ramp[0]).toBe(rampColorAt(0));
  });

  it('handles a single step without dividing by zero', () => {
    expect(hueRamp(1)).toEqual([rampColorAt(0)]);
  });

  it('clamps positions outside 0..1', () => {
    expect(rampColorAt(-1)).toBe(rampColorAt(0));
    expect(rampColorAt(2)).toBe(rampColorAt(1));
  });
});

/**
 * OKLCH ↔ sRGB, and the constant-lightness hue ramp behind the section color picker.
 * Pure: no React, no theme import.
 *
 * Why a perceptual space at all. Every section color has to be equally *light*: they
 * are read side by side, and one hue that lands visibly heavier than its neighbours
 * reads as emphasis the app never meant. HSL cannot deliver that. At `hsl(H 80% 70%)`
 * a yellow-green carries far more luminance than a blue, because HSL lightness ignores
 * how much light a hue actually reflects — so sweeping hue at fixed HSL lightness
 * produces a ramp that is pale over part of the circle and dark over the rest.
 *
 * OKLCH lightness does deliver it. Holding L fixed and letting hue vary keeps measured
 * luminance inside a narrow band all the way round, so the picker cannot land the user
 * on a color that clashes in weight with the presets — the property is enforced by the
 * geometry of the ramp rather than by validation after the fact.
 *
 * What limits the palette at this lightness is the sRGB gamut, which runs out of chroma
 * for blue and violet well before it does for green or yellow (see the table in
 * `SECTION_HUE_CHROMA`). The eight shipped presets in `theme/colors.ts` are generated
 * from this same L and C, one per hue, so the ramp and the presets cannot drift apart.
 *
 * Note what this ramp deliberately does *not* promise: that the label's text is legible
 * on it. The label draws white at roughly 2:1, under the 3:1 WCAG floor for large text,
 * as a chosen soft look — the color carries which section is running, and the name is a
 * glance-level cue rather than something read word by word. Raising the text's contrast
 * is a decision about the text, not a reason to move this lightness.
 */

/** Hue ramp lightness. See the table in `SECTION_HUE_CHROMA` for why this exact value. */
export const SECTION_HUE_LIGHTNESS = 0.78;

/**
 * Requested hue ramp chroma, clamped per hue to the sRGB gamut boundary.
 *
 * Measured across all 360 integer hues at L 0.78, C 0.15:
 *
 *   luminance spread            1.15× between the lightest and darkest hue
 *   chroma actually delivered   0.111–0.150, clamping on the blue/violet arc
 *
 * The gamut is what picks these numbers. Lightness is set where the colors read as
 * light and friendly rather than as the saturated mid-tones this palette used to carry,
 * and chroma as high as the blue arc can hold without collapsing to a pastel — request
 * 0.15 and clamp, rather than riding the boundary, so saturation stays roughly uniform
 * round the circle. `oklch.test.ts` pins both the uniform lightness and a floor that
 * keeps the palette light, so this pair cannot be changed without the test agreeing.
 */
export const SECTION_HUE_CHROMA = 0.15;

export interface Oklch {
  l: number;
  c: number;
  /** Degrees, 0–360. */
  h: number;
}

// ── sRGB transfer function ────────────────────────────────────────────────────

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// ── OKLab ─────────────────────────────────────────────────────────────────────

function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

// ── Gamut ─────────────────────────────────────────────────────────────────────

/** Small tolerance so a channel sitting exactly on 0 or 1 is not rejected by float noise. */
const GAMUT_EPSILON = 1e-6;

function inGamut([r, g, b]: [number, number, number]): boolean {
  return (
    r >= -GAMUT_EPSILON &&
    g >= -GAMUT_EPSILON &&
    b >= -GAMUT_EPSILON &&
    r <= 1 + GAMUT_EPSILON &&
    g <= 1 + GAMUT_EPSILON &&
    b <= 1 + GAMUT_EPSILON
  );
}

/**
 * Largest chroma ≤ `requested` that is representable in sRGB at this lightness and hue.
 *
 * Reducing chroma while holding L and H is the right direction to clip in: it desaturates
 * toward the neutral axis, which is always in gamut at any valid L, and — crucially —
 * it leaves lightness untouched, so the contrast guarantee survives the clamp.
 */
function clampChroma(l: number, c: number, h: number): number {
  if (inGamut(oklchToLinearRgb(l, c, h))) return c;
  let lo = 0;
  let hi = c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinearRgb(l, mid, h))) lo = mid;
    else hi = mid;
  }
  return lo;
}

function oklchToLinearRgb(l: number, c: number, h: number): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  return oklabToLinear(l, c * Math.cos(rad), c * Math.sin(rad));
}

// ── Public conversions ────────────────────────────────────────────────────────

function channelToHex(linear: number): string {
  const v = Math.round(Math.min(1, Math.max(0, linearToSrgb(linear))) * 255);
  return v.toString(16).padStart(2, '0');
}

/**
 * OKLCH → `#RRGGBB`, clamping chroma into the sRGB gamut first.
 *
 * Always returns a valid 7-character hex: after the chroma clamp each channel is
 * additionally clamped to [0,1] before rounding, so float noise at the gamut boundary
 * can never round a channel to 256.
 */
export function oklchToHex(l: number, c: number, h: number): string {
  const hue = ((h % 360) + 360) % 360;
  const [r, g, b] = oklchToLinearRgb(l, clampChroma(l, Math.max(0, c), hue), hue);
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`.toUpperCase();
}

/** `#RRGGBB` → OKLCH. Returns null for anything that is not a 6-digit hex. */
export function hexToOklch(hex: string): Oklch | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const [r, g, b] = [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ];
  const [L, a, bb] = linearToOklab(r, g, b);
  return {
    l: L,
    c: Math.hypot(a, bb),
    h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  };
}

/**
 * WCAG contrast ratio of `hex` against black — here a proxy for "how light is this",
 * since it is a monotonic function of relative luminance and rises as the color does.
 *
 * Exists so the ramp's uniform-lightness claim is a test rather than a comment: see
 * `oklch.test.ts`, which walks all 360 hues.
 */
export function contrastWithBlack(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return 1;
  const [r, g, b] = [1, 3, 5].map((i) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as [
    number,
    number,
    number,
  ];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05) / 0.05;
}

/** The hue at ramp position `t` ∈ [0,1]. Exposed so the picker can map a touch to a hue. */
export function rampHueAt(t: number): number {
  return Math.min(1, Math.max(0, t)) * 360;
}

/** The ramp color at position `t` ∈ [0,1], at the fixed lightness. */
export function rampColorAt(t: number): string {
  return oklchToHex(SECTION_HUE_LIGHTNESS, SECTION_HUE_CHROMA, rampHueAt(t));
}

/**
 * `steps` evenly spaced ramp colors.
 *
 * The picker draws these as discrete rects rather than feeding two endpoints to an SVG
 * `<LinearGradient>`: gradients interpolate in sRGB, and the sRGB midpoint of two
 * constant-lightness OKLCH colors is not itself at that lightness. Discrete steps make
 * the contrast guarantee true of whatever pixel the finger actually lands on.
 */
export function hueRamp(steps: number): string[] {
  return Array.from({ length: steps }, (_, i) => rampColorAt(steps === 1 ? 0 : i / (steps - 1)));
}

/** Imperative color constants for RN props that don't accept Tailwind class names. */
export const Colors = {
  primary: 'hsl(169.1 21.6% 40%)', // seagrass-600
  primaryForeground: 'hsl(140 12% 95.1%)', // ash-grey-50
  tabIconDefault: 'hsl(141 9.8% 60%)', // ash-grey-400
  text: 'hsl(135 11.1% 7.1%)', // ash-grey-950
  destructive: 'hsl(320.8 12.7% 40%)', // mauve-shadow-600
  error: 'hsl(321.4 13.7% 20%)', // mauve-shadow-800
} as const;

/**
 * Intensity ramp for the practice heatmap: a light seagrass tint for a little
 * practice up to the darkest accent shade for the most. `empty` is the neutral
 * cell for days with no practice, tinted to sit on the ash-grey-50 background.
 *
 * Kept on the seagrass hue so the grid reads as part of the app's palette
 * rather than a library default. `headerText` matches the muted captions used
 * elsewhere on the dashboard so the month labels sit in the same palette.
 */
export const HeatmapColors = {
  empty: 'hsl(144 9.8% 90%)', // ash-grey-100
  headerText: 'hsl(141 9.8% 60%)', // ash-grey-400
  ramp: [
    'hsl(169 22% 78%)', // seagrass tint between 50 and 500
    'hsl(168.4 22.4% 50%)', // seagrass-500
    'hsl(169.1 21.6% 40%)', // seagrass-600 (app accent)
    'hsl(169.1 21.6% 30%)', // seagrass-700
  ],
} as const;

/**
 * Categorical palette for the PlayView section label — one entry per section,
 * assigned by `domain/sections.ts#assignSectionColorIndices`.
 *
 * Deliberately outside the seagrass/ash-grey/mauve brand ramps: these hues carry
 * information rather than decoration. A student glancing at the label needs to tell
 * "this is a different section from the last one" at a distance, and tints of one
 * hue cannot do that. Hues are spread around the wheel and ordered so that
 * neighbours in the cycle are far apart.
 *
 * Every entry is generated straight off the section hue ramp (`domain/oklch.ts`,
 * L 0.78 / C 0.15, one hue per slot), which the color picker also draws from. Keeping
 * both on the same ramp is what stops a hand-picked color and a preset from looking
 * like they came from different palettes, and holding one OKLCH lightness across the
 * circle is what stops any single hue reading heavier than its neighbours. Any hue
 * added here should be generated the same way rather than typed in.
 *
 * The label draws **white** text on these, which is roughly 2:1 — under the WCAG floor
 * for large text, and deliberately so. Black is comfortably legible on them but reads
 * heavy; the color is what carries which section is running, and the name is a
 * glance-level cue rather than a paragraph. Nothing about this palette guarantees the
 * text is readable, and that is a decision about the text, not about these values.
 *
 * Written as hex rather than the `hsl(H S% L%)` used elsewhere in this file, because
 * these strings cross three different color parsers: React Native styles, the
 * `react-native-svg` gradient stops behind the label, and CSS gradients inside the
 * WebView, which receives them verbatim over SET_SECTIONS. Hex is the only notation
 * all three parse identically. The source hue is kept in the comment.
 *
 * Not migrated: a piece imported before this palette landed keeps the darker color it
 * stored, and will show black text on it until the user edits or re-imports it.
 */
export const SectionColors: readonly string[] = [
  '#8BB9FF', // blue — h 259, 10.5:1 on black
  '#FF977F', // vermilion — h 34, 10.0:1
  '#5DD38A', // green — h 154, 11.2:1
  '#CD9FFF', // violet — h 305, 10.0:1
  '#F9A140', // amber — h 64, 10.2:1
  '#FF8FB6', // magenta — h 359, 9.9:1
  '#00CDEA', // teal — h 212, 10.9:1
  '#92CB62', // olive — h 133, 10.9:1
] as const;

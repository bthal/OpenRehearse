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
 * The label always draws white text, so every entry is held at a lightness that
 * carries white at roughly 4.5:1 or better. That is the binding constraint on this
 * palette: the ochre and olive entries in particular are much darker than their
 * nominal hue would suggest, because a bright yellow-green cannot hold white type.
 * Any hue added here has to be checked against white before it goes in.
 *
 * Written as hex rather than the `hsl(H S% L%)` used elsewhere in this file, because
 * these strings cross three different color parsers: React Native styles, the
 * `react-native-svg` gradient stops behind the label, and CSS gradients inside the
 * WebView, which receives them verbatim over SET_SECTIONS. Hex is the only notation
 * all three parse identically. The source hue is kept in the comment.
 */
export const SectionColors: readonly string[] = [
  '#0B65DA', // blue — hsl(214 90% 45%)
  '#D43811', // vermilion — hsl(12 85% 45%)
  '#0E8147', // green — hsl(150 80% 28%)
  '#8925D0', // violet — hsl(275 70% 48%)
  '#A96404', // ochre — hsl(35 95% 34%)
  '#C1156B', // magenta — hsl(330 80% 42%)
  '#087F91', // teal — hsl(188 90% 30%)
  '#4B7D12', // olive — hsl(88 75% 28%)
] as const;

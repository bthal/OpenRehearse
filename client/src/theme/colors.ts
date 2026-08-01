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

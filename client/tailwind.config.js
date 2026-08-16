/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Brand ramp. 950 is the logo navy and the only fixed point; the rest is
        // derived on hue 240, easing saturation off toward the light end so the
        // tints stay usable as surfaces instead of drifting lilac.
        //
        // navy-600 is the interactive step (buttons, links, active tab). The
        // brand 950 is deliberately NOT the button colour -- at 10.6% lightness
        // it reads as a black slab rather than something tappable.
        //
        // See specs/brand.md for roles and measured contrast.
        navy: {
          50: 'hsl(240 60% 97.5%)',
          100: 'hsl(240 55% 94%)',
          200: 'hsl(240 50% 87%)',
          300: 'hsl(240 45% 77%)',
          400: 'hsl(240 42% 64%)',
          500: 'hsl(240 45% 50%)',
          600: 'hsl(240 55% 40%)',
          700: 'hsl(240 68% 30%)',
          800: 'hsl(240 82% 21%)',
          900: 'hsl(240 92% 15%)',
          950: 'hsl(240 100% 10.6%)', // #000036 -- the logo ground
        },
        // Neutrals, pulled onto the brand hue so they sit with the navy rather
        // than beside it. Replaces ash-grey.
        //
        // 400 is 58% lightness, not the 62% an even ramp would give: the muted
        // tab icon sits on this step against slate-50, and 62% lands at 2.81
        // against the 3.0 bar for UI elements. The outgoing ash-grey-400 was
        // worse still at 2.42.
        slate: {
          50: 'hsl(240 20% 97.5%)',
          100: 'hsl(240 18% 94.5%)',
          200: 'hsl(240 15% 88%)',
          300: 'hsl(240 13% 78%)',
          400: 'hsl(240 11% 58%)',
          500: 'hsl(240 10% 48%)',
          600: 'hsl(240 12% 38%)',
          700: 'hsl(240 15% 28%)',
          800: 'hsl(240 18% 20%)',
          900: 'hsl(240 22% 13%)',
          950: 'hsl(240 30% 8%)',
        },
        // Semantic set. Every step from 500 up carries white text at 4.5:1 or
        // better; the 50s are surface tints and carry none. Errors read as red
        // rather than as the old decorative mauve.
        error: {
          50: 'hsl(354 85% 96%)',
          500: 'hsl(354 72% 42%)',
          600: 'hsl(354 74% 36%)',
          700: 'hsl(354 76% 32%)',
          800: 'hsl(354 80% 26%)',
        },
        success: {
          50: 'hsl(150 60% 95%)',
          500: 'hsl(150 82% 27%)',
          600: 'hsl(150 84% 23%)',
          700: 'hsl(150 85% 20%)',
          800: 'hsl(150 88% 16%)',
        },
        warning: {
          50: 'hsl(35 90% 95%)',
          500: 'hsl(35 95% 33%)',
          600: 'hsl(35 95% 29%)',
          700: 'hsl(35 96% 25%)',
          800: 'hsl(35 96% 20%)',
        },
        // Categorical hues for the PlayView section label. Mirrors SectionColors in
        // src/theme/colors.ts, which is the source used at render time (the label
        // paints through an SVG gradient, which needs imperative values).
        section: {
          blue: '#0B65DA',
          vermilion: '#D43811',
          green: '#0E8147',
          violet: '#8925D0',
          ochre: '#A96404',
          magenta: '#C1156B',
          teal: '#087F91',
          olive: '#4B7D12',
        },
      },
      fontFamily: {
        // Outfit SemiBold, loaded in app/_layout.tsx and bundled from
        // assets/fonts. Registered under the single family name 'Outfit'
        // because only one weight ships: pair `font-brand` with the default
        // weight and never with `font-bold`/`font-semibold`, or Android
        // synthesises a fake bold on top of a face that is already 600.
        brand: ['Outfit'],
      },
    },
  },
  plugins: [],
};

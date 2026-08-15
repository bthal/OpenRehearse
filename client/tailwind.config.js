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
        'ash-grey': {
          50: 'hsl(140 12% 95.1%)',
          100: 'hsl(144 9.8% 90%)',
          200: 'hsl(138 9.8% 80%)',
          300: 'hsl(140 9.8% 70%)',
          400: 'hsl(141 9.8% 60%)',
          500: 'hsl(139.2 9.8% 50%)',
          600: 'hsl(141 9.8% 40%)',
          950: 'hsl(135 11.1% 7.1%)',
        },
        seagrass: {
          50: 'hsl(170 23.1% 94.9%)',
          500: 'hsl(168.4 22.4% 50%)',
          600: 'hsl(169.1 21.6% 40%)',
          700: 'hsl(169.1 21.6% 30%)',
        },
        'mauve-shadow': {
          500: 'hsl(320.8 12.7% 50%)',
          600: 'hsl(320.8 12.7% 40%)',
          800: 'hsl(321.4 13.7% 20%)',
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
        brand: ['serif'],
      },
    },
  },
  plugins: [],
};

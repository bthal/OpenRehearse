module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|nativewind|tailwindcss|fflate|i18next|react-i18next)',
  ],
  moduleNameMapper: {
    '^@domain/(.*)$': '<rootDir>/src/domain/$1',
    '^@data/(.*)$': '<rootDir>/src/data/$1',
    '^@state/(.*)$': '<rootDir>/src/state/$1',
    '^@components/(.*)$': '<rootDir>/components/$1',
    '^@theme/(.*)$': '<rootDir>/src/theme/$1',
    '^@score-web/(.*)$': '<rootDir>/src/score-web/$1',
    '^@i18n/(.*)$': '<rootDir>/src/i18n/$1',
  },
};

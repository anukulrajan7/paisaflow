module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['react-native-gesture-handler/jestSetup'],
  moduleNameMapper: {
    '^@react-native-community/netinfo$':
      '@react-native-community/netinfo/jest/netinfo-mock.js',
  },
  transform: {
    '^.+\\.(js|jsx|ts|tsx|mjs)$': 'babel-jest',
  },
  // Only *.test.* files are suites; helpers like src/database/__tests__/fakeDb.ts
  // live next to the tests that use them.
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|@react-native-community|@react-navigation|@notifee/react-native|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-svg|lucide-react-native|react-native-nitro-sqlite|react-native-keychain|react-native-fs|react-native-share|react-native-get-random-values|uuid|zustand)/',
  ],
};

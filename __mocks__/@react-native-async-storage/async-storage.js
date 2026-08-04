// Root jest mock: supabase-js uses AsyncStorage for session persistence.
// Delegates to the package's own in-memory jest mock (v3 exposes it at the
// ./jest subpath; it ships as ESM, so jest.config transforms this package).
module.exports = require('@react-native-async-storage/async-storage/jest');

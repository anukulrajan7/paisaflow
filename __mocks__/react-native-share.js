/**
 * Jest stub for the native react-native-share module.
 * Auto-applied to any test that (transitively) imports the real module —
 * e.g. rendering <App/>, where SettingsScreen imports src/services/export.
 * Share sheet calls resolve without doing anything.
 */
module.exports = {
  __esModule: true,
  default: {
    open: async () => ({success: true, message: ''}),
    shareSingle: async () => ({success: true, message: ''}),
  },
  Social: {},
};

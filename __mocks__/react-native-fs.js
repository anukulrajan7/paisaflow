/**
 * Jest stub for the native react-native-fs module.
 * Auto-applied to any test that (transitively) imports the real module —
 * e.g. rendering <App/>, where SettingsScreen imports src/services/export.
 * File operations are inert no-ops.
 */
module.exports = {
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/mock/documents',
    CachesDirectoryPath: '/mock/caches',
    ExternalDirectoryPath: '/mock/external',
    writeFile: async () => {},
    readFile: async () => '',
    exists: async () => false,
    mkdir: async () => {},
    unlink: async () => {},
  },
};

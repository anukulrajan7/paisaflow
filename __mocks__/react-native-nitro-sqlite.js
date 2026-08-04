/**
 * Jest stub for the native react-native-nitro-sqlite module.
 * Auto-applied to any test that (transitively) imports the real module —
 * e.g. rendering <App/>, where BootstrapGate opens the database.
 * Returns an inert connection: every query resolves to an empty result.
 * Repository unit tests do NOT use this — they inject src/database/__tests__/fakeDb.
 */
const emptyResult = {
  rows: {_array: [], length: 0, item: () => undefined},
  rowsAffected: 0,
};

const executor = {
  execute: () => emptyResult,
  executeAsync: async () => emptyResult,
};

module.exports = {
  open: () => ({
    ...executor,
    transaction: async fn => fn(executor),
    close: () => {},
  }),
};

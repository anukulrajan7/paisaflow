/**
 * Jest stub for the native react-native-keychain module.
 * Auto-applied to any test that (transitively) imports the real module —
 * e.g. src/services/security (OpenRouter key, app-lock PIN).
 * Credentials live in an in-memory vault keyed by service; nothing touches
 * the real keystore. Call `__clearKeychainVault()` between tests.
 */
const vault = new Map();

const DEFAULT_SERVICE = 'default';

function serviceOf(options) {
  return (options && options.service) || DEFAULT_SERVICE;
}

module.exports = {
  __esModule: true,
  ACCESSIBLE: {
    WHEN_UNLOCKED: 'WHEN_UNLOCKED',
    AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
    WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY',
  },
  setGenericPassword: async (username, password, options) => {
    const service = serviceOf(options);
    vault.set(service, {username, password});
    return {service};
  },
  getGenericPassword: async options => {
    const service = serviceOf(options);
    const entry = vault.get(service);
    if (!entry) {
      return false;
    }
    return {service, username: entry.username, password: entry.password};
  },
  resetGenericPassword: async options => {
    const service = serviceOf(options);
    vault.delete(service);
    return true;
  },
  __clearKeychainVault: () => vault.clear(),
};

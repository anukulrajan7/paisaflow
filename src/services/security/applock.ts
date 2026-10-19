/**
 * App-lock PIN storage, backed by react-native-keychain (Android Keystore /
 * iOS Keychain). Mirrors the security rules of secureKeyStore.ts:
 * - The PIN is ONLY ever stored here — never in SQLite, AsyncStorage, or logs.
 * - Errors are swallowed into generic messages; keychain details and the PIN
 *   itself must never be logged or surfaced.
 *
 * The on/off flag is not sensitive, so it lives in app_settings via
 * settingsRepository (raw key 'appLockEnabled') — BootstrapGate reads it to
 * decide whether to gate the app. Shared rules live in applockCommon.ts;
 * the web build swaps this file for applock.web.ts.
 */
import * as Keychain from 'react-native-keychain';

import {validatePin} from './applockCommon';

export {
  APP_LOCK_ENABLED_KEY,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  isAppLockEnabled,
  setAppLockEnabled,
  validatePin,
} from './applockCommon';

const APPLOCK_SERVICE = 'paisaflow-applock';
const APPLOCK_USERNAME = 'applock';

/** Persist the app-lock PIN in the device keychain. */
export async function setAppLockPin(pin: string): Promise<void> {
  const error = validatePin(pin);
  if (error) {
    throw new Error(error);
  }
  try {
    const result = await Keychain.setGenericPassword(APPLOCK_USERNAME, pin, {
      service: APPLOCK_SERVICE,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    if (result === false) {
      throw new Error('rejected');
    }
  } catch {
    throw new Error('Could not save the PIN securely. Please try again.');
  }
}

/** Check a PIN against the keychain. Resolves false when none is stored. */
export async function verifyAppLockPin(pin: string): Promise<boolean> {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: APPLOCK_SERVICE,
    });
    if (!credentials) {
      return false;
    }
    return credentials.password === pin;
  } catch {
    return false;
  }
}

/** Whether a PIN is currently stored in the keychain. */
export async function hasAppLockPin(): Promise<boolean> {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: APPLOCK_SERVICE,
    });
    return Boolean(credentials && credentials.password);
  } catch {
    return false;
  }
}

/** Remove the app-lock PIN from the keychain. */
export async function deleteAppLockPin(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({service: APPLOCK_SERVICE});
  } catch {
    // Nothing to clean up — treat as already removed.
  }
}

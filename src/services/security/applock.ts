/**
 * App-lock PIN storage, backed by react-native-keychain (Android Keystore /
 * iOS Keychain). Mirrors the security rules of secureKeyStore.ts:
 * - The PIN is ONLY ever stored here — never in SQLite, AsyncStorage, or logs.
 * - Errors are swallowed into generic messages; keychain details and the PIN
 *   itself must never be logged or surfaced.
 *
 * The on/off flag is not sensitive, so it lives in app_settings via
 * settingsRepository (raw key 'appLockEnabled') — BootstrapGate reads it to
 * decide whether to gate the app.
 */
import * as Keychain from 'react-native-keychain';

import {getSettingsRepository} from '../../database/repositories';

const APPLOCK_SERVICE = 'paisaflow-applock';
const APPLOCK_USERNAME = 'applock';

/** Raw app_settings key recording whether app lock is turned on. */
export const APP_LOCK_ENABLED_KEY = 'appLockEnabled';

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

/**
 * Validates a candidate PIN: 4–6 digits, nothing else.
 * Returns a user-facing error message, or null when valid.
 */
export function validatePin(pin: string): string | null {
  if (!/^\d+$/.test(pin)) {
    return 'PIN must contain digits only.';
  }
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) {
    return `PIN must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits.`;
  }
  return null;
}

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

/** Whether app lock is turned on (app_settings flag, not the PIN itself). */
export async function isAppLockEnabled(): Promise<boolean> {
  try {
    return (
      (await getSettingsRepository().getValue(APP_LOCK_ENABLED_KEY)) === 'true'
    );
  } catch {
    // Fail open: wrongly reporting "enabled" could gate the app behind a PIN
    // that does not exist — a lockout. A missed lock is the safer failure.
    return false;
  }
}

/** Persist the app-lock on/off flag in app_settings. */
export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  await getSettingsRepository().setValue(
    APP_LOCK_ENABLED_KEY,
    enabled ? 'true' : 'false',
  );
}

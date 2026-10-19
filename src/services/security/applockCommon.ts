/**
 * Platform-independent parts of app lock: PIN validation rules and the
 * on/off flag persisted in app_settings. The PIN itself is stored by the
 * platform module (keychain natively, encrypted IndexedDB on web).
 */
import {getSettingsRepository} from '../../database/repositories';

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

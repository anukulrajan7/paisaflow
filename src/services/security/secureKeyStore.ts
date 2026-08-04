/**
 * Secure storage for third-party API keys, backed by react-native-keychain
 * (Android Keystore / iOS Keychain).
 *
 * Security rules:
 * - The key is ONLY ever stored here — never in the DB, AsyncStorage, or logs.
 * - Errors are swallowed into generic messages; keychain error details and the
 *   key itself must never be logged or surfaced.
 */
import * as Keychain from 'react-native-keychain';

const OPENROUTER_SERVICE = 'paisaflow.openrouter.api_key';
const OPENROUTER_USERNAME = 'openrouter';

/** Persist the OpenRouter API key in the device keychain. */
export async function setOpenRouterApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error('API key cannot be empty.');
  }
  try {
    const result = await Keychain.setGenericPassword(
      OPENROUTER_USERNAME,
      trimmed,
      {
        service: OPENROUTER_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      },
    );
    if (result === false) {
      throw new Error('rejected');
    }
  } catch {
    throw new Error(
      'Could not save the API key securely. Please try again.',
    );
  }
}

/** Read the OpenRouter API key. Resolves null when none is stored. */
export async function getOpenRouterApiKey(): Promise<string | null> {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: OPENROUTER_SERVICE,
    });
    if (!credentials) {
      return null;
    }
    return credentials.password || null;
  } catch {
    return null;
  }
}

/** Remove the OpenRouter API key from the keychain. */
export async function deleteOpenRouterApiKey(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({service: OPENROUTER_SERVICE});
  } catch {
    // Nothing to clean up — treat as already removed.
  }
}

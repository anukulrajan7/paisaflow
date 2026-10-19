/**
 * Web implementation of the OpenRouter key store.
 *
 * The key is AES-GCM encrypted and kept in IndexedDB (see
 * platform/web/secretStore). This is weaker than the Android Keystore — any
 * script on this origin could decrypt it — so the AI settings screen says so
 * on web and recommends a low-limit key. Same rules otherwise: never in the
 * DB, never logged.
 */
import {deleteSecret, getSecret, setSecret} from '../../platform/web/secretStore';

const OPENROUTER_SECRET = 'paisaflow.openrouter.api_key';

export async function setOpenRouterApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error('API key cannot be empty.');
  }
  try {
    await setSecret(OPENROUTER_SECRET, trimmed);
  } catch {
    throw new Error('Could not save the API key securely. Please try again.');
  }
}

export async function getOpenRouterApiKey(): Promise<string | null> {
  return getSecret(OPENROUTER_SECRET);
}

export async function deleteOpenRouterApiKey(): Promise<void> {
  await deleteSecret(OPENROUTER_SECRET);
}

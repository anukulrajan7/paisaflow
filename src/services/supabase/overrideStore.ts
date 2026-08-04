/**
 * Runtime Supabase project overrides, stored in the device keychain
 * (Android Keystore / iOS Keychain) — never in the DB or AsyncStorage.
 *
 * When present, an override replaces the bundled credentials from
 * `src/config/supabase.ts`. The anon key is public-by-design (remote access
 * is enforced by row level security), but we still keep it in the keychain
 * and out of logs, mirrors, and backups where possible.
 *
 * Security rules mirror secureKeyStore.ts: errors are swallowed into generic
 * messages; credentials are never logged.
 */
import * as Keychain from 'react-native-keychain';

const OVERRIDE_SERVICE = 'paisaflow.supabase.project';
const OVERRIDE_USERNAME = 'supabase';

export interface SupabaseOverride {
  url: string;
  anonKey: string;
}

/** Persist a runtime Supabase URL + anon key override in the keychain. */
export async function setSupabaseOverride(override: SupabaseOverride): Promise<void> {
  const url = override.url.trim();
  const anonKey = override.anonKey.trim();
  if (!url || !anonKey) {
    throw new Error('Both the project URL and anon key are required.');
  }
  try {
    const result = await Keychain.setGenericPassword(
      OVERRIDE_USERNAME,
      JSON.stringify({url, anonKey}),
      {
        service: OVERRIDE_SERVICE,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      },
    );
    if (result === false) {
      throw new Error('rejected');
    }
  } catch {
    throw new Error(
      'Could not save the project credentials securely. Please try again.',
    );
  }
}

/** Read the runtime override. Resolves null when none is stored. */
export async function getSupabaseOverride(): Promise<SupabaseOverride | null> {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: OVERRIDE_SERVICE,
    });
    if (!credentials || !credentials.password) {
      return null;
    }
    const parsed: unknown = JSON.parse(credentials.password);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as SupabaseOverride).url === 'string' &&
      typeof (parsed as SupabaseOverride).anonKey === 'string'
    ) {
      const {url, anonKey} = parsed as SupabaseOverride;
      return url && anonKey ? {url, anonKey} : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Remove the runtime override (falls back to bundled credentials). */
export async function clearSupabaseOverride(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({service: OVERRIDE_SERVICE});
  } catch {
    // Nothing to clean up — treat as already removed.
  }
}

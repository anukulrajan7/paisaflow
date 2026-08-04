/**
 * Lazy singleton Supabase client.
 *
 * - Polyfill first: supabase-js needs URL/URLSearchParams in RN.
 * - Session persistence via AsyncStorage, auto token refresh on.
 * - Credentials come from the runtime keychain override when present, else
 *   the bundled `src/config/supabase.ts` (via src/config). When neither is
 *   set, `getSupabaseClient()` resolves null and cloud sync reports itself
 *   as "not configured" — the app stays fully functional offline.
 * - NEVER log URLs, keys, session tokens, or user payloads here.
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import {createClient} from '@supabase/supabase-js';
import type {SupabaseClient} from '@supabase/supabase-js';

import {SUPABASE_ANON_KEY, SUPABASE_URL} from '../../config';
import {getSupabaseOverride} from './overrideStore';

export interface SupabaseCredentials {
  url: string;
  anonKey: string;
  /** Where the active credentials came from. */
  source: 'override' | 'bundled';
}

/**
 * Resolve the active credentials: keychain override wins over the bundled
 * config. Null when both are empty ("not configured").
 */
export async function resolveSupabaseCredentials(): Promise<SupabaseCredentials | null> {
  const override = await getSupabaseOverride();
  if (override) {
    return {url: override.url, anonKey: override.anonKey, source: 'override'};
  }
  const url = SUPABASE_URL.trim();
  const anonKey = SUPABASE_ANON_KEY.trim();
  if (url && anonKey) {
    return {url, anonKey, source: 'bundled'};
  }
  return null;
}

let cachedKey: string | null = null;
let cachedClient: SupabaseClient | null = null;

/**
 * The shared client, or null when no credentials are configured.
 * Recreated automatically when the active credentials change.
 */
export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  const credentials = await resolveSupabaseCredentials();
  if (!credentials) {
    cachedKey = null;
    cachedClient = null;
    return null;
  }
  const cacheKey = `${credentials.source}:${credentials.url}`;
  if (cachedClient && cachedKey === cacheKey) {
    return cachedClient;
  }
  cachedClient = createClient(credentials.url, credentials.anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  cachedKey = cacheKey;
  return cachedClient;
}

/** Drop the cached client (e.g. after changing or clearing the override). */
export function resetSupabaseClient(): void {
  cachedKey = null;
  cachedClient = null;
}

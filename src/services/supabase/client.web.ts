/**
 * Web build: no Supabase client. The web bundle must never embed the
 * developer's bundled credentials (src/config/supabase.ts is gitignored and
 * replaced by src/config/index.web.ts), and the sync feature is Android-only.
 * `getSupabaseClient()` resolving null makes runSync() report "not
 * configured", exactly like a native build without credentials.
 */
import type {SupabaseClient} from '@supabase/supabase-js';

export interface SupabaseCredentials {
  url: string;
  anonKey: string;
  source: 'override' | 'bundled';
}

export async function resolveSupabaseCredentials(): Promise<SupabaseCredentials | null> {
  return null;
}

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  return null;
}

export function resetSupabaseClient(): void {
  // Nothing cached on web.
}

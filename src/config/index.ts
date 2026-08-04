/**
 * Build-time app configuration.
 *
 * Supabase credentials live in `src/config/supabase.ts`, which is gitignored
 * (copy `supabase.example.ts` and fill in your project values — see
 * supabase/README.md). When that file is absent (fresh clones, CI) we fall
 * back to the committed example module, whose empty strings make cloud sync
 * report itself as "not configured" instead of breaking the build. Users can
 * also override both values at runtime (src/services/supabase/overrideStore).
 *
 * Never log these values.
 */
import {
  SUPABASE_ANON_KEY as EXAMPLE_ANON_KEY,
  SUPABASE_URL as EXAMPLE_URL,
} from './supabase.example';

// `require` is not part of the RN type surface; declare the CommonJS global
// so the guarded optional load below typechecks.
declare const require: (name: string) => unknown;

interface SupabaseFileConfig {
  SUPABASE_URL?: unknown;
  SUPABASE_ANON_KEY?: unknown;
}

function loadLocalConfig(): SupabaseFileConfig | null {
  try {
    // Guarded optional module: resolves when the gitignored supabase.ts
    // exists, throws (caught) when it does not. If you hit a Metro
    // "unable to resolve ./supabase" error, copy supabase.example.ts to
    // supabase.ts in this folder.
    const local = require('./supabase') as SupabaseFileConfig | null;
    return local ?? null;
  } catch {
    return null;
  }
}

const local = loadLocalConfig();

function asNonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Bundled Supabase project URL ('' when no local config file is present). */
export const SUPABASE_URL: string =
  asNonEmptyString(local?.SUPABASE_URL) || EXAMPLE_URL;

/** Bundled Supabase anon key ('' when no local config file is present). */
export const SUPABASE_ANON_KEY: string =
  asNonEmptyString(local?.SUPABASE_ANON_KEY) || EXAMPLE_ANON_KEY;

/**
 * Web build configuration. Deliberately does NOT load `./supabase` — the
 * developer's bundled Supabase credentials must never end up in a public
 * JavaScript bundle. Cloud sync is an Android-only feature; on web both
 * values are empty so the feature reports itself as unavailable.
 */
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

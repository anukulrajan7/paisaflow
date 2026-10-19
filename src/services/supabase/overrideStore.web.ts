/**
 * Web build: cloud sync is disabled, so there is no runtime Supabase
 * override. Reads resolve null; writes refuse with a clear message. Keeping
 * the module shape identical lets the sync service compile unchanged.
 */
export interface SupabaseOverride {
  url: string;
  anonKey: string;
}

export async function setSupabaseOverride(_override: SupabaseOverride): Promise<void> {
  throw new Error('Cloud sync is available in the Android app.');
}

export async function getSupabaseOverride(): Promise<SupabaseOverride | null> {
  return null;
}

export async function clearSupabaseOverride(): Promise<void> {
  // Nothing stored on web.
}

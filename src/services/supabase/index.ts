/**
 * Optional Supabase backup sync. The app is fully functional without it;
 * everything here degrades to a no-op status when unconfigured or offline.
 */
export {
  getSupabaseClient,
  resetSupabaseClient,
  resolveSupabaseCredentials,
} from './client';
export type {SupabaseCredentials} from './client';
export {
  clearSupabaseOverride,
  getSupabaseOverride,
  setSupabaseOverride,
} from './overrideStore';
export type {SupabaseOverride} from './overrideStore';
export {
  CLOUD_SETTINGS_KEYS,
  SCHEMA_MISSING_MESSAGE,
  describeRemoteError,
  getLastSyncAt,
  runSync,
} from './syncService';
export type {
  SyncDeps,
  SyncRunResult,
  SyncRunStatus,
  TableSyncOutcome,
  TableSyncStatus,
} from './syncService';
export type {RecurringRuleRow} from './syncMappers';

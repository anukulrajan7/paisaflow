import {create} from 'zustand';

interface DataVersionState {
  /** Monotonic counter; bump after any financial-data mutation. */
  dataVersion: number;
  bumpDataVersion: () => void;
}

/**
 * Lightweight cross-feature invalidation. Mutation hooks call
 * `bumpDataVersion()` after writes; query hooks include `dataVersion`
 * in their effect deps to refetch. SQLite stays the source of truth.
 */
export const useDataVersionStore = create<DataVersionState>(set => ({
  dataVersion: 0,
  bumpDataVersion: () => set(s => ({dataVersion: s.dataVersion + 1})),
}));

export function bumpDataVersion(): void {
  useDataVersionStore.getState().bumpDataVersion();
}

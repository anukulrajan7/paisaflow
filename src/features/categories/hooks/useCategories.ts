import {useCallback, useEffect, useState} from 'react';

import {getCategoriesRepository} from '../../../database/repositories';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../../../database/repositories/interfaces';
import type {Category, CategoryType} from '../../../database/types';
import {
  bumpDataVersion,
  useDataVersionStore,
} from '../../../store/dataVersionStore';

export interface UseCategoriesResult {
  /** Null while the first load is in flight. Includes archived rows. */
  categories: Category[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * All categories of a type (including archived ones, so the screen can hide
 * or show them without refetching). Refetches whenever any feature bumps the
 * shared data version.
 */
export function useCategories(type: CategoryType): UseCategoriesResult {
  const dataVersion = useDataVersionStore(state => state.dataVersion);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await getCategoriesRepository().listCategories({
          type,
          includeArchived: true,
        });
        if (!cancelled) {
          setCategories(rows);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError('Could not load categories.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, dataVersion, reloadTick]);

  const reload = useCallback(() => setReloadTick(tick => tick + 1), []);

  return {categories, loading: categories === null && error === null, error, reload};
}

/** Category writes; every mutation bumps the shared data version. */
export function useCategoryMutations() {
  const createCategory = useCallback(
    async (input: CreateCategoryInput): Promise<Category> => {
      const created = await getCategoriesRepository().createCategory(input);
      bumpDataVersion();
      return created;
    },
    [],
  );

  const updateCategory = useCallback(
    async (id: string, patch: UpdateCategoryInput): Promise<Category> => {
      const updated = await getCategoriesRepository().updateCategory(id, patch);
      bumpDataVersion();
      return updated;
    },
    [],
  );

  const setCategoryArchived = useCallback(
    async (id: string, archived: boolean): Promise<void> => {
      await getCategoriesRepository().archiveCategory(id, archived);
      bumpDataVersion();
    },
    [],
  );

  return {createCategory, updateCategory, setCategoryArchived};
}

import {getDb} from '../../../database/connection/connection';
import {queryRows} from '../../../database/connection/helpers';
import type {CategoryType} from '../../../database/types';

/**
 * Category ids ordered by usage frequency (most-used first), for surfacing
 * common categories at the top of the add-transaction form. Soft-deleted
 * rows excluded; bound parameters only.
 */
export async function getMostUsedCategoryIds(
  type: CategoryType,
  limit = 5,
): Promise<string[]> {
  const rows = await queryRows<{category_id: string}>(
    getDb(),
    `SELECT category_id FROM transactions
     WHERE deleted_at IS NULL AND type = ? AND category_id IS NOT NULL
     GROUP BY category_id
     ORDER BY COUNT(*) DESC, MAX(occurred_at) DESC
     LIMIT ?`,
    [type, limit],
  );
  return rows.map(row => row.category_id);
}

import type {SqlDb} from '../connection/types';
import {queryFirst, queryRows} from '../connection/helpers';
import type {Category} from '../types';
import type {CategoryRow} from '../types/rows';
import {newId} from '../../utils/id';
import type {CategoriesRepository} from './interfaces';
import {mapCategoryRow} from './mappers';

const COLUMNS =
  'id, name, type, icon, color, is_system, is_archived, created_at, updated_at';

export function createCategoriesRepository(db: SqlDb): CategoriesRepository {
  async function getCategoryById(id: string): Promise<Category | null> {
    const row = await queryFirst<CategoryRow>(
      db,
      `SELECT ${COLUMNS} FROM categories WHERE id = ?`,
      [id],
    );
    return row ? mapCategoryRow(row) : null;
  }

  return {
    async createCategory(input) {
      if (!input.name.trim()) {
        throw new Error('Category name is required');
      }
      const id = newId();
      const now = Date.now();
      await db.executeAsync(
        `INSERT INTO categories
          (id, name, type, icon, color, is_system, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, input.name.trim(), input.type, input.icon, input.color, 0, 0, now, now],
      );
      const created = await getCategoryById(id);
      if (!created) {
        throw new Error(`Category not found after create: ${id}`);
      }
      return created;
    },

    async updateCategory(id, patch) {
      const existing = await getCategoryById(id);
      if (!existing) {
        throw new Error(`Category not found: ${id}`);
      }
      await db.executeAsync(
        `UPDATE categories SET
          name = ?, icon = ?, color = ?, is_archived = ?, updated_at = ?
         WHERE id = ?`,
        [
          patch.name?.trim() ?? existing.name,
          patch.icon ?? existing.icon,
          patch.color ?? existing.color,
          (patch.isArchived ?? existing.isArchived) ? 1 : 0,
          Date.now(),
          id,
        ],
      );
      const updated = await getCategoryById(id);
      if (!updated) {
        throw new Error(`Category not found after update: ${id}`);
      }
      return updated;
    },

    async archiveCategory(id, archived = true) {
      await db.executeAsync(
        'UPDATE categories SET is_archived = ?, updated_at = ? WHERE id = ?',
        [archived ? 1 : 0, Date.now(), id],
      );
    },

    getCategoryById,

    async listCategories(options = {}) {
      const where: string[] = [];
      const params: string[] = [];
      if (!options.includeArchived) {
        where.push('is_archived = 0');
      }
      if (options.type) {
        where.push('type = ?');
        params.push(options.type);
      }
      const whereSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
      const rows = await queryRows<CategoryRow>(
        db,
        `SELECT ${COLUMNS} FROM categories${whereSql} ORDER BY name ASC`,
        params,
      );
      return rows.map(mapCategoryRow);
    },
  };
}

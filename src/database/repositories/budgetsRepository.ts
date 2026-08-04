import type {SQLiteValue} from 'react-native-nitro-sqlite';

import type {SqlDb} from '../connection/types';
import {queryFirst, queryRows} from '../connection/helpers';
import type {Budget} from '../types';
import type {BudgetRow} from '../types/rows';
import {newId} from '../../utils/id';
import type {BudgetsRepository, CreateBudgetInput} from './interfaces';
import {mapBudgetRow} from './mappers';

const COLUMNS =
  'id, category_id, limit_minor, currency, period_start, period_end, created_at, updated_at';

function validateInput(input: CreateBudgetInput): void {
  if (!Number.isSafeInteger(input.limitMinor) || input.limitMinor <= 0) {
    throw new Error('limitMinor must be a positive integer (minor units)');
  }
  if (!input.currency) {
    throw new Error('currency is required');
  }
  if (
    !Number.isFinite(input.periodStart) ||
    !Number.isFinite(input.periodEnd) ||
    input.periodEnd <= input.periodStart
  ) {
    throw new Error('Budget period must satisfy periodStart < periodEnd');
  }
}

export function createBudgetsRepository(db: SqlDb): BudgetsRepository {
  async function getBudgetById(id: string): Promise<Budget | null> {
    const row = await queryFirst<BudgetRow>(
      db,
      `SELECT ${COLUMNS} FROM budgets WHERE id = ?`,
      [id],
    );
    return row ? mapBudgetRow(row) : null;
  }

  return {
    async createBudget(input) {
      validateInput(input);
      const id = newId();
      const now = Date.now();
      await db.executeAsync(
        `INSERT INTO budgets
          (id, category_id, limit_minor, currency, period_start, period_end, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.categoryId ?? null,
          input.limitMinor,
          input.currency,
          input.periodStart,
          input.periodEnd,
          now,
          now,
        ],
      );
      const created = await getBudgetById(id);
      if (!created) {
        throw new Error(`Budget not found after create: ${id}`);
      }
      return created;
    },

    async updateBudget(id, patch) {
      const existing = await getBudgetById(id);
      if (!existing) {
        throw new Error(`Budget not found: ${id}`);
      }
      const merged: CreateBudgetInput = {
        categoryId:
          patch.categoryId !== undefined ? patch.categoryId : existing.categoryId,
        limitMinor: patch.limitMinor ?? existing.limitMinor,
        currency: patch.currency ?? existing.currency,
        periodStart: patch.periodStart ?? existing.periodStart,
        periodEnd: patch.periodEnd ?? existing.periodEnd,
      };
      validateInput(merged);
      await db.executeAsync(
        `UPDATE budgets SET
          category_id = ?, limit_minor = ?, currency = ?,
          period_start = ?, period_end = ?, updated_at = ?
         WHERE id = ?`,
        [
          merged.categoryId ?? null,
          merged.limitMinor,
          merged.currency,
          merged.periodStart,
          merged.periodEnd,
          Date.now(),
          id,
        ],
      );
      const updated = await getBudgetById(id);
      if (!updated) {
        throw new Error(`Budget not found after update: ${id}`);
      }
      return updated;
    },

    async deleteBudget(id) {
      await db.executeAsync('DELETE FROM budgets WHERE id = ?', [id]);
    },

    getBudgetById,

    async listBudgets() {
      const rows = await queryRows<BudgetRow>(
        db,
        `SELECT ${COLUMNS} FROM budgets ORDER BY period_start DESC`,
      );
      return rows.map(mapBudgetRow);
    },

    async listBudgetsActiveAt(at) {
      const rows = await queryRows<BudgetRow>(
        db,
        `SELECT ${COLUMNS} FROM budgets WHERE period_start <= ? AND period_end > ?`,
        [at, at],
      );
      return rows.map(mapBudgetRow);
    },

    async getBudgetUsage(budgetId) {
      const budget = await getBudgetById(budgetId);
      if (!budget) {
        throw new Error(`Budget not found: ${budgetId}`);
      }
      // Spending = expense transactions in the budget period, transfers and
      // soft-deleted rows excluded; category budgets filter by category.
      const where =
        "deleted_at IS NULL AND type = 'expense' AND occurred_at >= ? AND occurred_at < ?" +
        (budget.categoryId ? ' AND category_id = ?' : '');
      const params: SQLiteValue[] = [budget.periodStart, budget.periodEnd];
      if (budget.categoryId) {
        params.push(budget.categoryId);
      }
      const rows = await queryRows<{amount_minor: number}>(
        db,
        `SELECT amount_minor FROM transactions WHERE ${where}`,
        params,
      );
      const spentMinor = rows.reduce((sum, row) => sum + row.amount_minor, 0);
      return {
        budget,
        limitMinor: budget.limitMinor,
        spentMinor,
        remainingMinor: budget.limitMinor - spentMinor,
        usedFraction: spentMinor / budget.limitMinor,
      };
    },
  };
}

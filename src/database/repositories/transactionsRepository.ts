import type {SQLiteValue} from 'react-native-nitro-sqlite';

import type {SqlDb} from '../connection/types';
import {queryFirst, queryRows} from '../connection/helpers';
import type {
  CategoryTotal,
  DailyTotal,
  Period,
  PeriodTotals,
  Transaction,
} from '../types';
import type {TransactionRow} from '../types/rows';
import {daysInPeriod, dayjs} from '../../utils/date';
import {newId} from '../../utils/id';
import type {
  CreateTransactionInput,
  TransactionFilters,
  TransactionsRepository,
} from './interfaces';
import {escapeLike, mapTransactionRow, placeholders} from './mappers';

const COLUMNS =
  'id, type, amount_minor, currency, account_id, destination_account_id, category_id, merchant, note, payment_method, occurred_at, created_at, updated_at, deleted_at';

interface NormalizedTransaction {
  type: Transaction['type'];
  amountMinor: number;
  currency: string;
  accountId: string;
  destinationAccountId: string | null;
  categoryId: string | null;
  merchant: string | null;
  note: string | null;
  paymentMethod: string | null;
  occurredAt: number;
}

/** Shared create/update validation. Pure — throws on invalid input. */
function normalizeInput(input: CreateTransactionInput): NormalizedTransaction {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('amountMinor must be a positive integer (minor units)');
  }
  if (!input.accountId) {
    throw new Error('accountId is required');
  }
  if (!input.currency) {
    throw new Error('currency is required');
  }
  if (!Number.isFinite(input.occurredAt)) {
    throw new Error('occurredAt must be a valid epoch-ms timestamp');
  }

  if (input.type === 'transfer') {
    if (!input.destinationAccountId) {
      throw new Error('Transfers require a destinationAccountId');
    }
    if (input.destinationAccountId === input.accountId) {
      throw new Error('Transfer destination must differ from the source account');
    }
    // Transfers are not income/expense: category is meaningless, force null.
    return {
      type: input.type,
      amountMinor: input.amountMinor,
      currency: input.currency,
      accountId: input.accountId,
      destinationAccountId: input.destinationAccountId,
      categoryId: null,
      merchant: input.merchant ?? null,
      note: input.note ?? null,
      paymentMethod: input.paymentMethod ?? null,
      occurredAt: input.occurredAt,
    };
  }

  return {
    type: input.type,
    amountMinor: input.amountMinor,
    currency: input.currency,
    accountId: input.accountId,
    destinationAccountId: null,
    categoryId: input.categoryId ?? null,
    merchant: input.merchant ?? null,
    note: input.note ?? null,
    paymentMethod: input.paymentMethod ?? null,
    occurredAt: input.occurredAt,
  };
}

interface LeanRow {
  type: string;
  amount_minor: number;
  occurred_at: number;
  category_id: string | null;
}

/** Rows used for aggregate math: lean select, summed in JS. */
function fetchLeanRows(
  db: SqlDb,
  period: Period,
  extraWhere = '',
  extraParams: SQLiteValue[] = [],
): Promise<LeanRow[]> {
  const where =
    'deleted_at IS NULL AND occurred_at >= ? AND occurred_at < ?' + extraWhere;
  return queryRows<LeanRow>(
    db,
    `SELECT type, amount_minor, occurred_at, category_id FROM transactions WHERE ${where}`,
    [period.start, period.end, ...extraParams],
  );
}

export function createTransactionsRepository(db: SqlDb): TransactionsRepository {
  async function getTransactionById(id: string): Promise<Transaction | null> {
    const row = await queryFirst<TransactionRow>(
      db,
      `SELECT ${COLUMNS} FROM transactions WHERE id = ?`,
      [id],
    );
    return row ? mapTransactionRow(row) : null;
  }

  async function listTransactions(
    filters: TransactionFilters = {},
  ): Promise<Transaction[]> {
    const where: string[] = [];
    const params: SQLiteValue[] = [];

    if (!filters.includeDeleted) {
      where.push('deleted_at IS NULL');
    }
    if (filters.type) {
      where.push('type = ?');
      params.push(filters.type);
    }
    if (filters.categoryId) {
      where.push('category_id = ?');
      params.push(filters.categoryId);
    }
    if (filters.accountId) {
      where.push('account_id = ?');
      params.push(filters.accountId);
    }
    if (filters.from != null) {
      where.push('occurred_at >= ?');
      params.push(filters.from);
    }
    if (filters.to != null) {
      where.push('occurred_at < ?');
      params.push(filters.to);
    }

    let sql = `SELECT ${COLUMNS} FROM transactions`;
    if (where.length > 0) {
      sql += ` WHERE ${where.join(' AND ')}`;
    }
    sql += ' ORDER BY occurred_at DESC, created_at DESC';
    if (filters.limit != null) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
      if (filters.offset != null) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }
    } else if (filters.offset != null) {
      // SQLite requires a LIMIT when OFFSET is used.
      sql += ' LIMIT -1 OFFSET ?';
      params.push(filters.offset);
    }

    const rows = await queryRows<TransactionRow>(db, sql, params);
    return rows.map(mapTransactionRow);
  }

  return {
    async createTransaction(input) {
      const tx = normalizeInput(input);
      const id = newId();
      const now = Date.now();
      await db.executeAsync(
        `INSERT INTO transactions
          (id, type, amount_minor, currency, account_id, destination_account_id,
           category_id, merchant, note, payment_method, occurred_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          tx.type,
          tx.amountMinor,
          tx.currency,
          tx.accountId,
          tx.destinationAccountId,
          tx.categoryId,
          tx.merchant,
          tx.note,
          tx.paymentMethod,
          tx.occurredAt,
          now,
          now,
          null,
        ],
      );
      return {...tx, id, createdAt: now, updatedAt: now, deletedAt: null};
    },

    async updateTransaction(id, patch) {
      const existing = await getTransactionById(id);
      if (!existing) {
        throw new Error(`Transaction not found: ${id}`);
      }
      const merged: CreateTransactionInput = {
        type: patch.type ?? existing.type,
        amountMinor: patch.amountMinor ?? existing.amountMinor,
        currency: patch.currency ?? existing.currency,
        accountId: patch.accountId ?? existing.accountId,
        destinationAccountId:
          patch.destinationAccountId !== undefined
            ? patch.destinationAccountId
            : existing.destinationAccountId,
        categoryId:
          patch.categoryId !== undefined ? patch.categoryId : existing.categoryId,
        merchant: patch.merchant !== undefined ? patch.merchant : existing.merchant,
        note: patch.note !== undefined ? patch.note : existing.note,
        paymentMethod:
          patch.paymentMethod !== undefined
            ? patch.paymentMethod
            : existing.paymentMethod,
        occurredAt: patch.occurredAt ?? existing.occurredAt,
      };
      const tx = normalizeInput(merged);
      const now = Date.now();
      await db.executeAsync(
        `UPDATE transactions SET
          type = ?, amount_minor = ?, currency = ?, account_id = ?,
          destination_account_id = ?, category_id = ?, merchant = ?, note = ?,
          payment_method = ?, occurred_at = ?, updated_at = ?
         WHERE id = ?`,
        [
          tx.type,
          tx.amountMinor,
          tx.currency,
          tx.accountId,
          tx.destinationAccountId,
          tx.categoryId,
          tx.merchant,
          tx.note,
          tx.paymentMethod,
          tx.occurredAt,
          now,
          id,
        ],
      );
      const updated = await getTransactionById(id);
      if (!updated) {
        throw new Error(`Transaction not found after update: ${id}`);
      }
      return updated;
    },

    async softDeleteTransaction(id) {
      await db.executeAsync(
        'UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?',
        [Date.now(), Date.now(), id],
      );
    },

    async restoreTransaction(id) {
      await db.executeAsync(
        'UPDATE transactions SET deleted_at = NULL, updated_at = ? WHERE id = ?',
        [Date.now(), id],
      );
    },

    getTransactionById,
    listTransactions,

    async searchTransactions(query, limit = 20) {
      const term = query.trim();
      if (!term) {
        return [];
      }
      const like = `%${escapeLike(term)}%`;

      const [byMerchant, byNote, matchingCategories] = await Promise.all([
        queryRows<TransactionRow>(
          db,
          `SELECT ${COLUMNS} FROM transactions
           WHERE deleted_at IS NULL AND merchant LIKE ? ESCAPE '\\'
           ORDER BY occurred_at DESC, created_at DESC LIMIT ?`,
          [like, limit],
        ),
        queryRows<TransactionRow>(
          db,
          `SELECT ${COLUMNS} FROM transactions
           WHERE deleted_at IS NULL AND note LIKE ? ESCAPE '\\'
           ORDER BY occurred_at DESC, created_at DESC LIMIT ?`,
          [like, limit],
        ),
        queryRows<{id: string}>(
          db,
          `SELECT id FROM categories WHERE name LIKE ? ESCAPE '\\'`,
          [like],
        ),
      ]);

      let byCategory: TransactionRow[] = [];
      if (matchingCategories.length > 0) {
        const ids = matchingCategories.map(c => c.id);
        byCategory = await queryRows<TransactionRow>(
          db,
          `SELECT ${COLUMNS} FROM transactions
           WHERE deleted_at IS NULL AND category_id IN (${placeholders(ids.length)})
           ORDER BY occurred_at DESC, created_at DESC LIMIT ?`,
          [...ids, limit],
        );
      }

      const seen = new Map<string, Transaction>();
      for (const row of [...byMerchant, ...byNote, ...byCategory]) {
        if (!seen.has(row.id)) {
          seen.set(row.id, mapTransactionRow(row));
        }
      }
      return [...seen.values()]
        .sort((a, b) => b.occurredAt - a.occurredAt || b.createdAt - a.createdAt)
        .slice(0, limit);
    },

    async getRecentTransactions(limit = 10) {
      return listTransactions({limit});
    },

    async getDailyTotals(period) {
      const rows = await fetchLeanRows(
        db,
        period,
        " AND type IN ('income', 'expense')",
      );
      const byDay = new Map<number, DailyTotal>();
      for (const dayStart of daysInPeriod(period)) {
        byDay.set(dayStart, {dayStart, incomeMinor: 0, expenseMinor: 0});
      }
      for (const row of rows) {
        const dayStart = dayjs(row.occurred_at).startOf('day').valueOf();
        const entry = byDay.get(dayStart) ?? {
          dayStart,
          incomeMinor: 0,
          expenseMinor: 0,
        };
        if (row.type === 'income') {
          entry.incomeMinor += row.amount_minor;
        } else if (row.type === 'expense') {
          entry.expenseMinor += row.amount_minor;
        }
        byDay.set(dayStart, entry);
      }
      return [...byDay.values()].sort((a, b) => a.dayStart - b.dayStart);
    },

    async getMonthlyTotals(period) {
      const rows = await fetchLeanRows(
        db,
        period,
        " AND type IN ('income', 'expense')",
      );
      const totals: PeriodTotals = {incomeMinor: 0, expenseMinor: 0, count: 0};
      for (const row of rows) {
        if (row.type === 'income') {
          totals.incomeMinor += row.amount_minor;
        } else {
          totals.expenseMinor += row.amount_minor;
        }
        totals.count += 1;
      }
      return totals;
    },

    async getCategoryTotals(period, type) {
      const rows = await fetchLeanRows(db, period, ' AND type = ?', [type]);
      const sums = new Map<string | null, {totalMinor: number; count: number}>();
      for (const row of rows) {
        const entry = sums.get(row.category_id) ?? {totalMinor: 0, count: 0};
        entry.totalMinor += row.amount_minor;
        entry.count += 1;
        sums.set(row.category_id, entry);
      }

      const categoryIds = [...sums.keys()].filter(
        (id): id is string => id != null,
      );
      const names = new Map<
        string,
        {name: string; icon: string; color: string}
      >();
      if (categoryIds.length > 0) {
        const categories = await queryRows<{
          id: string;
          name: string;
          icon: string;
          color: string;
        }>(
          db,
          `SELECT id, name, icon, color FROM categories WHERE id IN (${placeholders(
            categoryIds.length,
          )})`,
          categoryIds,
        );
        for (const category of categories) {
          names.set(category.id, {
            name: category.name,
            icon: category.icon,
            color: category.color,
          });
        }
      }

      const totals: CategoryTotal[] = [...sums.entries()].map(
        ([categoryId, entry]) => {
          const meta = categoryId ? names.get(categoryId) : undefined;
          return {
            categoryId,
            name: meta?.name ?? 'Uncategorized',
            icon: meta?.icon ?? 'Shapes',
            color: meta?.color ?? '#8B8175',
            totalMinor: entry.totalMinor,
            count: entry.count,
          };
        },
      );
      return totals.sort((a, b) => b.totalMinor - a.totalMinor);
    },
  };
}

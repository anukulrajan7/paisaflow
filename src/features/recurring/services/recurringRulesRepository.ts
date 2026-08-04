import {getDb} from '../../../database/connection/connection';
import {queryFirst, queryRows} from '../../../database/connection/helpers';
import type {SqlDb} from '../../../database/connection/types';
import {newId} from '../../../utils/id';
import type {
  RecurringFrequency,
  RecurringRule,
  RecurringRuleType,
} from '../types/recurringRule';

/**
 * Repository for recurring_rules (migration 003). Feature-local (mirrors
 * features/tracking/services/detectedExpensesRepository): rules are templates,
 * not ledger data — confirming one writes a real transaction through the
 * shared transactions repository.
 *
 * All queries use bound parameters; every write revalidates the full row.
 */

const FREQUENCIES: ReadonlyArray<RecurringFrequency> = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
];

const RULE_TYPES: ReadonlyArray<RecurringRuleType> = [
  'expense',
  'income',
  'transfer',
];

export interface RecurringRuleInput {
  type: RecurringRuleType;
  amountMinor: number;
  currency: string;
  accountId: string;
  /** Required for transfers; ignored (nulled) otherwise. */
  destinationAccountId?: string | null;
  /** Ignored (nulled) for transfers. */
  categoryId?: string | null;
  merchant?: string | null;
  note?: string | null;
  paymentMethod?: string | null;
  frequency: RecurringFrequency;
  /** Every N periods; defaults to 1. */
  intervalCount?: number;
  /** epoch ms of the first/next occurrence awaiting confirmation. */
  nextDueAt: number;
}

export type UpdateRecurringRuleInput = Partial<RecurringRuleInput>;

interface RecurringRuleRow {
  id: string;
  type: string;
  amount_minor: number;
  currency: string;
  account_id: string;
  destination_account_id: string | null;
  category_id: string | null;
  merchant: string | null;
  note: string | null;
  payment_method: string | null;
  frequency: string;
  interval_count: number;
  next_due_at: number;
  last_confirmed_at: number | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

const COLUMNS =
  'id, type, amount_minor, currency, account_id, destination_account_id, category_id, merchant, note, payment_method, frequency, interval_count, next_due_at, last_confirmed_at, is_active, created_at, updated_at';

function mapRow(row: RecurringRuleRow): RecurringRule {
  return {
    id: row.id,
    type: row.type as RecurringRuleType,
    amountMinor: row.amount_minor,
    currency: row.currency,
    accountId: row.account_id,
    destinationAccountId: row.destination_account_id,
    categoryId: row.category_id,
    merchant: row.merchant,
    note: row.note,
    paymentMethod: row.payment_method,
    frequency: row.frequency as RecurringFrequency,
    intervalCount: row.interval_count,
    nextDueAt: row.next_due_at,
    lastConfirmedAt: row.last_confirmed_at,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface NormalizedRule {
  type: RecurringRuleType;
  amountMinor: number;
  currency: string;
  accountId: string;
  destinationAccountId: string | null;
  categoryId: string | null;
  merchant: string | null;
  note: string | null;
  paymentMethod: string | null;
  frequency: RecurringFrequency;
  intervalCount: number;
  nextDueAt: number;
}

/** Shared create/update validation. Pure — throws on invalid input. */
function normalizeInput(input: RecurringRuleInput): NormalizedRule {
  if (!RULE_TYPES.includes(input.type)) {
    throw new Error('type must be expense, income or transfer');
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('amountMinor must be a positive integer (minor units)');
  }
  if (!input.currency) {
    throw new Error('currency is required');
  }
  if (!input.accountId) {
    throw new Error('accountId is required');
  }
  if (!FREQUENCIES.includes(input.frequency)) {
    throw new Error('frequency must be daily, weekly, monthly or yearly');
  }
  const intervalCount = input.intervalCount ?? 1;
  if (!Number.isSafeInteger(intervalCount) || intervalCount <= 0) {
    throw new Error('intervalCount must be a positive integer');
  }
  if (!Number.isFinite(input.nextDueAt)) {
    throw new Error('nextDueAt must be a valid epoch-ms timestamp');
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
      frequency: input.frequency,
      intervalCount,
      nextDueAt: input.nextDueAt,
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
    frequency: input.frequency,
    intervalCount,
    nextDueAt: input.nextDueAt,
  };
}

export function createRecurringRulesRepository(db: SqlDb) {
  async function getRuleById(id: string): Promise<RecurringRule | null> {
    const row = await queryFirst<RecurringRuleRow>(
      db,
      `SELECT ${COLUMNS} FROM recurring_rules WHERE id = ?`,
      [id],
    );
    return row ? mapRow(row) : null;
  }

  async function insertRule(rule: NormalizedRule): Promise<RecurringRule> {
    const id = newId();
    const now = Date.now();
    await db.executeAsync(
      `INSERT INTO recurring_rules
        (id, type, amount_minor, currency, account_id, destination_account_id,
         category_id, merchant, note, payment_method, frequency, interval_count,
         next_due_at, last_confirmed_at, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        rule.type,
        rule.amountMinor,
        rule.currency,
        rule.accountId,
        rule.destinationAccountId,
        rule.categoryId,
        rule.merchant,
        rule.note,
        rule.paymentMethod,
        rule.frequency,
        rule.intervalCount,
        rule.nextDueAt,
        null,
        1,
        now,
        now,
      ],
    );
    const created = await getRuleById(id);
    if (!created) {
      throw new Error(`Recurring rule not found after create: ${id}`);
    }
    return created;
  }

  return {
    async createRule(input: RecurringRuleInput): Promise<RecurringRule> {
      return insertRule(normalizeInput(input));
    },

    async updateRule(
      id: string,
      patch: UpdateRecurringRuleInput,
    ): Promise<RecurringRule> {
      const existing = await getRuleById(id);
      if (!existing) {
        throw new Error(`Recurring rule not found: ${id}`);
      }
      const merged: RecurringRuleInput = {
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
        frequency: patch.frequency ?? existing.frequency,
        intervalCount: patch.intervalCount ?? existing.intervalCount,
        nextDueAt: patch.nextDueAt ?? existing.nextDueAt,
      };
      const rule = normalizeInput(merged);
      await db.executeAsync(
        `UPDATE recurring_rules SET
          type = ?, amount_minor = ?, currency = ?, account_id = ?,
          destination_account_id = ?, category_id = ?, merchant = ?, note = ?,
          payment_method = ?, frequency = ?, interval_count = ?, next_due_at = ?,
          updated_at = ?
         WHERE id = ?`,
        [
          rule.type,
          rule.amountMinor,
          rule.currency,
          rule.accountId,
          rule.destinationAccountId,
          rule.categoryId,
          rule.merchant,
          rule.note,
          rule.paymentMethod,
          rule.frequency,
          rule.intervalCount,
          rule.nextDueAt,
          Date.now(),
          id,
        ],
      );
      const updated = await getRuleById(id);
      if (!updated) {
        throw new Error(`Recurring rule not found after update: ${id}`);
      }
      return updated;
    },

    /** Pause/resume. Paused rules never come due and keep their schedule. */
    async setRuleActive(id: string, isActive: boolean): Promise<void> {
      await db.executeAsync(
        'UPDATE recurring_rules SET is_active = ?, updated_at = ? WHERE id = ?',
        [isActive ? 1 : 0, Date.now(), id],
      );
    },

    /** Stamps a confirmation and stores the already-computed next due date. */
    async recordConfirmation(
      id: string,
      confirmedAt: number,
      nextDueAt: number,
    ): Promise<void> {
      await db.executeAsync(
        `UPDATE recurring_rules
         SET last_confirmed_at = ?, next_due_at = ?, updated_at = ?
         WHERE id = ?`,
        [confirmedAt, nextDueAt, Date.now(), id],
      );
    },

    /** Hard delete — rules carry no financial history of their own. */
    async deleteRule(id: string): Promise<void> {
      await db.executeAsync('DELETE FROM recurring_rules WHERE id = ?', [id]);
    },

    getRuleById,

    /** All rules: active first, then soonest due. */
    async listRules(): Promise<RecurringRule[]> {
      const rows = await queryRows<RecurringRuleRow>(
        db,
        `SELECT ${COLUMNS} FROM recurring_rules
         ORDER BY is_active DESC, next_due_at ASC`,
      );
      return rows.map(mapRow);
    },

    /** Active rules only, soonest due first. Feeds the pure listDueRules(). */
    async listActiveRules(): Promise<RecurringRule[]> {
      const rows = await queryRows<RecurringRuleRow>(
        db,
        `SELECT ${COLUMNS} FROM recurring_rules
         WHERE is_active = ?
         ORDER BY next_due_at ASC`,
        [1],
      );
      return rows.map(mapRow);
    },
  };
}

export type RecurringRulesRepository = ReturnType<
  typeof createRecurringRulesRepository
>;

let instance: RecurringRulesRepository | null = null;

/** Lazy singleton over the default connection (mirrors database/repositories). */
export function getRecurringRulesRepository(): RecurringRulesRepository {
  if (!instance) {
    instance = createRecurringRulesRepository(getDb());
  }
  return instance;
}

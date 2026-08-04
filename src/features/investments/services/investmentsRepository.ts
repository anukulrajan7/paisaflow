import {getDb} from '../../../database/connection/connection';
import {queryFirst, queryRows} from '../../../database/connection/helpers';
import type {SqlDb} from '../../../database/connection/types';
import {newId} from '../../../utils/id';
import {INVESTMENT_TYPES} from '../types/investment';
import type {
  Investment,
  InvestmentContribution,
  InvestmentType,
} from '../types/investment';

/**
 * Repository for investments + investment_contributions (migration 004).
 * Feature-local (mirrors features/recurring/services/recurringRulesRepository).
 *
 * Each investment owns ONE virtual holding account (type 'investment',
 * is_archived = 1, same name) created in the same transaction. Contributions
 * move money as real transfer transactions into that account — see
 * services/addInvestmentContribution.ts — so they never count as spending.
 *
 * All queries use bound parameters; every write revalidates the full row.
 */

export interface CreateInvestmentInput {
  name: string;
  type: InvestmentType;
  /** Currency of the (auto-created) holding account, e.g. 'INR'. */
  currency: string;
  /** Already-invested amount when tracking starts; becomes the holding
   *  account's opening balance (no transfer is created for it). */
  initialInvestedMinor?: number;
  /** epoch ms */
  startedAt: number;
  /** epoch ms */
  maturityAt?: number | null;
  monthlyContributionMinor?: number | null;
  /** Day of month 1..28. */
  reminderDay?: number | null;
  notes?: string | null;
}

export interface UpdateInvestmentInput {
  name?: string;
  type?: InvestmentType;
  startedAt?: number;
  maturityAt?: number | null;
  monthlyContributionMinor?: number | null;
  reminderDay?: number | null;
  notes?: string | null;
}

export interface InsertContributionInput {
  investmentId: string;
  amountMinor: number;
  transactionId: string;
  /** epoch ms */
  occurredAt: number;
  note?: string | null;
}

interface InvestmentRow {
  id: string;
  name: string;
  type: string;
  holding_account_id: string;
  invested_minor: number;
  current_value_minor: number;
  started_at: number;
  maturity_at: number | null;
  monthly_contribution_minor: number | null;
  reminder_day: number | null;
  notes: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface ContributionRow {
  id: string;
  investment_id: string;
  amount_minor: number;
  transaction_id: string | null;
  occurred_at: number;
  note: string | null;
  created_at: number;
}

const INVESTMENT_COLUMNS =
  'id, name, type, holding_account_id, invested_minor, current_value_minor, started_at, maturity_at, monthly_contribution_minor, reminder_day, notes, is_active, created_at, updated_at, deleted_at';

const CONTRIBUTION_COLUMNS =
  'id, investment_id, amount_minor, transaction_id, occurred_at, note, created_at';

function mapInvestment(row: InvestmentRow): Investment {
  return {
    id: row.id,
    name: row.name,
    type: row.type as InvestmentType,
    holdingAccountId: row.holding_account_id,
    investedMinor: row.invested_minor,
    currentValueMinor: row.current_value_minor,
    startedAt: row.started_at,
    maturityAt: row.maturity_at,
    monthlyContributionMinor: row.monthly_contribution_minor,
    reminderDay: row.reminder_day,
    notes: row.notes,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContribution(row: ContributionRow): InvestmentContribution {
  return {
    id: row.id,
    investmentId: row.investment_id,
    amountMinor: row.amount_minor,
    transactionId: row.transaction_id,
    occurredAt: row.occurred_at,
    note: row.note,
    createdAt: row.created_at,
  };
}

/** Fields shared by create and update. Pure — throws on invalid input. */
function validateDetails(details: {
  name: string;
  type: InvestmentType;
  startedAt: number;
  maturityAt: number | null;
  monthlyContributionMinor: number | null;
  reminderDay: number | null;
}): void {
  if (!details.name.trim()) {
    throw new Error('Investment name is required');
  }
  if (!INVESTMENT_TYPES.includes(details.type)) {
    throw new Error(`type must be one of: ${INVESTMENT_TYPES.join(', ')}`);
  }
  if (!Number.isFinite(details.startedAt)) {
    throw new Error('startedAt must be a valid epoch-ms timestamp');
  }
  if (details.maturityAt != null && !Number.isFinite(details.maturityAt)) {
    throw new Error('maturityAt must be a valid epoch-ms timestamp');
  }
  if (
    details.monthlyContributionMinor != null &&
    (!Number.isSafeInteger(details.monthlyContributionMinor) ||
      details.monthlyContributionMinor <= 0)
  ) {
    throw new Error(
      'monthlyContributionMinor must be a positive integer (minor units)',
    );
  }
  if (
    details.reminderDay != null &&
    (!Number.isSafeInteger(details.reminderDay) ||
      details.reminderDay < 1 ||
      details.reminderDay > 28)
  ) {
    throw new Error('reminderDay must be an integer between 1 and 28');
  }
}

/** Create-only validation on top of the shared details. */
function validateCreate(input: CreateInvestmentInput): void {
  validateDetails({
    name: input.name,
    type: input.type,
    startedAt: input.startedAt,
    maturityAt: input.maturityAt ?? null,
    monthlyContributionMinor: input.monthlyContributionMinor ?? null,
    reminderDay: input.reminderDay ?? null,
  });
  if (!input.currency) {
    throw new Error('currency is required');
  }
  const initial = input.initialInvestedMinor ?? 0;
  if (!Number.isSafeInteger(initial) || initial < 0) {
    throw new Error(
      'initialInvestedMinor must be a non-negative integer (minor units)',
    );
  }
}

export function createInvestmentsRepository(db: SqlDb) {
  async function getInvestmentById(id: string): Promise<Investment | null> {
    const row = await queryFirst<InvestmentRow>(
      db,
      `SELECT ${INVESTMENT_COLUMNS} FROM investments WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    return row ? mapInvestment(row) : null;
  }

  async function getContributionById(
    id: string,
  ): Promise<InvestmentContribution | null> {
    const row = await queryFirst<ContributionRow>(
      db,
      `SELECT ${CONTRIBUTION_COLUMNS} FROM investment_contributions WHERE id = ?`,
      [id],
    );
    return row ? mapContribution(row) : null;
  }

  return {
    getInvestmentById,

    /**
     * Creates the investment plus its virtual holding account in one
     * transaction. The account insert is inlined (rather than going through
     * accountsRepository.createAccount, which opens its own transaction) so
     * the pair is atomic.
     */
    async createInvestment(input: CreateInvestmentInput): Promise<Investment> {
      validateCreate(input);
      const id = newId();
      const holdingAccountId = newId();
      const now = Date.now();
      const initial = input.initialInvestedMinor ?? 0;
      await db.transaction(async tx => {
        await tx.executeAsync(
          `INSERT INTO accounts
            (id, name, type, currency, opening_balance_minor, is_default, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [holdingAccountId, input.name.trim(), 'investment', input.currency, initial, 0, 1, now, now],
        );
        await tx.executeAsync(
          `INSERT INTO investments
            (id, name, type, holding_account_id, invested_minor, current_value_minor,
             started_at, maturity_at, monthly_contribution_minor, reminder_day, notes,
             is_active, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            input.name.trim(),
            input.type,
            holdingAccountId,
            initial,
            initial,
            input.startedAt,
            input.maturityAt ?? null,
            input.monthlyContributionMinor ?? null,
            input.reminderDay ?? null,
            input.notes?.trim() || null,
            1,
            now,
            now,
            null,
          ],
        );
      });
      const created = await getInvestmentById(id);
      if (!created) {
        throw new Error(`Investment not found after create: ${id}`);
      }
      return created;
    },

    /** Metadata edits; also renames the holding account when the name changes. */
    async updateInvestment(
      id: string,
      patch: UpdateInvestmentInput,
    ): Promise<Investment> {
      const existing = await getInvestmentById(id);
      if (!existing) {
        throw new Error(`Investment not found: ${id}`);
      }
      const next = {
        name: patch.name?.trim() ?? existing.name,
        type: patch.type ?? existing.type,
        startedAt: patch.startedAt ?? existing.startedAt,
        maturityAt:
          patch.maturityAt !== undefined ? patch.maturityAt : existing.maturityAt,
        monthlyContributionMinor:
          patch.monthlyContributionMinor !== undefined
            ? patch.monthlyContributionMinor
            : existing.monthlyContributionMinor,
        reminderDay:
          patch.reminderDay !== undefined ? patch.reminderDay : existing.reminderDay,
        notes: patch.notes !== undefined ? patch.notes?.trim() || null : existing.notes,
      };
      validateDetails(next);
      const now = Date.now();
      await db.transaction(async tx => {
        await tx.executeAsync(
          `UPDATE investments SET
            name = ?, type = ?, started_at = ?, maturity_at = ?,
            monthly_contribution_minor = ?, reminder_day = ?, notes = ?, updated_at = ?
           WHERE id = ?`,
          [
            next.name,
            next.type,
            next.startedAt,
            next.maturityAt,
            next.monthlyContributionMinor,
            next.reminderDay,
            next.notes,
            now,
            id,
          ],
        );
        if (next.name !== existing.name) {
          await tx.executeAsync(
            'UPDATE accounts SET name = ?, updated_at = ? WHERE id = ?',
            [next.name, now, existing.holdingAccountId],
          );
        }
      });
      const updated = await getInvestmentById(id);
      if (!updated) {
        throw new Error(`Investment not found after update: ${id}`);
      }
      return updated;
    },

    /** Manual valuation — there are no market APIs; the user types this in. */
    async updateCurrentValue(
      id: string,
      currentValueMinor: number,
    ): Promise<Investment> {
      const existing = await getInvestmentById(id);
      if (!existing) {
        throw new Error(`Investment not found: ${id}`);
      }
      if (!Number.isSafeInteger(currentValueMinor) || currentValueMinor < 0) {
        throw new Error('currentValueMinor must be a non-negative integer (minor units)');
      }
      await db.executeAsync(
        'UPDATE investments SET current_value_minor = ?, updated_at = ? WHERE id = ?',
        [currentValueMinor, Date.now(), id],
      );
      const updated = await getInvestmentById(id);
      if (!updated) {
        throw new Error(`Investment not found after update: ${id}`);
      }
      return updated;
    },

    /** Archive = soft delete (is_active = 0); history and transfers stay. */
    async setInvestmentActive(id: string, isActive: boolean): Promise<void> {
      await db.executeAsync(
        'UPDATE investments SET is_active = ?, updated_at = ? WHERE id = ?',
        [isActive ? 1 : 0, Date.now(), id],
      );
    },

    /** Active investments by default, name A→Z. */
    async listInvestments(options?: {
      includeInactive?: boolean;
    }): Promise<Investment[]> {
      const where = options?.includeInactive ? '' : ' WHERE is_active = 1 AND deleted_at IS NULL';
      const rows = await queryRows<InvestmentRow>(
        db,
        `SELECT ${INVESTMENT_COLUMNS} FROM investments${where} ORDER BY name ASC`,
      );
      return rows.map(mapInvestment);
    },

    /** Contribution history for one investment, newest first. */
    async listContributions(investmentId: string): Promise<InvestmentContribution[]> {
      const rows = await queryRows<ContributionRow>(
        db,
        `SELECT ${CONTRIBUTION_COLUMNS} FROM investment_contributions
         WHERE investment_id = ? ORDER BY occurred_at DESC, created_at DESC`,
        [investmentId],
      );
      return rows.map(mapContribution);
    },

    /**
     * Inserts the contribution row. Used by addInvestmentContribution inside
     * a shared transaction with the transfer + invested/current bump — do not
     * call it standalone.
     */
    async insertContribution(
      input: InsertContributionInput,
    ): Promise<InvestmentContribution> {
      if (
        !Number.isSafeInteger(input.amountMinor) ||
        input.amountMinor <= 0
      ) {
        throw new Error('amountMinor must be a positive integer (minor units)');
      }
      if (!input.transactionId) {
        throw new Error('transactionId is required');
      }
      if (!Number.isFinite(input.occurredAt)) {
        throw new Error('occurredAt must be a valid epoch-ms timestamp');
      }
      const id = newId();
      await db.executeAsync(
        `INSERT INTO investment_contributions
          (id, investment_id, amount_minor, transaction_id, occurred_at, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.investmentId,
          input.amountMinor,
          input.transactionId,
          input.occurredAt,
          input.note?.trim() || null,
          Date.now(),
        ],
      );
      const created = await getContributionById(id);
      if (!created) {
        throw new Error(`Contribution not found after create: ${id}`);
      }
      return created;
    },

    /**
     * Moves invested/current totals after a contribution. Read-modify-write in
     * JS (no SQL expressions) — always called inside the contribution
     * transaction. Current value rises with each contribution because the
     * money buys units worth what was paid; the user then revalues manually.
     */
    async applyContributionTotals(
      id: string,
      investedMinor: number,
      currentValueMinor: number,
    ): Promise<void> {
      await db.executeAsync(
        'UPDATE investments SET invested_minor = ?, current_value_minor = ?, updated_at = ? WHERE id = ?',
        [investedMinor, currentValueMinor, Date.now(), id],
      );
    },
  };
}

export type InvestmentsRepository = ReturnType<typeof createInvestmentsRepository>;

let instance: InvestmentsRepository | null = null;

/** Lazy singleton over the default connection (mirrors database/repositories). */
export function getInvestmentsRepository(): InvestmentsRepository {
  if (!instance) {
    instance = createInvestmentsRepository(getDb());
  }
  return instance;
}

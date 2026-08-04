import {getDb} from '../../../database/connection/connection';
import {queryFirst, queryRows} from '../../../database/connection/helpers';
import type {SqlDb} from '../../../database/connection/types';
import {newId} from '../../../utils/id';
import type {
  SalaryConfig,
  SalaryRecord,
  SalaryRecordStatus,
} from '../types/salary';

/**
 * Repository for salary_configs / salary_records (migration 004).
 * Feature-local (mirrors features/recurring/services/recurringRulesRepository):
 * the config is just a template — confirming a month writes the real income
 * transaction through the shared transactions repository (see confirmSalary).
 *
 * There is ONE active config; saveConfig upserts it. All queries use bound
 * parameters; every write revalidates the full row.
 */

export const ALREADY_RECORDED_MESSAGE =
  'Salary already recorded for this month';

const RECORD_STATUSES: ReadonlyArray<SalaryRecordStatus> = [
  'credited',
  'partial',
  'bonus',
  'delayed',
];

const PERIOD_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface SalaryConfigInput {
  amountMinor: number;
  currency: string;
  accountId: string;
  employer?: string | null;
  expectedDay: number;
  /** 'HH:mm' 24h local time, or null. */
  reminderTime?: string | null;
}

export interface SalaryRecordInput {
  configId: string;
  periodKey: string;
  amountMinor: number;
  status: SalaryRecordStatus;
  transactionId?: string | null;
  note?: string | null;
}

export type UpdateSalaryRecordInput = Partial<
  Omit<SalaryRecordInput, 'configId' | 'periodKey'>
>;

interface SalaryConfigRow {
  id: string;
  amount_minor: number;
  currency: string;
  account_id: string;
  employer: string | null;
  expected_day: number;
  reminder_time: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

interface SalaryRecordRow {
  id: string;
  config_id: string;
  period_key: string;
  amount_minor: number;
  status: string;
  transaction_id: string | null;
  note: string | null;
  created_at: number;
  updated_at: number;
}

const CONFIG_COLUMNS =
  'id, amount_minor, currency, account_id, employer, expected_day, reminder_time, is_active, created_at, updated_at';

const RECORD_COLUMNS =
  'id, config_id, period_key, amount_minor, status, transaction_id, note, created_at, updated_at';

function mapConfigRow(row: SalaryConfigRow): SalaryConfig {
  return {
    id: row.id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    accountId: row.account_id,
    employer: row.employer,
    expectedDay: row.expected_day,
    reminderTime: row.reminder_time,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRecordRow(row: SalaryRecordRow): SalaryRecord {
  return {
    id: row.id,
    configId: row.config_id,
    periodKey: row.period_key,
    amountMinor: row.amount_minor,
    status: row.status as SalaryRecordStatus,
    transactionId: row.transaction_id,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface NormalizedConfig {
  amountMinor: number;
  currency: string;
  accountId: string;
  employer: string | null;
  expectedDay: number;
  reminderTime: string | null;
}

/** Shared config validation. Pure — throws on invalid input. */
function normalizeConfigInput(input: SalaryConfigInput): NormalizedConfig {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('amountMinor must be a positive integer (minor units)');
  }
  if (!input.currency) {
    throw new Error('currency is required');
  }
  if (!input.accountId) {
    throw new Error('accountId is required');
  }
  if (
    !Number.isSafeInteger(input.expectedDay) ||
    input.expectedDay < 1 ||
    input.expectedDay > 28
  ) {
    throw new Error('expectedDay must be an integer between 1 and 28');
  }
  const reminderTime = input.reminderTime ?? null;
  if (reminderTime !== null && !REMINDER_TIME_PATTERN.test(reminderTime)) {
    throw new Error("reminderTime must be 'HH:mm' (24h)");
  }
  const employer = input.employer?.trim() ? input.employer.trim() : null;
  return {
    amountMinor: input.amountMinor,
    currency: input.currency,
    accountId: input.accountId,
    employer,
    expectedDay: input.expectedDay,
    reminderTime,
  };
}

interface NormalizedRecord {
  configId: string;
  periodKey: string;
  amountMinor: number;
  status: SalaryRecordStatus;
  transactionId: string | null;
  note: string | null;
}

/** Shared record validation. Pure — throws on invalid input. */
function normalizeRecordInput(input: SalaryRecordInput): NormalizedRecord {
  if (!input.configId) {
    throw new Error('configId is required');
  }
  if (!PERIOD_KEY_PATTERN.test(input.periodKey)) {
    throw new Error("periodKey must be 'YYYY-MM'");
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('amountMinor must be a positive integer (minor units)');
  }
  if (!RECORD_STATUSES.includes(input.status)) {
    throw new Error('status must be credited, partial, bonus or delayed');
  }
  return {
    configId: input.configId,
    periodKey: input.periodKey,
    amountMinor: input.amountMinor,
    status: input.status,
    transactionId: input.transactionId ?? null,
    note: input.note?.trim() ? input.note.trim() : null,
  };
}

/** True for SQLite UNIQUE-constraint errors (real db and test fake). */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /unique/i.test(error.message);
}

export function createSalaryRepository(db: SqlDb) {
  async function getConfigById(id: string): Promise<SalaryConfig | null> {
    const row = await queryFirst<SalaryConfigRow>(
      db,
      `SELECT ${CONFIG_COLUMNS} FROM salary_configs WHERE id = ?`,
      [id],
    );
    return row ? mapConfigRow(row) : null;
  }

  async function getRecordById(id: string): Promise<SalaryRecord | null> {
    const row = await queryFirst<SalaryRecordRow>(
      db,
      `SELECT ${RECORD_COLUMNS} FROM salary_records WHERE id = ?`,
      [id],
    );
    return row ? mapRecordRow(row) : null;
  }

  /** The single active config, or null when salary tracking is not set up. */
  async function getActiveConfig(): Promise<SalaryConfig | null> {
    const row = await queryFirst<SalaryConfigRow>(
      db,
      `SELECT ${CONFIG_COLUMNS} FROM salary_configs
       WHERE is_active = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
      [1],
    );
    return row ? mapConfigRow(row) : null;
  }

  async function getRecordForPeriod(
    configId: string,
    periodKey: string,
  ): Promise<SalaryRecord | null> {
    const row = await queryFirst<SalaryRecordRow>(
      db,
      `SELECT ${RECORD_COLUMNS} FROM salary_records
       WHERE config_id = ? AND period_key = ?`,
      [configId, periodKey],
    );
    return row ? mapRecordRow(row) : null;
  }

  return {
    getActiveConfig,

    getConfigById,

    /**
     * Upserts the one active config: updates the existing active row when
     * present, inserts a new active row otherwise.
     */
    async saveConfig(input: SalaryConfigInput): Promise<SalaryConfig> {
      const config = normalizeConfigInput(input);
      const now = Date.now();
      const existing = await getActiveConfig();
      if (existing) {
        await db.executeAsync(
          `UPDATE salary_configs SET
            amount_minor = ?, currency = ?, account_id = ?, employer = ?,
            expected_day = ?, reminder_time = ?, is_active = ?, updated_at = ?
           WHERE id = ?`,
          [
            config.amountMinor,
            config.currency,
            config.accountId,
            config.employer,
            config.expectedDay,
            config.reminderTime,
            1,
            now,
            existing.id,
          ],
        );
        const updated = await getConfigById(existing.id);
        if (!updated) {
          throw new Error(
            `Salary config not found after update: ${existing.id}`,
          );
        }
        return updated;
      }
      const id = newId();
      await db.executeAsync(
        `INSERT INTO salary_configs
          (id, amount_minor, currency, account_id, employer, expected_day,
           reminder_time, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          config.amountMinor,
          config.currency,
          config.accountId,
          config.employer,
          config.expectedDay,
          config.reminderTime,
          1,
          now,
          now,
        ],
      );
      const created = await getConfigById(id);
      if (!created) {
        throw new Error(`Salary config not found after create: ${id}`);
      }
      return created;
    },

    getRecordForPeriod,

    /**
     * Inserts one month's outcome. UNIQUE(config_id, period_key) prevents
     * duplicates; a repeat surfaces as ALREADY_RECORDED_MESSAGE instead of a
     * raw constraint error. Upgrading a delayed record goes through
     * updateRecord (see confirmSalary).
     */
    async createRecord(input: SalaryRecordInput): Promise<SalaryRecord> {
      const record = normalizeRecordInput(input);
      const duplicate = await getRecordForPeriod(
        record.configId,
        record.periodKey,
      );
      if (duplicate) {
        throw new Error(ALREADY_RECORDED_MESSAGE);
      }
      const id = newId();
      const now = Date.now();
      try {
        await db.executeAsync(
          `INSERT INTO salary_records
            (id, config_id, period_key, amount_minor, status, transaction_id,
             note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            record.configId,
            record.periodKey,
            record.amountMinor,
            record.status,
            record.transactionId,
            record.note,
            now,
            now,
          ],
        );
      } catch (error) {
        // Backstop for a raced insert hitting UNIQUE(config_id, period_key).
        if (isUniqueViolation(error)) {
          throw new Error(ALREADY_RECORDED_MESSAGE);
        }
        throw error;
      }
      const created = await getRecordById(id);
      if (!created) {
        throw new Error(`Salary record not found after create: ${id}`);
      }
      return created;
    },

    /** Patches a record (e.g. a delayed record being marked credited). */
    async updateRecord(
      id: string,
      patch: UpdateSalaryRecordInput,
    ): Promise<SalaryRecord> {
      const existing = await getRecordById(id);
      if (!existing) {
        throw new Error(`Salary record not found: ${id}`);
      }
      const record = normalizeRecordInput({
        configId: existing.configId,
        periodKey: existing.periodKey,
        amountMinor: patch.amountMinor ?? existing.amountMinor,
        status: patch.status ?? existing.status,
        transactionId:
          patch.transactionId !== undefined
            ? patch.transactionId
            : existing.transactionId,
        note: patch.note !== undefined ? patch.note : existing.note,
      });
      await db.executeAsync(
        `UPDATE salary_records SET
          amount_minor = ?, status = ?, transaction_id = ?, note = ?, updated_at = ?
         WHERE id = ?`,
        [
          record.amountMinor,
          record.status,
          record.transactionId,
          record.note,
          Date.now(),
          id,
        ],
      );
      const updated = await getRecordById(id);
      if (!updated) {
        throw new Error(`Salary record not found after update: ${id}`);
      }
      return updated;
    },

    getRecordById,

    /** All records for a config, newest period first. */
    async listRecords(configId: string): Promise<SalaryRecord[]> {
      const rows = await queryRows<SalaryRecordRow>(
        db,
        `SELECT ${RECORD_COLUMNS} FROM salary_records
         WHERE config_id = ?
         ORDER BY period_key DESC`,
        [configId],
      );
      return rows.map(mapRecordRow);
    },
  };
}

export type SalaryRepository = ReturnType<typeof createSalaryRepository>;

let instance: SalaryRepository | null = null;

/** Lazy singleton over the default connection (mirrors database/repositories). */
export function getSalaryRepository(): SalaryRepository {
  if (!instance) {
    instance = createSalaryRepository(getDb());
  }
  return instance;
}

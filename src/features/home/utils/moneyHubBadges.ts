import {queryFirst, queryRows} from '../../../database/connection/helpers';
import type {SqlDb} from '../../../database/connection/types';
import {dayjs} from '../../../utils/date';
import type {Dayjs} from '../../../utils/date';
import {salaryStateFor} from '../../salary/utils/salaryState';
import type {SalaryConfig, SalaryRecord} from '../../salary/types/salary';

/** Attention counts shown on the Home money-hub tiles. */
export interface MoneyHubBadges {
  /** Open ledger entries (any person) past their expected return date. */
  overdueLedgerCount: number;
  /** Salary configured, expected day passed, this month still unconfirmed. */
  salaryUnconfirmed: boolean;
}

export const NO_BADGES: MoneyHubBadges = {
  overdueLedgerCount: 0,
  salaryUnconfirmed: false,
};

/**
 * Pure: the Salary tile begs attention when the configured expected day has
 * passed and the current month has no confirmed record yet. Reuses the salary
 * feature's own state rule — 'delayed' (no record, or a delayed record past
 * the expected day) is exactly "unconfirmed past expected day".
 */
export function isSalaryUnconfirmed(
  config: Pick<SalaryConfig, 'expectedDay'> | null,
  record: Pick<SalaryRecord, 'status'> | null,
  today: Dayjs | number | Date,
): boolean {
  if (!config) {
    return false;
  }
  return salaryStateFor(config, record, today) === 'delayed';
}

/**
 * Count of open ledger entries past their expected return date — the same
 * rule as PeopleRepository.listOverdueEntries, kept cheap for the Home tile.
 * (A plain filtered id scan, not COUNT(*): the test fakeDb has no aggregate
 * support, and the open-entry set is tiny either way.)
 */
export async function countOverdueLedgerEntries(
  db: SqlDb,
  todayStart: number,
): Promise<number> {
  const rows = await queryRows<{id: string}>(
    db,
    `SELECT id FROM ledger_entries
     WHERE deleted_at IS NULL AND status != 'completed'
       AND expected_return_at IS NOT NULL AND expected_return_at < ?`,
    [todayStart],
  );
  return rows.length;
}

interface ActiveSalaryConfigRow {
  id: string;
  expected_day: number;
}

/**
 * Read-only badge data for the money hub: a filtered count on ledger_entries
 * plus a two-row salary lookup. Throws on DB failure — the caller decides
 * whether to hide the badges.
 */
export async function getMoneyHubBadges(
  db: SqlDb,
  now: number,
): Promise<MoneyHubBadges> {
  const today = dayjs(now);
  const overdueLedgerCount = await countOverdueLedgerEntries(
    db,
    today.startOf('day').valueOf(),
  );

  const configRow = await queryFirst<ActiveSalaryConfigRow>(
    db,
    `SELECT id, expected_day FROM salary_configs
     WHERE is_active = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    [1],
  );
  let record: Pick<SalaryRecord, 'status'> | null = null;
  if (configRow) {
    record = await queryFirst<Pick<SalaryRecord, 'status'>>(
      db,
      `SELECT status FROM salary_records
       WHERE config_id = ? AND period_key = ?`,
      [configRow.id, today.format('YYYY-MM')],
    );
  }

  return {
    overdueLedgerCount,
    salaryUnconfirmed: isSalaryUnconfirmed(
      configRow ? {expectedDay: configRow.expected_day} : null,
      record,
      today,
    ),
  };
}

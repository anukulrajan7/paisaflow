import {MIGRATIONS, runMigrations} from '../../../../database/migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData} from '../../../../database/seeds';
import {createFakeDb} from '../../../../database/__tests__/fakeDb';
import type {FakeDb} from '../../../../database/__tests__/fakeDb';
import {dayjs} from '../../../../utils/date';
import {
  countOverdueLedgerEntries,
  getMoneyHubBadges,
  isSalaryUnconfirmed,
} from '../moneyHubBadges';

const BANK = DEFAULT_ACCOUNT_IDS.bank;
// Fixed "now": mid-month, so expected-day rules are easy to reason about.
const NOW = dayjs('2025-06-15T12:00:00').valueOf();
const TODAY_START = dayjs(NOW).startOf('day').valueOf();
const YESTERDAY = dayjs('2025-06-14T10:00:00').valueOf();
const TOMORROW = dayjs('2025-06-16T10:00:00').valueOf();

describe('isSalaryUnconfirmed (pure)', () => {
  it('is false without an active config or before the expected day', () => {
    expect(isSalaryUnconfirmed(null, null, NOW)).toBe(false);
    expect(
      isSalaryUnconfirmed({expectedDay: 20}, null, NOW),
    ).toBe(false);
  });

  it('is true past the expected day with no record or a delayed record', () => {
    expect(isSalaryUnconfirmed({expectedDay: 10}, null, NOW)).toBe(true);
    expect(
      isSalaryUnconfirmed({expectedDay: 10}, {status: 'delayed'}, NOW),
    ).toBe(true);
  });

  it('is false once the month is confirmed (credited, partial or bonus)', () => {
    expect(
      isSalaryUnconfirmed({expectedDay: 10}, {status: 'credited'}, NOW),
    ).toBe(false);
    expect(
      isSalaryUnconfirmed({expectedDay: 10}, {status: 'partial'}, NOW),
    ).toBe(false);
    expect(
      isSalaryUnconfirmed({expectedDay: 10}, {status: 'bonus'}, NOW),
    ).toBe(false);
  });
});

describe('money hub badge queries (fakeDb)', () => {
  let db: FakeDb;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
  });

  async function insertPerson(id: string) {
    await db.executeAsync(
      `INSERT INTO people (id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
      [id, 'Ravi', NOW, NOW],
    );
  }

  async function insertLedgerEntry(
    id: string,
    overrides: {
      status?: string;
      expectedReturnAt?: number | null;
      deletedAt?: number | null;
    } = {},
  ) {
    const status = overrides.status ?? 'pending';
    const expectedReturnAt =
      overrides.expectedReturnAt === undefined
        ? YESTERDAY
        : overrides.expectedReturnAt;
    const deletedAt = overrides.deletedAt ?? null;
    await db.executeAsync(
      `INSERT INTO ledger_entries
        (id, person_id, direction, amount_minor, currency, account_id,
         person_account_id, occurred_at, expected_return_at, status,
         repaid_minor, reminder_enabled, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        'person-1',
        'lent',
        100_000,
        'INR',
        BANK,
        BANK,
        NOW,
        expectedReturnAt,
        status,
        0,
        0,
        NOW,
        NOW,
        deletedAt,
      ],
    );
  }

  async function insertSalaryConfig(expectedDay: number) {
    await db.executeAsync(
      `INSERT INTO salary_configs
        (id, amount_minor, currency, account_id, expected_day, is_active,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['config-1', 500_000, 'INR', BANK, expectedDay, 1, NOW, NOW],
    );
  }

  async function insertSalaryRecord(status: string, periodKey = '2025-06') {
    await db.executeAsync(
      `INSERT INTO salary_records
        (id, config_id, period_key, amount_minor, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['record-1', 'config-1', periodKey, 500_000, status, NOW, NOW],
    );
  }

  it('counts only open entries whose expected return passed today', async () => {
    await insertPerson('person-1');
    expect(await countOverdueLedgerEntries(db, TODAY_START)).toBe(0);

    await insertLedgerEntry('entry-overdue');
    await insertLedgerEntry('entry-due-today', {expectedReturnAt: TODAY_START});
    await insertLedgerEntry('entry-future', {expectedReturnAt: TOMORROW});
    await insertLedgerEntry('entry-completed', {status: 'completed'});
    await insertLedgerEntry('entry-no-date', {expectedReturnAt: null});
    await insertLedgerEntry('entry-deleted', {deletedAt: NOW});

    expect(await countOverdueLedgerEntries(db, TODAY_START)).toBe(1);
  });

  it('reports no badges on a fresh install', async () => {
    expect(await getMoneyHubBadges(db, NOW)).toEqual({
      overdueLedgerCount: 0,
      salaryUnconfirmed: false,
    });
  });

  it('flags an unconfirmed salary only past the expected day', async () => {
    await insertSalaryConfig(20); // not yet due on the 15th
    expect((await getMoneyHubBadges(db, NOW)).salaryUnconfirmed).toBe(false);

    await db.executeAsync(
      'UPDATE salary_configs SET expected_day = ? WHERE id = ?',
      [10, 'config-1'],
    );
    expect((await getMoneyHubBadges(db, NOW)).salaryUnconfirmed).toBe(true);

    // A confirmed record for the current period clears the badge…
    await insertSalaryRecord('credited');
    expect((await getMoneyHubBadges(db, NOW)).salaryUnconfirmed).toBe(false);
  });

  it('keeps the badge for a delayed record in the current period', async () => {
    await insertSalaryConfig(10);
    await insertSalaryRecord('delayed');
    expect((await getMoneyHubBadges(db, NOW)).salaryUnconfirmed).toBe(true);
  });

  it('combines ledger and salary badges', async () => {
    await insertPerson('person-1');
    await insertLedgerEntry('entry-overdue');
    await insertSalaryConfig(10);

    expect(await getMoneyHubBadges(db, NOW)).toEqual({
      overdueLedgerCount: 1,
      salaryUnconfirmed: true,
    });
  });
});

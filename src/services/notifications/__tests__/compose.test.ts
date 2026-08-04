import {MIGRATIONS, runMigrations} from '../../../database/migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData} from '../../../database/seeds';
import {createSettingsRepository} from '../../../database/repositories/settingsRepository';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import type {FakeDb} from '../../../database/__tests__/fakeDb';
import {contributionPeriodKey} from '../../../features/savings/utils/savingsGoalMath';
import {
  composeReminderBody,
  REMINDER_INCLUDE_KEYS,
} from '../compose';
import {EVENING_REMINDER_COPY, MORNING_REMINDER_COPY} from '../constants';

// Fixed local 'now': Tuesday 4 Aug 2026, 09:00 — day-of-month 4, period 2026-08.
const NOW = new Date(2026, 7, 4, 9, 0, 0);
const TODAY_START = new Date(2026, 7, 4).getTime();
const TODAY_NOON = new Date(2026, 7, 4, 15, 0, 0).getTime();
const YESTERDAY_NOON = new Date(2026, 7, 3, 12, 0, 0).getTime();
const TOMORROW_NOON = new Date(2026, 7, 5, 12, 0, 0).getTime();
const PERIOD_KEY = '2026-08';

async function insertPerson(db: FakeDb, id: string, name: string): Promise<void> {
  await db.executeAsync(
    'INSERT INTO people (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [id, name, TODAY_START, TODAY_START],
  );
}

interface LedgerFixture {
  id: string;
  personId?: string;
  direction?: string;
  amountMinor?: number;
  repaidMinor?: number;
  expectedReturnAt?: number | null;
  status?: string;
  reminderEnabled?: number;
  updatedAt?: number;
}

async function insertLedgerEntry(
  db: FakeDb,
  fixture: LedgerFixture,
): Promise<void> {
  await db.executeAsync(
    `INSERT INTO ledger_entries
       (id, person_id, direction, amount_minor, currency, account_id, person_account_id,
        occurred_at, expected_return_at, status, repaid_minor, reminder_enabled,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fixture.id,
      fixture.personId ?? 'p1',
      fixture.direction ?? 'lent',
      fixture.amountMinor ?? 200_000,
      'INR',
      DEFAULT_ACCOUNT_IDS.bank,
      'person_acc_1',
      TODAY_START,
      fixture.expectedReturnAt ?? TODAY_NOON,
      fixture.status ?? 'pending',
      fixture.repaidMinor ?? 0,
      fixture.reminderEnabled ?? 1,
      TODAY_START,
      fixture.updatedAt ?? TODAY_START,
      null,
    ],
  );
}

interface SalaryFixture {
  id: string;
  expectedDay?: number;
  amountMinor?: number;
  employer?: string | null;
  isActive?: number;
}

async function insertSalaryConfig(
  db: FakeDb,
  fixture: SalaryFixture,
): Promise<void> {
  await db.executeAsync(
    `INSERT INTO salary_configs
       (id, amount_minor, currency, account_id, employer, expected_day, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fixture.id,
      fixture.amountMinor ?? 5_000_000,
      'INR',
      DEFAULT_ACCOUNT_IDS.bank,
      fixture.employer ?? null,
      fixture.expectedDay ?? 4,
      fixture.isActive ?? 1,
      TODAY_START,
      TODAY_START,
    ],
  );
}

async function insertSalaryRecord(
  db: FakeDb,
  configId: string,
  periodKey: string = PERIOD_KEY,
): Promise<void> {
  await db.executeAsync(
    `INSERT INTO salary_records
       (id, config_id, period_key, amount_minor, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [`rec_${configId}`, configId, periodKey, 5_000_000, 'confirmed', TODAY_START, TODAY_START],
  );
}

interface InvestmentFixture {
  id: string;
  name?: string;
  reminderDay?: number | null;
  monthlyContributionMinor?: number | null;
  isActive?: number;
}

async function insertInvestment(
  db: FakeDb,
  fixture: InvestmentFixture,
): Promise<void> {
  await db.executeAsync(
    `INSERT INTO investments
       (id, name, type, holding_account_id, invested_minor, current_value_minor,
        started_at, monthly_contribution_minor, reminder_day, is_active,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fixture.id,
      fixture.name ?? 'Index fund',
      'mutual_fund',
      'inv_acc_1',
      0,
      0,
      TODAY_START,
      fixture.monthlyContributionMinor === undefined
        ? 500_000
        : fixture.monthlyContributionMinor,
      fixture.reminderDay === undefined ? 4 : fixture.reminderDay,
      fixture.isActive ?? 1,
      TODAY_START,
      TODAY_START,
      null,
    ],
  );
}

interface GoalFixture {
  id: string;
  name?: string;
  reminderSlot?: string | null;
  contributionMinor?: number | null;
  frequency?: string | null;
  isActive?: number;
}

async function insertSavingsGoal(db: FakeDb, fixture: GoalFixture): Promise<void> {
  await db.executeAsync(
    `INSERT INTO savings_goals
       (id, name, target_minor, saved_minor, currency, savings_account_id,
        contribution_amount_minor, contribution_frequency, reminder_slot, is_active,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fixture.id,
      fixture.name ?? 'Goa trip',
      1_000_000,
      0,
      'INR',
      'sav_acc_1',
      fixture.contributionMinor === undefined ? 200_000 : fixture.contributionMinor,
      fixture.frequency === undefined ? 'monthly' : fixture.frequency,
      fixture.reminderSlot === undefined ? 'morning' : fixture.reminderSlot,
      fixture.isActive ?? 1,
      TODAY_START,
      TODAY_START,
    ],
  );
}

async function insertSavingsContribution(
  db: FakeDb,
  goalId: string,
  periodKey: string = PERIOD_KEY,
): Promise<void> {
  await db.executeAsync(
    `INSERT INTO savings_contributions (id, goal_id, period_key, amount_minor, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [`sc_${goalId}_${periodKey}`, goalId, periodKey, 200_000, TODAY_START],
  );
}

async function insertExpense(
  db: FakeDb,
  id: string,
  amountMinor: number,
  occurredAt: number,
): Promise<void> {
  await db.executeAsync(
    `INSERT INTO transactions
       (id, type, amount_minor, currency, account_id, occurred_at, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      'expense',
      amountMinor,
      'INR',
      DEFAULT_ACCOUNT_IDS.bank,
      occurredAt,
      occurredAt,
      occurredAt,
      null,
    ],
  );
}

describe('composeReminderBody', () => {
  let db: FakeDb;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
  });

  describe('fallbacks', () => {
    it('falls back to the static morning copy on an empty database', async () => {
      const content = await composeReminderBody('morning', db, NOW);
      expect(content.title).toBe(MORNING_REMINDER_COPY.title);
      expect(content.body).toBe(MORNING_REMINDER_COPY.body);
      expect(content.screen).toBe('Home');
    });

    it('falls back to the static evening copy on an empty database', async () => {
      const content = await composeReminderBody('evening', db, NOW);
      expect(content.title).toBe(EVENING_REMINDER_COPY.title);
      expect(content.body).toBe(EVENING_REMINDER_COPY.body);
      expect(content.screen).toBe('AddTransaction');
    });

    it('does not throw when the Phase 9 tables are missing', async () => {
      const partialDb = createFakeDb();
      await runMigrations(partialDb, MIGRATIONS.slice(0, 3));
      await seedDefaultData(partialDb);

      const morning = await composeReminderBody('morning', partialDb, NOW);
      expect(morning.body).toBe(MORNING_REMINDER_COPY.body);
      const evening = await composeReminderBody('evening', partialDb, NOW);
      expect(evening.body).toBe(EVENING_REMINDER_COPY.body);
    });
  });

  describe('morning — ledger', () => {
    it('mentions money expected back today with the person and amount', async () => {
      await insertPerson(db, 'p1', 'Rahul');
      await insertLedgerEntry(db, {id: 'le1'});

      const content = await composeReminderBody('morning', db, NOW);
      expect(content.body).toContain('Good morning.');
      expect(content.body).toContain('₹2,000');
      expect(content.body).toContain('Rahul');
      expect(content.body).toContain('today');
      expect(content.screen).toBe('People');
    });

    it('includes overdue entries even when their reminder is off', async () => {
      await insertPerson(db, 'p1', 'Rahul');
      await insertLedgerEntry(db, {
        id: 'le1',
        expectedReturnAt: YESTERDAY_NOON,
        reminderEnabled: 0,
      });

      const content = await composeReminderBody('morning', db, NOW);
      expect(content.body).toContain('1 overdue payment');
      expect(content.screen).toBe('People');
    });

    it('excludes completed entries and entries due in the future', async () => {
      await insertPerson(db, 'p1', 'Rahul');
      await insertLedgerEntry(db, {id: 'le1', status: 'completed'});
      await insertLedgerEntry(db, {id: 'le2', expectedReturnAt: TOMORROW_NOON});

      const content = await composeReminderBody('morning', db, NOW);
      expect(content.body).toBe(MORNING_REMINDER_COPY.body);
      expect(content.screen).toBe('Home');
    });
  });

  describe('morning — salary, investments, savings', () => {
    it('mentions salary expected today when unconfirmed', async () => {
      await insertSalaryConfig(db, {id: 'sc1', employer: 'Acme'});

      const content = await composeReminderBody('morning', db, NOW);
      expect(content.body).toContain('₹50,000');
      expect(content.body).toContain('Acme');
      expect(content.screen).toBe('Salary');
    });

    it('skips salary once a record exists for the period', async () => {
      await insertSalaryConfig(db, {id: 'sc1'});
      await insertSalaryRecord(db, 'sc1');

      const content = await composeReminderBody('morning', db, NOW);
      expect(content.body).toBe(MORNING_REMINDER_COPY.body);
    });

    it('skips salary configs expected on another day', async () => {
      await insertSalaryConfig(db, {id: 'sc1', expectedDay: 10});

      const content = await composeReminderBody('morning', db, NOW);
      expect(content.body).toBe(MORNING_REMINDER_COPY.body);
    });

    it('mentions an investment contribution due today', async () => {
      await insertInvestment(db, {id: 'inv1'});

      const content = await composeReminderBody('morning', db, NOW);
      expect(content.body).toContain('₹5,000 monthly investment');
      expect(content.screen).toBe('Investments');
    });

    it('skips inactive investments and other reminder days', async () => {
      await insertInvestment(db, {id: 'inv1', isActive: 0});
      await insertInvestment(db, {id: 'inv2', reminderDay: 20});

      const content = await composeReminderBody('morning', db, NOW);
      expect(content.body).toBe(MORNING_REMINDER_COPY.body);
    });

    it('mentions a morning savings goal without a contribution this period', async () => {
      await insertSavingsGoal(db, {id: 'g1'});

      const content = await composeReminderBody('morning', db, NOW);
      expect(content.body).toContain('₹2,000');
      expect(content.body).toContain('Goa trip');
      expect(content.screen).toBe('SavingsGoals');
    });

    it('skips goals already contributed or slotted for the evening', async () => {
      await insertSavingsGoal(db, {id: 'g1'});
      await insertSavingsContribution(db, 'g1');
      await insertSavingsGoal(db, {id: 'g2', name: 'Bike', reminderSlot: 'evening'});

      const content = await composeReminderBody('morning', db, NOW);
      expect(content.body).toBe(MORNING_REMINDER_COPY.body);
    });

    it('buckets weekly goals by their ISO week, not the calendar month', async () => {
      await insertSavingsGoal(db, {id: 'g1', frequency: 'weekly'});
      // A contribution logged under the monthly key must NOT satisfy a
      // weekly goal; the ISO-week key must.
      await insertSavingsContribution(db, 'g1', PERIOD_KEY);

      let content = await composeReminderBody('morning', db, NOW);
      expect(content.body).toContain('Goa trip');

      await insertSavingsContribution(
        db,
        'g1',
        contributionPeriodKey('weekly', NOW.getTime()),
      );
      content = await composeReminderBody('morning', db, NOW);
      expect(content.body).toBe(MORNING_REMINDER_COPY.body);
    });
  });

  describe('evening', () => {
    it("summarizes today's spending", async () => {
      await insertExpense(db, 't1', 100_000, TODAY_START + 1000);
      await insertExpense(db, 't2', 24_000, TODAY_NOON);
      // Yesterday's spend must not count.
      await insertExpense(db, 't3', 999_900, YESTERDAY_NOON);

      const content = await composeReminderBody('evening', db, NOW);
      expect(content.body).toContain('Good evening.');
      expect(content.body).toContain('You spent ₹1,240 today');
      expect(content.screen).toBe('AddTransaction');
    });

    it('mentions repayments recorded today', async () => {
      await insertPerson(db, 'p1', 'Rahul');
      await insertLedgerEntry(db, {
        id: 'le1',
        repaidMinor: 100_000,
        updatedAt: TODAY_NOON,
        expectedReturnAt: TOMORROW_NOON,
      });

      const content = await composeReminderBody('evening', db, NOW);
      expect(content.body).toContain('Rahul repaid ₹1,000 today');
      expect(content.screen).toBe('People');
    });

    it('flags a salary still unconfirmed after its expected day', async () => {
      await insertSalaryConfig(db, {id: 'sc1', expectedDay: 2});

      const content = await composeReminderBody('evening', db, NOW);
      expect(content.body).toContain('still unconfirmed');
      expect(content.screen).toBe('Salary');
    });

    it('mentions evening-slotted savings goals', async () => {
      await insertSavingsGoal(db, {id: 'g1', reminderSlot: 'evening'});

      const content = await composeReminderBody('evening', db, NOW);
      expect(content.body).toContain('Goa trip');
      expect(content.screen).toBe('SavingsGoals');
    });
  });

  describe('include toggles', () => {
    it('drops a category when its raw setting is false', async () => {
      await insertPerson(db, 'p1', 'Rahul');
      await insertLedgerEntry(db, {id: 'le1'});
      await createSettingsRepository(db).setValue(
        REMINDER_INCLUDE_KEYS.lent,
        'false',
      );

      const content = await composeReminderBody('morning', db, NOW);
      expect(content.body).toBe(MORNING_REMINDER_COPY.body);
      expect(content.screen).toBe('Home');
    });

    it('keeps other categories when one is toggled off', async () => {
      await insertSalaryConfig(db, {id: 'sc1'});
      await insertInvestment(db, {id: 'inv1'});
      await createSettingsRepository(db).setValue(
        REMINDER_INCLUDE_KEYS.salary,
        'false',
      );

      const content = await composeReminderBody('morning', db, NOW);
      expect(content.body).not.toContain('salary');
      expect(content.body).toContain('₹5,000 monthly investment');
      expect(content.screen).toBe('Investments');
    });

    it('falls back when every category is toggled off', async () => {
      await insertExpense(db, 't1', 100_000, TODAY_NOON);
      const settings = createSettingsRepository(db);
      for (const key of Object.values(REMINDER_INCLUDE_KEYS)) {
        await settings.setValue(key, 'false');
      }

      const content = await composeReminderBody('evening', db, NOW);
      expect(content.body).toBe(EVENING_REMINDER_COPY.body);
    });
  });

  describe('copy shape', () => {
    it('keeps a fully loaded morning body short and capped at 3 sentences', async () => {
      await insertPerson(db, 'p1', 'Rahul');
      await insertLedgerEntry(db, {id: 'le1'});
      await insertSalaryConfig(db, {id: 'sc1'});
      await insertInvestment(db, {id: 'inv1'});
      await insertSavingsGoal(db, {id: 'g1'});

      const content = await composeReminderBody('morning', db, NOW);
      expect(content.body.startsWith('Good morning.')).toBe(true);
      expect(content.body.length).toBeLessThan(200);
      // At most three sentences after the greeting.
      const sentences = content.body.split('. ').filter(Boolean);
      expect(sentences.length).toBeLessThanOrEqual(4); // greeting + 3
      // First contributing section wins the deep link.
      expect(content.screen).toBe('People');
    });
  });
});

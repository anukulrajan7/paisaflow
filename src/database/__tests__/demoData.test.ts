import {MIGRATIONS, runMigrations} from '../migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData} from '../seeds';
import {
  DEMO_ID_PREFIX,
  isDemoDataLoaded,
  removeDemoData,
  seedDemoData,
} from '../seeds/devData';
import {createFakeDb} from './fakeDb';
import type {FakeDb} from './fakeDb';

async function bootedDb(): Promise<FakeDb> {
  const db = createFakeDb();
  await runMigrations(db, MIGRATIONS);
  await seedDefaultData(db);
  return db;
}

const DEMO_TABLES = [
  'accounts',
  'transactions',
  'recurring_rules',
  'salary_configs',
  'salary_records',
  'investments',
  'investment_contributions',
  'savings_goals',
  'savings_contributions',
  'people',
  'ledger_entries',
  'detected_expenses',
] as const;

function demoRows(db: FakeDb, table: string) {
  return db
    .getRows(table)
    .filter(row => String(row.id).startsWith(DEMO_ID_PREFIX));
}

describe('demo data seed', () => {
  it('loads every case, reports loaded, and sets the marker', async () => {
    const db = await bootedDb();
    const result = await seedDemoData(db);
    expect(result).toBe('loaded');
    expect(await isDemoDataLoaded(db)).toBe(true);

    // Months of varied transactions across accounts + a transfer.
    const txs = demoRows(db, 'transactions');
    expect(txs.length).toBeGreaterThan(20);
    expect(txs.some(row => row.type === 'income')).toBe(true);
    expect(txs.some(row => row.type === 'expense')).toBe(true);
    const accountsUsed = new Set(txs.map(row => row.account_id));
    expect(accountsUsed.size).toBeGreaterThanOrEqual(3);
    expect(
      txs.some(
        row =>
          row.type === 'transfer' &&
          row.account_id === DEFAULT_ACCOUNT_IDS.bank &&
          row.destination_account_id === DEFAULT_ACCOUNT_IDS.cash,
      ),
    ).toBe(true);

    // Recurring rules: rent due soon, credit-card bill overdue by 3 days.
    const rules = demoRows(db, 'recurring_rules');
    expect(rules).toHaveLength(2);
    const rent = rules.find(row => row.id === 'demo-recurring-rent');
    const ccBill = rules.find(row => row.id === 'demo-recurring-cc-bill');
    expect(rent?.type).toBe('expense');
    expect((rent?.next_due_at as number) > Date.now()).toBe(true);
    expect(ccBill?.type).toBe('transfer');
    expect(ccBill?.destination_account_id).toBe(
      DEFAULT_ACCOUNT_IDS.creditCard,
    );
    const overdueDays =
      (Date.now() - (ccBill?.next_due_at as number)) / (24 * 60 * 60 * 1000);
    expect(overdueDays).toBeGreaterThan(2.5);
    expect(overdueDays).toBeLessThan(3.5);

    // Salary: config + one credited + one partial record.
    expect(demoRows(db, 'salary_configs')).toHaveLength(1);
    const records = demoRows(db, 'salary_records');
    expect(records.map(row => row.status).sort()).toEqual([
      'credited',
      'partial',
    ]);

    // Investments: one gain, one loss, one contribution.
    const investments = demoRows(db, 'investments');
    expect(investments).toHaveLength(2);
    const gain = investments.find(row => row.id === 'demo-inv-axis');
    const loss = investments.find(row => row.id === 'demo-inv-stocks');
    expect(
      (gain?.current_value_minor as number) > (gain?.invested_minor as number),
    ).toBe(true);
    expect(
      (loss?.current_value_minor as number) < (loss?.invested_minor as number),
    ).toBe(true);
    expect(demoRows(db, 'investment_contributions')).toHaveLength(1);

    // Savings goal at 60% with a contribution this period.
    const goals = demoRows(db, 'savings_goals');
    expect(goals).toHaveLength(1);
    expect(
      (goals[0].saved_minor as number) / (goals[0].target_minor as number),
    ).toBe(0.6);
    const contribs = demoRows(db, 'savings_contributions');
    expect(contribs).toHaveLength(1);

    // People: partially repaid lent entry OVERDUE, borrowed entry pending.
    expect(demoRows(db, 'people')).toHaveLength(2);
    const entries = demoRows(db, 'ledger_entries');
    expect(entries).toHaveLength(2);
    const lent = entries.find(row => row.id === 'demo-ledger-rahul-lent');
    const borrowed = entries.find(
      row => row.id === 'demo-ledger-priya-borrowed',
    );
    expect(lent?.direction).toBe('lent');
    expect(lent?.status).toBe('partial');
    expect(lent?.repaid_minor).toBeGreaterThan(0);
    expect((lent?.expected_return_at as number) < Date.now()).toBe(true);
    expect(borrowed?.direction).toBe('borrowed');
    expect(borrowed?.status).toBe('pending');

    // Detected expenses pending review.
    const detected = demoRows(db, 'detected_expenses');
    expect(detected).toHaveLength(2);
    expect(detected.every(row => row.status === 'pending')).toBe(true);

    // Virtual accounts exist but stay archived (out of pickers).
    const demoAccounts = demoRows(db, 'accounts');
    expect(demoAccounts).toHaveLength(4);
    expect(demoAccounts.every(row => row.is_archived === 1)).toBe(true);
  });

  it('is idempotent: a second load is a no-op', async () => {
    const db = await bootedDb();
    await seedDemoData(db);
    const countsBefore = DEMO_TABLES.map(
      table => [table, db.getRows(table).length] as const,
    );

    const result = await seedDemoData(db);
    expect(result).toBe('already-loaded');
    for (const [table, count] of countsBefore) {
      expect(db.getRows(table)).toHaveLength(count);
    }
  });
});

describe('removeDemoData', () => {
  it('deletes only demo rows and the marker, keeping real user data', async () => {
    const db = await bootedDb();
    await seedDemoData(db);

    // Real user data created after the demo was loaded.
    const now = Date.now();
    await db.executeAsync(
      `INSERT INTO transactions
        (id, type, amount_minor, currency, account_id, destination_account_id,
         category_id, merchant, note, payment_method, occurred_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'real-tx-1',
        'expense',
        12_345,
        'INR',
        DEFAULT_ACCOUNT_IDS.cash,
        null,
        'cat_food',
        'My real lunch',
        null,
        'cash',
        now,
        now,
        now,
        null,
      ],
    );
    await db.executeAsync(
      `INSERT INTO people
        (id, name, phone, contact_ref, notes, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['real-person-1', 'Real Friend', null, null, null, now, now, null],
    );
    // A repayment the user recorded against a DEMO ledger entry: random id,
    // identifiable only via the [ledger:demo-...] note marker.
    await db.executeAsync(
      `INSERT INTO transactions
        (id, type, amount_minor, currency, account_id, destination_account_id,
         category_id, merchant, note, payment_method, occurred_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'real-repayment-xyz',
        'transfer',
        50_000,
        'INR',
        'demo-acc-person-rahul',
        DEFAULT_ACCOUNT_IDS.bank,
        null,
        'Rahul Verma',
        '[ledger:demo-ledger-rahul-lent] Repayment received from Rahul Verma',
        null,
        now,
        now,
        now,
        null,
      ],
    );

    const result = await removeDemoData(db);
    expect(result).toBe('removed');
    expect(await isDemoDataLoaded(db)).toBe(false);

    // No demo rows remain anywhere.
    for (const table of DEMO_TABLES) {
      expect(demoRows(db, table)).toHaveLength(0);
    }
    // The user-recorded repayment against a demo entry is gone too.
    expect(
      db.getRows('transactions').some(row => row.id === 'real-repayment-xyz'),
    ).toBe(false);

    // Real data is untouched.
    expect(
      db.getRows('transactions').some(row => row.id === 'real-tx-1'),
    ).toBe(true);
    expect(db.getRows('people').some(row => row.id === 'real-person-1')).toBe(
      true,
    );
    // Default accounts/categories survive.
    expect(db.getRows('accounts')).toHaveLength(4);
    expect(db.getRows('categories')).toHaveLength(18);
  });

  it('reports not-loaded when no demo data exists and touches nothing', async () => {
    const db = await bootedDb();
    const txCount = db.getRows('transactions').length;

    const result = await removeDemoData(db);
    expect(result).toBe('not-loaded');
    expect(db.getRows('transactions')).toHaveLength(txCount);
    expect(db.getRows('accounts')).toHaveLength(4);
  });

  it('supports a load -> remove -> load cycle', async () => {
    const db = await bootedDb();
    expect(await seedDemoData(db)).toBe('loaded');
    expect(await removeDemoData(db)).toBe('removed');
    expect(await seedDemoData(db)).toBe('loaded');
    expect(demoRows(db, 'ledger_entries')).toHaveLength(2);
  });
});

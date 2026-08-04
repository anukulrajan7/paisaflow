import {dayjs} from '../../utils/date';
import type {SqlDb} from '../connection/types';
import {queryFirst} from '../connection/helpers';
import {DEFAULT_ACCOUNT_IDS, SYSTEM_CATEGORY_IDS} from './defaultData';

/**
 * DEV-only sample data. This module exists so developers can populate the
 * app with realistic transactions/budgets during development.
 *
 * - `DEV_SEED_ENABLED` is the compile-time guard: release builds must never
 *   ship fake transactions (see AGENTS.md).
 * - `seedDevSampleData` is NEVER called from the production bootstrap path;
 *   invoke it explicitly (e.g. from a hidden dev menu action).
 *
 * The second half of this module is the user-triggered DEMO dataset
 * (`seedDemoData` / `removeDemoData` / `isDemoDataLoaded`), which is NOT
 * `__DEV__`-gated: it powers Settings -> Data -> "Load demo data" so release
 * builds can be explored with realistic sample records, and removed again
 * without touching real user data (see DEMO_ID_PREFIX below).
 */
export const DEV_SEED_ENABLED = __DEV__;

const DEV_SEED_MARKER_KEY = 'dev_seed_v1';

interface SampleEntry {
  dayOffset: number; // days after month start
  type: 'expense' | 'income';
  categoryId: string;
  amountMinor: number;
  merchant: string | null;
  accountId: string;
}

const MONTH_TEMPLATE: SampleEntry[] = [
  {dayOffset: 0, type: 'income', categoryId: SYSTEM_CATEGORY_IDS.salary, amountMinor: 8_500_000, merchant: 'Acme Corp', accountId: DEFAULT_ACCOUNT_IDS.bank},
  {dayOffset: 1, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.rent, amountMinor: 2_200_000, merchant: 'Greenview Apartments', accountId: DEFAULT_ACCOUNT_IDS.bank},
  {dayOffset: 2, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.groceries, amountMinor: 185_050, merchant: 'Fresh Mart', accountId: DEFAULT_ACCOUNT_IDS.upiWallet},
  {dayOffset: 3, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.food, amountMinor: 42_000, merchant: 'Chai Point', accountId: DEFAULT_ACCOUNT_IDS.cash},
  {dayOffset: 4, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.transport, amountMinor: 28_000, merchant: 'Metro Card Recharge', accountId: DEFAULT_ACCOUNT_IDS.upiWallet},
  {dayOffset: 5, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.food, amountMinor: 65_000, merchant: 'Domino\'s', accountId: DEFAULT_ACCOUNT_IDS.upiWallet},
  {dayOffset: 6, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.bills, amountMinor: 119_900, merchant: 'Electricity Board', accountId: DEFAULT_ACCOUNT_IDS.bank},
  {dayOffset: 7, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.entertainment, amountMinor: 49_900, merchant: 'Cinepolis', accountId: DEFAULT_ACCOUNT_IDS.creditCard},
  {dayOffset: 8, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.food, amountMinor: 38_000, merchant: 'Udipi Cafe', accountId: DEFAULT_ACCOUNT_IDS.cash},
  {dayOffset: 9, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.groceries, amountMinor: 240_000, merchant: 'BigBasket', accountId: DEFAULT_ACCOUNT_IDS.upiWallet},
  {dayOffset: 10, type: 'income', categoryId: SYSTEM_CATEGORY_IDS.freelance, amountMinor: 1_500_000, merchant: 'Design Gig', accountId: DEFAULT_ACCOUNT_IDS.bank},
  {dayOffset: 11, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.shopping, amountMinor: 199_900, merchant: 'Amazon', accountId: DEFAULT_ACCOUNT_IDS.creditCard},
  {dayOffset: 12, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.food, amountMinor: 54_000, merchant: 'Swiggy', accountId: DEFAULT_ACCOUNT_IDS.upiWallet},
  {dayOffset: 13, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.health, amountMinor: 85_000, merchant: 'Apollo Pharmacy', accountId: DEFAULT_ACCOUNT_IDS.cash},
  {dayOffset: 14, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.transport, amountMinor: 31_000, merchant: 'Uber', accountId: DEFAULT_ACCOUNT_IDS.upiWallet},
  {dayOffset: 15, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.food, amountMinor: 72_000, merchant: 'Zomato', accountId: DEFAULT_ACCOUNT_IDS.upiWallet},
  {dayOffset: 16, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.education, amountMinor: 129_900, merchant: 'Udemy', accountId: DEFAULT_ACCOUNT_IDS.creditCard},
  {dayOffset: 17, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.family, amountMinor: 150_000, merchant: 'Gift for Amma', accountId: DEFAULT_ACCOUNT_IDS.cash},
  {dayOffset: 18, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.food, amountMinor: 44_000, merchant: 'Chai Point', accountId: DEFAULT_ACCOUNT_IDS.cash},
  {dayOffset: 19, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.travel, amountMinor: 340_000, merchant: 'IRCTC', accountId: DEFAULT_ACCOUNT_IDS.creditCard},
  {dayOffset: 20, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.groceries, amountMinor: 165_000, merchant: 'Fresh Mart', accountId: DEFAULT_ACCOUNT_IDS.upiWallet},
  {dayOffset: 21, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.food, amountMinor: 58_000, merchant: 'Domino\'s', accountId: DEFAULT_ACCOUNT_IDS.creditCard},
  {dayOffset: 22, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.bills, amountMinor: 99_900, merchant: 'Jio Fiber', accountId: DEFAULT_ACCOUNT_IDS.bank},
  {dayOffset: 23, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.entertainment, amountMinor: 19_900, merchant: 'Spotify', accountId: DEFAULT_ACCOUNT_IDS.upiWallet},
  {dayOffset: 24, type: 'expense', categoryId: SYSTEM_CATEGORY_IDS.other, amountMinor: 25_000, merchant: null, accountId: DEFAULT_ACCOUNT_IDS.cash},
];

/** Round up to the nearest ₹1,000 (100_000 minor). */
function roundUpToThousand(minor: number): number {
  return Math.ceil(minor / 100_000) * 100_000;
}

/**
 * Seeds ~3 months of sample transactions plus two budgets for the current
 * month: an overall budget sitting near its limit and a Food budget that is
 * exceeded. Idempotent via an app_settings marker. No-op outside __DEV__.
 */
export async function seedDevSampleData(db: SqlDb): Promise<void> {
  if (!__DEV__) {
    return;
  }
  // NOTE: the demo dataset (seedDemoData) is deliberately NOT pulled in
  // here — its extra month-to-date spend would break the budget calibration
  // below. Load it explicitly via Settings -> Data -> "Load demo data".
  const existing = await queryFirst<{value: string}>(
    db,
    'SELECT value FROM app_settings WHERE key = ?',
    [DEV_SEED_MARKER_KEY],
  );
  if (existing) {
    return;
  }

  const now = Date.now();
  const thisMonthStart = dayjs().startOf('month');
  let txIndex = 0;
  let currentMonthExpenseMinor = 0;
  let currentMonthFoodMinor = 0;

  await db.transaction(async tx => {
    for (let monthsBack = 2; monthsBack >= 0; monthsBack--) {
      const monthStart = thisMonthStart.subtract(monthsBack, 'month');
      const isCurrentMonth = monthsBack === 0;
      for (const entry of MONTH_TEMPLATE) {
        const occurred = monthStart.add(entry.dayOffset, 'day').add(12, 'hour');
        // Keep the current month strictly "month to date".
        if (occurred.valueOf() > now) {
          continue;
        }
        const id = `dev_tx_${txIndex}`;
        txIndex += 1;
        await tx.executeAsync(
          `INSERT OR IGNORE INTO transactions
            (id, type, amount_minor, currency, account_id, destination_account_id,
             category_id, merchant, note, payment_method, occurred_at, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            entry.type,
            entry.amountMinor,
            'INR',
            entry.accountId,
            null,
            entry.categoryId,
            entry.merchant,
            null,
            entry.accountId === DEFAULT_ACCOUNT_IDS.cash ? 'cash' : 'upi',
            occurred.valueOf(),
            occurred.valueOf(),
            occurred.valueOf(),
            null,
          ],
        );
        if (isCurrentMonth && entry.type === 'expense') {
          currentMonthExpenseMinor += entry.amountMinor;
          if (entry.categoryId === SYSTEM_CATEGORY_IDS.food) {
            currentMonthFoodMinor += entry.amountMinor;
          }
        }
      }
    }

    // Guaranteed month-to-date expenses, so the budgets below behave the
    // same no matter which day of the month the seed runs.
    const recentAt = dayjs().subtract(1, 'hour').valueOf();
    const todaysEntries: Array<{
      id: string;
      categoryId: string;
      amountMinor: number;
      merchant: string;
    }> = [
      {id: 'dev_tx_today_food', categoryId: SYSTEM_CATEGORY_IDS.food, amountMinor: 55_000, merchant: 'Swiggy'},
      {id: 'dev_tx_today_groceries', categoryId: SYSTEM_CATEGORY_IDS.groceries, amountMinor: 30_000, merchant: 'Fresh Mart'},
    ];
    for (const entry of todaysEntries) {
      await tx.executeAsync(
        `INSERT OR IGNORE INTO transactions
          (id, type, amount_minor, currency, account_id, destination_account_id,
           category_id, merchant, note, payment_method, occurred_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          'expense',
          entry.amountMinor,
          'INR',
          DEFAULT_ACCOUNT_IDS.upiWallet,
          null,
          entry.categoryId,
          entry.merchant,
          null,
          'upi',
          recentAt,
          recentAt,
          recentAt,
          null,
        ],
      );
      currentMonthExpenseMinor += entry.amountMinor;
      if (entry.categoryId === SYSTEM_CATEGORY_IDS.food) {
        currentMonthFoodMinor += entry.amountMinor;
      }
    }

    // One transfer: bank -> cash, mid current month.
    const transferAt = Math.min(
      thisMonthStart.add(12, 'day').add(10, 'hour').valueOf(),
      now,
    );
    await tx.executeAsync(
      `INSERT OR IGNORE INTO transactions
        (id, type, amount_minor, currency, account_id, destination_account_id,
         category_id, merchant, note, payment_method, occurred_at, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'dev_tx_transfer_1',
        'transfer',
        200_000,
        'INR',
        DEFAULT_ACCOUNT_IDS.bank,
        DEFAULT_ACCOUNT_IDS.cash,
        null,
        null,
        'ATM withdrawal',
        null,
        transferAt,
        transferAt,
        transferAt,
        null,
      ],
    );

    // Budgets for the current month: overall near limit (~90%), Food exceeded.
    // Limits are derived from the actual seeded month-to-date spend, so the
    // near-limit/exceeded relationship holds on any day of the month.
    const periodStart = thisMonthStart.valueOf();
    const periodEnd = thisMonthStart.add(1, 'month').valueOf();
    const overallLimit = roundUpToThousand(Math.ceil(currentMonthExpenseMinor / 0.9));
    const foodLimit = Math.max(100, Math.floor(currentMonthFoodMinor * 0.8));
    await tx.executeAsync(
      `INSERT OR IGNORE INTO budgets
        (id, category_id, limit_minor, currency, period_start, period_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['dev_budget_overall', null, overallLimit, 'INR', periodStart, periodEnd, now, now],
    );
    await tx.executeAsync(
      `INSERT OR IGNORE INTO budgets
        (id, category_id, limit_minor, currency, period_start, period_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['dev_budget_food', SYSTEM_CATEGORY_IDS.food, foodLimit, 'INR', periodStart, periodEnd, now, now],
    );

    await tx.executeAsync(
      'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
      [DEV_SEED_MARKER_KEY, '1', now],
    );
  });
}

/* ------------------------------------------------------------------------ */
/* Demo data (user-triggered, works in release builds)                       */
/* ------------------------------------------------------------------------ */

/**
 * Comprehensive demo dataset covering every money-hub case, loadable from
 * Settings -> Data -> "Load demo data" — including in RELEASE builds, so the
 * app can be explored on a real phone without typing records by hand.
 *
 * Tagging / removal strategy: every row created here uses a stable id with
 * the shared `demo-` prefix (DEMO_ID_PREFIX). Demo rows live only in tables
 * where user data never holds a foreign key INTO those ids, so removal is a
 * simple child-before-parent `DELETE ... WHERE id LIKE 'demo-%'` sweep — no
 * per-id manifest in app_settings is needed. The one exception: repayments a
 * user records against a demo ledger entry get random ids, but they always
 * carry the `[ledger:<entryId>]` note marker, so they are caught by a
 * `note LIKE '[ledger:demo-%'` delete. An app_settings marker makes loading
 * idempotent; removal deletes ONLY demo rows plus that marker.
 */
export const DEMO_ID_PREFIX = 'demo-';

const DEMO_SEED_MARKER_KEY = 'demo_seed_v1';

export type DemoSeedResult = 'loaded' | 'already-loaded';
export type DemoRemoveResult = 'removed' | 'not-loaded';

async function hasDemoMarker(db: SqlDb): Promise<boolean> {
  const row = await queryFirst<{value: string}>(
    db,
    'SELECT value FROM app_settings WHERE key = ?',
    [DEMO_SEED_MARKER_KEY],
  );
  return row != null;
}

/** Whether the demo dataset is currently loaded (drives the Settings rows). */
export function isDemoDataLoaded(db: SqlDb): Promise<boolean> {
  return hasDemoMarker(db);
}

/**
 * Loads the demo dataset. Idempotent via the app_settings marker — a second
 * call is a no-op and reports 'already-loaded'. Unlike seedDevSampleData this
 * is NOT guarded by __DEV__: it runs only on explicit user action.
 */
export async function seedDemoData(db: SqlDb): Promise<DemoSeedResult> {
  if (await hasDemoMarker(db)) {
    return 'already-loaded';
  }

  const now = Date.now();
  const thisMonthStart = dayjs().startOf('month');
  const daysAgo = (n: number) => dayjs().subtract(n, 'day').valueOf();
  const thisPeriodKey = dayjs().format('YYYY-MM');
  const prevPeriodKey = dayjs().subtract(1, 'month').format('YYYY-MM');

  await db.transaction(async tx => {
    // -- Virtual accounts (archived: hidden from pickers/lists) ------------
    const virtualAccounts: Array<{id: string; name: string; type: string}> = [
      {id: 'demo-acc-inv-axis', name: 'Axis Bluechip Index Fund', type: 'investment'},
      {id: 'demo-acc-inv-stocks', name: 'Tata Motors (5 shares)', type: 'investment'},
      {id: 'demo-acc-person-rahul', name: 'Rahul Verma', type: 'person'},
      {id: 'demo-acc-person-priya', name: 'Priya Sharma', type: 'person'},
    ];
    for (const account of virtualAccounts) {
      await tx.executeAsync(
        `INSERT OR IGNORE INTO accounts
          (id, name, type, currency, opening_balance_minor, is_default, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [account.id, account.name, account.type, 'INR', 0, 0, 1, now, now],
      );
    }

    // -- Transactions: ~3 months of varied income/expense + a transfer ------
    let txIndex = 0;
    for (let monthsBack = 2; monthsBack >= 0; monthsBack--) {
      const monthStart = thisMonthStart.subtract(monthsBack, 'month');
      for (const entry of MONTH_TEMPLATE) {
        const occurred = monthStart.add(entry.dayOffset, 'day').add(12, 'hour');
        if (occurred.valueOf() > now) {
          continue; // keep the current month strictly month-to-date
        }
        const id = `demo-tx-m${monthsBack}-${txIndex}`;
        txIndex += 1;
        await tx.executeAsync(
          `INSERT OR IGNORE INTO transactions
            (id, type, amount_minor, currency, account_id, destination_account_id,
             category_id, merchant, note, payment_method, occurred_at, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            entry.type,
            entry.amountMinor,
            'INR',
            entry.accountId,
            null,
            entry.categoryId,
            entry.merchant,
            null,
            entry.accountId === DEFAULT_ACCOUNT_IDS.cash ? 'cash' : 'upi',
            occurred.valueOf(),
            occurred.valueOf(),
            occurred.valueOf(),
            null,
          ],
        );
      }
    }

    const insertTransaction = async (
      id: string,
      type: 'expense' | 'income' | 'transfer',
      amountMinor: number,
      accountId: string,
      destinationAccountId: string | null,
      categoryId: string | null,
      merchant: string | null,
      note: string | null,
      occurredAt: number,
    ) => {
      await tx.executeAsync(
        `INSERT OR IGNORE INTO transactions
          (id, type, amount_minor, currency, account_id, destination_account_id,
           category_id, merchant, note, payment_method, occurred_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          type,
          amountMinor,
          'INR',
          accountId,
          destinationAccountId,
          categoryId,
          merchant,
          note,
          null,
          occurredAt,
          occurredAt,
          occurredAt,
          null,
        ],
      );
    };

    // One plain transfer: bank -> cash.
    const transferAt = Math.min(
      thisMonthStart.add(12, 'day').add(10, 'hour').valueOf(),
      now,
    );
    await insertTransaction(
      'demo-tx-transfer',
      'transfer',
      200_000,
      DEFAULT_ACCOUNT_IDS.bank,
      DEFAULT_ACCOUNT_IDS.cash,
      null,
      null,
      'ATM withdrawal',
      transferAt,
    );

    // Salary-backed income transactions (linked from salary_records below).
    const salaryCreditedAt = Math.min(
      thisMonthStart.add(1, 'day').add(9, 'hour').valueOf(),
      now,
    );
    await insertTransaction(
      'demo-tx-salary-credited',
      'income',
      8_500_000,
      DEFAULT_ACCOUNT_IDS.bank,
      null,
      SYSTEM_CATEGORY_IDS.salary,
      'Acme Corp',
      'Salary',
      salaryCreditedAt,
    );
    const salaryPartialAt = thisMonthStart
      .subtract(1, 'month')
      .add(1, 'day')
      .add(9, 'hour')
      .valueOf();
    await insertTransaction(
      'demo-tx-salary-partial',
      'income',
      5_000_000,
      DEFAULT_ACCOUNT_IDS.bank,
      null,
      SYSTEM_CATEGORY_IDS.salary,
      'Acme Corp',
      'Salary — notice period payout',
      salaryPartialAt,
    );

    // Investment contribution transfer: bank -> virtual holding account.
    await insertTransaction(
      'demo-tx-inv-contrib',
      'transfer',
      100_000,
      DEFAULT_ACCOUNT_IDS.bank,
      'demo-acc-inv-axis',
      null,
      null,
      'SIP — Axis Bluechip Index Fund',
      daysAgo(10),
    );

    // Ledger transfers (lent out, partial repayment received, borrowed).
    await insertTransaction(
      'demo-tx-ledger-rahul',
      'transfer',
      300_000,
      DEFAULT_ACCOUNT_IDS.bank,
      'demo-acc-person-rahul',
      null,
      'Rahul Verma',
      'Lent to Rahul Verma — For his bike repair',
      daysAgo(20),
    );
    await insertTransaction(
      'demo-tx-ledger-rahul-repay',
      'transfer',
      100_000,
      'demo-acc-person-rahul',
      DEFAULT_ACCOUNT_IDS.bank,
      null,
      'Rahul Verma',
      '[ledger:demo-ledger-rahul-lent] Repayment received from Rahul Verma',
      daysAgo(6),
    );
    await insertTransaction(
      'demo-tx-ledger-priya',
      'transfer',
      150_000,
      'demo-acc-person-priya',
      DEFAULT_ACCOUNT_IDS.bank,
      null,
      'Priya Sharma',
      'Borrowed from Priya Sharma',
      daysAgo(5),
    );

    // -- Recurring rules: rent due soon, credit-card bill overdue -----------
    await tx.executeAsync(
      `INSERT OR IGNORE INTO recurring_rules
        (id, type, amount_minor, currency, account_id, destination_account_id,
         category_id, merchant, note, payment_method, frequency, interval_count,
         next_due_at, last_confirmed_at, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'demo-recurring-rent',
        'expense',
        2_200_000,
        'INR',
        DEFAULT_ACCOUNT_IDS.bank,
        null,
        SYSTEM_CATEGORY_IDS.rent,
        'Greenview Apartments',
        null,
        null,
        'monthly',
        1,
        dayjs().add(2, 'day').valueOf(),
        null,
        1,
        now,
        now,
      ],
    );
    await tx.executeAsync(
      `INSERT OR IGNORE INTO recurring_rules
        (id, type, amount_minor, currency, account_id, destination_account_id,
         category_id, merchant, note, payment_method, frequency, interval_count,
         next_due_at, last_confirmed_at, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'demo-recurring-cc-bill',
        'transfer',
        450_000,
        'INR',
        DEFAULT_ACCOUNT_IDS.bank,
        DEFAULT_ACCOUNT_IDS.creditCard,
        null,
        null,
        'Credit card bill',
        null,
        'monthly',
        1,
        daysAgo(3), // overdue by 3 days
        null,
        1,
        now,
        now,
      ],
    );

    // -- Salary: one config, one credited record, one partial record ---------
    await tx.executeAsync(
      `INSERT OR IGNORE INTO salary_configs
        (id, amount_minor, currency, account_id, employer, expected_day,
         reminder_time, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'demo-salary-config',
        8_500_000,
        'INR',
        DEFAULT_ACCOUNT_IDS.bank,
        'Acme Corp',
        1,
        null,
        1,
        now,
        now,
      ],
    );
    await tx.executeAsync(
      `INSERT OR IGNORE INTO salary_records
        (id, config_id, period_key, amount_minor, status, transaction_id, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'demo-salary-rec-current',
        'demo-salary-config',
        thisPeriodKey,
        8_500_000,
        'credited',
        'demo-tx-salary-credited',
        null,
        now,
        now,
      ],
    );
    await tx.executeAsync(
      `INSERT OR IGNORE INTO salary_records
        (id, config_id, period_key, amount_minor, status, transaction_id, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'demo-salary-rec-prev',
        'demo-salary-config',
        prevPeriodKey,
        5_000_000,
        'partial',
        'demo-tx-salary-partial',
        'Notice period payout',
        now,
        now,
      ],
    );

    // -- Investments: one with a gain, one with a loss, one contribution -----
    await tx.executeAsync(
      `INSERT OR IGNORE INTO investments
        (id, name, type, holding_account_id, invested_minor, current_value_minor,
         started_at, maturity_at, monthly_contribution_minor, reminder_day,
         notes, is_active, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'demo-inv-axis',
        'Axis Bluechip Index Fund',
        'mutual_fund',
        'demo-acc-inv-axis',
        5_000_000,
        5_600_000, // +12% gain
        dayjs().subtract(6, 'month').valueOf(),
        null,
        100_000,
        5,
        null,
        1,
        now,
        now,
        null,
      ],
    );
    await tx.executeAsync(
      `INSERT OR IGNORE INTO investment_contributions
        (id, investment_id, amount_minor, transaction_id, occurred_at, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        'demo-inv-contrib-1',
        'demo-inv-axis',
        100_000,
        'demo-tx-inv-contrib',
        daysAgo(10),
        'SIP',
        now,
      ],
    );
    await tx.executeAsync(
      `INSERT OR IGNORE INTO investments
        (id, name, type, holding_account_id, invested_minor, current_value_minor,
         started_at, maturity_at, monthly_contribution_minor, reminder_day,
         notes, is_active, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'demo-inv-stocks',
        'Tata Motors (5 shares)',
        'stocks',
        'demo-acc-inv-stocks',
        2_000_000,
        1_700_000, // -15% loss
        dayjs().subtract(3, 'month').valueOf(),
        null,
        null,
        null,
        null,
        1,
        now,
        now,
        null,
      ],
    );

    // -- Savings goal at 60% with a contribution in the current period -------
    await tx.executeAsync(
      `INSERT OR IGNORE INTO savings_goals
        (id, name, target_minor, saved_minor, currency, target_date,
         savings_account_id, contribution_amount_minor, contribution_frequency,
         reminder_slot, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'demo-goal-goa',
        'Goa trip',
        1_000_000,
        600_000, // 60% funded
        'INR',
        dayjs().add(4, 'month').valueOf(),
        DEFAULT_ACCOUNT_IDS.bank,
        100_000,
        'monthly',
        null,
        1,
        now,
        now,
      ],
    );
    await tx.executeAsync(
      `INSERT OR IGNORE INTO savings_contributions
        (id, goal_id, period_key, amount_minor, transaction_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `demo-goal-contrib-${thisPeriodKey}`,
        'demo-goal-goa',
        thisPeriodKey,
        100_000,
        null,
        now,
      ],
    );

    // -- People + ledger: overdue partially-repaid lent, pending borrowed ----
    await tx.executeAsync(
      `INSERT OR IGNORE INTO people
        (id, name, phone, contact_ref, notes, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['demo-person-rahul', 'Rahul Verma', null, null, 'Demo person', now, now, null],
    );
    await tx.executeAsync(
      `INSERT OR IGNORE INTO people
        (id, name, phone, contact_ref, notes, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['demo-person-priya', 'Priya Sharma', null, null, 'Demo person', now, now, null],
    );
    await tx.executeAsync(
      `INSERT OR IGNORE INTO ledger_entries
        (id, person_id, direction, amount_minor, currency, account_id,
         person_account_id, transaction_id, occurred_at, expected_return_at,
         notes, status, repaid_minor, reminder_enabled, reminder_slot,
         created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'demo-ledger-rahul-lent',
        'demo-person-rahul',
        'lent',
        300_000,
        'INR',
        DEFAULT_ACCOUNT_IDS.bank,
        'demo-acc-person-rahul',
        'demo-tx-ledger-rahul',
        daysAgo(20),
        daysAgo(4), // overdue
        'For his bike repair',
        'partial',
        100_000,
        1,
        'morning',
        now,
        now,
        null,
      ],
    );
    await tx.executeAsync(
      `INSERT OR IGNORE INTO ledger_entries
        (id, person_id, direction, amount_minor, currency, account_id,
         person_account_id, transaction_id, occurred_at, expected_return_at,
         notes, status, repaid_minor, reminder_enabled, reminder_slot,
         created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'demo-ledger-priya-borrowed',
        'demo-person-priya',
        'borrowed',
        150_000,
        'INR',
        DEFAULT_ACCOUNT_IDS.bank,
        'demo-acc-person-priya',
        'demo-tx-ledger-priya',
        daysAgo(5),
        dayjs().add(10, 'day').valueOf(),
        null,
        'pending',
        0,
        0,
        null,
        now,
        now,
        null,
      ],
    );

    // -- Detected expenses awaiting review -----------------------------------
    await tx.executeAsync(
      `INSERT OR IGNORE INTO detected_expenses
        (id, source, raw_body, parsed_json, amount_minor, direction, merchant,
         account_hint, occurred_at, category_id, dedupe_hash, status,
         transaction_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'demo-detected-swiggy',
        'sms',
        'INR 349.00 spent on Card XX1234 at SWIGGY',
        '{"amountMinor":34900,"merchant":"Swiggy","direction":"debit"}',
        34_900,
        'debit',
        'Swiggy',
        'XX1234',
        daysAgo(1),
        SYSTEM_CATEGORY_IDS.food,
        'demo-dedupe-swiggy',
        'pending',
        null,
        now,
        now,
      ],
    );
    await tx.executeAsync(
      `INSERT OR IGNORE INTO detected_expenses
        (id, source, raw_body, parsed_json, amount_minor, direction, merchant,
         account_hint, occurred_at, category_id, dedupe_hash, status,
         transaction_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'demo-detected-uber',
        'sms',
        'INR 287.00 spent on Card XX1234 at UBER',
        '{"amountMinor":28700,"merchant":"Uber","direction":"debit"}',
        28_700,
        'debit',
        'Uber',
        'XX1234',
        daysAgo(2),
        SYSTEM_CATEGORY_IDS.transport,
        'demo-dedupe-uber',
        'pending',
        null,
        now,
        now,
      ],
    );

    await tx.executeAsync(
      'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
      [DEMO_SEED_MARKER_KEY, '1', now],
    );
  });

  return 'loaded';
}

/** Tables holding demo rows, ordered child-before-parent for FK safety. */
const DEMO_TABLES = [
  'detected_expenses',
  'salary_records',
  'investment_contributions',
  'savings_contributions',
  'ledger_entries',
  'salary_configs',
  'investments',
  'savings_goals',
  'recurring_rules',
  'people',
  'transactions',
  'accounts',
] as const;

/**
 * Removes ONLY the demo rows (ids prefixed `demo-`, plus user-recorded
 * repayments against demo ledger entries, identifiable via their
 * `[ledger:demo-...]` note marker) and clears the marker. Real user data —
 * including rows created after the demo was loaded — is never touched.
 */
export async function removeDemoData(db: SqlDb): Promise<DemoRemoveResult> {
  if (!(await hasDemoMarker(db))) {
    return 'not-loaded';
  }
  await db.transaction(async tx => {
    // Repayments the user recorded against demo ledger entries have random
    // ids; the repayment note marker is the only way to find them.
    await tx.executeAsync(
      `DELETE FROM transactions WHERE note LIKE ? ESCAPE '\\'`,
      [`[ledger:${DEMO_ID_PREFIX}%`],
    );
    for (const table of DEMO_TABLES) {
      await tx.executeAsync(
        `DELETE FROM ${table} WHERE id LIKE ? ESCAPE '\\'`,
        [`${DEMO_ID_PREFIX}%`],
      );
    }
    await tx.executeAsync('DELETE FROM app_settings WHERE key = ?', [
      DEMO_SEED_MARKER_KEY,
    ]);
  });
  return 'removed';
}

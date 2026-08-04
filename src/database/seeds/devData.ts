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

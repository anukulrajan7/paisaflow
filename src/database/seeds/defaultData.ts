import {CATEGORY_COLORS} from '../../design-system/tokens/colors';
import type {AccountType, CategoryType} from '../types';
import type {SqlDb} from '../connection/types';

/**
 * Stable ids for seeded rows. Fixed slugs make the seeds idempotent via
 * INSERT OR IGNORE and give DEV seeds/tests well-known references.
 */
export const DEFAULT_ACCOUNT_IDS = {
  cash: 'acc_cash',
  bank: 'acc_bank',
  creditCard: 'acc_credit_card',
  upiWallet: 'acc_upi_wallet',
} as const;

const DEFAULT_ACCOUNTS: Array<{
  id: string;
  name: string;
  type: AccountType;
  isDefault: boolean;
}> = [
  {id: DEFAULT_ACCOUNT_IDS.cash, name: 'Cash', type: 'cash', isDefault: true},
  {id: DEFAULT_ACCOUNT_IDS.bank, name: 'Bank Account', type: 'bank', isDefault: false},
  {id: DEFAULT_ACCOUNT_IDS.creditCard, name: 'Credit Card', type: 'credit_card', isDefault: false},
  {id: DEFAULT_ACCOUNT_IDS.upiWallet, name: 'UPI Wallet', type: 'upi_wallet', isDefault: false},
];

export const SYSTEM_CATEGORY_IDS = {
  food: 'cat_food',
  groceries: 'cat_groceries',
  transport: 'cat_transport',
  shopping: 'cat_shopping',
  bills: 'cat_bills',
  rent: 'cat_rent',
  health: 'cat_health',
  entertainment: 'cat_entertainment',
  education: 'cat_education',
  travel: 'cat_travel',
  family: 'cat_family',
  other: 'cat_other',
  salary: 'cat_salary',
  freelance: 'cat_freelance',
  business: 'cat_business',
  refund: 'cat_refund',
  gift: 'cat_gift',
  otherIncome: 'cat_other_income',
} as const;

const SYSTEM_CATEGORIES: Array<{
  id: string;
  name: string;
  type: CategoryType;
  /** lucide icon name */
  icon: string;
}> = [
  {id: SYSTEM_CATEGORY_IDS.food, name: 'Food', type: 'expense', icon: 'UtensilsCrossed'},
  {id: SYSTEM_CATEGORY_IDS.groceries, name: 'Groceries', type: 'expense', icon: 'ShoppingBasket'},
  {id: SYSTEM_CATEGORY_IDS.transport, name: 'Transport', type: 'expense', icon: 'Car'},
  {id: SYSTEM_CATEGORY_IDS.shopping, name: 'Shopping', type: 'expense', icon: 'ShoppingBag'},
  {id: SYSTEM_CATEGORY_IDS.bills, name: 'Bills', type: 'expense', icon: 'Receipt'},
  {id: SYSTEM_CATEGORY_IDS.rent, name: 'Rent', type: 'expense', icon: 'House'},
  {id: SYSTEM_CATEGORY_IDS.health, name: 'Health', type: 'expense', icon: 'HeartPulse'},
  {id: SYSTEM_CATEGORY_IDS.entertainment, name: 'Entertainment', type: 'expense', icon: 'Clapperboard'},
  {id: SYSTEM_CATEGORY_IDS.education, name: 'Education', type: 'expense', icon: 'GraduationCap'},
  {id: SYSTEM_CATEGORY_IDS.travel, name: 'Travel', type: 'expense', icon: 'Plane'},
  {id: SYSTEM_CATEGORY_IDS.family, name: 'Family', type: 'expense', icon: 'Users'},
  {id: SYSTEM_CATEGORY_IDS.other, name: 'Other', type: 'expense', icon: 'Shapes'},
  {id: SYSTEM_CATEGORY_IDS.salary, name: 'Salary', type: 'income', icon: 'Briefcase'},
  {id: SYSTEM_CATEGORY_IDS.freelance, name: 'Freelance', type: 'income', icon: 'Laptop'},
  {id: SYSTEM_CATEGORY_IDS.business, name: 'Business', type: 'income', icon: 'Store'},
  {id: SYSTEM_CATEGORY_IDS.refund, name: 'Refund', type: 'income', icon: 'Undo2'},
  {id: SYSTEM_CATEGORY_IDS.gift, name: 'Gift', type: 'income', icon: 'Gift'},
  {id: SYSTEM_CATEGORY_IDS.otherIncome, name: 'Other Income', type: 'income', icon: 'HandCoins'},
];

function categoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

/**
 * Idempotent seed of the default accounts and system categories.
 * Safe to run on every bootstrap — existing rows are left untouched
 * (INSERT OR IGNORE on stable primary keys), including any the user renamed.
 */
export async function seedDefaultData(db: SqlDb): Promise<void> {
  const now = Date.now();
  await db.transaction(async tx => {
    for (const account of DEFAULT_ACCOUNTS) {
      await tx.executeAsync(
        `INSERT OR IGNORE INTO accounts
          (id, name, type, currency, opening_balance_minor, is_default, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          account.id,
          account.name,
          account.type,
          'INR',
          0,
          account.isDefault ? 1 : 0,
          0,
          now,
          now,
        ],
      );
    }
    for (const [index, category] of SYSTEM_CATEGORIES.entries()) {
      await tx.executeAsync(
        `INSERT OR IGNORE INTO categories
          (id, name, type, icon, color, is_system, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          category.id,
          category.name,
          category.type,
          category.icon,
          categoryColor(index),
          1,
          0,
          now,
          now,
        ],
      );
    }
  });
}

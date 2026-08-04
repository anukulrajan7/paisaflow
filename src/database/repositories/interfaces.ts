import type {
  Account,
  AccountType,
  AiPeriodType,
  AiSummary,
  Budget,
  BudgetUsage,
  Category,
  CategoryTotal,
  CategoryType,
  DailyTotal,
  Period,
  PeriodTotals,
  Transaction,
  TransactionType,
} from '../types';

/**
 * Repository interfaces — the ONLY contract screens/hooks depend on.
 * Framework-free: no SQLite/driver types leak into these signatures.
 * Implementations live next to this file (SQLite, backed by nitro-sqlite).
 */

export interface CreateTransactionInput {
  type: TransactionType;
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
  occurredAt: number;
}

export type UpdateTransactionInput = Partial<CreateTransactionInput>;

export interface TransactionFilters {
  type?: TransactionType;
  categoryId?: string;
  /** Matches the source account (account_id). */
  accountId?: string;
  /** epoch ms, inclusive */
  from?: number;
  /** epoch ms, exclusive */
  to?: number;
  /** Defaults to false (soft-deleted rows hidden). */
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface TransactionsRepository {
  /**
   * Validates input before writing:
   * - amountMinor must be a positive integer (all types)
   * - transfers require destinationAccountId != accountId and ignore categoryId
   * - expense/income ignore destinationAccountId
   */
  createTransaction(input: CreateTransactionInput): Promise<Transaction>;
  updateTransaction(id: string, patch: UpdateTransactionInput): Promise<Transaction>;
  softDeleteTransaction(id: string): Promise<void>;
  restoreTransaction(id: string): Promise<void>;
  getTransactionById(id: string): Promise<Transaction | null>;
  /** Newest first (occurred_at DESC, created_at DESC). */
  listTransactions(filters?: TransactionFilters): Promise<Transaction[]>;
  /** LIKE match on merchant, note, or category name. Caller debounces input. */
  searchTransactions(query: string, limit?: number): Promise<Transaction[]>;
  getRecentTransactions(limit?: number): Promise<Transaction[]>;
  /** One entry per day in [period.start, period.end), transfers excluded. */
  getDailyTotals(period: Period): Promise<DailyTotal[]>;
  /** Transfers and soft-deleted rows excluded. */
  getMonthlyTotals(period: Period): Promise<PeriodTotals>;
  /** Per-category totals for the given type, sorted by totalMinor DESC. */
  getCategoryTotals(period: Period, type: CategoryType): Promise<CategoryTotal[]>;
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  currency: string;
  openingBalanceMinor?: number;
  isDefault?: boolean;
}

export interface UpdateAccountInput {
  name?: string;
  type?: AccountType;
  currency?: string;
  openingBalanceMinor?: number;
  isArchived?: boolean;
}

export interface AccountsRepository {
  createAccount(input: CreateAccountInput): Promise<Account>;
  updateAccount(id: string, patch: UpdateAccountInput): Promise<Account>;
  archiveAccount(id: string, archived?: boolean): Promise<void>;
  getAccountById(id: string): Promise<Account | null>;
  listAccounts(options?: {includeArchived?: boolean}): Promise<Account[]>;
  getDefaultAccount(): Promise<Account | null>;
  /** Atomically clears the previous default and marks `id` as default. */
  setDefaultAccount(id: string): Promise<void>;
  /**
   * Current balance in minor units:
   * opening balance + income − expense − transfers out + transfers in,
   * excluding soft-deleted transactions.
   */
  getAccountBalance(id: string): Promise<number>;
}

export interface CreateCategoryInput {
  name: string;
  type: CategoryType;
  /** lucide icon name */
  icon: string;
  color: string;
}

export interface UpdateCategoryInput {
  name?: string;
  icon?: string;
  color?: string;
  isArchived?: boolean;
}

export interface CategoriesRepository {
  createCategory(input: CreateCategoryInput): Promise<Category>;
  updateCategory(id: string, patch: UpdateCategoryInput): Promise<Category>;
  archiveCategory(id: string, archived?: boolean): Promise<void>;
  getCategoryById(id: string): Promise<Category | null>;
  listCategories(options?: {
    type?: CategoryType;
    includeArchived?: boolean;
  }): Promise<Category[]>;
}

export interface CreateBudgetInput {
  /** Null/omitted = overall budget across all expense categories. */
  categoryId?: string | null;
  limitMinor: number;
  currency: string;
  periodStart: number;
  periodEnd: number;
}

export type UpdateBudgetInput = Partial<CreateBudgetInput>;

export interface BudgetsRepository {
  createBudget(input: CreateBudgetInput): Promise<Budget>;
  updateBudget(id: string, patch: UpdateBudgetInput): Promise<Budget>;
  /** Hard delete — budgets carry no financial history. */
  deleteBudget(id: string): Promise<void>;
  getBudgetById(id: string): Promise<Budget | null>;
  listBudgets(): Promise<Budget[]>;
  /** Budgets whose [periodStart, periodEnd) contains `at` (epoch ms). */
  listBudgetsActiveAt(at: number): Promise<Budget[]>;
  /** Expense spending against the budget's period (+ category if set). */
  getBudgetUsage(budgetId: string): Promise<BudgetUsage>;
}

export interface ReminderSetting {
  enabled: boolean;
  /** 'HH:mm' 24h local time, e.g. '08:30'. */
  time: string;
}

export interface SettingsRepository {
  getValue(key: string): Promise<string | null>;
  setValue(key: string, value: string): Promise<void>;

  getCurrency(): Promise<string>;
  setCurrency(currency: string): Promise<void>;

  getThemePreference(): Promise<'light' | 'dark' | 'system'>;
  setThemePreference(preference: 'light' | 'dark' | 'system'): Promise<void>;

  /** Day of month 1..28 on which the monthly budget cycle starts. */
  getBudgetCycleStartDay(): Promise<number>;
  setBudgetCycleStartDay(day: number): Promise<void>;

  getMorningReminder(): Promise<ReminderSetting>;
  setMorningReminder(setting: ReminderSetting): Promise<void>;
  getEveningReminder(): Promise<ReminderSetting>;
  setEveningReminder(setting: ReminderSetting): Promise<void>;

  isOnboardingComplete(): Promise<boolean>;
  setOnboardingComplete(complete: boolean): Promise<void>;

  getDefaultAccountId(): Promise<string | null>;
  setDefaultAccountId(id: string | null): Promise<void>;

  getAiModel(): Promise<string | null>;
  setAiModel(model: string): Promise<void>;
}

export interface CreateAiSummaryInput {
  periodType: AiPeriodType;
  periodStart: number;
  periodEnd: number;
  inputHash: string;
  model: string;
  summaryJson: string;
}

export interface AiSummariesRepository {
  createSummary(input: CreateAiSummaryInput): Promise<AiSummary>;
  /** Cache lookup by aggregate input hash. */
  findByInputHash(inputHash: string): Promise<AiSummary | null>;
  findLatestForPeriod(
    periodType: AiPeriodType,
    periodStart: number,
    periodEnd: number,
  ): Promise<AiSummary | null>;
}

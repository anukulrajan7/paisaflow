import {getDb} from '../connection/connection';
import {createAccountsRepository} from './accountsRepository';
import {createAiSummariesRepository} from './aiSummariesRepository';
import {createBudgetsRepository} from './budgetsRepository';
import {createCategoriesRepository} from './categoriesRepository';
import {createSettingsRepository} from './settingsRepository';
import {createTransactionsRepository} from './transactionsRepository';
import type {
  AccountsRepository,
  AiSummariesRepository,
  BudgetsRepository,
  CategoriesRepository,
  SettingsRepository,
  TransactionsRepository,
} from './interfaces';

/**
 * Lazy singletons over the default connection, for app code that does not
 * manage its own db handle. Tests construct repositories directly against a
 * fake db instead.
 */
let transactions: TransactionsRepository | null = null;
let accounts: AccountsRepository | null = null;
let categories: CategoriesRepository | null = null;
let budgets: BudgetsRepository | null = null;
let settings: SettingsRepository | null = null;
let aiSummaries: AiSummariesRepository | null = null;

export function getTransactionsRepository(): TransactionsRepository {
  if (!transactions) {
    transactions = createTransactionsRepository(getDb());
  }
  return transactions;
}

export function getAccountsRepository(): AccountsRepository {
  if (!accounts) {
    accounts = createAccountsRepository(getDb());
  }
  return accounts;
}

export function getCategoriesRepository(): CategoriesRepository {
  if (!categories) {
    categories = createCategoriesRepository(getDb());
  }
  return categories;
}

export function getBudgetsRepository(): BudgetsRepository {
  if (!budgets) {
    budgets = createBudgetsRepository(getDb());
  }
  return budgets;
}

export function getSettingsRepository(): SettingsRepository {
  if (!settings) {
    settings = createSettingsRepository(getDb());
  }
  return settings;
}

export function getAiSummariesRepository(): AiSummariesRepository {
  if (!aiSummaries) {
    aiSummaries = createAiSummariesRepository(getDb());
  }
  return aiSummaries;
}

/** Drop cached singletons (e.g. after closeDb in dev/test). */
export function resetRepositories(): void {
  transactions = null;
  accounts = null;
  categories = null;
  budgets = null;
  settings = null;
  aiSummaries = null;
}

export {createTransactionsRepository} from './transactionsRepository';
export {createAccountsRepository} from './accountsRepository';
export {createCategoriesRepository} from './categoriesRepository';
export {createBudgetsRepository} from './budgetsRepository';
export {createSettingsRepository, SETTINGS_KEYS} from './settingsRepository';
export {createAiSummariesRepository} from './aiSummariesRepository';
export type * from './interfaces';

import type {Account, PeriodTotals} from '../../../database/types';
import {isVirtualAccountType} from '../components/accountTypeMeta';

/** Aggregated money position shown at the top of the Accounts screen. */
export interface BalancesSummary {
  /**
   * Spendable money: sum of balances over real (non-virtual), non-archived
   * accounts EXCLUDING credit cards. Negative balances (overdraft) count
   * as-is. Credit-card balances never count as available money.
   */
  totalAvailableMinor: number;
  /**
   * Amount owed on credit cards, as a POSITIVE number: credit-card expenses
   * push the account balance negative, so outstanding is the magnitude of
   * negative balances summed over non-archived credit cards. A credit card
   * with a positive balance (overpayment) contributes 0.
   */
  creditCardOutstandingMinor: number;
  monthIncomeMinor: number;
  monthExpenseMinor: number;
  /** monthIncomeMinor − monthExpenseMinor (negative = overspent). */
  netCashFlowMinor: number;
}

/**
 * Pure aggregation for the Accounts & Balances header. `balances` maps
 * account id → current balance in minor units (from
 * `accountsRepository.getAccountBalance`, the balance contract); a missing
 * entry is treated as 0. `monthTotals` covers the current budget-cycle
 * month and already excludes transfers.
 */
export function computeBalancesSummary(
  accounts: readonly Account[],
  balances: Readonly<Record<string, number>>,
  monthTotals: PeriodTotals,
): BalancesSummary {
  let totalAvailableMinor = 0;
  let creditCardOutstandingMinor = 0;

  for (const account of accounts) {
    if (account.isArchived || isVirtualAccountType(account.type)) {
      continue;
    }
    const balanceMinor = balances[account.id] ?? 0;
    if (account.type === 'credit_card') {
      creditCardOutstandingMinor += Math.max(0, -balanceMinor);
    } else {
      totalAvailableMinor += balanceMinor;
    }
  }

  return {
    totalAvailableMinor,
    creditCardOutstandingMinor,
    monthIncomeMinor: monthTotals.incomeMinor,
    monthExpenseMinor: monthTotals.expenseMinor,
    netCashFlowMinor: monthTotals.incomeMinor - monthTotals.expenseMinor,
  };
}

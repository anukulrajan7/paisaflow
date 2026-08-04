import type {Account, PeriodTotals} from '../../../database/types';
import {computeBalancesSummary} from '../services/balancesSummary';

const makeAccount = (overrides: Partial<Account>): Account => ({
  id: 'acc-1',
  name: 'Account',
  type: 'bank',
  currency: 'INR',
  openingBalanceMinor: 0,
  isDefault: false,
  isArchived: false,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const makeTotals = (
  incomeMinor = 0,
  expenseMinor = 0,
): PeriodTotals => ({incomeMinor, expenseMinor, count: 0});

describe('computeBalancesSummary', () => {
  describe('total available money', () => {
    it('sums cash, bank and wallet balances of active accounts', () => {
      const accounts = [
        makeAccount({id: 'cash', type: 'cash'}),
        makeAccount({id: 'bank', type: 'bank'}),
        makeAccount({id: 'wallet', type: 'upi_wallet'}),
      ];
      const balances = {cash: 100_00, bank: 250_00, wallet: 50_00};

      const summary = computeBalancesSummary(
        accounts,
        balances,
        makeTotals(),
      );

      expect(summary.totalAvailableMinor).toBe(400_00);
    });

    it('counts a negative bank balance (overdraft) as-is', () => {
      const accounts = [makeAccount({id: 'bank', type: 'bank'})];
      const summary = computeBalancesSummary(
        accounts,
        {bank: -120_00},
        makeTotals(),
      );

      expect(summary.totalAvailableMinor).toBe(-120_00);
    });

    it('excludes archived accounts', () => {
      const accounts = [
        makeAccount({id: 'bank', type: 'bank'}),
        makeAccount({id: 'old', type: 'bank', isArchived: true}),
      ];
      const summary = computeBalancesSummary(
        accounts,
        {bank: 100_00, old: 999_00},
        makeTotals(),
      );

      expect(summary.totalAvailableMinor).toBe(100_00);
    });

    it('excludes virtual person and investment accounts', () => {
      const accounts = [
        makeAccount({id: 'bank', type: 'bank'}),
        makeAccount({id: 'person', type: 'person'}),
        makeAccount({id: 'investment', type: 'investment'}),
      ];
      const summary = computeBalancesSummary(
        accounts,
        {bank: 100_00, person: 500_00, investment: 700_00},
        makeTotals(),
      );

      expect(summary.totalAvailableMinor).toBe(100_00);
    });

    it('never counts credit-card balances as available money', () => {
      const accounts = [
        makeAccount({id: 'bank', type: 'bank'}),
        // Positive card balance = overpayment; still not available money.
        makeAccount({id: 'cc', type: 'credit_card'}),
      ];
      const summary = computeBalancesSummary(
        accounts,
        {bank: 100_00, cc: 40_00},
        makeTotals(),
      );

      expect(summary.totalAvailableMinor).toBe(100_00);
      expect(summary.creditCardOutstandingMinor).toBe(0);
    });

    it('treats a missing balance entry as zero', () => {
      const accounts = [makeAccount({id: 'bank', type: 'bank'})];
      const summary = computeBalancesSummary(accounts, {}, makeTotals());

      expect(summary.totalAvailableMinor).toBe(0);
    });
  });

  describe('credit-card outstanding', () => {
    it('reports negative card balances as a positive outstanding amount', () => {
      const accounts = [
        makeAccount({id: 'cc1', type: 'credit_card'}),
        makeAccount({id: 'cc2', type: 'credit_card'}),
      ];
      const summary = computeBalancesSummary(
        accounts,
        {cc1: -300_00, cc2: -150_50},
        makeTotals(),
      );

      expect(summary.creditCardOutstandingMinor).toBe(450_50);
    });

    it('ignores positive card balances', () => {
      const accounts = [
        makeAccount({id: 'cc1', type: 'credit_card'}),
        makeAccount({id: 'cc2', type: 'credit_card'}),
      ];
      const summary = computeBalancesSummary(
        accounts,
        {cc1: -300_00, cc2: 80_00},
        makeTotals(),
      );

      expect(summary.creditCardOutstandingMinor).toBe(300_00);
    });

    it('excludes archived credit cards', () => {
      const accounts = [
        makeAccount({id: 'cc1', type: 'credit_card'}),
        makeAccount({id: 'cc2', type: 'credit_card', isArchived: true}),
      ];
      const summary = computeBalancesSummary(
        accounts,
        {cc1: -300_00, cc2: -900_00},
        makeTotals(),
      );

      expect(summary.creditCardOutstandingMinor).toBe(300_00);
    });
  });

  describe('monthly cash flow', () => {
    it('passes through income and expense and nets them', () => {
      const summary = computeBalancesSummary(
        [],
        {},
        makeTotals(5_000_00, 3_200_00),
      );

      expect(summary.monthIncomeMinor).toBe(5_000_00);
      expect(summary.monthExpenseMinor).toBe(3_200_00);
      expect(summary.netCashFlowMinor).toBe(1_800_00);
    });

    it('reports a negative net cash flow when expenses exceed income', () => {
      const summary = computeBalancesSummary(
        [],
        {},
        makeTotals(1_000_00, 1_400_00),
      );

      expect(summary.netCashFlowMinor).toBe(-400_00);
    });

    it('handles a month with no activity', () => {
      const summary = computeBalancesSummary([], {}, makeTotals());

      expect(summary).toEqual({
        totalAvailableMinor: 0,
        creditCardOutstandingMinor: 0,
        monthIncomeMinor: 0,
        monthExpenseMinor: 0,
        netCashFlowMinor: 0,
      });
    });
  });
});

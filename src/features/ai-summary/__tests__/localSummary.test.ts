import {buildLocalSummary} from '../services/localSummary';
import type {AiAggregatePayload} from '../types';

function makePayload(
  overrides: Partial<AiAggregatePayload> = {},
): AiAggregatePayload {
  return {
    currency: 'INR',
    period: {
      start: '2026-07-01T00:00:00.000Z',
      end: '2026-08-01T00:00:00.000Z',
    },
    incomeMinor: 50000_00,
    expenseMinor: 32000_00,
    budgetMinor: 30000_00,
    previousPeriodExpenseMinor: 25000_00,
    topCategories: [
      {name: 'Food', amountMinor: 16000_00, share: 0.5},
      {name: 'Transport', amountMinor: 8000_00, share: 0.25},
    ],
    dailyTotals: [
      {date: '2026-07-01', incomeMinor: 0, expenseMinor: 1200_00},
      {date: '2026-07-02', incomeMinor: 50000_00, expenseMinor: 800_00},
    ],
    largestTransactions: [
      {amountMinor: 5000_00, merchant: 'Big Bazaar', category: 'Food'},
      {amountMinor: 3000_00, merchant: null, category: 'Transport'},
    ],
    transactionCount: 42,
    ...overrides,
  };
}

describe('buildLocalSummary', () => {
  it('is deterministic for the same payload', () => {
    const payload = makePayload();
    expect(buildLocalSummary(payload)).toEqual(buildLocalSummary(payload));
  });

  it('never invents totals that conflict with the payload', () => {
    const summary = buildLocalSummary(makePayload());
    expect(summary.headline).toContain('₹32,000.00');
    expect(summary.overview).toContain('₹32,000.00');
    expect(summary.overview).toContain('42 transactions');
  });

  it('warns when spending exceeds the budget', () => {
    const summary = buildLocalSummary(makePayload());
    expect(
      summary.warnings.some(w => w.includes('over your ₹30,000.00 budget')),
    ).toBe(true);
  });

  it('warns when spending is well above the previous period', () => {
    const summary = buildLocalSummary(makePayload());
    expect(summary.warnings.some(w => w.includes('higher than last period'))).toBe(
      true,
    );
    expect(summary.comparison).toContain('up about 28%');
  });

  it('suggests setting a budget when none exists', () => {
    const summary = buildLocalSummary(makePayload({budgetMinor: null}));
    expect(summary.suggestions.some(s => s.includes('Set a monthly budget'))).toBe(
      true,
    );
  });

  it('reports no comparison data when previous period is empty', () => {
    const summary = buildLocalSummary(
      makePayload({previousPeriodExpenseMinor: 0}),
    );
    expect(summary.comparison).toContain('No spending data');
  });

  it('reports stable spending when within 20% of the previous period', () => {
    const summary = buildLocalSummary(
      makePayload({
        expenseMinor: 25000_00,
        previousPeriodExpenseMinor: 25000_00,
      }),
    );
    expect(summary.comparison).toContain('about the same');
  });

  it('says data is insufficient when there are no transactions', () => {
    const summary = buildLocalSummary(
      makePayload({
        transactionCount: 0,
        expenseMinor: 0,
        incomeMinor: 0,
        topCategories: [],
        largestTransactions: [],
        dailyTotals: [],
      }),
    );
    expect(summary.headline).toBe('Not enough data yet');
    expect(summary.warnings).toEqual([]);
  });

  it('uses the category name when the merchant is missing', () => {
    const summary = buildLocalSummary(
      makePayload({
        largestTransactions: [
          {amountMinor: 3000_00, merchant: null, category: 'Transport'},
        ],
      }),
    );
    expect(summary.highlights.some(h => h.includes('at Transport'))).toBe(true);
  });
});

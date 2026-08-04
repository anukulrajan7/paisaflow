import {hashAggregatePayload} from '../services/inputHash';
import type {AiAggregatePayload} from '../types';

function makePayload(): AiAggregatePayload {
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
    topCategories: [{name: 'Food', amountMinor: 16000_00, share: 0.5}],
    dailyTotals: [{date: '2026-07-01', incomeMinor: 0, expenseMinor: 1200_00}],
    largestTransactions: [
      {amountMinor: 5000_00, merchant: 'Big Bazaar', category: 'Food'},
    ],
    transactionCount: 42,
  };
}

describe('hashAggregatePayload', () => {
  it('is stable for identical payloads', () => {
    expect(hashAggregatePayload(makePayload())).toBe(
      hashAggregatePayload(makePayload()),
    );
  });

  it('is insensitive to object key order', () => {
    const payload = makePayload();
    const reordered = {
      transactionCount: payload.transactionCount,
      largestTransactions: payload.largestTransactions,
      dailyTotals: payload.dailyTotals,
      topCategories: payload.topCategories,
      previousPeriodExpenseMinor: payload.previousPeriodExpenseMinor,
      budgetMinor: payload.budgetMinor,
      expenseMinor: payload.expenseMinor,
      incomeMinor: payload.incomeMinor,
      period: {end: payload.period.end, start: payload.period.start},
      currency: payload.currency,
    };
    expect(hashAggregatePayload(reordered)).toBe(hashAggregatePayload(payload));
  });

  it('changes when any value changes', () => {
    const base = makePayload();
    const variants: AiAggregatePayload[] = [
      {...base, expenseMinor: base.expenseMinor + 1},
      {...base, transactionCount: base.transactionCount + 1},
      {...base, budgetMinor: null},
      {
        ...base,
        topCategories: [
          {name: 'Food', amountMinor: 16000_00 + 100, share: 0.5},
        ],
      },
    ];
    for (const variant of variants) {
      expect(hashAggregatePayload(variant)).not.toBe(hashAggregatePayload(base));
    }
  });

  it('treats array order as significant (daily totals are time-ordered)', () => {
    const base = makePayload();
    const twoDays = {
      ...base,
      dailyTotals: [
        {date: '2026-07-01', incomeMinor: 0, expenseMinor: 100},
        {date: '2026-07-02', incomeMinor: 0, expenseMinor: 200},
      ],
    };
    const reversed = {
      ...base,
      dailyTotals: [...twoDays.dailyTotals].reverse(),
    };
    expect(hashAggregatePayload(reversed)).not.toBe(hashAggregatePayload(twoDays));
  });

  it('returns a fixed-length hex string', () => {
    expect(hashAggregatePayload(makePayload())).toMatch(/^[0-9a-f]{16}$/);
  });
});

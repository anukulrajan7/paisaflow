import {
  computeNextDueAt,
  describeNextDue,
  frequencyLabel,
  isOverdue,
  listDueRules,
  ordinal,
  overdueDays,
} from '../services/recurringScheduler';
import type {RecurringRule} from '../types/recurringRule';
import {dayjs} from '../../../utils/date';

/** Local calendar time → epoch ms. */
function at(iso: string): number {
  return dayjs(iso).valueOf();
}

function makeRule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: 'rule_1',
    type: 'expense',
    amountMinor: 10_000,
    currency: 'INR',
    accountId: 'acc_cash',
    destinationAccountId: null,
    categoryId: null,
    merchant: null,
    note: null,
    paymentMethod: null,
    frequency: 'monthly',
    intervalCount: 1,
    nextDueAt: at('2025-06-05T09:00:00'),
    lastConfirmedAt: null,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('computeNextDueAt', () => {
  it('advances daily rules by whole days, preserving time-of-day', () => {
    const from = at('2025-03-10T14:30:00');
    expect(dayjs(computeNextDueAt(from, 'daily', 1)).format('YYYY-MM-DD HH:mm')).toBe(
      '2025-03-11 14:30',
    );
    expect(
      dayjs(computeNextDueAt(from, 'daily', 3)).format('YYYY-MM-DD HH:mm'),
    ).toBe('2025-03-13 14:30');
  });

  it('advances weekly rules by whole weeks', () => {
    const from = at('2025-03-10T08:00:00'); // a Monday
    expect(computeNextDueAt(from, 'weekly', 1)).toBe(at('2025-03-17T08:00:00'));
    expect(computeNextDueAt(from, 'weekly', 2)).toBe(at('2025-03-24T08:00:00'));
  });

  it('advances monthly rules keeping the day-of-month', () => {
    expect(computeNextDueAt(at('2025-01-05T09:00:00'), 'monthly', 1)).toBe(
      at('2025-02-05T09:00:00'),
    );
    expect(computeNextDueAt(at('2025-01-05T09:00:00'), 'monthly', 3)).toBe(
      at('2025-04-05T09:00:00'),
    );
  });

  it('clamps the day-of-month to the target month length (Jan 31 → Feb 28)', () => {
    expect(computeNextDueAt(at('2025-01-31T09:00:00'), 'monthly', 1)).toBe(
      at('2025-02-28T09:00:00'),
    );
  });

  it('clamps to Feb 29 in leap years (Jan 31 2024 → Feb 29 2024)', () => {
    expect(computeNextDueAt(at('2024-01-31T09:00:00'), 'monthly', 1)).toBe(
      at('2024-02-29T09:00:00'),
    );
  });

  it('clamps other short months (Mar 31 → Apr 30, multi-month intervals too)', () => {
    expect(computeNextDueAt(at('2025-03-31T09:00:00'), 'monthly', 1)).toBe(
      at('2025-04-30T09:00:00'),
    );
    expect(computeNextDueAt(at('2025-01-31T09:00:00'), 'monthly', 3)).toBe(
      at('2025-04-30T09:00:00'),
    );
  });

  it('crosses the year boundary for December rules', () => {
    expect(computeNextDueAt(at('2025-12-15T09:00:00'), 'monthly', 1)).toBe(
      at('2026-01-15T09:00:00'),
    );
  });

  it('advances yearly rules, clamping Feb 29 to Feb 28 in non-leap years', () => {
    expect(computeNextDueAt(at('2025-08-15T09:00:00'), 'yearly', 1)).toBe(
      at('2026-08-15T09:00:00'),
    );
    expect(computeNextDueAt(at('2024-02-29T09:00:00'), 'yearly', 1)).toBe(
      at('2025-02-28T09:00:00'),
    );
    expect(computeNextDueAt(at('2025-08-15T09:00:00'), 'yearly', 4)).toBe(
      at('2029-08-15T09:00:00'),
    );
  });

  it('rejects non-positive or non-integer intervals and invalid timestamps', () => {
    expect(() => computeNextDueAt(at('2025-01-01'), 'daily', 0)).toThrow(
      'positive integer',
    );
    expect(() => computeNextDueAt(at('2025-01-01'), 'daily', -2)).toThrow(
      'positive integer',
    );
    expect(() => computeNextDueAt(at('2025-01-01'), 'weekly', 1.5)).toThrow(
      'positive integer',
    );
    expect(() => computeNextDueAt(Number.NaN, 'daily', 1)).toThrow(
      'valid epoch-ms',
    );
  });
});

describe('listDueRules', () => {
  const NOW = at('2025-06-05T12:00:00');

  it('returns rules due at or before now, oldest due first', () => {
    const dueEarlier = makeRule({id: 'a', nextDueAt: at('2025-06-01T09:00:00')});
    const dueExactlyNow = makeRule({id: 'b', nextDueAt: NOW});
    const dueToday = makeRule({id: 'c', nextDueAt: at('2025-06-05T08:00:00')});
    const future = makeRule({id: 'd', nextDueAt: at('2025-06-06T00:00:00')});

    const due = listDueRules([future, dueToday, dueExactlyNow, dueEarlier], NOW);
    expect(due.map(rule => rule.id)).toEqual(['a', 'c', 'b']);
  });

  it('excludes paused (inactive) rules even when past due', () => {
    const paused = makeRule({
      id: 'paused',
      isActive: false,
      nextDueAt: at('2025-01-01T00:00:00'),
    });
    expect(listDueRules([paused], NOW)).toEqual([]);
  });

  it('handles an empty rule list', () => {
    expect(listDueRules([], NOW)).toEqual([]);
  });
});

describe('isOverdue / overdueDays', () => {
  const NOW = at('2025-06-05T12:00:00');

  it('is overdue only when the due date is before today start', () => {
    expect(isOverdue(at('2025-06-04T23:59:59'), NOW)).toBe(true);
    expect(isOverdue(at('2025-06-05T00:00:00'), NOW)).toBe(false); // today
    expect(isOverdue(at('2025-06-05T18:00:00'), NOW)).toBe(false); // later today
    expect(isOverdue(at('2025-06-06T00:00:00'), NOW)).toBe(false);
  });

  it('counts whole calendar days overdue', () => {
    expect(overdueDays(at('2025-06-04T09:00:00'), NOW)).toBe(1);
    expect(overdueDays(at('2025-05-31T09:00:00'), NOW)).toBe(5);
    expect(overdueDays(at('2025-06-05T01:00:00'), NOW)).toBe(0); // due today
    expect(overdueDays(at('2025-06-10T01:00:00'), NOW)).toBe(0); // future
  });
});

describe('frequencyLabel', () => {
  it('labels each frequency at interval 1', () => {
    expect(
      frequencyLabel(
        makeRule({frequency: 'daily', nextDueAt: at('2025-06-05T09:00:00')}),
      ),
    ).toBe('Daily');
    expect(
      frequencyLabel(
        makeRule({frequency: 'weekly', nextDueAt: at('2025-06-02T09:00:00')}),
      ),
    ).toBe('Weekly · Mon');
    expect(
      frequencyLabel(
        makeRule({frequency: 'monthly', nextDueAt: at('2025-06-05T09:00:00')}),
      ),
    ).toBe('Monthly · 5th');
    expect(
      frequencyLabel(
        makeRule({frequency: 'yearly', nextDueAt: at('2025-08-15T09:00:00')}),
      ),
    ).toBe('Yearly · 15 Aug');
  });

  it('labels multi-interval rules', () => {
    expect(
      frequencyLabel(
        makeRule({
          frequency: 'daily',
          intervalCount: 3,
          nextDueAt: at('2025-06-05T09:00:00'),
        }),
      ),
    ).toBe('Every 3 days');
    expect(
      frequencyLabel(
        makeRule({
          frequency: 'weekly',
          intervalCount: 2,
          nextDueAt: at('2025-06-04T09:00:00'),
        }),
      ),
    ).toBe('Every 2 weeks · Wed');
    expect(
      frequencyLabel(
        makeRule({
          frequency: 'monthly',
          intervalCount: 3,
          nextDueAt: at('2025-06-01T09:00:00'),
        }),
      ),
    ).toBe('Every 3 months · 1st');
    expect(
      frequencyLabel(
        makeRule({
          frequency: 'yearly',
          intervalCount: 2,
          nextDueAt: at('2025-12-25T09:00:00'),
        }),
      ),
    ).toBe('Every 2 years · 25 Dec');
  });
});

describe('ordinal', () => {
  it('handles st/nd/rd/th including the teens exception', () => {
    const expected: Array<[number, string]> = [
      [1, '1st'],
      [2, '2nd'],
      [3, '3rd'],
      [4, '4th'],
      [11, '11th'],
      [12, '12th'],
      [13, '13th'],
      [21, '21st'],
      [22, '22nd'],
      [23, '23rd'],
      [31, '31st'],
    ];
    for (const [day, label] of expected) {
      expect(ordinal(day)).toBe(label);
    }
  });
});

describe('describeNextDue', () => {
  const NOW = at('2025-06-05T12:00:00');

  it('describes overdue, today, tomorrow and future dates', () => {
    expect(describeNextDue(at('2025-06-04T09:00:00'), NOW)).toBe(
      'Overdue by 1 day',
    );
    expect(describeNextDue(at('2025-06-01T09:00:00'), NOW)).toBe(
      'Overdue by 4 days',
    );
    expect(describeNextDue(at('2025-06-05T18:00:00'), NOW)).toBe('Due today');
    expect(describeNextDue(at('2025-06-06T00:00:00'), NOW)).toBe('Due tomorrow');
    expect(describeNextDue(at('2025-09-05T09:00:00'), NOW)).toBe('Due 5 Sep');
  });

  it('appends the year when the due date is in a different year', () => {
    expect(describeNextDue(at('2026-01-15T09:00:00'), NOW)).toBe(
      'Due 15 Jan 2026',
    );
  });
});

import {dayjs} from '../../../utils/date';
import type {ContributionFrequency} from '../types/savingsGoal';
import {
  contributionPeriodKey,
  describeNextContribution,
  frequencyAdverb,
  frequencyLabel,
  goalPeriodKey,
  isGoalComplete,
  nextContributionDueAt,
  nextPeriodStart,
  periodsRemaining,
  progressFraction,
  remainingMinor,
  suggestedContributionMinor,
} from '../utils/savingsGoalMath';

const at = (iso: string) => dayjs(iso).valueOf();

describe('contributionPeriodKey', () => {
  it('daily → YYYY-MM-DD', () => {
    expect(contributionPeriodKey('daily', at('2025-08-04T15:30:00'))).toBe(
      '2025-08-04',
    );
  });

  it('monthly → YYYY-MM', () => {
    expect(contributionPeriodKey('monthly', at('2025-08-04T15:30:00'))).toBe(
      '2025-08',
    );
    expect(contributionPeriodKey('monthly', at('2025-12-31T23:59:00'))).toBe(
      '2025-12',
    );
  });

  it('weekly → ISO YYYY-Www', () => {
    // Monday 4 Aug 2025 is ISO week 32.
    expect(contributionPeriodKey('weekly', at('2025-08-04T09:00:00'))).toBe(
      '2025-W32',
    );
    // Same ISO week from a Sunday.
    expect(contributionPeriodKey('weekly', at('2025-08-10T09:00:00'))).toBe(
      '2025-W32',
    );
  });

  it('weekly → ISO year rolls at year boundaries', () => {
    // 30 Dec 2024 belongs to ISO week 1 of 2025.
    expect(contributionPeriodKey('weekly', at('2024-12-30T09:00:00'))).toBe(
      '2025-W01',
    );
    expect(contributionPeriodKey('weekly', at('2025-01-01T09:00:00'))).toBe(
      '2025-W01',
    );
    // 1 Jan 2021 belongs to ISO week 53 of 2020.
    expect(contributionPeriodKey('weekly', at('2021-01-01T09:00:00'))).toBe(
      '2020-W53',
    );
  });

  it('goalPeriodKey falls back to daily for unscheduled goals', () => {
    expect(
      goalPeriodKey({contributionFrequency: null}, at('2025-08-04T12:00:00')),
    ).toBe('2025-08-04');
    expect(
      goalPeriodKey(
        {contributionFrequency: 'monthly'},
        at('2025-08-04T12:00:00'),
      ),
    ).toBe('2025-08');
  });
});

describe('periodsRemaining', () => {
  it('counts the current period plus whole periods until the target', () => {
    // Aug 2025 → Dec 2025: Aug/Sep/Oct/Nov/Dec = 5 periods.
    expect(
      periodsRemaining('monthly', at('2025-08-10'), at('2025-12-15')),
    ).toBe(5);
  });

  it('is 1 when the target falls inside the current period', () => {
    expect(
      periodsRemaining('monthly', at('2025-08-10'), at('2025-08-31')),
    ).toBe(1);
  });

  it('is 1 when the target date is in the past', () => {
    expect(
      periodsRemaining('monthly', at('2025-08-10'), at('2025-01-15')),
    ).toBe(1);
    expect(periodsRemaining('daily', at('2025-08-10'), at('2025-08-01'))).toBe(
      1,
    );
  });

  it('weekly counts ISO weeks', () => {
    // Mondays 4 Aug and 25 Aug → weeks of 4, 11, 18, 25 Aug = 4 periods.
    expect(
      periodsRemaining('weekly', at('2025-08-04'), at('2025-08-25')),
    ).toBe(4);
  });

  it('daily counts calendar days', () => {
    expect(
      periodsRemaining('daily', at('2025-08-04T09:00:00'), at('2025-08-07T22:00:00')),
    ).toBe(4);
  });
});

describe('suggestedContributionMinor', () => {
  const base = {
    targetMinor: 100_000,
    savedMinor: 25_000,
    contributionFrequency: 'monthly' as ContributionFrequency,
    targetDate: at('2025-12-15'),
  };

  it('splits the remainder evenly, rounding up', () => {
    // 75_000 over 5 months = 15_000 exactly.
    expect(suggestedContributionMinor(base, at('2025-08-10'))).toBe(15_000);
  });

  it('ceils so the goal is reached, not undershot', () => {
    expect(
      suggestedContributionMinor(
        {...base, targetMinor: 35_000}, // 10_000 over 5 months
        at('2025-08-10'),
      ),
    ).toBe(2_000);
    expect(
      suggestedContributionMinor(
        {...base, targetMinor: 35_001, savedMinor: 25_000}, // 10_001 / 5
        at('2025-08-10'),
      ),
    ).toBe(2_001);
  });

  it('returns null without a target date', () => {
    expect(
      suggestedContributionMinor({...base, targetDate: null}, at('2025-08-10')),
    ).toBeNull();
  });

  it('returns null without a schedule', () => {
    expect(
      suggestedContributionMinor(
        {...base, contributionFrequency: null},
        at('2025-08-10'),
      ),
    ).toBeNull();
  });

  it('suggests the full remaining amount once the target date has passed', () => {
    expect(
      suggestedContributionMinor(
        {...base, targetDate: at('2025-01-15')},
        at('2025-08-10'),
      ),
    ).toBe(75_000);
  });

  it('returns null when the goal is already complete', () => {
    expect(
      suggestedContributionMinor({...base, savedMinor: 100_000}, at('2025-08-10')),
    ).toBeNull();
    // Overshot too.
    expect(
      suggestedContributionMinor({...base, savedMinor: 120_000}, at('2025-08-10')),
    ).toBeNull();
  });
});

describe('remainingMinor / progressFraction / isGoalComplete', () => {
  it('computes the remaining amount, clamped at zero', () => {
    expect(remainingMinor({targetMinor: 1_000, savedMinor: 400})).toBe(600);
    expect(remainingMinor({targetMinor: 1_000, savedMinor: 1_500})).toBe(0);
  });

  it('computes a clamped progress fraction', () => {
    expect(progressFraction({targetMinor: 1_000, savedMinor: 250})).toBe(0.25);
    expect(progressFraction({targetMinor: 1_000, savedMinor: 2_000})).toBe(1);
    expect(progressFraction({targetMinor: 0, savedMinor: 0})).toBe(0);
  });

  it('detects completion at or above the target', () => {
    expect(isGoalComplete({targetMinor: 1_000, savedMinor: 999})).toBe(false);
    expect(isGoalComplete({targetMinor: 1_000, savedMinor: 1_000})).toBe(true);
    expect(isGoalComplete({targetMinor: 1_000, savedMinor: 1_001})).toBe(true);
  });
});

describe('nextContributionDueAt / describeNextContribution', () => {
  const monthly = {contributionFrequency: 'monthly' as ContributionFrequency};
  const unscheduled = {contributionFrequency: null};

  it('is null for unscheduled goals', () => {
    expect(nextContributionDueAt(unscheduled, at('2025-08-10'), false)).toBeNull();
    expect(describeNextContribution(unscheduled, at('2025-08-10'), false)).toBeNull();
  });

  it('is due now while the current period is unrecorded', () => {
    const due = nextContributionDueAt(monthly, at('2025-08-10'), false);
    expect(due).toBe(at('2025-08-01T00:00:00'));
    expect(describeNextContribution(monthly, at('2025-08-10'), false)).toBe(
      'Due now',
    );
  });

  it('rolls to the next period once this period is recorded', () => {
    const due = nextContributionDueAt(monthly, at('2025-08-10'), true);
    expect(due).toBe(at('2025-09-01T00:00:00'));
    expect(describeNextContribution(monthly, at('2025-08-10'), true)).toBe(
      'Next 1 Sep',
    );
  });

  it('appends the year when the next period crosses into it', () => {
    expect(
      describeNextContribution(monthly, at('2025-12-20'), true),
    ).toBe('Next 1 Jan 2026');
  });

  it('nextPeriodStart advances daily and weekly periods', () => {
    expect(nextPeriodStart('daily', at('2025-08-10T15:00:00'))).toBe(
      at('2025-08-11T00:00:00'),
    );
    // 10 Aug 2025 is a Sunday; the next ISO week starts Monday 11 Aug.
    expect(nextPeriodStart('weekly', at('2025-08-10T15:00:00'))).toBe(
      at('2025-08-11T00:00:00'),
    );
  });
});

describe('labels', () => {
  it('frequencyLabel / frequencyAdverb', () => {
    expect(frequencyLabel('daily')).toBe('Daily');
    expect(frequencyLabel(null)).toBeNull();
    expect(frequencyAdverb('weekly')).toBe('a week');
    expect(frequencyAdverb(null)).toBeNull();
  });
});

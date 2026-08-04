import {getBudgetStatus} from '../utils/budgetStatus';

describe('getBudgetStatus', () => {
  const LIMIT = 100_000; // ₹1,000.00 in minor units

  it('is under when nothing is spent', () => {
    expect(getBudgetStatus(LIMIT, 0)).toEqual({
      tone: 'under',
      percentUsed: 0,
      remainingMinor: LIMIT,
    });
  });

  it('is under at exactly 80% of the limit', () => {
    const status = getBudgetStatus(LIMIT, 80_000);
    expect(status.tone).toBe('under');
    expect(status.percentUsed).toBe(80);
  });

  it('is near just past 80% of the limit', () => {
    const status = getBudgetStatus(LIMIT, 80_001);
    expect(status.tone).toBe('near');
    expect(status.percentUsed).toBe(80);
    expect(status.remainingMinor).toBe(19_999);
  });

  it('is near (not over) at exactly 100% of the limit', () => {
    const status = getBudgetStatus(LIMIT, LIMIT);
    expect(status.tone).toBe('near');
    expect(status.percentUsed).toBe(100);
    expect(status.remainingMinor).toBe(0);
  });

  it('is over when spending exceeds the limit, with negative remaining', () => {
    const status = getBudgetStatus(LIMIT, 125_000);
    expect(status.tone).toBe('over');
    expect(status.percentUsed).toBe(125);
    expect(status.remainingMinor).toBe(-25_000);
  });

  it('handles a zero limit without dividing by zero', () => {
    expect(getBudgetStatus(0, 0)).toEqual({
      tone: 'under',
      percentUsed: 0,
      remainingMinor: 0,
    });
  });

  it('rounds the percent used to a whole number', () => {
    expect(getBudgetStatus(3, 1).percentUsed).toBe(33);
  });
});

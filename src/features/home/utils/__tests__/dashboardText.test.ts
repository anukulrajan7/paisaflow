import {dayjs} from '../../../../utils/date';
import {describeExpenseChange, greetingFor} from '../dashboardText';

describe('greetingFor', () => {
  it('greets by time of day', () => {
    expect(greetingFor(dayjs('2026-08-04T03:00:00'))).toBe('Good evening');
    expect(greetingFor(dayjs('2026-08-04T08:00:00'))).toBe('Good morning');
    expect(greetingFor(dayjs('2026-08-04T13:00:00'))).toBe('Good afternoon');
    expect(greetingFor(dayjs('2026-08-04T19:00:00'))).toBe('Good evening');
  });

  it('uses 12:00 as the morning/afternoon boundary', () => {
    expect(greetingFor(dayjs('2026-08-04T11:59:00'))).toBe('Good morning');
    expect(greetingFor(dayjs('2026-08-04T12:00:00'))).toBe('Good afternoon');
    expect(greetingFor(dayjs('2026-08-04T17:00:00'))).toBe('Good evening');
  });
});

describe('describeExpenseChange', () => {
  it('handles no previous spending (divide by zero)', () => {
    expect(describeExpenseChange(5000, 0)).toBe(
      'No spending last month to compare',
    );
  });

  it('handles no spending in either month', () => {
    expect(describeExpenseChange(0, 0)).toBe('No spending in either month');
  });

  it('reports an increase', () => {
    expect(describeExpenseChange(15000, 10000)).toBe('50% more than last month');
  });

  it('reports a decrease', () => {
    expect(describeExpenseChange(7500, 10000)).toBe('25% less than last month');
  });

  it('reports no change', () => {
    expect(describeExpenseChange(10000, 10000)).toBe('Same as last month');
  });
});

import {dayjs} from '../../../utils/date';
import {
  ordinal,
  periodKeyFor,
  periodLabel,
  salaryStateFor,
} from '../utils/salaryState';

describe('periodKeyFor', () => {
  it('formats the calendar month as YYYY-MM', () => {
    expect(periodKeyFor(dayjs('2025-06-15T10:30:00'))).toBe('2025-06');
    expect(periodKeyFor(dayjs('2025-01-01T00:00:00').valueOf())).toBe('2025-01');
    expect(periodKeyFor(new Date(2025, 11, 31))).toBe('2025-12');
  });
});

describe('periodLabel', () => {
  it('labels a period key as a long month', () => {
    expect(periodLabel('2025-06')).toBe('June 2025');
    expect(periodLabel('2025-12')).toBe('December 2025');
  });
});

describe('ordinal', () => {
  it('handles st/nd/rd/th including the teens', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
    expect(ordinal(28)).toBe('28th');
  });
});

describe('salaryStateFor', () => {
  const config = {expectedDay: 5};

  it('is expected up to and on the expected day', () => {
    expect(salaryStateFor(config, null, dayjs('2025-06-01'))).toBe('expected');
    expect(salaryStateFor(config, null, dayjs('2025-06-05T23:59:00'))).toBe(
      'expected',
    );
  });

  it('is delayed once today passes the expected day', () => {
    expect(salaryStateFor(config, null, dayjs('2025-06-06T00:00:00'))).toBe(
      'delayed',
    );
    expect(salaryStateFor(config, null, dayjs('2025-06-28'))).toBe('delayed');
  });

  it('a record decides the state outright, whatever the day', () => {
    expect(salaryStateFor(config, {status: 'credited'}, dayjs('2025-06-01'))).toBe(
      'credited',
    );
    expect(salaryStateFor(config, {status: 'partial'}, dayjs('2025-06-20'))).toBe(
      'partial',
    );
    expect(salaryStateFor(config, {status: 'bonus'}, dayjs('2025-06-20'))).toBe(
      'bonus',
    );
    expect(salaryStateFor(config, {status: 'delayed'}, dayjs('2025-06-02'))).toBe(
      'delayed',
    );
  });
});

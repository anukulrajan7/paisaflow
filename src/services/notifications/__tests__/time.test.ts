import {nextOccurrenceTimestamp, REMINDER_TIME_PATTERN} from '../time';

// Local noon on 2026-08-04 — avoids edge cases around midnight in any TZ.
const NOW = new Date(2026, 7, 4, 12, 0, 0);

describe('nextOccurrenceTimestamp', () => {
  it('returns today when the time is still in the future', () => {
    const ts = nextOccurrenceTimestamp('20:30', NOW);
    const expected = new Date(2026, 7, 4, 20, 30, 0, 0);
    expect(ts).toBe(expected.getTime());
  });

  it('returns tomorrow when the time has already passed today', () => {
    const ts = nextOccurrenceTimestamp('08:30', NOW);
    const expected = new Date(2026, 7, 5, 8, 30, 0, 0);
    expect(ts).toBe(expected.getTime());
  });

  it('returns tomorrow when the time is exactly now', () => {
    const ts = nextOccurrenceTimestamp('12:00', NOW);
    const expected = new Date(2026, 7, 5, 12, 0, 0, 0);
    expect(ts).toBe(expected.getTime());
  });

  it('handles midnight and end-of-day boundary times', () => {
    expect(nextOccurrenceTimestamp('00:00', NOW)).toBe(
      new Date(2026, 7, 5, 0, 0, 0, 0).getTime(),
    );
    expect(nextOccurrenceTimestamp('23:59', NOW)).toBe(
      new Date(2026, 7, 4, 23, 59, 0, 0).getTime(),
    );
  });

  it('zeroes seconds and milliseconds of the occurrence', () => {
    const now = new Date(2026, 7, 4, 12, 34, 56, 789);
    const ts = nextOccurrenceTimestamp('20:30', now);
    const result = new Date(ts);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('rolls over month boundaries correctly', () => {
    const endOfMonth = new Date(2026, 7, 31, 23, 0, 0);
    const ts = nextOccurrenceTimestamp('08:30', endOfMonth);
    expect(ts).toBe(new Date(2026, 8, 1, 8, 30, 0, 0).getTime());
  });

  it.each(['8:30', '24:00', '12:60', 'abc', '', '12:00:00'])(
    'throws on invalid time %p',
    invalid => {
      expect(() => nextOccurrenceTimestamp(invalid, NOW)).toThrow(
        `Invalid reminder time '${invalid}'`,
      );
    },
  );

  it('accepts every value matched by REMINDER_TIME_PATTERN', () => {
    for (const time of ['00:00', '09:05', '12:30', '19:59', '23:59']) {
      expect(REMINDER_TIME_PATTERN.test(time)).toBe(true);
      expect(() => nextOccurrenceTimestamp(time, NOW)).not.toThrow();
    }
  });
});

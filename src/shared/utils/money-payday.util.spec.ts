import { applyBps, formatNaira, percentOf, percentToBps, toMinor } from './money.util';
import { lagosDayEnd, lagosDayStart, nextPayday, ordinal, startOfLagosMonth } from './payday.util';

describe('money utils', () => {
  it('applies basis points with integer maths, rounding down', () => {
    expect(applyBps(85_000_000, 1500)).toBe(12_750_000);
    expect(applyBps(101, 5000)).toBe(50);

    expect(applyBps(10_000_000_000, 3333)).toBe(3_333_000_000);
  });

  it('converts percent to basis points', () => {
    expect(percentToBps(12.5)).toBe(1250);
    expect(percentToBps(0.01)).toBe(1);
  });

  it('computes one-decimal percentages and guards zero', () => {
    expect(percentOf(61_250_000, 85_000_000)).toBe(72.1);
    expect(percentOf(5, 0)).toBe(0);
  });

  it('reads SQL aggregates that arrive as strings', () => {
    expect(toMinor('123456')).toBe(123456);
    expect(toMinor(null)).toBe(0);
    expect(toMinor('nope')).toBe(0);
  });

  it('formats naira', () => {
    expect(formatNaira(85_000_000)).toBe('₦850,000.00');
  });
});

describe('payday utils', () => {
  const now = new Date('2026-11-05T09:00:00Z');

  it('returns this month when the payday is still ahead (today counts)', () => {
    expect(nextPayday(28, now)).toBe('2026-11-28');
    expect(nextPayday(5, now)).toBe('2026-11-05');
  });

  it('rolls to next month once the payday has passed', () => {
    expect(nextPayday(4, now)).toBe('2026-12-04');
  });

  it('falls on the last day of shorter months', () => {
    expect(nextPayday(31, now)).toBe('2026-11-30');
    expect(nextPayday(31, new Date('2027-02-10T09:00:00Z'))).toBe('2027-02-28');
  });

  it('rolls over the year end', () => {
    expect(nextPayday(1, new Date('2026-12-15T09:00:00Z'))).toBe('2027-01-01');
  });

  it('uses the Lagos calendar date, not UTC', () => {
    expect(nextPayday(4, new Date('2026-11-04T23:30:00Z'))).toBe('2026-12-04');
  });

  it('builds Lagos day boundaries and month start', () => {
    expect(lagosDayStart('2026-11-05').toISOString()).toBe('2026-11-04T23:00:00.000Z');
    expect(lagosDayEnd('2026-11-05').toISOString()).toBe('2026-11-05T23:00:00.000Z');
    expect(startOfLagosMonth(now).toISOString()).toBe('2026-10-31T23:00:00.000Z');
  });

  it('formats ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 28, 31].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '28th',
      '31st',
    ]);
  });
});

import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { cacheSeconds, localMidnight, localToday, parseDay, parseMonth, rejectUnexpectedParams } from './params.js';

const INSTALL = Temporal.PlainDate.from('2026-10-08');
// 2026-10-20 10:00 in Madrid (UTC+2).
const NOW = Temporal.Instant.from('2026-10-20T08:00:00Z');

const day = (value: string) => Temporal.PlainDate.from(value);

describe('localToday', () => {
  it('uses the Madrid day, not the UTC day', () => {
    expect(localToday(Temporal.Instant.from('2026-10-20T21:59:00Z')).toString()).toBe('2026-10-20');
    expect(localToday(Temporal.Instant.from('2026-10-20T22:00:00Z')).toString()).toBe('2026-10-21');
  });
});

describe('localMidnight', () => {
  it('summer time is UTC+2', () => {
    expect(localMidnight(day('2026-07-15')).toString()).toBe('2026-07-14T22:00:00Z');
  });
  it('winter time is UTC+1', () => {
    expect(localMidnight(day('2026-01-15')).toString()).toBe('2026-01-14T23:00:00Z');
  });
  it('handles the days the clock changes', () => {
    expect(localMidnight(day('2026-03-29')).toString()).toBe('2026-03-28T23:00:00Z');
    expect(localMidnight(day('2026-03-30')).toString()).toBe('2026-03-29T22:00:00Z');
    expect(localMidnight(day('2026-10-25')).toString()).toBe('2026-10-24T22:00:00Z');
    expect(localMidnight(day('2026-10-26')).toString()).toBe('2026-10-25T23:00:00Z');
  });
});

describe('rejectUnexpectedParams', () => {
  it('accepts exactly the allowed params', () => {
    expect(rejectUnexpectedParams(new URL('https://x/api/day?date=2026-10-10'), ['date'])).toBeNull();
  });
  it('rejects unknown, repeated or missing params', () => {
    expect(rejectUnexpectedParams(new URL('https://x/api/day?date=2026-10-10&x=1'), ['date'])).not.toBeNull();
    expect(rejectUnexpectedParams(new URL('https://x/api/day?date=a&date=b'), ['date'])).not.toBeNull();
    expect(rejectUnexpectedParams(new URL('https://x/api/day'), ['date'])).not.toBeNull();
    expect(rejectUnexpectedParams(new URL('https://x/api/now?cachebust=1'), [])).not.toBeNull();
  });
});

describe('parseDay', () => {
  it('accepts days from install to today', () => {
    expect(parseDay('2026-10-08', NOW, INSTALL)).toEqual({ ok: true, value: day('2026-10-08') });
    expect(parseDay('2026-10-20', NOW, INSTALL)).toEqual({ ok: true, value: day('2026-10-20') });
  });
  it('rejects other spellings, impossible dates, the future and days before install', () => {
    for (const value of ['2026-10-8', '20261010', '2026-10-10T00:00', ' 2026-10-10', '2026-02-30', '2026-10-21', '2026-10-07']) {
      expect(parseDay(value, NOW, INSTALL).ok).toBe(false);
    }
  });
});

describe('parseMonth', () => {
  it('accepts months from install to the current one', () => {
    expect(parseMonth('2026-10', NOW, INSTALL)).toEqual({ ok: true, value: Temporal.PlainYearMonth.from('2026-10') });
  });
  it('rejects other spellings, the future and months before install', () => {
    for (const value of ['2026-1', '2026-13', '202610', '2026-11', '2026-09', '2026-10-01']) {
      expect(parseMonth(value, NOW, INSTALL).ok).toBe(false);
    }
  });
});

describe('cacheSeconds', () => {
  it('is short while the data can still change and long once it cannot', () => {
    expect(cacheSeconds(day('2026-10-20'), NOW)).toBe(60); // today
    expect(cacheSeconds(day('2026-10-19'), NOW)).toBe(600); // late batches can still arrive
    expect(cacheSeconds(day('2026-10-13'), NOW)).toBe(600);
    expect(cacheSeconds(day('2026-10-12'), NOW)).toBe(30 * 24 * 3600); // older than the 7 days ingest accepts
  });
});

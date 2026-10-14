import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
  cachePolicy, last24hStart, last7DaysStart, localMidnight, localToday, parseDay, parseMonth, parseRange, rangeResolution,
  rejectUnexpectedParams,
} from './params.js';

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

describe('last24hStart', () => {
  it('is 24 hours of real time, also across the clock change', () => {
    expect(last24hStart(NOW).toString()).toBe('2026-10-19T08:00:00Z');
    // 2026-10-25 12:00 Madrid (UTC+1) is 25 wall-clock hours after 2026-10-24 12:00 (UTC+2).
    expect(last24hStart(Temporal.Instant.from('2026-10-25T11:00:00Z')).toString()).toBe('2026-10-24T11:00:00Z');
  });
});

describe('last7DaysStart', () => {
  it('starts at local midnight six days before today', () => {
    // Today 2026-10-20: from 2026-10-14 00:00 Madrid (UTC+2).
    expect(last7DaysStart(NOW).toString()).toBe('2026-10-13T22:00:00Z');
  });
  it('uses the Madrid day near midnight', () => {
    // 2026-10-20 00:30 Madrid is still 2026-10-19 in UTC.
    expect(last7DaysStart(Temporal.Instant.from('2026-10-19T22:30:00Z')).toString()).toBe('2026-10-13T22:00:00Z');
  });
  it('keeps the start in summer time after the clock change', () => {
    // Today 2026-10-27 (UTC+1): from 2026-10-21 00:00, still UTC+2.
    expect(last7DaysStart(Temporal.Instant.from('2026-10-27T10:00:00Z')).toString()).toBe('2026-10-20T22:00:00Z');
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

describe('parseRange', () => {
  const instant = (value: string) => Temporal.Instant.from(value);
  it('accepts whole-minute instants and ends the range now at most', () => {
    expect(parseRange('2026-10-19T22:00:00Z', '2026-10-20T06:30:00Z', NOW, INSTALL)).toEqual({
      ok: true,
      value: { from: instant('2026-10-19T22:00:00Z'), to: instant('2026-10-20T06:30:00Z') },
    });
    expect(parseRange('2026-10-19T22:00:00Z', '2026-10-21T00:00:00Z', NOW, INSTALL)).toEqual({
      ok: true,
      value: { from: instant('2026-10-19T22:00:00Z'), to: NOW },
    });
  });
  it('rejects other spellings, seconds, reversed or future ranges, before install and over 31 days', () => {
    const bad: [string, string][] = [
      ['2026-10-19T22:00Z', '2026-10-20T06:00:00Z'], // Temporal prints the seconds
      ['2026-10-20T00:00:00+02:00', '2026-10-20T06:00:00Z'],
      ['2026-10-19T22:00:30Z', '2026-10-20T06:00:00Z'],
      ['2026-10-20T06:00:00Z', '2026-10-20T06:00:00Z'],
      ['2026-10-20T06:00:00Z', '2026-10-19T22:00:00Z'],
      ['2026-10-20T08:00:00Z', '2026-10-20T09:00:00Z'], // from is now
      ['2026-10-07T21:59:00Z', '2026-10-08T06:00:00Z'], // install day starts 2026-10-07T22:00Z
    ];
    for (const [from, to] of bad) {
      expect(parseRange(from, to, NOW, INSTALL).ok).toBe(false);
    }
    const later = Temporal.Instant.from('2026-12-01T00:00:00Z');
    expect(parseRange('2026-10-10T00:00:00Z', '2026-11-10T00:00:00Z', later, INSTALL).ok).toBe(true); // 31 days
    expect(parseRange('2026-10-10T00:00:00Z', '2026-11-10T00:01:00Z', later, INSTALL).ok).toBe(false);
  });
});

describe('rangeResolution', () => {
  const range = (from: string, to: string) => ({ from: Temporal.Instant.from(from), to: Temporal.Instant.from(to) });
  it('sends minutes up to 48 hours and hours above', () => {
    expect(rangeResolution(range('2026-10-18T08:00:00Z', '2026-10-20T08:00:00Z'))).toBe('minute');
    expect(rangeResolution(range('2026-10-18T08:00:00Z', '2026-10-20T08:01:00Z'))).toBe('hour');
  });
});

describe('cachePolicy', () => {
  it('today expires when the next reading lands, with no stale copy', () => {
    // NOW is 08:00:00Z: the next reading lands at 08:00:08.
    expect(cachePolicy(day('2026-10-20'), NOW)).toEqual({ sMaxAge: 8, staleWhileRevalidate: 0 });
  });
  it('is short while late batches can still arrive and long once they cannot', () => {
    expect(cachePolicy(day('2026-10-19'), NOW)).toEqual({ sMaxAge: 600, staleWhileRevalidate: 600 });
    expect(cachePolicy(day('2026-10-13'), NOW).sMaxAge).toBe(600);
    expect(cachePolicy(day('2026-10-12'), NOW).sMaxAge).toBe(30 * 24 * 3600); // older than the 7 days ingest accepts
  });
});

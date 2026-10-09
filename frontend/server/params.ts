// Pure helpers for the read API: strict query params, Madrid local days and cache times.
// Strictness matters: any unexpected query string is a 400, so bots cannot bypass the CDN cache.
import { Temporal } from 'temporal-polyfill';

export const TIME_ZONE = 'Europe/Madrid';

// The ingest function accepts readings up to 7 days old, so a day can still change until then.
const LATE_DATA_DAYS = 7;
const CACHE_TODAY_S = 60;
const CACHE_RECENT_S = 600;
const CACHE_CLOSED_S = 30 * 24 * 3600;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

// Today in Madrid.
export function localToday(now: Temporal.Instant): Temporal.PlainDate {
  return now.toZonedDateTimeISO(TIME_ZONE).toPlainDate();
}

// The instant of 00:00 Madrid time on that day (DST handled by Temporal).
export function localMidnight(day: Temporal.PlainDate): Temporal.Instant {
  return day.toZonedDateTime(TIME_ZONE).toInstant();
}

// Null when the URL has exactly the expected params, each once; otherwise the error message.
export function rejectUnexpectedParams(url: URL, expected: string[]): string | null {
  const keys = [...url.searchParams.keys()];
  const unknown = keys.filter((key) => !expected.includes(key));
  if (unknown.length > 0) {
    return `unexpected parameter: ${unknown[0]}`;
  }
  for (const key of expected) {
    const count = keys.filter((k) => k === key).length;
    if (count !== 1) {
      return count === 0 ? `missing parameter: ${key}` : `repeated parameter: ${key}`;
    }
  }
  return null;
}

// Temporal also accepts other ISO forms (20261010, a time part...). Requiring the value to be
// exactly what Temporal would print keeps a single spelling per date, so one cache entry each.
function parseExact<T extends { toString(): string }>(value: string, parse: (value: string) => T): T | null {
  try {
    const parsed = parse(value);
    return parsed.toString() === value ? parsed : null;
  } catch {
    return null;
  }
}

// A local day between the install day and today, written YYYY-MM-DD.
export function parseDay(value: string, now: Temporal.Instant, installDay: Temporal.PlainDate): Parsed<Temporal.PlainDate> {
  const day = parseExact(value, (v) => Temporal.PlainDate.from(v, { overflow: 'reject' }));
  if (!day) {
    return { ok: false, error: 'date must be YYYY-MM-DD' };
  }
  if (Temporal.PlainDate.compare(day, localToday(now)) > 0) {
    return { ok: false, error: 'date is in the future' };
  }
  if (Temporal.PlainDate.compare(day, installDay) < 0) {
    return { ok: false, error: `no data before ${installDay}` };
  }
  return { ok: true, value: day };
}

// A month between the install month and the current one, written YYYY-MM.
export function parseMonth(value: string, now: Temporal.Instant, installDay: Temporal.PlainDate): Parsed<Temporal.PlainYearMonth> {
  const month = parseExact(value, (v) => Temporal.PlainYearMonth.from(v, { overflow: 'reject' }));
  if (!month) {
    return { ok: false, error: 'month must be YYYY-MM' };
  }
  if (Temporal.PlainYearMonth.compare(month, localToday(now).toPlainYearMonth()) > 0) {
    return { ok: false, error: 'month is in the future' };
  }
  const installMonth = installDay.toPlainYearMonth();
  if (Temporal.PlainYearMonth.compare(month, installMonth) < 0) {
    return { ok: false, error: `no data before ${installMonth}` };
  }
  return { ok: true, value: month };
}

// How long the CDN may keep a response whose newest data is on lastDay (a local day).
export function cacheSeconds(lastDay: Temporal.PlainDate, now: Temporal.Instant): number {
  const today = localToday(now);
  if (Temporal.PlainDate.compare(lastDay, today) >= 0) {
    return CACHE_TODAY_S;
  }
  const closedBefore = today.subtract({ days: LATE_DATA_DAYS });
  return Temporal.PlainDate.compare(lastDay, closedBefore) >= 0 ? CACHE_RECENT_S : CACHE_CLOSED_S;
}

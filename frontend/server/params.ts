// Pure helpers for the read API: strict query params, Madrid local days and cache times.
// Strictness matters: any unexpected query string is a 400, so bots cannot bypass the CDN cache.
import { Temporal } from 'temporal-polyfill';
import { msUntilNextReading } from '../shared/refresh.js';

export const TIME_ZONE = 'Europe/Madrid';

// The ingest function accepts readings up to 7 days old, so a day can still change until then.
const LATE_DATA_DAYS = 7;
const CACHE_RECENT_S = 600;
const CACHE_CLOSED_S = 30 * 24 * 3600;

// s-maxage and stale-while-revalidate for the Vercel CDN, in seconds.
export interface CachePolicy {
  sMaxAge: number;
  staleWhileRevalidate: number;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

// Today in Madrid.
export function localToday(now: Temporal.Instant): Temporal.PlainDate {
  return now.toZonedDateTimeISO(TIME_ZONE).toPlainDate();
}

// The instant of 00:00 Madrid time on that day (DST handled by Temporal).
export function localMidnight(day: Temporal.PlainDate): Temporal.Instant {
  return day.toZonedDateTime(TIME_ZONE).toInstant();
}

// Start of the "24 h" view: exactly 24 hours before now (it crosses midnight).
export function last24hStart(now: Temporal.Instant): Temporal.Instant {
  return now.subtract({ hours: 24 });
}

// Start of the "7 días" view: 00:00 Madrid time six days before today, so today plus the
// six whole days before it. Not 168 hours: the view follows local days.
export function last7DaysStart(now: Temporal.Instant): Temporal.Instant {
  return localMidnight(localToday(now).subtract({ days: 6 }));
}

// Every endpoint takes an optional ?station=<device_id> (the default station without it).
export const STATION_PARAM = 'station';

// Null when the URL has exactly the expected params, each once, and the optional ones at most
// once; otherwise the error message.
export function rejectUnexpectedParams(url: URL, expected: string[], optional: string[] = [STATION_PARAM]): string | null {
  const keys = [...url.searchParams.keys()];
  const unknown = keys.filter((key) => !expected.includes(key) && !optional.includes(key));
  if (unknown.length > 0) {
    return `unexpected parameter: ${unknown[0]}`;
  }
  for (const key of expected) {
    const count = keys.filter((k) => k === key).length;
    if (count !== 1) {
      return count === 0 ? `missing parameter: ${key}` : `repeated parameter: ${key}`;
    }
  }
  for (const key of optional) {
    if (keys.filter((k) => k === key).length > 1) {
      return `repeated parameter: ${key}`;
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

// Custom ranges (/api/range): at most this long, and sent as one-minute readings up to
// RANGE_MINUTE_MAX_HOURS, as hourly stats above that. 31 days of hours fit one PostgREST page.
export const RANGE_MAX_DAYS = 31;
export const RANGE_MINUTE_MAX_HOURS = 48;

export interface InstantRange {
  from: Temporal.Instant;
  to: Temporal.Instant;
}

// An instant on a whole minute, written exactly as Temporal prints it (2026-10-14T05:00:00Z).
function parseMinute(value: string): Temporal.Instant | null {
  const instant = parseExact(value, (v) => Temporal.Instant.from(v));
  return instant && instant.epochMilliseconds % 60_000 === 0 ? instant : null;
}

// A custom range from..to. `to` may be in the future (the range then ends now); the range must
// start after the install day began and last at most RANGE_MAX_DAYS.
export function parseRange(fromValue: string, toValue: string, now: Temporal.Instant, installDay: Temporal.PlainDate): Parsed<InstantRange> {
  const from = parseMinute(fromValue);
  const to = parseMinute(toValue);
  if (!from || !to) {
    return { ok: false, error: 'from and to must be whole-minute instants like 2026-10-14T05:00:00Z' };
  }
  if (Temporal.Instant.compare(from, to) >= 0) {
    return { ok: false, error: 'from must be before to' };
  }
  if (Temporal.Instant.compare(from, now) >= 0) {
    return { ok: false, error: 'from is in the future' };
  }
  if (Temporal.Instant.compare(from, localMidnight(installDay)) < 0) {
    return { ok: false, error: `no data before ${installDay}` };
  }
  if (Temporal.Duration.compare(from.until(to), { hours: RANGE_MAX_DAYS * 24 }) > 0) {
    return { ok: false, error: `ranges are at most ${RANGE_MAX_DAYS} days` };
  }
  return { ok: true, value: { from, to: Temporal.Instant.compare(to, now) > 0 ? now : to } };
}

// One-minute readings for short ranges, hourly stats for long ones.
export function rangeResolution(range: InstantRange): 'minute' | 'hour' {
  return Temporal.Duration.compare(range.from.until(range.to), { hours: RANGE_MINUTE_MAX_HOURS }) > 0 ? 'hour' : 'minute';
}

// How long the CDN may keep a response whose newest data is on lastDay (a local day).
// Today: until the next reading lands, and never a stale copy, so each minute shows up at once.
// Older days: long, and a stale copy may be served while a fresh one is fetched.
export function cachePolicy(lastDay: Temporal.PlainDate, now: Temporal.Instant): CachePolicy {
  const today = localToday(now);
  if (Temporal.PlainDate.compare(lastDay, today) >= 0) {
    return { sMaxAge: Math.ceil(msUntilNextReading(now.epochMilliseconds) / 1000), staleWhileRevalidate: 0 };
  }
  const closedBefore = today.subtract({ days: LATE_DATA_DAYS });
  const seconds = Temporal.PlainDate.compare(lastDay, closedBefore) >= 0 ? CACHE_RECENT_S : CACHE_CLOSED_S;
  return { sMaxAge: seconds, staleWhileRevalidate: seconds };
}

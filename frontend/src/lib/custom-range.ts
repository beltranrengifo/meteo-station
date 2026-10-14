// The custom chart range and the checks the API also makes (server/params.ts parseRange).
import { Temporal } from 'temporal-polyfill';
import { TIME_ZONE } from './format';

// Same limit as the API (server/params.ts RANGE_MAX_DAYS).
export const CUSTOM_MAX_DAYS = 31;

export interface CustomRange {
  from: string; // instants, ISO 8601, whole minutes
  to: string; // exclusive, as in the API
}

// The range never ends after the current minute: the API cuts it to now anyway.
function capToNow(to: Temporal.Instant, now: Temporal.Instant): Temporal.Instant {
  const end = now.round({ smallestUnit: 'minute', roundingMode: 'ceil' });
  return Temporal.Instant.compare(to, end) > 0 ? end : to;
}

// Whole days picked on the calendar: from 00:00 on the first day to the end of the last one
// (shown as 23:59), or to now when the last one is today.
export function daysRange(first: Temporal.PlainDate, last: Temporal.PlainDate, now: Temporal.Instant): CustomRange {
  const from = first.toZonedDateTime(TIME_ZONE).toInstant();
  const to = capToNow(last.add({ days: 1 }).toZonedDateTime(TIME_ZONE).toInstant(), now);
  return { from: from.toString(), to: to.toString() };
}

// The last `days` days up to now, today included: from 00:00 on the first one (never before the
// install day). It ends at 00:00 tomorrow, which the API cuts to now: the range stays the same
// all day, so its data is cached and refreshed instead of asked for again each minute.
export function lastDaysRange(days: number, today: Temporal.PlainDate, installDate: string | undefined): CustomRange {
  const first = today.subtract({ days: days - 1 }).toZonedDateTime(TIME_ZONE).toInstant();
  const install = installDate === undefined ? undefined : installStart(installDate);
  const from = install && Temporal.Instant.compare(install, first) > 0 ? install : first;
  const to = today.add({ days: 1 }).toZonedDateTime(TIME_ZONE).toInstant();
  return { from: from.toString(), to: to.toString() };
}

// The last minute inside the range, which is what the picker and the title show as its end.
export function lastMinute(range: CustomRange): string {
  return Temporal.Instant.from(range.to).subtract({ minutes: 1 }).toString();
}

// The exclusive end for a range whose last minute is `minute` (ISO 8601).
export function endAfter(minute: string, now: Temporal.Instant): string {
  return capToNow(Temporal.Instant.from(minute).add({ minutes: 1 }), now).toString();
}

// The first instant with data: 00:00 in Madrid on the install day (YYYY-MM-DD, from /api/now).
export function installStart(installDate: string): Temporal.Instant {
  return Temporal.PlainDate.from(installDate).toZonedDateTime(TIME_ZONE).toInstant();
}

const installDayFormat = new Intl.DateTimeFormat('es-ES', { timeZone: TIME_ZONE, day: 'numeric', month: 'long' });

// Problem with a picked range, in Spanish, or null when the API will accept it. The install
// date is unknown until /api/now answers; the API still checks it then.
export function customRangeProblem(range: CustomRange, installDate: string | undefined): string | null {
  const from = Temporal.Instant.from(range.from);
  const to = Temporal.Instant.from(range.to);
  if (Temporal.Instant.compare(from, to) >= 0) {
    return '"Desde" tiene que ser anterior a "Hasta".';
  }
  if (Temporal.Instant.compare(from, Temporal.Now.instant()) >= 0) {
    return '"Desde" no puede ser futuro.';
  }
  if (installDate !== undefined) {
    const start = installStart(installDate);
    if (Temporal.Instant.compare(from, start) < 0) {
      return `No hay datos antes del ${installDayFormat.format(new Date(start.epochMilliseconds))}.`;
    }
  }
  if (Temporal.Duration.compare(from.until(to), { hours: CUSTOM_MAX_DAYS * 24 }) > 0) {
    return `El periodo puede durar como mucho ${CUSTOM_MAX_DAYS} días.`;
  }
  return null;
}

// Shorter selections are taken as a stray click, not a range.
const MIN_SELECTION_MINUTES = 2;

// A range dragged on a chart, as a custom range: kept inside the chart's from..to and widened
// to whole minutes, as the API asks. Null for a selection too short to mean anything.
export function selectionToRange(
  start: Temporal.Instant,
  end: Temporal.Instant,
  bounds: CustomRange,
): CustomRange | null {
  const [low, high] = Temporal.Instant.compare(start, end) <= 0 ? [start, end] : [end, start];
  const boundFrom = Temporal.Instant.from(bounds.from);
  const boundTo = Temporal.Instant.from(bounds.to);
  const from = (Temporal.Instant.compare(low, boundFrom) < 0 ? boundFrom : low)
    .round({ smallestUnit: 'minute', roundingMode: 'floor' });
  const to = (Temporal.Instant.compare(high, boundTo) > 0 ? boundTo : high)
    .round({ smallestUnit: 'minute', roundingMode: 'ceil' });
  if (Temporal.Duration.compare(from.until(to), { minutes: MIN_SELECTION_MINUTES }) < 0) {
    return null;
  }
  return { from: from.toString(), to: to.toString() };
}

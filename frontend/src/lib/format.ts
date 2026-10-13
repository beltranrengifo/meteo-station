// Display helpers. Data is UTC end to end; times are shown in Madrid (the station's zone),
// whatever the viewer's browser zone.
import { Temporal } from 'temporal-polyfill';

export const TIME_ZONE = 'Europe/Madrid';

// The station sends a reading every minute; after this long without one it is shown as down.
const STALE_AFTER_MINUTES = 5;

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

export function msToKmh(ms: number | null): number | null {
  return ms === null ? null : ms * 3.6;
}

export function madridToday(): Temporal.PlainDate {
  return Temporal.Now.plainDateISO(TIME_ZONE);
}

// "HH:mm" in Madrid.
export function formatTime(iso: string): string {
  return Temporal.Instant.from(iso)
    .toZonedDateTimeISO(TIME_ZONE)
    .toPlainTime()
    .toString({ smallestUnit: 'minute' });
}

// ECharts can only show times in the browser zone or in UTC. Shifting each instant to its
// Madrid wall-clock time and telling ECharts to use UTC makes every axis label and tooltip show
// Madrid time. On the two days the clock changes, one hour is doubled or skipped.
export function toMadridWallClockMs(iso: string): number {
  return Temporal.Instant.from(iso)
    .toZonedDateTimeISO(TIME_ZONE)
    .toPlainDateTime()
    .toZonedDateTime('UTC').epochMilliseconds;
}

// One of the 8 points of the vane, in Spanish (O = oeste).
export function compassPoint(degrees: number | null): string {
  if (degrees === null) {
    return '—';
  }
  return COMPASS[Math.round(degrees / 45) % 8];
}

export function isStale(lastTs: string | null, now: Temporal.Instant): boolean {
  if (!lastTs) {
    return true;
  }
  const age = now.since(Temporal.Instant.from(lastTs));
  return Temporal.Duration.compare(age, { minutes: STALE_AFTER_MINUTES }) > 0;
}

// Rain since midnight at each minute, from the rain of each minute.
export function cumulativeRain(perMinute: number[]): number[] {
  let total = 0;
  return perMinute.map((mm) => {
    total = Math.round((total + mm) * 10000) / 10000;
    return total;
  });
}

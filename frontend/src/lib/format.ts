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

// The instant a wall-clock ms from a chart stands for (inverse of toMadridWallClockMs). In the
// hour repeated when summer time ends, it takes the first (summer) one. Chart positions come
// with fractions of a millisecond, which Temporal rejects, so it rounds first.
export function fromMadridWallClockMs(ms: number): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(Math.round(ms))
    .toZonedDateTimeISO('UTC')
    .toPlainDateTime()
    .toZonedDateTime(TIME_ZONE, { disambiguation: 'compatible' })
    .toInstant();
}

// The inverse of toMadridWallClockMs, for labels: the Madrid wall-clock time it stands for.
function wallClock(ms: number): Temporal.PlainDateTime {
  return Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO('UTC').toPlainDateTime();
}

const wallDayFormat = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });

// Time axis label for a wall-clock ms: "mar 13" at midnight, "07:00" otherwise.
export function wallClockAxisLabel(ms: number): string {
  const time = wallClock(ms);
  if (time.hour === 0 && time.minute === 0) {
    return wallDayFormat.format(ms);
  }
  return time.toPlainTime().toString({ smallestUnit: 'minute' });
}

// Tooltip heading for a wall-clock ms: "mar 13, 07:12".
export function wallClockLabel(ms: number): string {
  return `${wallDayFormat.format(ms)}, ${wallClock(ms).toPlainTime().toString({ smallestUnit: 'minute' })}`;
}

// Tooltip heading for a stretch of `minutes` starting at a wall-clock ms: "mar 13, 07:10 – 07:20",
// or just the day for a whole day.
export function wallClockSpanLabel(ms: number, minutes: number): string {
  if (minutes <= 1) {
    return wallClockLabel(ms);
  }
  if (minutes >= 1440) {
    return wallDayFormat.format(ms);
  }
  const end = wallClock(ms + minutes * 60_000).toPlainTime().toString({ smallestUnit: 'minute' });
  return `${wallClockLabel(ms)} – ${end}`;
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

const dayFormat = new Intl.DateTimeFormat('es-ES', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric' });
const longDateFormat = new Intl.DateTimeFormat('es-ES', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' });
const fullDateFormat = new Intl.DateTimeFormat('es-ES', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// "mar 13": short weekday and day of the month in Madrid.
export function formatDay(iso: string): string {
  return dayFormat.format(new Date(iso));
}

// "Hoy" for today, else "Sáb 17", for a Madrid date (YYYY-MM-DD) in the forecast.
export function forecastDayLabel(date: string, today: Temporal.PlainDate): string {
  const day = Temporal.PlainDate.from(date);
  if (day.equals(today)) {
    return 'Hoy';
  }
  return capitalize(formatDay(middayOf(day)));
}

// "martes, 13 de octubre" in Madrid.
export function formatLongDate(iso: string): string {
  return longDateFormat.format(new Date(iso));
}

// "Miércoles, 21 de octubre de 2026" for a Madrid date (YYYY-MM-DD).
export function formatFullDate(date: string): string {
  return capitalize(fullDateFormat.format(new Date(middayOf(Temporal.PlainDate.from(date)))));
}

// Midday: a time every day has, whatever the clock change.
function middayOf(day: Temporal.PlainDate): string {
  return day.toZonedDateTime({ timeZone: TIME_ZONE, plainTime: '12:00' }).toInstant().toString();
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// "07:12" when it is the same Madrid day as now, otherwise "mar 13, 07:12".
export function formatWhen(iso: string, now: Temporal.Instant): string {
  const day = Temporal.Instant.from(iso).toZonedDateTimeISO(TIME_ZONE).toPlainDate();
  const sameDay = day.equals(now.toZonedDateTimeISO(TIME_ZONE).toPlainDate());
  return sameDay ? formatTime(iso) : `${formatDay(iso)}, ${formatTime(iso)}`;
}

// "hace 12 s", "hace 3 min", "hace 2 h".
export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) {
    return `hace ${s} s`;
  }
  if (s < 3600) {
    return `hace ${Math.floor(s / 60)} min`;
  }
  return `hace ${Math.floor(s / 3600)} h`;
}

// CEST in summer time, CET in winter time. From the offset: browsers name zones differently.
export function timeZoneName(now: Temporal.Instant): string {
  return now.toZonedDateTimeISO(TIME_ZONE).offset === '+02:00' ? 'CEST' : 'CET';
}

// Spanish greeting for the Madrid hour: días until 14:00, tardes until 21:00.
export function greeting(now: Temporal.Instant): string {
  const hour = now.toZonedDateTimeISO(TIME_ZONE).hour;
  if (hour >= 6 && hour < 14) {
    return 'Buenos días';
  }
  return hour >= 14 && hour < 21 ? 'Buenas tardes' : 'Buenas noches';
}

// Date pickers work with the browser's Date in its own zone. To pick Madrid times whatever that
// zone is, the picker shows a Date whose local fields are the Madrid wall-clock time, and the
// pick is read back the same way.
export function toPickerDate(iso: string): Date {
  const t = Temporal.Instant.from(iso).toZonedDateTimeISO(TIME_ZONE);
  return new Date(t.year, t.month - 1, t.day, t.hour, t.minute);
}

// The instant of a picked Madrid wall-clock time, to the minute. A time skipped when summer
// time starts moves forward an hour; a repeated one when it ends takes the first (summer) one.
export function fromPickerDate(date: Date): string {
  return Temporal.PlainDateTime.from({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  })
    .toZonedDateTime(TIME_ZONE, { disambiguation: 'compatible' })
    .toInstant()
    .toString();
}

// "13 oct, 07:00" in Madrid, for the custom range's title.
const shortDateTimeFormat = new Intl.DateTimeFormat('es-ES', {
  timeZone: TIME_ZONE, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

export function formatShortDateTime(iso: string): string {
  return shortDateTimeFormat.format(new Date(iso));
}

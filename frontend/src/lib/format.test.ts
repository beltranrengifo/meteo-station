import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
  compassPoint, forecastDayLabel, formatAge, fromMadridWallClockMs, formatDay, formatFullDate, formatLongDate, formatShortDateTime, formatTime, formatWhen, fromPickerDate, greeting, isStale,
  msToKmh, timeZoneName, toPickerDate,
  toMadridWallClockMs, wallClockAxisLabel, wallClockLabel, wallClockSpanLabel,
} from './format';

describe('msToKmh', () => {
  it('converts m/s to km/h', () => {
    expect(msToKmh(10)).toBeCloseTo(36);
    expect(msToKmh(null)).toBeNull();
  });
});

describe('formatTime', () => {
  it('shows Madrid time whatever the viewer zone', () => {
    expect(formatTime('2026-10-09T09:03:00+00:00')).toBe('11:03'); // summer, UTC+2
    expect(formatTime('2026-12-09T09:03:00+00:00')).toBe('10:03'); // winter, UTC+1
  });
});

describe('toMadridWallClockMs', () => {
  it('maps an instant to its Madrid wall-clock time, expressed as if it were UTC', () => {
    expect(new Date(toMadridWallClockMs('2026-10-09T09:03:00+00:00')).toISOString()).toBe('2026-10-09T11:03:00.000Z');
  });
});

describe('compassPoint', () => {
  it('names the 8 directions, wrapping at north', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(350)).toBe('N');
    expect(compassPoint(45)).toBe('NE');
    expect(compassPoint(225)).toBe('SO');
    expect(compassPoint(315)).toBe('NO');
    expect(compassPoint(null)).toBe('—');
  });
});

describe('isStale', () => {
  const now = Temporal.Instant.from('2026-10-09T09:10:00Z');
  it('is stale after 5 minutes without readings', () => {
    expect(isStale('2026-10-09T09:05:00+00:00', now)).toBe(false);
    expect(isStale('2026-10-09T09:04:59+00:00', now)).toBe(true);
    expect(isStale(null, now)).toBe(true);
  });
});

describe('day labels', () => {
  it('use the Madrid day', () => {
    // 23:30 on Tuesday the 13th in Madrid, already the 13th 21:30 in UTC.
    expect(formatDay('2026-10-13T21:30:00Z')).toBe('mar 13');
    expect(formatDay('2026-10-13T22:30:00Z')).toBe('mié 14');
    expect(formatLongDate('2026-10-13T22:30:00Z')).toBe('miércoles, 14 de octubre');
  });
  it('add the day only when it is not today', () => {
    const now = Temporal.Instant.from('2026-10-14T10:00:00Z');
    expect(formatWhen('2026-10-14T05:12:00Z', now)).toBe('07:12');
    expect(formatWhen('2026-10-13T21:30:00Z', now)).toBe('mar 13, 23:30');
  });
});

describe('formatAge', () => {
  it('uses seconds, then minutes, then hours', () => {
    expect(formatAge(12.9)).toBe('hace 12 s');
    expect(formatAge(185)).toBe('hace 3 min');
    expect(formatAge(7200)).toBe('hace 2 h');
    expect(formatAge(-1)).toBe('hace 0 s');
  });
});

describe('timeZoneName and greeting', () => {
  it('names summer and winter time', () => {
    expect(timeZoneName(Temporal.Instant.from('2026-10-24T12:00:00Z'))).toBe('CEST');
    expect(timeZoneName(Temporal.Instant.from('2026-10-25T12:00:00Z'))).toBe('CET');
  });
  it('greets by the Madrid hour', () => {
    expect(greeting(Temporal.Instant.from('2026-10-14T04:00:00Z'))).toBe('Buenos días'); // 06:00
    expect(greeting(Temporal.Instant.from('2026-10-14T12:00:00Z'))).toBe('Buenas tardes'); // 14:00
    expect(greeting(Temporal.Instant.from('2026-10-14T19:00:00Z'))).toBe('Buenas noches'); // 21:00
    expect(greeting(Temporal.Instant.from('2026-10-14T03:59:00Z'))).toBe('Buenas noches'); // 05:59
  });
});

describe('wall-clock labels', () => {
  it('show the day at midnight and the time otherwise', () => {
    const wall = (iso: string) => toMadridWallClockMs(iso);
    expect(wallClockAxisLabel(wall('2026-10-13T22:00:00Z'))).toBe('mié 14');
    expect(wallClockAxisLabel(wall('2026-10-14T05:00:00Z'))).toBe('07:00');
    expect(wallClockLabel(wall('2026-10-14T05:12:00Z'))).toBe('mié 14, 07:12');
  });
  it('name a stretch by its start and end, or by the day', () => {
    const wall = (iso: string) => toMadridWallClockMs(iso);
    expect(wallClockSpanLabel(wall('2026-10-14T05:12:00Z'), 1)).toBe('mié 14, 07:12');
    expect(wallClockSpanLabel(wall('2026-10-14T05:10:00Z'), 10)).toBe('mié 14, 07:10 – 07:20');
    expect(wallClockSpanLabel(wall('2026-10-14T16:00:00Z'), 360)).toBe('mié 14, 18:00 – 00:00');
    expect(wallClockSpanLabel(wall('2026-10-13T22:00:00Z'), 1440)).toBe('mié 14');
  });
});

describe('picker dates', () => {
  it('show the Madrid wall-clock time in the local fields, whatever the browser zone', () => {
    const date = toPickerDate('2026-10-14T05:12:00Z');
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2026, 9, 14, 7, 12]);
  });
  it('read a pick back as the Madrid instant', () => {
    expect(fromPickerDate(new Date(2026, 9, 14, 7, 12))).toBe('2026-10-14T05:12:00Z');
    expect(fromPickerDate(new Date(2026, 11, 14, 7, 12))).toBe('2026-12-14T06:12:00Z');
  });
  it('take the summer-time 02:30 on the night the clock goes back', () => {
    expect(fromPickerDate(new Date(2026, 9, 25, 2, 30))).toBe('2026-10-25T00:30:00Z');
  });
  it('title a custom range in Madrid time', () => {
    expect(formatShortDateTime('2026-10-13T05:00:00Z')).toBe('13 oct, 07:00');
  });
});

describe('fromMadridWallClockMs', () => {
  it('turns a chart time back into its instant', () => {
    expect(fromMadridWallClockMs(toMadridWallClockMs('2026-10-14T05:12:00Z')).toString()).toBe('2026-10-14T05:12:00Z');
    expect(fromMadridWallClockMs(toMadridWallClockMs('2026-12-14T05:12:00Z')).toString()).toBe('2026-12-14T05:12:00Z');
  });
  it('accepts the fractional ms a brush selection gives', () => {
    expect(fromMadridWallClockMs(toMadridWallClockMs('2026-10-14T05:12:00Z') + 0.4).toString()).toBe('2026-10-14T05:12:00Z');
  });
});

describe('forecastDayLabel', () => {
  const today = Temporal.PlainDate.from('2026-10-16');

  it('says Hoy for today', () => {
    expect(forecastDayLabel('2026-10-16', today)).toBe('Hoy');
  });

  it('gives a capitalised short weekday and the day otherwise', () => {
    expect(forecastDayLabel('2026-10-17', today)).toBe('Sáb 17');
  });

  it('works on the day the clock goes back', () => {
    expect(forecastDayLabel('2026-10-25', today)).toBe('Dom 25');
  });
});

describe('formatFullDate', () => {
  it('gives the capitalised weekday, day, month and year', () => {
    expect(formatFullDate('2026-10-21')).toBe('Miércoles, 21 de octubre de 2026');
  });

  it('keeps the date on the day the clock goes back', () => {
    expect(formatFullDate('2026-10-25')).toBe('Domingo, 25 de octubre de 2026');
  });
});

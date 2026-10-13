import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { compassPoint, cumulativeRain, formatTime, isStale, msToKmh, toMadridWallClockMs } from './format';

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

describe('cumulativeRain', () => {
  it('adds up the rain of each minute', () => {
    expect(cumulativeRain([0, 0.2794, 0, 0.2794])).toEqual([0, 0.2794, 0.2794, 0.5588]);
  });
});

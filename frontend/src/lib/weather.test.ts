import { describe, expect, it } from 'vitest';
import type { ReadingRow } from '../../shared/api-types';
import { dewPoint, feelsLike, precipIntensity, pressureTrend, skyKind, skyLabel, uvCategory } from './weather';

function reading(ts: string, values: Partial<ReadingRow> = {}): ReadingRow {
  return {
    ts,
    temp_c: 20,
    humidity_pct: 50,
    pressure_hpa: 945,
    wind_avg_ms: 0,
    wind_gust_ms: 0,
    wind_dir_deg: 0,
    rain_mm: 0,
    ...values,
  };
}

describe('dewPoint', () => {
  it('follows the Magnus formula', () => {
    expect(dewPoint(20, 50)).toBeCloseTo(9.26, 2);
    expect(dewPoint(20, 100)).toBeCloseTo(20, 5); // saturated air: dew point is the temperature
  });
  it('is null without data', () => {
    expect(dewPoint(null, 50)).toBeNull();
    expect(dewPoint(20, null)).toBeNull();
    expect(dewPoint(20, 0)).toBeNull();
  });
});

describe('feelsLike', () => {
  it('follows the apparent temperature formula', () => {
    expect(feelsLike(20, 50, 0)).toBeCloseTo(19.85, 2);
    expect(feelsLike(16, 50, 1.8)).toBeCloseTo(13.73, 2); // wind makes it feel colder
    expect(feelsLike(30, 70, 1)).toBeCloseTo(35.07, 2); // humid heat feels hotter
    expect(feelsLike(0, 80, 5)).toBeCloseTo(-5.89, 2);
  });
  it('is null without data', () => {
    expect(feelsLike(null, 50, 1)).toBeNull();
    expect(feelsLike(20, null, 1)).toBeNull();
    expect(feelsLike(20, 50, null)).toBeNull();
  });
});

describe('pressureTrend', () => {
  it('compares the latest reading with the one 3 hours before', () => {
    const readings = [
      reading('2026-10-14T06:00:00Z', { pressure_hpa: 940 }),
      reading('2026-10-14T07:00:00Z', { pressure_hpa: 944.6 }),
      reading('2026-10-14T10:00:00Z', { pressure_hpa: 944.3 }),
    ];
    expect(pressureTrend(readings)).toBe(-0.3);
  });
  it('accepts an older reading up to 10 minutes off', () => {
    const readings = [reading('2026-10-14T07:10:00Z', { pressure_hpa: 944 }), reading('2026-10-14T10:00:00Z', { pressure_hpa: 945 })];
    expect(pressureTrend(readings)).toBe(1);
  });
  it('is null when the station was off 3 hours ago', () => {
    const readings = [reading('2026-10-14T07:11:00Z'), reading('2026-10-14T10:00:00Z')];
    expect(pressureTrend(readings)).toBeNull();
    expect(pressureTrend([])).toBeNull();
  });
});

describe('sky', () => {
  it('names the WMO codes in Spanish', () => {
    expect(skyLabel(0)).toBe('Despejado');
    expect(skyLabel(63)).toBe('Lluvia moderada');
    expect(skyLabel(42)).toBe('Cielo sin datos');
  });
  it('groups the codes into what the picture draws', () => {
    expect([0, 1, 2, 3, 45, 55, 63, 81, 73, 86, 95, 99].map(skyKind)).toEqual([
      'clear', 'clear', 'partly', 'cloudy', 'cloudy', 'rain', 'rain', 'rain', 'snow', 'snow', 'storm', 'storm',
    ]);
  });
  it('grades rain and snow, and nothing for a dry sky', () => {
    expect([2, 45, 55, 61, 63, 65, 80, 82, 71, 73, 86, 95].map(precipIntensity)).toEqual([
      null, null, 'light', 'light', 'moderate', 'heavy', 'light', 'heavy', 'light', 'moderate', 'heavy', 'heavy',
    ]);
  });
});

describe('uvCategory', () => {
  it('uses the WHO bands on the rounded index', () => {
    expect([0, 2.4, 2.5, 5, 6, 7.4, 8, 10, 11].map(uvCategory)).toEqual([
      'bajo', 'bajo', 'moderado', 'moderado', 'alto', 'alto', 'muy alto', 'muy alto', 'extremo',
    ]);
  });
});

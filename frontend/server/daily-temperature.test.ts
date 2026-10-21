import { describe, expect, it } from 'vitest';
import {
  measuredYesterdayMax, nightMinimum, temperatureCorrection, todayRange, type StationDay,
} from './daily-temperature';
import type { TodayHour } from './open-meteo';

function hour(h: number, tempC: number): TodayHour {
  return {
    hour: h, tempC, weatherCode: 0, isDay: true, pressureHpa: 1015, windKmh: 5, windDirDeg: 0,
    gustKmh: 10, precipMm: 0, precipProbabilityPct: 0,
  };
}

// A model day: 4 °C at 5:00, 10 °C at 9:00, 20 °C at 16:00, 8 °C at 23:00, 12 °C otherwise.
const TEMPS: Record<number, number> = { 5: 4, 9: 10, 16: 20, 23: 8 };
const DAY = Array.from({ length: 24 }, (_, h) => hour(h, TEMPS[h] ?? 12));

const station = (values: Partial<StationDay> = {}): StationDay => ({ temp9: null, nightMin: null, yesterdayMax: null, ...values });

describe('temperatureCorrection', () => {
  it('averages the 9:00 error and yesterday high error', () => {
    // 9:00: 12 measured vs 10 forecast = +2. Yesterday: 21 measured vs 20 forecast = +1.
    expect(temperatureCorrection(station({ temp9: 12, yesterdayMax: 21 }), DAY, 20)).toBe(1.5);
  });
  it('uses the one it has', () => {
    expect(temperatureCorrection(station({ temp9: 12 }), DAY, 20)).toBe(2);
    expect(temperatureCorrection(station({ yesterdayMax: 21 }), DAY, 20)).toBe(1);
    expect(temperatureCorrection(station({ yesterdayMax: 21 }), DAY, null)).toBe(0);
  });
  it('is 0 without station data', () => {
    expect(temperatureCorrection(station(), DAY, 20)).toBe(0);
  });
  it('is capped at 5 °C either way', () => {
    expect(temperatureCorrection(station({ temp9: 30 }), DAY, null)).toBe(5);
    expect(temperatureCorrection(station({ temp9: -2 }), DAY, null)).toBe(-5);
  });
});

describe('todayRange', () => {
  it('corrects the model high from 9:00 on', () => {
    expect(todayRange(DAY, station(), 1).max).toEqual({ tempC: 21, hour: 16 });
  });
  it('takes the measured night low when it is the lowest', () => {
    expect(todayRange(DAY, station({ nightMin: { tempC: 6, hour: 7 } }), 1).min).toEqual({ tempC: 6, hour: 7 });
  });
  it('takes a lower corrected low later in the day', () => {
    expect(todayRange(DAY, station({ nightMin: { tempC: 10, hour: 6 } }), 1).min).toEqual({ tempC: 9, hour: 23 });
  });
  it('without a measured low, takes the model low of the whole day', () => {
    expect(todayRange(DAY, station(), 1).min).toEqual({ tempC: 5, hour: 5 });
  });
});

describe('nightMinimum', () => {
  // From 00:00 on 22 Oct in Madrid (22:00Z the day before), one reading a minute.
  const readings = (count: number) => Array.from({ length: count }, (_, i) => ({
    ts: new Date(Date.parse('2026-10-21T22:00:00Z') + i * 60_000).toISOString(),
    temp_c: i === 300 ? 3.5 : 10, // 05:00 in Madrid
  }));
  it('finds the lowest reading and its Madrid hour', () => {
    expect(nightMinimum(readings(430))).toEqual({ tempC: 3.5, hour: 5 });
  });
  it('is null with fewer than 430 readings with a temperature', () => {
    expect(nightMinimum(readings(429))).toBeNull();
    expect(nightMinimum(readings(430).map((r, i) => (i === 0 ? { ...r, temp_c: null } : r)))).toBeNull();
  });
});

describe('measuredYesterdayMax', () => {
  it('needs 1200 samples', () => {
    expect(measuredYesterdayMax({ temp_max: 21.3, samples: 1200 })).toBe(21.3);
    expect(measuredYesterdayMax({ temp_max: 21.3, samples: 1199 })).toBeNull();
    expect(measuredYesterdayMax({ temp_max: null, samples: 1440 })).toBeNull();
    expect(measuredYesterdayMax(null)).toBeNull();
  });
});

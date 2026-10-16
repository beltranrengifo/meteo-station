import { describe, expect, it } from 'vitest';
import type { ForecastHour } from '../../shared/api-types';
import { formatRain, formatSnow, precipitationOver } from './forecast';

function hour(precipMm: number | null, precipProbabilityPct: number | null, snowCm: number | null = 0): ForecastHour {
  return { time: '2026-10-16T12:00:00Z', weatherCode: 61, isDay: true, tempC: 15, precipMm, precipProbabilityPct, snowCm };
}

describe('precipitationOver', () => {
  it('adds the amounts and keeps the highest chance', () => {
    expect(precipitationOver([hour(0.1, 20), hour(0.2, 45), hour(0, 30)])).toEqual({ mm: 0.3, probabilityPct: 45, snowCm: 0 });
  });

  it('adds the snow', () => {
    expect(precipitationOver([hour(0.7, 60, 0.49), hour(1.4, 80, 0.98)]).snowCm).toBe(1.5);
  });

  it('skips hours without data, and gives null when none has any', () => {
    expect(precipitationOver([hour(null, null, null), hour(0.4, 10)])).toEqual({ mm: 0.4, probabilityPct: 10, snowCm: 0 });
    expect(precipitationOver([hour(null, null, null)])).toEqual({ mm: null, probabilityPct: null, snowCm: null });
  });
});

describe('formatSnow', () => {
  it('shows tenths below 1 cm and whole cm above', () => {
    expect(formatSnow(0.7)).toBe('0.7 cm');
    expect(formatSnow(3.4)).toBe('3 cm');
  });
});

describe('formatRain', () => {
  it('shows tenths, a plain 0 for none and a dash without data', () => {
    expect(formatRain(2)).toBe('2.0 mm');
    expect(formatRain(0)).toBe('0 mm');
    expect(formatRain(null)).toBe('—');
  });
});

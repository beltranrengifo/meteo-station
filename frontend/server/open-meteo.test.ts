import { describe, expect, it } from 'vitest';
import { forecastUrl, toSky } from './open-meteo.js';

describe('forecastUrl', () => {
  it('asks for current sky and UV plus today\'s UV peak, in Madrid time', () => {
    const url = new URL(forecastUrl('40.5', '-3.9'));
    expect(url.searchParams.get('latitude')).toBe('40.5');
    expect(url.searchParams.get('longitude')).toBe('-3.9');
    expect(url.searchParams.get('current')).toBe('weather_code,cloud_cover,is_day,uv_index');
    expect(url.searchParams.get('daily')).toBe('uv_index_max');
    expect(url.searchParams.get('timezone')).toBe('Europe/Madrid');
  });
});

describe('toSky', () => {
  // Trimmed from a real response.
  const forecast = {
    current: { time: '2026-10-13T11:45', weather_code: 2, cloud_cover: 40, is_day: 1, uv_index: 3.35 },
    daily: { time: ['2026-10-13'], uv_index_max: [4.9] },
  };

  it('maps the fields and turns the local time into an instant', () => {
    expect(toSky(forecast)).toEqual({
      observedAt: '2026-10-13T09:45:00Z', // 11:45 Madrid in summer time (UTC+2)
      weatherCode: 2,
      cloudCoverPct: 40,
      isDay: true,
      uvIndex: 3.35,
      uvIndexMaxToday: 4.9,
    });
  });

  it('reads is_day 0 as night', () => {
    expect(toSky({ ...forecast, current: { ...forecast.current, is_day: 0 } }).isDay).toBe(false);
  });
});

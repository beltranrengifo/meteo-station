import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { forecastUrl, toForecast, toSky, weekUrl, type OpenMeteoWeek } from './open-meteo.js';

describe('weekUrl', () => {
  it('asks for 7 days in exact instants, Madrid days and m/s', () => {
    const url = new URL(weekUrl({ latitude: 40.5, longitude: -3.9 }));
    expect(url.searchParams.get('timezone')).toBe('Europe/Madrid');
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
    expect(url.searchParams.get('wind_speed_unit')).toBe('ms');
    expect(url.searchParams.get('forecast_days')).toBe('7');
  });
});

describe('toForecast', () => {
  // 2026-10-16 00:00 in Madrid (UTC+2), as Open-Meteo sends it.
  const midnight = 1792101600;
  const hourCount = 48;
  const week: OpenMeteoWeek = {
    hourly: {
      time: Array.from({ length: hourCount }, (_, i) => midnight + i * 3600),
      weather_code: Array.from({ length: hourCount }, (_, i) => i),
      temperature_2m: Array.from({ length: hourCount }, (_, i) => 10 + i / 10),
      precipitation_probability: Array.from({ length: hourCount }, (_, i) => (i === 14 ? null : i)),
      is_day: Array.from({ length: hourCount }, (_, i) => (i % 24 >= 8 && i % 24 < 19 ? 1 : 0)),
    },
    daily: {
      time: [midnight, midnight + 86400],
      weather_code: [2, 61],
      temperature_2m_max: [26.1, 22.3],
      temperature_2m_min: [13.4, 15.5],
      precipitation_sum: [0, 2],
      precipitation_probability_max: [0, 48],
      wind_gusts_10m_max: [3.4, 9.3],
    },
  };
  // 14:34 in Madrid.
  const now = Temporal.Instant.from('2026-10-16T12:34:00Z');

  it('starts the hours at the current one and keeps 24', () => {
    const { hours } = toForecast(week, now);
    expect(hours).toHaveLength(24);
    expect(hours[0]).toEqual({
      time: '2026-10-16T12:00:00Z', weatherCode: 14, isDay: true, tempC: 11.4, precipProbabilityPct: null,
    });
    expect(hours.at(-1)!.time).toBe('2026-10-17T11:00:00Z');
  });

  it('dates each day in Madrid', () => {
    const { days } = toForecast(week, now);
    expect(days.map((d) => d.date)).toEqual(['2026-10-16', '2026-10-17']);
    expect(days[1]).toEqual({
      date: '2026-10-17', weatherCode: 61, tempMinC: 15.5, tempMaxC: 22.3, precipMm: 2, precipProbabilityPct: 48, gustMaxMs: 9.3,
    });
  });

  it('gives no hours once the forecast is all in the past', () => {
    expect(toForecast(week, Temporal.Instant.from('2026-10-20T00:00:00Z')).hours).toEqual([]);
  });
});

describe('forecastUrl', () => {
  it('asks for current sky and UV plus today\'s UV peak, in Madrid time', () => {
    const url = new URL(forecastUrl({ latitude: 40.5, longitude: -3.9 }));
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

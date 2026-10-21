import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
  forecastUrl,
  previousDayForecastMax,
  previousRunsUrl,
  toForecast,
  toSky,
  toTodayHours,
  todayUrl,
  weekUrl,
  type OpenMeteoToday,
  type OpenMeteoPreviousRuns,
  type OpenMeteoWeek,
} from './open-meteo.js';

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
      precipitation: Array.from({ length: hourCount }, (_, i) => i / 10),
      precipitation_probability: Array.from({ length: hourCount }, (_, i) => (i === 15 ? null : i)),
      snowfall: Array.from({ length: hourCount }, (_, i) => (i === 16 ? 0.7 : 0)),
      is_day: Array.from({ length: hourCount }, (_, i) => (i % 24 >= 8 && i % 24 < 19 ? 1 : 0)),
    },
    daily: {
      time: [midnight, midnight + 86400],
      weather_code: [2, 61],
      temperature_2m_max: [26.1, 22.3],
      temperature_2m_min: [13.4, 15.5],
      precipitation_sum: [0, 2],
      precipitation_probability_max: [0, 48],
      snowfall_sum: [0, 1.4],
      wind_gusts_10m_max: [3.4, 9.3],
    },
  };
  // 14:34 in Madrid.
  const now = Temporal.Instant.from('2026-10-16T12:34:00Z');

  it('starts the hours at the current one and keeps 24', () => {
    const { hours } = toForecast(week, now);
    expect(hours).toHaveLength(24);
    expect(hours[0]).toMatchObject({ time: '2026-10-16T12:00:00Z', weatherCode: 14, isDay: true, tempC: 11.4 });
    expect(hours.at(-1)!.time).toBe('2026-10-17T11:00:00Z');
  });

  it('gives each hour the rain of the hour after it', () => {
    // 14:00 Madrid gets Open-Meteo's 15:00 values, which are for 14:00 to 15:00.
    const [first, second] = toForecast(week, now).hours;
    expect(first).toMatchObject({ precipMm: 1.5, precipProbabilityPct: null, snowCm: 0 });
    expect(second).toMatchObject({ precipMm: 1.6, precipProbabilityPct: 16, snowCm: 0.7 });
  });

  it('has no rain for an hour past the end of the forecast', () => {
    // 22:00 UTC on the second day: the last hour Open-Meteo sent.
    const [last] = toForecast(week, Temporal.Instant.from('2026-10-17T21:00:00Z')).hours;
    expect(last).toMatchObject({ time: '2026-10-17T21:00:00Z', precipMm: null, precipProbabilityPct: null, snowCm: null });
  });

  it('dates each day in Madrid', () => {
    const { days } = toForecast(week, now);
    expect(days.map((d) => d.date)).toEqual(['2026-10-16', '2026-10-17']);
    expect(days[1]).toEqual({
      date: '2026-10-17', weatherCode: 61, tempMinC: 15.5, tempMaxC: 22.3, precipMm: 2, precipProbabilityPct: 48, snowCm: 1.4, gustMaxMs: 9.3,
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

const unix = (iso: string) => Temporal.Instant.from(iso).epochMilliseconds / 1000;

describe('todayUrl', () => {
  it('asks for today and tomorrow by hour, wind in km/h, in Madrid time', () => {
    const url = new URL(todayUrl({ latitude: 40.4, longitude: -3.7 }));
    expect(`${url.origin}${url.pathname}`).toBe('https://api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('forecast_days')).toBe('2');
    expect(url.searchParams.get('wind_speed_unit')).toBe('kmh');
    expect(url.searchParams.get('timezone')).toBe('Europe/Madrid');
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
    expect(url.searchParams.get('hourly')).toBe(
      'temperature_2m,weather_code,is_day,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability',
    );
  });
});

function todayData(times: string[]): OpenMeteoToday {
  const n = times.length;
  return {
    hourly: {
      time: times.map(unix),
      temperature_2m: times.map((_, i) => 10 + i),
      weather_code: Array<number>(n).fill(0),
      is_day: Array<number>(n).fill(1),
      pressure_msl: Array<number>(n).fill(1015),
      wind_speed_10m: Array<number>(n).fill(5),
      wind_direction_10m: Array<number>(n).fill(270),
      wind_gusts_10m: times.map((_, i) => 20 + i),
      precipitation: times.map((_, i) => i / 10),
      precipitation_probability: times.map((_, i) => i * 10),
    },
  };
}

describe('toTodayHours', () => {
  it('keeps today in Madrid and takes rain and gusts from the next hour', () => {
    // 22:00 and 23:00 on 22 Oct in Madrid (UTC+2), then 00:00 on the 23rd.
    const data = todayData(['2026-10-22T20:00:00Z', '2026-10-22T21:00:00Z', '2026-10-22T22:00:00Z']);
    const hours = toTodayHours(data, Temporal.PlainDate.from('2026-10-22'));
    expect(hours.map((h) => h.hour)).toEqual([22, 23]);
    expect(hours[1]).toEqual({
      hour: 23, tempC: 11, weatherCode: 0, isDay: true, pressureHpa: 1015, windKmh: 5, windDirDeg: 270,
      gustKmh: 22, precipMm: 0.2, precipProbabilityPct: 20,
    });
  });
  it('keeps both 2:00 hours when summer time ends', () => {
    // 25 Oct 2026: 00:00Z is 02:00 at UTC+2, 01:00Z is 02:00 again at UTC+1, 02:00Z is 03:00.
    const data = todayData(['2026-10-25T00:00:00Z', '2026-10-25T01:00:00Z', '2026-10-25T02:00:00Z']);
    const hours = toTodayHours(data, Temporal.PlainDate.from('2026-10-25'));
    expect(hours.map((h) => h.hour)).toEqual([2, 2, 3]);
    expect(hours.map((h) => h.gustKmh)).toEqual([21, 22, null]);
  });
});

describe('previousRunsUrl', () => {
  it('asks the previous runs API for yesterday as forecast the day before', () => {
    const url = new URL(previousRunsUrl({ latitude: 40.4, longitude: -3.7 }));
    expect(`${url.origin}${url.pathname}`).toBe('https://previous-runs-api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('hourly')).toBe('temperature_2m_previous_day1');
    expect(url.searchParams.get('past_days')).toBe('1');
    expect(url.searchParams.get('forecast_days')).toBe('1');
    expect(url.searchParams.get('timezone')).toBe('Europe/Madrid');
  });
});

describe('previousDayForecastMax', () => {
  it('takes the highest of that Madrid day, skipping missing values', () => {
    const data: OpenMeteoPreviousRuns = {
      hourly: {
        // 23:00 on the 20th, 14:00 and 15:00 on the 21st, 00:00 on the 22nd (Madrid, UTC+2).
        time: ['2026-10-20T21:00:00Z', '2026-10-21T12:00:00Z', '2026-10-21T13:00:00Z', '2026-10-21T22:00:00Z'].map(unix),
        temperature_2m_previous_day1: [30, 17.2, null, 25],
      },
    };
    expect(previousDayForecastMax(data, Temporal.PlainDate.from('2026-10-21'))).toBe(17.2);
  });
  it('is null when the day has no values', () => {
    const data: OpenMeteoPreviousRuns = { hourly: { time: [unix('2026-10-21T12:00:00Z')], temperature_2m_previous_day1: [null] } };
    expect(previousDayForecastMax(data, Temporal.PlainDate.from('2026-10-21'))).toBeNull();
  });
});


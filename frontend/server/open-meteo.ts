// Sky state, UV and the week's forecast from Open-Meteo (free for non-commercial use, no API
// key). The station measures none of them, so they come from a weather model for its location.
import { Temporal } from 'temporal-polyfill';
import type { ForecastResponse, SkyResponse } from '../shared/api-types.js';
import { TIME_ZONE } from './params.js';
import type { Coordinates } from './station-choice.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const PREVIOUS_RUNS_URL = 'https://previous-runs-api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 5000;

// The parts of the Open-Meteo response we read. Times are local (TIME_ZONE), with no offset.
export interface OpenMeteoForecast {
  current: { time: string; weather_code: number; cloud_cover: number; is_day: number; uv_index: number };
  daily: { time: string[]; uv_index_max: number[] };
}

export function forecastUrl({ latitude, longitude }: Coordinates): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'weather_code,cloud_cover,is_day,uv_index',
    daily: 'uv_index_max',
    timezone: TIME_ZONE,
    forecast_days: '1',
  });
  return `${FORECAST_URL}?${params}`;
}

export function toSky(forecast: OpenMeteoForecast): SkyResponse {
  const { current, daily } = forecast;
  return {
    observedAt: Temporal.PlainDateTime.from(current.time).toZonedDateTime(TIME_ZONE).toInstant().toString(),
    weatherCode: current.weather_code,
    cloudCoverPct: current.cloud_cover,
    isDay: current.is_day === 1,
    uvIndex: current.uv_index,
    uvIndexMaxToday: daily.uv_index_max[0],
  };
}

// The forecast tab: the next 24 hours, and today plus the next 6 days.
const FORECAST_HOURS = 24;
const FORECAST_DAYS = 7;

// The parts of the week forecast we read. With timeformat=unixtime, hourly times are exact
// instants (the hour repeated when summer time ends is not ambiguous) and daily times are each
// day's local midnight. Wind speeds in m/s, like the station's. Precipitation (rain and snow,
// as water) in mm, snowfall in cm. Hourly precipitation, snowfall and the chance of more than
// 0.1 mm are for the hour *before* each time.
export interface OpenMeteoWeek {
  hourly: {
    time: number[];
    weather_code: number[];
    temperature_2m: number[];
    precipitation: (number | null)[];
    precipitation_probability: (number | null)[];
    snowfall: (number | null)[];
    is_day: number[];
  };
  daily: {
    time: number[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: (number | null)[];
    snowfall_sum: number[];
    wind_gusts_10m_max: number[];
  };
}

export function weekUrl({ latitude, longitude }: Coordinates): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: 'weather_code,temperature_2m,precipitation,precipitation_probability,snowfall,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,snowfall_sum,wind_gusts_10m_max',
    timezone: TIME_ZONE,
    timeformat: 'unixtime',
    wind_speed_unit: 'ms',
    forecast_days: String(FORECAST_DAYS),
  });
  return `${FORECAST_URL}?${params}`;
}

// Hours from the current one on (Open-Meteo starts at today's 00:00), and every day. Each hour
// gets the precipitation and snow of the hour that follows it (Open-Meteo's value at the next time), so an hour
// reads as "from this time on"; null past the last one.
export function toForecast(week: OpenMeteoWeek, now: Temporal.Instant): ForecastResponse {
  const { hourly, daily } = week;
  const thisHour = now.round({ smallestUnit: 'hour', roundingMode: 'floor' }).epochMilliseconds;
  const first = hourly.time.findIndex((t) => t * 1000 >= thisHour);
  const hours = (first === -1 ? [] : hourly.time.slice(first, first + FORECAST_HOURS)).map((t, i) => {
    const at = first + i;
    return {
      time: Temporal.Instant.fromEpochMilliseconds(t * 1000).toString(),
      weatherCode: hourly.weather_code[at],
      isDay: hourly.is_day[at] === 1,
      tempC: hourly.temperature_2m[at],
      precipMm: hourly.precipitation[at + 1] ?? null,
      precipProbabilityPct: hourly.precipitation_probability[at + 1] ?? null,
      snowCm: hourly.snowfall[at + 1] ?? null,
    };
  });
  const days = daily.time.map((t, i) => ({
    date: Temporal.Instant.fromEpochMilliseconds(t * 1000).toZonedDateTimeISO(TIME_ZONE).toPlainDate().toString(),
    weatherCode: daily.weather_code[i],
    tempMinC: daily.temperature_2m_min[i],
    tempMaxC: daily.temperature_2m_max[i],
    precipMm: daily.precipitation_sum[i],
    precipProbabilityPct: daily.precipitation_probability_max[i],
    snowCm: daily.snowfall_sum[i],
    gustMaxMs: daily.wind_gusts_10m_max[i],
  }));
  return { hours, days };
}

async function getOpenMeteo<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Open-Meteo: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

// Coordinates only come from env vars (STATION_COORDINATES): neither the repository nor the
// database holds a station's exact location, and no response ever includes it.
export async function fetchSky(coordinates: Coordinates): Promise<SkyResponse> {
  return toSky(await getOpenMeteo<OpenMeteoForecast>(forecastUrl(coordinates)));
}

export async function fetchForecast(coordinates: Coordinates): Promise<ForecastResponse> {
  return toForecast(await getOpenMeteo<OpenMeteoWeek>(weekUrl(coordinates)), Temporal.Now.instant());
}

// One hour of today's forecast for the 9:00 notification: hour h covers h:00 to h+1:00 in Madrid.
// Instant values (temperature, sky, pressure, wind) are Open-Meteo's at h:00; precipitation, its
// chance and gusts are its values at h+1:00, which cover the hour before that time.
export interface TodayHour {
  hour: number; // Madrid hour, 0-23 (2 twice when summer time ends)
  tempC: number;
  weatherCode: number;
  isDay: boolean;
  pressureHpa: number; // at sea level
  windKmh: number;
  windDirDeg: number; // where the wind comes from
  gustKmh: number | null;
  precipMm: number | null;
  precipProbabilityPct: number | null;
}

export interface OpenMeteoToday {
  hourly: {
    time: number[];
    temperature_2m: number[];
    weather_code: number[];
    is_day: number[];
    pressure_msl: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    wind_gusts_10m: (number | null)[];
    precipitation: (number | null)[];
    precipitation_probability: (number | null)[];
  };
}

export function todayUrl({ latitude, longitude }: Coordinates): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: 'temperature_2m,weather_code,is_day,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability',
    timezone: TIME_ZONE,
    timeformat: 'unixtime',
    wind_speed_unit: 'kmh',
    // Tomorrow's 00:00 holds the rain and gusts of today's last hour.
    forecast_days: '2',
  });
  return `${FORECAST_URL}?${params}`;
}

export function toTodayHours(data: OpenMeteoToday, today: Temporal.PlainDate): TodayHour[] {
  const { hourly } = data;
  const hours: TodayHour[] = [];
  hourly.time.forEach((t, i) => {
    const local = Temporal.Instant.fromEpochMilliseconds(t * 1000).toZonedDateTimeISO(TIME_ZONE);
    if (!local.toPlainDate().equals(today)) {
      return;
    }
    hours.push({
      hour: local.hour,
      tempC: hourly.temperature_2m[i],
      weatherCode: hourly.weather_code[i],
      isDay: hourly.is_day[i] === 1,
      pressureHpa: hourly.pressure_msl[i],
      windKmh: hourly.wind_speed_10m[i],
      windDirDeg: hourly.wind_direction_10m[i],
      gustKmh: hourly.wind_gusts_10m[i + 1] ?? null,
      precipMm: hourly.precipitation[i + 1] ?? null,
      precipProbabilityPct: hourly.precipitation_probability[i + 1] ?? null,
    });
  });
  return hours;
}

// What the model run of the day before forecast, hour by hour (Open-Meteo's Previous Runs API).
export interface OpenMeteoPreviousRuns {
  hourly: { time: number[]; temperature_2m_previous_day1: (number | null)[] };
}

export function previousRunsUrl({ latitude, longitude }: Coordinates): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: 'temperature_2m_previous_day1',
    timezone: TIME_ZONE,
    timeformat: 'unixtime',
    past_days: '1',
    forecast_days: '1',
  });
  return `${PREVIOUS_RUNS_URL}?${params}`;
}

// The highest temperature forecast for `day` (Madrid) by the run of the day before.
export function previousDayForecastMax(data: OpenMeteoPreviousRuns, day: Temporal.PlainDate): number | null {
  const { time, temperature_2m_previous_day1: temps } = data.hourly;
  let max: number | null = null;
  time.forEach((t, i) => {
    const temp = temps[i];
    const date = Temporal.Instant.fromEpochMilliseconds(t * 1000).toZonedDateTimeISO(TIME_ZONE).toPlainDate();
    if (temp !== null && date.equals(day) && (max === null || temp > max)) {
      max = temp;
    }
  });
  return max;
}

// Today's hours, with one retry. Throws without hours 9 to 23: the message needs them all.
export async function fetchToday(coordinates: Coordinates, today: Temporal.PlainDate): Promise<TodayHour[]> {
  const url = todayUrl(coordinates);
  const data = await getOpenMeteo<OpenMeteoToday>(url).catch(() => getOpenMeteo<OpenMeteoToday>(url));
  const hours = toTodayHours(data, today);
  if (!hours.some((h) => h.hour === 9) || !hours.some((h) => h.hour === 23)) {
    throw new Error('Open-Meteo: today is incomplete');
  }
  return hours;
}

// Optional: without it the correction uses only the 9:00 reading.
export async function fetchYesterdayForecastMax(coordinates: Coordinates, yesterday: Temporal.PlainDate): Promise<number | null> {
  try {
    return previousDayForecastMax(await getOpenMeteo<OpenMeteoPreviousRuns>(previousRunsUrl(coordinates)), yesterday);
  } catch (error) {
    console.error(error);
    return null;
  }
}

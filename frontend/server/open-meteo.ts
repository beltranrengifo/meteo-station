// Sky state and UV from Open-Meteo (free for non-commercial use, no API key).
// The station measures neither, so they come from a weather model for the station's location.
import { Temporal } from 'temporal-polyfill';
import type { SkyResponse } from '../shared/api-types.js';
import { TIME_ZONE } from './params.js';
import type { Coordinates } from './station-choice.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
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

// Coordinates only come from env vars (STATION_COORDINATES): neither the repository nor the
// database holds a station's exact location, and no response ever includes it.
export async function fetchSky(coordinates: Coordinates): Promise<SkyResponse> {
  const url = forecastUrl(coordinates);
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Open-Meteo: HTTP ${response.status}`);
  }
  return toSky((await response.json()) as OpenMeteoForecast);
}

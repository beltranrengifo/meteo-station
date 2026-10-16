// Shapes of the read API responses, shared by api/ (server) and src/ (browser).
// Types and plain constants only: nothing here may touch secrets.
import type { Tables } from './database.types.js';

// Columns of a one-minute reading sent to the browser: /api/day returns 1440 of them, so
// diagnostics (rssi, uptime, fw) and bookkeeping (id, inserted_at) stay out. `satisfies`
// checks each name against database.types.ts at compile time. Aggregates send every column.
export const READING_FIELDS = [
  'ts', 'temp_c', 'humidity_pct', 'pressure_hpa', 'wind_avg_ms', 'wind_gust_ms', 'wind_dir_deg', 'rain_mm',
] as const satisfies readonly (keyof Tables<'readings'>)[];

export type ReadingRow = Pick<Tables<'readings'>, (typeof READING_FIELDS)[number]>;
export type HourlyRow = Tables<'readings_hourly'>;
export type DailyRow = Tables<'readings_daily'>;

// Every endpoint below takes an optional ?station=<device_id>; without it, the default station.

// GET /api/stations: the stations the dashboard lists, oldest first.
export interface StationInfo {
  id: string;   // device_id
  name: string; // public name, e.g. "Madrid, Las Rozas"
}

export interface StationsResponse {
  stations: StationInfo[];
  defaultId: string | null; // null only when no station is listed
}

// GET /api/now
export interface NowResponse {
  reading: ReadingRow | null;
  today: DailyRow | null;
  installDate: string; // YYYY-MM-DD: the first day with data; the API rejects anything earlier
}

// GET /api/day?date=YYYY-MM-DD
export interface DayResponse {
  date: string;
  summary: DailyRow | null;
  readings: ReadingRow[];
}

// GET /api/last-24h: readings with from < ts <= to (instants, ISO 8601 UTC).
export interface Last24hResponse {
  from: string;
  to: string;
  readings: ReadingRow[];
}

// GET /api/last-7-days: hourly stats with from <= hour < to, computed from the readings
// on each request, so the current hour is exact (stored aggregates lag up to 10 minutes).
export interface Last7DaysResponse {
  from: string;
  to: string;
  hours: HourlyRow[];
}

// GET /api/range?from=&to=: a custom range, from <= ts < to (instants, ISO 8601 UTC; `to` is
// cut to now). One-minute readings up to 48 hours, hourly stats for longer ranges.
export type RangeResponse =
  | { from: string; to: string; resolution: 'minute'; readings: ReadingRow[] }
  | { from: string; to: string; resolution: 'hour'; hours: HourlyRow[] };

// GET /api/sky: sky and UV for the station from Open-Meteo (model data, not measured here).
// Open-Meteo data is CC BY 4.0: the dashboard must credit it.
export interface SkyResponse {
  observedAt: string;      // instant the values are for (ISO 8601 UTC), 15-minute steps
  weatherCode: number;     // WMO weather interpretation code
  cloudCoverPct: number;
  isDay: boolean;
  uvIndex: number;
  uvIndexMaxToday: number;
}

// GET /api/month?month=YYYY-MM
export interface MonthResponse {
  month: string;
  days: DailyRow[];
  hours: HourlyRow[];
}

// GET /api/daily
export interface DailyResponse {
  days: DailyRow[];
}

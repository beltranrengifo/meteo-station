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

// GET /api/now
export interface NowResponse {
  reading: ReadingRow | null;
  today: DailyRow | null;
}

// GET /api/day?date=YYYY-MM-DD
export interface DayResponse {
  date: string;
  summary: DailyRow | null;
  readings: ReadingRow[];
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

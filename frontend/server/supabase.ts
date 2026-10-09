// Server-side Supabase access for the read API. Uses the secret key, so this module must
// never be imported from src/ (browser code).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Temporal } from 'temporal-polyfill';
import type { Database, Tables } from './database.types.js';

// PostgREST returns at most 1000 rows per request on Supabase.
const PAGE_SIZE = 1000;

export interface StationConfig {
  db: SupabaseClient<Database>;
  deviceId: string;
  installDay: Temporal.PlainDate;
}

let cached: StationConfig | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing env var ${name}`);
  }
  return value;
}

export function station(): StationConfig {
  if (!cached) {
    cached = {
      db: createClient<Database>(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
      deviceId: requireEnv('STATION_DEVICE_ID'),
      installDay: Temporal.PlainDate.from(requireEnv('STATION_INSTALL_DATE')),
    };
  }
  return cached;
}

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

// Runs a query page by page until all rows are read. The query must have a stable order.
export async function fetchAll<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new Error(error.message);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) {
      return rows;
    }
  }
}

// Columns of a one-minute reading sent to the browser: /api/day returns 1440 of them, so
// diagnostics (rssi, uptime, fw) and bookkeeping (id, inserted_at) stay out. `satisfies`
// checks each name against database.types.ts at compile time. Aggregates use select('*').
const READING_FIELDS = [
  'ts', 'temp_c', 'humidity_pct', 'pressure_hpa', 'wind_avg_ms', 'wind_gust_ms', 'wind_dir_deg', 'rain_mm',
] as const satisfies readonly (keyof Tables<'readings'>)[];

export const READING_COLUMNS = READING_FIELDS.join(', ');

// What one reading looks like in the API responses.
export type ReadingRow = Pick<Tables<'readings'>, (typeof READING_FIELDS)[number]>;

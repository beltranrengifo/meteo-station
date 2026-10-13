// Server-side Supabase access for the read API. Uses the secret key, so this module must
// never be imported from src/ (browser code).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Temporal } from 'temporal-polyfill';
import { READING_FIELDS } from '../shared/api-types.js';
import type { Database } from '../shared/database.types.js';

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

// Column list for select(); which columns and why is in shared/api-types.ts.
export const READING_COLUMNS = READING_FIELDS.join(', ');

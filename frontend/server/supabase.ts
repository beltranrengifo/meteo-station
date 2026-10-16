// Server-side Supabase access for the read API. Uses the secret key, so this module must
// never be imported from src/ (browser code).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Temporal } from 'temporal-polyfill';
import { READING_FIELDS, type StationInfo } from '../shared/api-types.js';
import type { Database } from '../shared/database.types.js';
import { requireEnv } from './env.js';
import { localToday, type Parsed } from './params.js';
import { defaultStationId, pickStation } from './station-choice.js';

// PostgREST returns at most 1000 rows per request on Supabase.
const PAGE_SIZE = 1000;
// A station listed or renamed in Supabase shows up within this long.
const STATIONS_TTL_MS = 60_000;

let client: SupabaseClient<Database> | null = null;

export function db(): SupabaseClient<Database> {
  client ??= createClient<Database>(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

let stationsCache: { at: number; stations: StationInfo[] } | null = null;

// The stations the dashboard lists (devices.listed and active), oldest first.
export async function listedStations(): Promise<StationInfo[]> {
  if (stationsCache && Date.now() - stationsCache.at < STATIONS_TTL_MS) {
    return stationsCache.stations;
  }
  const { data, error } = await db()
    .from('devices')
    .select('device_id, display_name')
    .eq('listed', true)
    .eq('active', true)
    .order('created_at');
  if (error) {
    throw new Error(error.message);
  }
  // listed implies a display_name (devices_listed_needs_display_name).
  const stations = data.map((row) => ({ id: row.device_id, name: row.display_name ?? row.device_id }));
  stationsCache = { at: Date.now(), stations };
  return stations;
}

export function defaultStation(stations: StationInfo[]): string | null {
  return defaultStationId(stations, process.env.STATION_DEVICE_ID);
}

// The first local day with data never changes once known.
const installDays = new Map<string, Temporal.PlainDate>();

// The local (Madrid) day of the station's first reading; today while it has none.
async function installDay(deviceId: string): Promise<Temporal.PlainDate> {
  const known = installDays.get(deviceId);
  if (known) {
    return known;
  }
  const { data, error } = await db()
    .from('readings').select('ts').eq('device_id', deviceId)
    .order('ts').limit(1).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return localToday(Temporal.Now.instant());
  }
  const day = localToday(Temporal.Instant.from(data.ts));
  installDays.set(deviceId, day);
  return day;
}

export interface Station {
  deviceId: string;
  name: string;
  installDay: Temporal.PlainDate;
}

// The station of a request: ?station=<device_id>, or the default when absent. An error when it
// is not a listed station.
export async function requestStation(url: URL): Promise<Parsed<Station>> {
  const picked = pickStation(await listedStations(), url.searchParams.get('station'), process.env.STATION_DEVICE_ID);
  if (!picked) {
    return { ok: false, error: 'unknown station' };
  }
  return { ok: true, value: { deviceId: picked.id, name: picked.name, installDay: await installDay(picked.id) } };
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

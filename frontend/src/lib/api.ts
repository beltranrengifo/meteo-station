// Data fetching for the dashboard (TanStack Query: caching, refetch, loading and error state).
import { useQuery } from '@tanstack/react-query';
import type { Temporal } from 'temporal-polyfill';
import type {
  DailySummaryResponse, DayResponse, ForecastResponse, Last24hResponse, Last7DaysResponse, NowResponse, RangeResponse, SkyResponse,
  StationsResponse,
} from '../../shared/api-types';
import { msUntilNextReading } from '../../shared/refresh';

// Ask again just after each new reading lands. The API cache for today expires at that same
// point, so the extra 2 s make sure the CDN fetches the fresh data.
const AFTER_EXPIRY_MS = 2_000;
// /api/sky and /api/forecast are cached 15 minutes: Open-Meteo updates its current values
// every 15 minutes.
const SKY_REFRESH_MS = 15 * 60_000;

function untilNextReading(): number {
  return msUntilNextReading(Date.now()) + AFTER_EXPIRY_MS;
}

// The station list changes only when one is listed in Supabase.
const STATIONS_REFRESH_MS = 10 * 60_000;

// Every query below is for one station: undefined while the station list is loading.
type StationId = string | undefined;

function stationPath(path: string, station: string, params: Record<string, string> = {}): string {
  return `${path}?${new URLSearchParams({ ...params, station })}`;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function useStations() {
  return useQuery({
    queryKey: ['stations'],
    queryFn: () => getJson<StationsResponse>('/api/stations'),
    staleTime: STATIONS_REFRESH_MS,
    refetchInterval: STATIONS_REFRESH_MS,
  });
}

export function useNow(station: StationId) {
  return useQuery({
    queryKey: ['now', station],
    queryFn: () => getJson<NowResponse>(stationPath('/api/now', station!)),
    enabled: station !== undefined,
    refetchInterval: untilNextReading,
  });
}

export function useDay(station: StationId, day: Temporal.PlainDate, refresh: boolean) {
  const date = day.toString();
  return useQuery({
    queryKey: ['day', station, date],
    queryFn: () => getJson<DayResponse>(stationPath('/api/day', station!, { date })),
    enabled: station !== undefined,
    refetchInterval: refresh ? untilNextReading : false,
  });
}

export function useLast24h(station: StationId) {
  return useQuery({
    queryKey: ['last-24h', station],
    queryFn: () => getJson<Last24hResponse>(stationPath('/api/last-24h', station!)),
    enabled: station !== undefined,
    refetchInterval: untilNextReading,
  });
}

export function useLast7Days(station: StationId, enabled: boolean) {
  return useQuery({
    queryKey: ['last-7-days', station],
    queryFn: () => getJson<Last7DaysResponse>(stationPath('/api/last-7-days', station!)),
    enabled: enabled && station !== undefined,
    refetchInterval: untilNextReading,
  });
}

// A custom range is fixed once picked: no refresh. A range up to now refreshes like the others.
export function useRange(station: StationId, from: string, to: string, enabled: boolean, refresh = false) {
  return useQuery({
    queryKey: ['range', station, from, to],
    queryFn: () => getJson<RangeResponse>(stationPath('/api/range', station!, { from, to })),
    enabled: enabled && station !== undefined,
    refetchInterval: refresh ? untilNextReading : false,
  });
}

// A station without coordinates answers 404 to /api/sky and /api/forecast: no use asking again.
function retryUnlessMissing(failures: number, error: Error): boolean {
  return !isMissing(error) && failures < 3;
}

export function isMissing(error: Error | null): boolean {
  return error?.message.endsWith('HTTP 404') ?? false;
}

// Without coordinates: no sky, the rest of the page as usual.
export function useSky(station: StationId) {
  return useQuery({
    queryKey: ['sky', station],
    queryFn: () => getJson<SkyResponse>(stationPath('/api/sky', station!)),
    enabled: station !== undefined,
    retry: retryUnlessMissing,
    staleTime: SKY_REFRESH_MS,
    refetchInterval: SKY_REFRESH_MS,
  });
}

// Only once the forecast tab is opened.
export function useForecast(station: StationId, enabled: boolean) {
  return useQuery({
    queryKey: ['forecast', station],
    queryFn: () => getJson<ForecastResponse>(stationPath('/api/forecast', station!)),
    enabled: enabled && station !== undefined,
    retry: retryUnlessMissing,
    staleTime: SKY_REFRESH_MS,
    refetchInterval: SKY_REFRESH_MS,
  });
}

// Today's notification text, for subscribers ("El aviso de hoy"). 404 until it is sent: no card.
// Asked again when the app comes back to the front, which is what a tap on the notification does.
export function useDailySummary(enabled: boolean) {
  return useQuery({
    queryKey: ['daily-summary'],
    queryFn: () => getJson<DailySummaryResponse>('/api/daily-summary'),
    enabled,
    retry: retryUnlessMissing,
    staleTime: 60_000,
  });
}

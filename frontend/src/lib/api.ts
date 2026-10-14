// Data fetching for the dashboard (TanStack Query: caching, refetch, loading and error state).
import { useQuery } from '@tanstack/react-query';
import type { Temporal } from 'temporal-polyfill';
import type {
  DayResponse, Last24hResponse, Last7DaysResponse, NowResponse, RangeResponse, SkyResponse,
} from '../../shared/api-types';
import { msUntilNextReading } from '../../shared/refresh';

// Ask again just after each new reading lands. The API cache for today expires at that same
// point, so the extra 2 s make sure the CDN fetches the fresh data.
const AFTER_EXPIRY_MS = 2_000;
// /api/sky is cached 15 minutes: Open-Meteo updates its current values every 15 minutes.
const SKY_REFRESH_MS = 15 * 60_000;

function untilNextReading(): number {
  return msUntilNextReading(Date.now()) + AFTER_EXPIRY_MS;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function useNow() {
  return useQuery({
    queryKey: ['now'],
    queryFn: () => getJson<NowResponse>('/api/now'),
    refetchInterval: untilNextReading,
  });
}

export function useDay(day: Temporal.PlainDate, refresh: boolean) {
  const date = day.toString();
  return useQuery({
    queryKey: ['day', date],
    queryFn: () => getJson<DayResponse>(`/api/day?date=${date}`),
    refetchInterval: refresh ? untilNextReading : false,
  });
}

export function useLast24h() {
  return useQuery({
    queryKey: ['last-24h'],
    queryFn: () => getJson<Last24hResponse>('/api/last-24h'),
    refetchInterval: untilNextReading,
  });
}

export function useLast7Days(enabled: boolean) {
  return useQuery({
    queryKey: ['last-7-days'],
    queryFn: () => getJson<Last7DaysResponse>('/api/last-7-days'),
    enabled,
    refetchInterval: untilNextReading,
  });
}

// A custom range is fixed once picked: no refresh. A range up to now refreshes like the others.
export function useRange(from: string, to: string, enabled: boolean, refresh = false) {
  const params = new URLSearchParams({ from, to });
  return useQuery({
    queryKey: ['range', from, to],
    queryFn: () => getJson<RangeResponse>(`/api/range?${params}`),
    enabled,
    refetchInterval: refresh ? untilNextReading : false,
  });
}

export function useSky() {
  return useQuery({
    queryKey: ['sky'],
    queryFn: () => getJson<SkyResponse>('/api/sky'),
    staleTime: SKY_REFRESH_MS,
    refetchInterval: SKY_REFRESH_MS,
  });
}

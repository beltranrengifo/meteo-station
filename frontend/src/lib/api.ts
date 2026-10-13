// Data fetching for the dashboard (TanStack Query: caching, refetch, loading and error state).
import { useQuery } from '@tanstack/react-query';
import type { Temporal } from 'temporal-polyfill';
import type { DayResponse, NowResponse } from '../../shared/api-types';
import { msUntilNextReading } from '../../shared/refresh';

// Ask again just after each new reading lands. The API cache for today expires at that same
// point, so the extra 2 s make sure the CDN fetches the fresh data.
const AFTER_EXPIRY_MS = 2_000;

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

// Which station the dashboard shows. The choice lives in the URL (?station=<device_id>), so a
// link opens the same station; without it, the API's default station.
import type { StationInfo, StationsResponse } from '../../shared/api-types';

const PARAM = 'station';

// The station asked for when it is listed, else the default, else the first one.
export function chooseStation(response: StationsResponse, wanted: string | null): StationInfo | undefined {
  const { stations, defaultId } = response;
  return (
    stations.find((station) => station.id === wanted)
    ?? stations.find((station) => station.id === defaultId)
    ?? stations[0]
  );
}

export function stationFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(PARAM);
}

// Replaces the current history entry: switching stations is not a page to go back to.
export function setStationInUrl(id: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, id);
  window.history.replaceState(null, '', url);
}

// "Madrid, Las Rozas" -> "Las Rozas", for the greeting.
export function shortPlace(name: string): string {
  return name.split(',').at(-1)!.trim();
}

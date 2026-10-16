// Pure parts of picking a station for a request: no I/O, so they are unit-tested.
import type { StationInfo } from '../shared/api-types.js';

// The station a request asks for (?station=), else the default: STATION_DEVICE_ID when it is
// listed, else the first listed one. Null when the station asked for is not listed: unlisted
// stations are never served, whatever their data.
export function pickStation(
  stations: StationInfo[],
  requested: string | null,
  defaultId: string | undefined,
): StationInfo | null {
  if (requested !== null) {
    return stations.find((station) => station.id === requested) ?? null;
  }
  return stations.find((station) => station.id === defaultId) ?? stations[0] ?? null;
}

export function defaultStationId(stations: StationInfo[], defaultId: string | undefined): string | null {
  return pickStation(stations, null, defaultId)?.id ?? null;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// STATION_COORDINATES holds {"<device_id>": [latitude, longitude], ...}. Null when the station
// has none or the value is not valid.
export function stationCoordinates(json: string | undefined, deviceId: string): Coordinates | null {
  if (!json) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || !Object.hasOwn(parsed, deviceId)) {
    return null;
  }
  const value = (parsed as Record<string, unknown>)[deviceId];
  if (!Array.isArray(value) || value.length !== 2) {
    return null;
  }
  const [latitude, longitude] = value;
  if (typeof latitude !== 'number' || typeof longitude !== 'number'
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }
  return { latitude, longitude };
}

import { describe, expect, it } from 'vitest';
import { defaultStationId, pickStation, stationCoordinates } from './station-choice.js';

const HOME = { id: 'meteo-station-1', name: 'Madrid, Las Rozas' };
const VILLAGE = { id: 'meteo-station-2', name: 'Pueblo' };
const STATIONS = [HOME, VILLAGE];

describe('pickStation', () => {
  it('serves the station asked for when it is listed', () => {
    expect(pickStation(STATIONS, 'meteo-station-2', 'meteo-station-1')).toBe(VILLAGE);
  });
  it('never serves a station that is not listed', () => {
    expect(pickStation(STATIONS, 'meteo-station-bench', 'meteo-station-bench')).toBeNull();
    expect(pickStation([], 'meteo-station-1', undefined)).toBeNull();
  });
  it('without a station asked for, serves the default, else the first listed', () => {
    expect(pickStation(STATIONS, null, 'meteo-station-2')).toBe(VILLAGE);
    expect(pickStation(STATIONS, null, 'meteo-station-bench')).toBe(HOME);
    expect(pickStation(STATIONS, null, undefined)).toBe(HOME);
    expect(pickStation([], null, 'meteo-station-1')).toBeNull();
  });
});

describe('defaultStationId', () => {
  it('is the default when listed, else the first listed, else null', () => {
    expect(defaultStationId(STATIONS, 'meteo-station-2')).toBe('meteo-station-2');
    expect(defaultStationId(STATIONS, 'other')).toBe('meteo-station-1');
    expect(defaultStationId([], 'meteo-station-1')).toBeNull();
  });
});

describe('stationCoordinates', () => {
  const json = JSON.stringify({ 'meteo-station-1': [40.5, -3.9], 'meteo-station-2': [41, -4.5] });

  it('reads one station from the map', () => {
    expect(stationCoordinates(json, 'meteo-station-2')).toEqual({ latitude: 41, longitude: -4.5 });
  });
  it('is null for a station without coordinates, or a missing or broken map', () => {
    expect(stationCoordinates(json, 'meteo-station-bench')).toBeNull();
    expect(stationCoordinates(undefined, 'meteo-station-1')).toBeNull();
    expect(stationCoordinates('{not json', 'meteo-station-1')).toBeNull();
    expect(stationCoordinates('[1, 2]', '0')).toBeNull();
    expect(stationCoordinates('{"toString": [1, 2]}', 'constructor')).toBeNull();
  });
  it('is null for values that are not a latitude and a longitude', () => {
    for (const value of [[40.5], ['40.5', '-3.9'], [91, 0], [0, 181], { lat: 40.5 }]) {
      expect(stationCoordinates(JSON.stringify({ s: value }), 's')).toBeNull();
    }
  });
});

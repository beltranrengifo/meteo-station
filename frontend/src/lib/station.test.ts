import { describe, expect, it } from 'vitest';
import { chooseStation, shortPlace } from './station';

const HOME = { id: 'meteo-station-1', name: 'Madrid, Las Rozas' };
const VILLAGE = { id: 'meteo-station-2', name: 'Pueblo' };

describe('chooseStation', () => {
  const response = { stations: [HOME, VILLAGE], defaultId: 'meteo-station-1' };

  it('shows the station in the URL when it is listed', () => {
    expect(chooseStation(response, 'meteo-station-2')).toBe(VILLAGE);
  });
  it('falls back to the default for a missing or unknown station', () => {
    expect(chooseStation(response, null)).toBe(HOME);
    expect(chooseStation(response, 'meteo-station-bench')).toBe(HOME);
  });
  it('falls back to the first station without a default, and to none without stations', () => {
    expect(chooseStation({ stations: [VILLAGE, HOME], defaultId: null }, null)).toBe(VILLAGE);
    expect(chooseStation({ stations: [], defaultId: null }, null)).toBeUndefined();
  });
});

describe('shortPlace', () => {
  it('keeps the part after the last comma', () => {
    expect(shortPlace('Madrid, Las Rozas')).toBe('Las Rozas');
    expect(shortPlace('Pueblo')).toBe('Pueblo');
  });
});

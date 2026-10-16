import { describe, expect, it } from 'vitest';
import { viewFromSearch } from './view';

describe('viewFromSearch', () => {
  it('opens the forecast only when asked for', () => {
    expect(viewFromSearch('?station=meteo-station-1&view=forecast')).toBe('forecast');
  });

  it('opens the station tab by default or for an unknown view', () => {
    expect(viewFromSearch('')).toBe('station');
    expect(viewFromSearch('?view=nope')).toBe('station');
  });
});

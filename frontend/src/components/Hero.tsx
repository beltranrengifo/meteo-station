// Greeting, the station picker, the sky from Open-Meteo and the time of the last reading.
import { MapPin } from 'lucide-react';
import { Temporal } from 'temporal-polyfill';
import type { ReadingRow, SkyResponse, StationInfo } from '../../shared/api-types';
import { formatLongDate, formatTime, greeting, timeZoneName } from '../lib/format';
import { shortPlace } from '../lib/station';
import { SkyVisual } from './SkyVisual';

interface HeroProps {
  reading: ReadingRow | null;
  sky: SkyResponse | undefined;
  station: StationInfo;
  stations: StationInfo[];
  onStationChange: (id: string) => void;
}

export function Hero({ reading, sky, station, stations, onStationChange }: HeroProps) {
  const now = Temporal.Now.instant();
  return (
    <section className="hero-row">
      <div>
        <div className="location">
          <MapPin size={14} aria-hidden="true" />
          {stations.length > 1 ? (
            <select
              className="station-picker"
              aria-label="Estación"
              value={station.id}
              onChange={(event) => onStationChange(event.target.value)}
            >
              {stations.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          ) : (
            station.name
          )}
          <span>·</span> {timeZoneName(now)}
        </div>
        <h1>
          {greeting(now)}, {shortPlace(station.name)}<span>.</span>
        </h1>
        <p>Una lectura tranquila de tu microclima.</p>
      </div>
      <div className="hero-side">
        <SkyVisual sky={sky} tempC={reading?.temp_c ?? null} />
        <div className="time-card">
          <span>Última lectura</span>
          <strong>{reading ? formatTime(reading.ts) : '—'}</strong>
          <small>{reading ? formatLongDate(reading.ts) : 'Sin lecturas'}</small>
        </div>
      </div>
    </section>
  );
}

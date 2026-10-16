// Greeting, the sky from Open-Meteo and the time of the last reading.
import { MapPin } from 'lucide-react';
import { Temporal } from 'temporal-polyfill';
import type { ReadingRow, SkyResponse } from '../../shared/api-types';
import { formatLongDate, formatTime, greeting, timeZoneName } from '../lib/format';
import { shortPlace } from '../lib/station';
import { SkyVisual } from './SkyVisual';

interface HeroProps {
  reading: ReadingRow | null;
  sky: SkyResponse | undefined;
  place: string;
}

export function Hero({ reading, sky, place }: HeroProps) {
  const now = Temporal.Now.instant();
  return (
    <section className="hero-row">
      <div>
        <div className="location">
          <MapPin size={14} aria-hidden="true" /> {place} <span>·</span> {timeZoneName(now)}
        </div>
        <h1>
          {greeting(now)}, {shortPlace(place)}<span>.</span>
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

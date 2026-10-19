// The sky over the station from Open-Meteo, drawn with CSS: sun or moon, clouds, rain or snow.
import type { CSSProperties } from 'react';
import type { SkyResponse } from '../../shared/api-types';
import { precipIntensity, skyKind, skyLabel, uvCategory, type PrecipIntensity } from '../lib/weather';

// Drops or flakes in the picture: more the harder it falls.
const PARTICLES: Record<PrecipIntensity, number> = { light: 10, moderate: 16, heavy: 26 };
// Spreads the particles evenly but without a visible pattern (golden ratio steps).
const GOLDEN = 0.618034;

interface SkyVisualProps {
  sky: SkyResponse | undefined;
  tempC: number | null;
}

export function SkyVisual({ sky, tempC }: SkyVisualProps) {
  if (!sky) {
    return (
      <div className="weather-visual">
        <div className="weather-caption">
          <strong>Cielo sin datos</strong>
        </div>
      </div>
    );
  }
  const kind = skyKind(sky.weatherCode);
  const label = skyLabel(sky.weatherCode);
  const temp = tempC === null ? '' : ` · ${tempC.toFixed(1)} °C`;
  const uv = sky.isDay
    ? `UV ${Math.round(sky.uvIndex)} (${uvCategory(sky.uvIndex)}) · máx. hoy ${Math.round(sky.uvIndexMaxToday)}`
    : `UV máx. hoy ${Math.round(sky.uvIndexMaxToday)}`;
  const showOrb = kind === 'clear' || kind === 'partly';
  const clouds = kind === 'clear' ? 0 : kind === 'partly' ? 2 : 3;
  const intensity = precipIntensity(sky.weatherCode);

  return (
    <div className={`weather-visual ${sky.isDay ? 'day' : 'night'} ${kind}`} role="img" aria-label={`${label}${temp}`}>
      {showOrb && (sky.isDay ? (
        <div className="sun-orb" aria-hidden="true">
          <span className="sun-core" />
          <span className="sun-rays" />
        </div>
      ) : (
        <div className="moon" aria-hidden="true" />
      ))}
      {intensity && <Precipitation snow={kind === 'snow'} intensity={intensity} />}
      {clouds >= 2 && <Cloud className="cloud-back" />}
      {clouds >= 2 && <Cloud className="cloud-front" />}
      {clouds >= 3 && <Cloud className="cloud-top" />}
      <div className="weather-caption">
        <strong>{label}{temp}</strong>
        <span>{uv}</span>
      </div>
    </div>
  );
}

// Behind the clouds, so the rain comes out of them. Each particle gets its own column, length
// and phase (a negative delay: it is already raining when the picture appears).
function Precipitation({ snow, intensity }: { snow: boolean; intensity: PrecipIntensity }) {
  const count = PARTICLES[intensity];
  return (
    <div className={`${snow ? 'flakes' : 'drops'} ${intensity}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const spread = (i * GOLDEN) % 1;
        const style = {
          '--x': `${(4 + spread * 92).toFixed(1)}%`,
          '--phase': ((i * 0.37) % 1).toFixed(2),
          '--size': ((i * 0.53) % 1).toFixed(2),
        } as CSSProperties;
        return <span key={i} style={style} />;
      })}
    </div>
  );
}

function Cloud({ className }: { className: string }) {
  return (
    <div className={`weather-cloud ${className}`} aria-hidden="true">
      <span /><span /><span />
    </div>
  );
}

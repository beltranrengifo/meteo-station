// The sky over the station from Open-Meteo, drawn with CSS: sun or moon, clouds, rain or snow.
import type { SkyResponse } from '../../shared/api-types';
import { skyKind, skyLabel, uvCategory } from '../lib/weather';

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
      {clouds >= 2 && <Cloud className="cloud-back" />}
      {clouds >= 2 && <Cloud className="cloud-front" />}
      {clouds >= 3 && <Cloud className="cloud-top" />}
      {(kind === 'rain' || kind === 'storm' || kind === 'snow') && (
        <div className={kind === 'snow' ? 'flakes' : 'drops'} aria-hidden="true">
          <span /><span /><span /><span /><span />
        </div>
      )}
      <div className="weather-caption">
        <strong>{label}{temp}</strong>
        <span>{uv}</span>
      </div>
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

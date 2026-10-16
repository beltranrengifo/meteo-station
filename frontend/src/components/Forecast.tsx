// The forecast tab: a card per day for the week and the next 24 hours, from Open-Meteo for the
// station's location (through /api/forecast: the coordinates never reach the browser).
import { Droplets } from 'lucide-react';
import type { ForecastDay, ForecastHour, ForecastResponse } from '../../shared/api-types';
import { forecastDayLabel, formatTime, madridToday, msToKmh } from '../lib/format';
import { shortPlace } from '../lib/station';
import { skyKind, skyKindLabel, skyLabel } from '../lib/weather';
import { Spinner } from './Loading';
import { SkyIcon } from './SkyIcon';

function percent(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

function DayCard({ day, label }: { day: ForecastDay; label: string }) {
  const rain = day.precipMm > 0 ? ` · ${day.precipMm.toFixed(1)} mm` : '';
  return (
    <li className={`forecast-day ${label === 'Hoy' ? 'today' : ''}`}>
      <span className="forecast-day-name">{label}</span>
      <SkyIcon code={day.weatherCode} isDay size={26} />
      <strong className="forecast-kind">{skyKindLabel(skyKind(day.weatherCode))}</strong>
      <span className="forecast-label">{skyLabel(day.weatherCode)}</span>
      <div className="forecast-temps">
        <b><span className="sr-only">Máxima </span>{Math.round(day.tempMaxC)}°</b>
        <span><span className="sr-only">mínima </span>{Math.round(day.tempMinC)}°</span>
      </div>
      <span className="forecast-detail">{percent(day.precipProbabilityPct)} lluvia{rain}</span>
      <span className="forecast-detail">Racha {Math.round(msToKmh(day.gustMaxMs)!)} km/h</span>
    </li>
  );
}

function HourCell({ hour, first }: { hour: ForecastHour; first: boolean }) {
  return (
    <li className="forecast-hour">
      <span>{first ? 'Ahora' : formatTime(hour.time)}</span>
      <SkyIcon code={hour.weatherCode} isDay={hour.isDay} size={22} />
      <span className="sr-only">{skyLabel(hour.weatherCode)}</span>
      <b>{Math.round(hour.tempC)}°</b>
      <small>
        <Droplets size={11} aria-hidden="true" /> {percent(hour.precipProbabilityPct)}
        <span className="sr-only"> de probabilidad de lluvia</span>
      </small>
    </li>
  );
}

interface ForecastProps {
  place: string;
  data: ForecastResponse | undefined;
  isPending: boolean;
  isError: boolean;
  missing: boolean; // the station has no coordinates
}

export function Forecast({ place, data, isPending, isError, missing }: ForecastProps) {
  const today = madridToday();
  return (
    <section className="forecast-section">
      <div className="section-heading forecast-heading">
        <div>
          <span className="eyebrow">Open-Meteo · Actualización automática</span>
          <h2>Previsión para {shortPlace(place)}</h2>
          <p>Temperatura, lluvia y viento estimados para los próximos días.</p>
        </div>
      </div>
      {missing && <p className="chart-status">Esta estación todavía no tiene previsión.</p>}
      {isError && !missing && <p role="alert" className="chart-status">No se pudo cargar la previsión.</p>}
      {isPending && <Spinner label="Cargando la previsión…" />}
      {data && (
        <>
          <ol className="forecast-days" aria-label="Próximos 7 días">
            {data.days.map((day) => (
              <DayCard key={day.date} day={day} label={forecastDayLabel(day.date, today)} />
            ))}
          </ol>
          <div className="panel-title forecast-hours-title">
            <div>
              <span className="eyebrow">Hora a hora</span>
              <h3>Próximas 24 horas</h3>
            </div>
          </div>
          <ol className="forecast-hours" aria-label="Próximas 24 horas">
            {data.hours.map((hour, i) => (
              <HourCell key={hour.time} hour={hour} first={i === 0} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

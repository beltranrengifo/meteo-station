// Latest values, today's extremes so far and a warning when the station stops sending.
import { Activity, ArrowDown, ArrowUp, Droplets, Gauge, Thermometer, Umbrella, Wind, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Temporal } from 'temporal-polyfill';
import type { ReadingRow } from '../../shared/api-types';
import { useClock } from '../lib/clock';
import { compassPoint, formatAge, formatTime, isStale, msToKmh } from '../lib/format';
import { rangeExtreme, totalRain, type RangeSeries } from '../lib/series';
import { PRESSURE_TREND_HOURS, dewPoint, feelsLike, pressureTrend } from '../lib/weather';

function fixed(value: number | null | undefined, decimals: number): string {
  return value === null || value === undefined ? '—' : value.toFixed(decimals);
}

function signed(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(1)}`;
}

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  note?: ReactNode; // a second value, between the main one and the detail
  detail: ReactNode;
  tone: string;
}

function MetricCard({ icon: Icon, label, value, unit, note, detail, tone }: MetricCardProps) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-top">
        <span className="metric-icon">
          <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span>{label}</span>
      </div>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      {note && <div className="metric-note">{note}</div>}
      <div className="metric-detail">{detail}</div>
    </article>
  );
}

// Today's lowest and highest so far, one per line, each with the time it happened.
function Extremes({ min, max }: { min: { value: number; at: string } | null | undefined; max: { value: number; at: string } | null | undefined }) {
  const row = (Icon: LucideIcon, label: string, extreme: { value: number; at: string } | null | undefined) => (
    <span className="extreme">
      <Icon size={12} strokeWidth={2} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <b>{fixed(extreme?.value, 1)}°</b>
      <span>{extreme ? formatTime(extreme.at) : '—'}</span>
    </span>
  );
  return (
    <span className="extremes">
      {row(ArrowDown, 'Mínima', min)}
      {row(ArrowUp, 'Máxima', max)}
    </span>
  );
}

function ReadingAge({ ts }: { ts: string | null }) {
  const now = useClock();
  if (!ts) {
    return null;
  }
  const seconds = now.since(Temporal.Instant.from(ts)).total('seconds');
  return (
    <span className="updated">
      <Activity size={14} aria-hidden="true" /> lectura {formatAge(seconds)}
    </span>
  );
}

function StaleWarning({ ts }: { ts: string | null }) {
  const now = useClock();
  if (!isStale(ts, now)) {
    return null;
  }
  return (
    <p role="alert" className="stale-warning">
      La estación lleva más de 5 minutos sin enviar datos.
    </p>
  );
}

interface CurrentConditionsProps {
  reading: ReadingRow | null;
  today: RangeSeries | undefined; // today's one-minute readings
  last24h: ReadingRow[] | undefined; // for the pressure trend, which may start yesterday
}

export function CurrentConditions({ reading, today, last24h }: CurrentConditionsProps) {
  const at = (iso: string | undefined) => (iso ? formatTime(iso) : '—');
  const tempMin = today && rangeExtreme(today, 'min', (s) => s.temp);
  const tempMax = today && rangeExtreme(today, 'max', (s) => s.temp);
  const gustMax = today && rangeExtreme(today, 'max', (s) => s.windGust);
  const trend = last24h ? pressureTrend(last24h) : null;
  const dew = dewPoint(reading?.temp_c ?? null, reading?.humidity_pct ?? null);
  const feels = feelsLike(reading?.temp_c ?? null, reading?.humidity_pct ?? null, reading?.wind_avg_ms ?? null);

  return (
    <section className="current-panel">
      <div className="panel-title">
        <div>
          <span className="eyebrow">Resumen en directo</span>
          <h2>Condiciones actuales</h2>
        </div>
        <ReadingAge ts={reading?.ts ?? null} />
      </div>
      <StaleWarning ts={reading?.ts ?? null} />
      <div className="metrics-grid">
        <MetricCard
          icon={Thermometer}
          label="Temperatura"
          value={fixed(reading?.temp_c, 1)}
          unit="°C"
          note={<>Sensación <b>{fixed(feels, 1)}°</b></>}
          detail={<Extremes min={tempMin} max={tempMax} />}
          tone="blue"
        />
        <MetricCard
          icon={Droplets}
          label="Humedad"
          value={fixed(reading?.humidity_pct, 0)}
          unit="%"
          detail={`Punto de rocío ${fixed(dew, 1)} °C`}
          tone="teal"
        />
        <MetricCard
          icon={Gauge}
          label="Presión"
          value={fixed(reading?.pressure_hpa, 1)}
          unit="hPa"
          detail={trend === null ? `Sin datos de hace ${PRESSURE_TREND_HOURS} h` : `${signed(trend)} hPa en ${PRESSURE_TREND_HOURS} h`}
          tone="violet"
        />
        <MetricCard
          icon={Wind}
          label="Viento"
          value={fixed(msToKmh(reading?.wind_avg_ms ?? null), 0)}
          unit="km/h"
          detail={`Racha ${fixed(msToKmh(reading?.wind_gust_ms ?? null), 0)} km/h · ${compassPoint(reading?.wind_dir_deg ?? null)}`}
          tone="amber"
        />
        <MetricCard
          icon={Wind}
          label="Racha máxima"
          value={fixed(gustMax?.value, 0)}
          unit="km/h"
          detail={gustMax ? `Hoy a las ${at(gustMax.at)}` : 'Hoy sin datos'}
          tone="orange"
        />
        <MetricCard
          icon={Umbrella}
          label="Lluvia hoy"
          value={today ? totalRain(today).toFixed(1) : '—'}
          unit="mm"
          detail="Acumulado desde medianoche"
          tone="indigo"
        />
      </div>
    </section>
  );
}

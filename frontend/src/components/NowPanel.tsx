// Current values, today's extremes so far and a warning when the station stops sending.
import { Temporal } from 'temporal-polyfill';
import type { NowResponse } from '../../shared/api-types';
import { compassPoint, formatTime, isStale, msToKmh } from '../lib/format';

function fixed(value: number | null | undefined, decimals: number): string {
  return value === null || value === undefined ? '—' : value.toFixed(decimals);
}

interface CardProps {
  label: string;
  value: string;
  unit: string;
  detail?: string;
}

function Card({ label, value, unit, detail }: CardProps) {
  return (
    <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">
        {value} <span className="text-base font-normal text-gray-500 dark:text-gray-400">{unit}</span>
      </div>
      {detail && <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detail}</div>}
    </div>
  );
}

interface NowPanelProps {
  data: NowResponse;
}

export function NowPanel({ data }: NowPanelProps) {
  const { reading, today } = data;
  const stale = isStale(reading?.ts ?? null, Temporal.Now.instant());
  const at = (iso: string | null | undefined) => (iso ? formatTime(iso) : '—');

  return (
    <section className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Última lectura: {reading ? formatTime(reading.ts) : '—'}
      </p>
      {stale && (
        <p role="alert" className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          La estación lleva más de 5 minutos sin enviar datos.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card
          label="Temperatura"
          value={fixed(reading?.temp_c, 1)}
          unit="°C"
          detail={`Mín ${fixed(today?.temp_min, 1)} (${at(today?.temp_min_at)}) · Máx ${fixed(today?.temp_max, 1)} (${at(today?.temp_max_at)})`}
        />
        <Card label="Humedad" value={fixed(reading?.humidity_pct, 0)} unit="%" />
        <Card label="Presión" value={fixed(reading?.pressure_hpa, 1)} unit="hPa" />
        <Card
          label="Viento"
          value={fixed(msToKmh(reading?.wind_avg_ms ?? null), 0)}
          unit="km/h"
          detail={`Racha ${fixed(msToKmh(reading?.wind_gust_ms ?? null), 0)} km/h · ${compassPoint(reading?.wind_dir_deg ?? null)}`}
        />
        <Card
          label="Racha máxima hoy"
          value={fixed(msToKmh(today?.wind_gust_max ?? null), 0)}
          unit="km/h"
          detail={`a las ${at(today?.wind_gust_max_at)}`}
        />
        <Card label="Lluvia hoy" value={fixed(today?.rain_mm, 1)} unit="mm" />
      </div>
    </section>
  );
}

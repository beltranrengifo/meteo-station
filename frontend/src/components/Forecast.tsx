// The forecast tab: a card per day for the week, then the next 24 hours (a row every 3 hours
// and a chart of every hour), from Open-Meteo for the station's location (through
// /api/forecast: the coordinates never reach the browser). Precipitation always shows its
// amount next to its chance (40 % of 0.1 mm is not 40 % of 20 mm), and snow its depth.
import type { BarSeriesOption, EChartsOption, LineSeriesOption } from 'echarts';
import { Droplets, Snowflake } from 'lucide-react';
import { useMemo } from 'react';
import { Temporal } from 'temporal-polyfill';
import type { ForecastDay, ForecastHour, ForecastResponse } from '../../shared/api-types';
import { formatRain, formatSnow, precipitationOver } from '../lib/forecast';
import { TIME_ZONE, forecastDayLabel, formatDay, formatTime, formatWhen, madridToday, msToKmh } from '../lib/format';
import { shortPlace } from '../lib/station';
import { skyKind, skyKindLabel, skyLabel } from '../lib/weather';
import { COLORS, Chart } from './Chart';
import { Spinner } from './Loading';
import { SkyIcon } from './SkyIcon';

function percent(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

function DayCard({ day, label }: { day: ForecastDay; label: string }) {
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
      <span className="forecast-rain">
        <Droplets size={12} aria-hidden="true" /> {formatRain(day.precipMm)}
        <span className="sr-only"> de precipitación</span>
      </span>
      {day.snowCm > 0 && (
        <span className="forecast-snow">
          <Snowflake size={12} aria-hidden="true" /> {formatSnow(day.snowCm)}
          <span className="sr-only"> de nieve</span>
        </span>
      )}
      <span className="forecast-detail">{percent(day.precipProbabilityPct)} de probabilidad</span>
      <span className="forecast-detail">Racha {Math.round(msToKmh(day.gustMaxMs)!)} km/h</span>
    </li>
  );
}

// The strip shows one hour in three: 8 slots fit in one row, phones included.
const SLOT_HOURS = 3;

// The day's name, in the slot where the day changes (none in the others).
function slotDays(hours: ForecastHour[], today: Temporal.PlainDate): (string | null)[] {
  return hours.map((hour, i) => {
    const day = Temporal.Instant.from(hour.time).toZonedDateTimeISO(TIME_ZONE).toPlainDate();
    const previous = i > 0 ? Temporal.Instant.from(hours[i - 1].time).toZonedDateTimeISO(TIME_ZONE).toPlainDate() : day;
    return day.equals(previous) ? null : forecastDayLabel(day.toString(), today);
  });
}

interface HourSlotProps {
  hours: ForecastHour[]; // the slot's hours; it shows the first one's sky and temperature
  first: boolean;
  day: string | null;
}

function HourSlot({ hours, first, day }: HourSlotProps) {
  const [hour] = hours;
  const rain = precipitationOver(hours);
  return (
    <li className="forecast-hour">
      <em>{day}</em>
      <span>{first ? 'Ahora' : formatTime(hour.time)}</span>
      <SkyIcon code={hour.weatherCode} isDay={hour.isDay} size={22} />
      <span className="sr-only">{skyLabel(hour.weatherCode)}</span>
      <b>{Math.round(hour.tempC)}°</b>
      <small className="forecast-rain">
        <Droplets size={11} aria-hidden="true" /> {formatRain(rain.mm)}
        <span className="sr-only"> de precipitación en 3 horas</span>
      </small>
      {rain.snowCm !== null && rain.snowCm > 0 && (
        <small className="forecast-snow">
          <Snowflake size={11} aria-hidden="true" /> {formatSnow(rain.snowCm)}
          <span className="sr-only"> de nieve</span>
        </small>
      )}
      <small>
        {percent(rain.probabilityPct)}
        <span className="sr-only"> de probabilidad</span>
      </small>
    </li>
  );
}

// "mar 13" at midnight, the time otherwise.
function hourAxisLabel(time: string): string {
  const local = Temporal.Instant.from(time).toZonedDateTimeISO(TIME_ZONE);
  return local.hour === 0 ? formatDay(time) : formatTime(time);
}

// Up to 2 mm in an hour is light rain (AEMET): the rain axis never goes lower, so a drizzle
// does not fill the chart.
const RAIN_AXIS_MIN_MAX_MM = 2;

const UNITS: Record<string, { unit: string; decimals: number }> = {
  Temperatura: { unit: '°C', decimals: 1 },
  Precipitación: { unit: 'mm', decimals: 1 },
  Probabilidad: { unit: '%', decimals: 0 },
};

// Every hour: temperature as a line, the rain amount as bars, its chance as a dashed line on a
// hidden 0-100 % axis.
function hoursOption(hours: ForecastHour[]): EChartsOption {
  const now = Temporal.Now.instant();
  return {
    grid: { left: 36, right: 44, top: 30, bottom: 24 },
    legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 14, itemHeight: 3 },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const list = Array.isArray(params) ? params : [params];
        const hour = hours[list[0].dataIndex];
        const end = Temporal.Instant.from(hour.time).add({ hours: 1 }).toString();
        const rows = list.map((p) => {
          const { unit, decimals } = UNITS[p.seriesName ?? ''] ?? { unit: '', decimals: 0 };
          const value = typeof p.value === 'number' ? `${p.value.toFixed(decimals)} ${unit}` : '—';
          return `${p.marker} ${p.seriesName}: <b>${value}</b>`;
        });
        if (hour.snowCm) {
          rows.push(`<span style="padding-left:14px">de ella, nieve: <b>${formatSnow(hour.snowCm)}</b></span>`);
        }
        return [`${formatWhen(hour.time, now)} – ${formatTime(end)}`, ...rows].join('<br/>');
      },
    },
    xAxis: {
      type: 'category',
      data: hours.map((hour) => hour.time),
      axisLabel: { formatter: hourAxisLabel, interval: SLOT_HOURS - 1, hideOverlap: true },
    },
    yAxis: [
      { type: 'value', scale: true, axisLabel: { formatter: '{value}°' } },
      {
        type: 'value',
        min: 0,
        max: ({ max }) => Math.max(max, RAIN_AXIS_MIN_MAX_MM),
        splitLine: { show: false },
        axisLabel: { formatter: '{value} mm' },
      },
      { type: 'value', min: 0, max: 100, show: false },
    ],
    series: [
      {
        name: 'Precipitación',
        type: 'bar',
        yAxisIndex: 1,
        barMaxWidth: 14,
        itemStyle: { color: COLORS.blue, opacity: 0.6, borderRadius: [4, 4, 0, 0] },
        data: hours.map((hour) => hour.precipMm),
      } satisfies BarSeriesOption,
      {
        name: 'Probabilidad',
        type: 'line',
        yAxisIndex: 2,
        showSymbol: false,
        lineStyle: { width: 1.2, type: 'dashed', color: COLORS.teal },
        itemStyle: { color: COLORS.teal },
        data: hours.map((hour) => hour.precipProbabilityPct),
      } satisfies LineSeriesOption,
      {
        name: 'Temperatura',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 1.8, color: COLORS.amber },
        itemStyle: { color: COLORS.amber },
        data: hours.map((hour) => hour.tempC),
      } satisfies LineSeriesOption,
    ],
  };
}

function Hours({ hours, today }: { hours: ForecastHour[]; today: Temporal.PlainDate }) {
  const slots = hours.filter((_, i) => i % SLOT_HOURS === 0);
  const days = slotDays(slots, today);
  const slotHours = (i: number) => hours.slice(i * SLOT_HOURS, (i + 1) * SLOT_HOURS);
  const option = useMemo(() => hoursOption(hours), [hours]);
  return (
    <>
      <ol className="forecast-hours" aria-label="Próximas 24 horas, cada 3 horas">
        {slots.map((hour, i) => (
          <HourSlot key={hour.time} hours={slotHours(i)} first={i === 0} day={days[i]} />
        ))}
      </ol>
      <article className="chart-card forecast-chart">
        <div className="chart-heading">
          <h3>Hora a hora</h3>
          <span className="chart-unit">°C · mm · %</span>
        </div>
        <p className="chart-note">
          Barras: litros por m² en cada hora (la nieve, en agua). Línea discontinua: probabilidad de que caigan más de 0.1 mm.
          Pasa el ratón o el dedo para ver cada hora.
        </p>
        <Chart option={option} />
      </article>
    </>
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
              <span className="eyebrow">Cada 3 horas</span>
              <h3>Próximas 24 horas</h3>
            </div>
          </div>
          <Hours hours={data.hours} today={today} />
        </>
      )}
    </section>
  );
}

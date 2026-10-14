// The charts for the chosen range (2 h, Hoy, 24 h, 7 días or custom). Every title names the
// range, and the time axis spans exactly the range's from..to, in Madrid time.
import type { BarSeriesOption, EChartsOption, LineSeriesOption, TooltipComponentOption } from 'echarts';
import { Suspense, lazy, useMemo, type ReactNode } from 'react';
import { Temporal } from 'temporal-polyfill';
import {
  TIME_ZONE, formatDay, formatShortDateTime, fromMadridWallClockMs, formatTime, formatWhen, toMadridWallClockMs, wallClockAxisLabel, wallClockLabel,
} from '../lib/format';
import {
  RANGES, bucketEnd, lastRain, linePoints, rainBuckets, rainUnitFor, rangeExtreme, totalRain,
  type RainBucket, type RainUnit, type RangeKey, type RangeSeries, type Sample,
} from '../lib/series';
import { COLORS, Chart, useCanBrush } from './Chart';
import { ChartsLoading, Spinner } from './Loading';
import { lastMinute, selectionToRange, type CustomRange } from '../lib/custom-range';

const CustomRangePicker = lazy(() => import('./CustomRangePicker').then((m) => ({ default: m.CustomRangePicker })));

interface Line {
  name: string;
  pick: (s: Sample) => number | null;
  color: string;
}

type Formatter = Exclude<TooltipComponentOption['formatter'], string | undefined>;

function tooltipFormatter(unit: string, decimals: number, heading: (axisValue: number | string) => string): Formatter {
  return (params) => {
    const list = Array.isArray(params) ? params : [params];
    const rows = list.map((p) => {
      const raw = Array.isArray(p.value) ? p.value[1] : p.value;
      const value = typeof raw === 'number' ? `${raw.toFixed(decimals)} ${unit}` : '—';
      return `${p.marker} ${p.seriesName}: <b>${value}</b>`;
    });
    const first = list[0];
    const axisValue = Array.isArray(first.value) ? (first.value[0] as number) : first.name;
    return [heading(axisValue), ...rows].join('<br/>');
  };
}

function lineOption(series: RangeSeries, lines: Line[], unit: string, decimals: number, fitScale: boolean): EChartsOption {
  return {
    // Times are Madrid wall-clock times expressed as UTC (see toMadridWallClockMs).
    useUTC: true,
    grid: { left: 44, right: 12, top: lines.length > 1 ? 30 : 10, bottom: 24 },
    legend: lines.length > 1 ? { top: 0, left: 0, icon: 'roundRect', itemWidth: 14, itemHeight: 3 } : undefined,
    tooltip: {
      trigger: 'axis',
      formatter: tooltipFormatter(unit, decimals, (t) => wallClockLabel(t as number)),
    },
    xAxis: {
      type: 'time',
      min: toMadridWallClockMs(series.from),
      max: toMadridWallClockMs(series.to),
      axisLabel: { formatter: (value: number) => wallClockAxisLabel(value), hideOverlap: true },
    },
    yAxis: { type: 'value', scale: fitScale, min: fitScale ? undefined : 0 },
    series: lines.map(
      (line): LineSeriesOption => ({
        name: line.name,
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 1.6, color: line.color },
        itemStyle: { color: line.color },
        data: linePoints(series, line.pick),
      }),
    ),
  };
}

// Bar label: the day for day bars and at midnight, the time otherwise.
function bucketLabel(start: string, unit: RainUnit): string {
  const local = Temporal.Instant.from(start).toZonedDateTimeISO(TIME_ZONE);
  const isMidnight = local.hour === 0 && local.minute === 0;
  return unit === 'day' || isMidnight ? formatDay(start) : formatTime(start);
}

function rainOption(buckets: RainBucket[], unit: RainUnit): EChartsOption {
  const now = Temporal.Now.instant();
  const heading = (start: string) => {
    if (unit === 'day') {
      return formatDay(start);
    }
    const end = bucketEnd(Temporal.Instant.from(start), unit).toString();
    return `${formatWhen(start, now)} – ${formatTime(end)}`;
  };
  return {
    grid: { left: 44, right: 12, top: 10, bottom: 24 },
    tooltip: {
      trigger: 'axis',
      formatter: tooltipFormatter('mm', 1, (start) => heading(String(start))),
    },
    // Categories are the bucket start instants: time labels repeat when a range spans days.
    xAxis: {
      type: 'category',
      data: buckets.map((b) => b.start),
      axisLabel: { formatter: (start: string) => bucketLabel(start, unit), hideOverlap: true },
    },
    yAxis: { type: 'value', min: 0, minInterval: 0.2 },
    series: [
      {
        name: 'Lluvia',
        type: 'bar',
        barMaxWidth: 14,
        itemStyle: { color: COLORS.blue, opacity: 0.82, borderRadius: [4, 4, 0, 0] },
        data: buckets.map((b) => b.mm),
      } satisfies BarSeriesOption,
    ],
  };
}

interface ChartCardProps {
  title: string;
  unit: string;
  note: string;
  children: ReactNode;
}

// The range is named once, above the cards.
function ChartCard({ title, unit, note, children }: ChartCardProps) {
  return (
    <article className="chart-card">
      <div className="chart-heading">
        <h3>{title}</h3>
        <span className="chart-unit">{unit}</span>
      </div>
      <p className="chart-note">{note}</p>
      {children}
    </article>
  );
}

function between(series: RangeSeries, low: (s: Sample) => number | null, high: (s: Sample) => number | null, decimals: number, unit: string) {
  const min = rangeExtreme(series, 'min', low);
  const max = rangeExtreme(series, 'max', high);
  return min && max ? `Entre ${min.value.toFixed(decimals)} y ${max.value.toFixed(decimals)} ${unit}` : 'Sin datos';
}

interface ChartsProps {
  series: RangeSeries;
  onSelectRange: (range: CustomRange) => void;
}

function Charts({ series, onSelectRange }: ChartsProps) {
  const rainUnit = rainUnitFor(series);
  const buckets = useMemo(() => rainBuckets(series, rainUnit), [series, rainUnit]);
  const cards = useMemo(() => {
    const now = Temporal.Now.instant();
    const tempMin = rangeExtreme(series, 'min', (s) => s.tempMin, (s) => s.tempMinAt);
    const tempMax = rangeExtreme(series, 'max', (s) => s.tempMax, (s) => s.tempMaxAt);
    const gust = rangeExtreme(series, 'max', (s) => s.windGust, (s) => s.windGustAt);
    const rainAt = lastRain(series);
    return [
      {
        title: 'Temperatura',
        unit: '°C',
        note: tempMin && tempMax
          ? `Mín ${tempMin.value.toFixed(1)} °C (${formatWhen(tempMin.at, now)}) · Máx ${tempMax.value.toFixed(1)} °C (${formatWhen(tempMax.at, now)})`
          : 'Sin datos',
        option: lineOption(series, [{ name: 'Temperatura', pick: (s) => s.temp, color: COLORS.blue }], '°C', 1, true),
      },
      {
        title: 'Humedad relativa',
        unit: '%',
        note: between(series, (s) => s.humidityMin, (s) => s.humidityMax, 0, '%'),
        option: lineOption(series, [{ name: 'Humedad', pick: (s) => s.humidity, color: COLORS.teal }], '%', 0, true),
      },
      {
        title: 'Lluvia',
        unit: 'mm',
        note: `${totalRain(series).toFixed(1)} mm en total · ${rainAt ? `última lluvia ${formatWhen(rainAt, now)}` : 'sin lluvia'}`,
        option: rainOption(buckets, rainUnit),
        axis: 'category' as const,
      },
      {
        title: 'Viento',
        unit: 'km/h',
        note: gust && gust.value > 0 ? `Racha máxima ${gust.value.toFixed(0)} km/h (${formatWhen(gust.at, now)})` : 'Sin rachas',
        option: lineOption(
          series,
          [
            { name: 'Medio', pick: (s) => s.windAvg, color: COLORS.blue },
            { name: 'Racha', pick: (s) => s.windGust, color: COLORS.amber },
          ],
          'km/h',
          1,
          false,
        ),
      },
      {
        title: 'Presión atmosférica',
        unit: 'hPa',
        note: between(series, (s) => s.pressureMin, (s) => s.pressureMax, 1, 'hPa'),
        option: lineOption(series, [{ name: 'Presión', pick: (s) => s.pressure, color: COLORS.violet }], 'hPa', 1, true),
      },
      {
        title: 'Punto de rocío',
        unit: '°C',
        note: `${between(series, (s) => s.dewPoint, (s) => s.dewPoint, 1, '°C')} · calculado con temperatura y humedad`,
        option: lineOption(series, [{ name: 'Punto de rocío', pick: (s) => s.dewPoint, color: COLORS.teal }], '°C', 1, true),
      },
    ];
  }, [series, buckets, rainUnit]);

  const select = (start: Temporal.Instant, end: Temporal.Instant) => {
    const range = selectionToRange(start, end, { from: series.from, to: series.to });
    if (range) {
      onSelectRange(range);
    }
  };
  // Time axes give wall-clock ms; the rain bars give the indices of the first and last bar.
  const onTimeBrush = (start: number, end: number) => select(fromMadridWallClockMs(start), fromMadridWallClockMs(end));
  const onBarsBrush = (start: number, end: number) => {
    const clamp = (i: number) => Math.min(buckets.length - 1, Math.max(0, Math.round(i)));
    const first = buckets[clamp(Math.min(start, end))];
    const last = buckets[clamp(Math.max(start, end))];
    if (first && last) {
      select(Temporal.Instant.from(first.start), bucketEnd(Temporal.Instant.from(last.start), rainUnit));
    }
  };

  return (
    <div className="charts-grid">
      {cards.map((card) => (
        <ChartCard key={card.title} title={card.title} unit={card.unit} note={card.note}>
          <Chart option={card.option} onBrush={'axis' in card ? onBarsBrush : onTimeBrush} />
        </ChartCard>
      ))}
    </div>
  );
}

interface RangeChartsProps {
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
  custom: CustomRange;
  onCustomChange: (range: CustomRange) => void;
  installDate: string | undefined; // YYYY-MM-DD, from /api/now
  // A stretch dragged on a chart: becomes the custom range.
  onSelectRange: (range: CustomRange) => void;
  series: RangeSeries | undefined;
  isPending: boolean;
  isError: boolean;
}

export function RangeCharts({
  range, onRangeChange, custom, onCustomChange, installDate, onSelectRange, series, isPending, isError,
}: RangeChartsProps) {
  const canBrush = useCanBrush();
  const current = RANGES.find((r) => r.key === range)!;
  // The custom range is named by its first and last minute.
  const title = range === 'custom' ? `Del ${formatShortDateTime(custom.from)} al ${formatShortDateTime(lastMinute(custom))}` : current.title;
  return (
    <section className="trend-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Histórico de sensores</span>
          <h2>{title}</h2>
        </div>
        <div className="range-switcher" role="group" aria-label="Periodo de las gráficas">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={r.key === range ? 'active' : ''}
              aria-pressed={r.key === range}
              onClick={() => onRangeChange(r.key)}
            >
              {r.button}
            </button>
          ))}
        </div>
      </div>
      {range === 'custom' && (
        <Suspense fallback={<Spinner label="Cargando el selector de fechas…" />}>
          <CustomRangePicker value={custom} onChange={onCustomChange} installDate={installDate} />
        </Suspense>
      )}
      {isError && <p role="alert" className="chart-status">No se pudieron cargar los datos de este periodo.</p>}
      {!isError && isPending && !series && <ChartsLoading rangeTitle={title} />}
      {!isError && isPending && series && <Spinner label="Cargando más detalle…" />}
      {series && series.samples.length === 0 && <p className="chart-status">Sin datos en este periodo.</p>}
      {series && series.samples.length > 0 && canBrush && (
        <p className="brush-hint">Arrastra sobre una gráfica para ver ese tramo en detalle.</p>
      )}
      {series && series.samples.length > 0 && <Charts series={series} onSelectRange={onSelectRange} />}
    </section>
  );
}

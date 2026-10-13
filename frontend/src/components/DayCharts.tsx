// The day's one-minute readings as line charts, one per quantity. Times are Madrid time.
import type { EChartsOption, LineSeriesOption } from 'echarts';
import type { ReadingRow } from '../../shared/api-types';
import { cumulativeRain, msToKmh, toMadridWallClockMs } from '../lib/format';
import { Chart } from './Chart';

interface Line {
  name: string;
  values: (number | null)[];
  area?: boolean;
}

function lineOption(times: number[], lines: Line[], unit: string, decimals: number, fitScale: boolean): EChartsOption {
  return {
    // Times are Madrid wall-clock times expressed as UTC (see toMadridWallClockMs).
    useUTC: true,
    grid: { left: 48, right: 16, top: lines.length > 1 ? 32 : 16, bottom: 28 },
    legend: lines.length > 1 ? { top: 0 } : undefined,
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => (typeof value === 'number' ? `${value.toFixed(decimals)} ${unit}` : '—'),
    },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', scale: fitScale, axisLabel: { formatter: `{value} ${unit}` } },
    series: lines.map(
      (line): LineSeriesOption => ({
        name: line.name,
        type: 'line',
        showSymbol: false,
        sampling: 'lttb',
        areaStyle: line.area ? { opacity: 0.25 } : undefined,
        data: times.map((t, i) => [t, line.values[i]]),
      }),
    ),
  };
}

interface DayChartsProps {
  readings: ReadingRow[];
}

export function DayCharts({ readings }: DayChartsProps) {
  const times = readings.map((r) => toMadridWallClockMs(r.ts));
  const panels = [
    { title: 'Temperatura', option: lineOption(times, [{ name: 'Temperatura', values: readings.map((r) => r.temp_c) }], '°C', 1, true) },
    { title: 'Humedad', option: lineOption(times, [{ name: 'Humedad', values: readings.map((r) => r.humidity_pct) }], '%', 0, true) },
    { title: 'Presión', option: lineOption(times, [{ name: 'Presión', values: readings.map((r) => r.pressure_hpa) }], 'hPa', 1, true) },
    {
      title: 'Viento',
      option: lineOption(
        times,
        [
          { name: 'Medio', values: readings.map((r) => msToKmh(r.wind_avg_ms)) },
          { name: 'Racha', values: readings.map((r) => msToKmh(r.wind_gust_ms)) },
        ],
        'km/h',
        1,
        false,
      ),
    },
    {
      title: 'Lluvia acumulada',
      option: lineOption(times, [{ name: 'Lluvia', values: cumulativeRain(readings.map((r) => r.rain_mm)), area: true }], 'mm', 1, false),
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {panels.map((panel) => (
        <section key={panel.title} className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
          <h3 className="mb-1 text-sm font-medium text-gray-600 dark:text-gray-300">{panel.title}</h3>
          <Chart option={panel.option} />
        </section>
      ))}
    </div>
  );
}

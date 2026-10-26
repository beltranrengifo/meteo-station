// The chart ranges and their data in one shape, whether it comes as one-minute readings
// (Hoy, 24 h) or hourly stats (7 días). Range bounds are exact instants: see server/params.ts.
import { Temporal } from 'temporal-polyfill';
import type { HourlyRow, ReadingRow } from '../../shared/api-types';
import { TIME_ZONE, msToKmh, toMadridWallClockMs } from './format';
import { dewPoint } from './weather';

export type RangeKey = 'last2h' | 'last24h' | 'last7days' | 'last30days' | 'custom';

// The custom range's title names its dates (see RangeCharts).
export const RANGES: { key: RangeKey; button: string; title: string }[] = [
  { key: 'last2h', button: '2 h', title: 'Últimas 2 horas' },
  { key: 'last24h', button: '24 h', title: 'Últimas 24 horas' },
  { key: 'last7days', button: '7 días', title: 'Hoy y los 6 días anteriores' },
  { key: 'last30days', button: '30 días', title: 'Hoy y los 29 días anteriores' },
  { key: 'custom', button: 'Personalizado', title: 'Periodo personalizado' },
];

// One point of a chart. Minute readings have no min/max, so those repeat the value itself.
export interface Sample {
  ts: string;
  temp: number | null;
  tempMin: number | null;
  tempMinAt: string | null;
  tempMax: number | null;
  tempMaxAt: string | null;
  humidity: number | null;
  humidityMin: number | null;
  humidityMax: number | null;
  pressure: number | null;
  pressureMin: number | null;
  pressureMax: number | null;
  windAvg: number | null; // km/h
  windGust: number | null; // km/h
  windGustAt: string | null;
  windDir: number | null; // degrees the wind comes from; the hour's vector mean for hourly data
  dewPoint: number | null;
  rain: number; // mm in this sample's minute or hour
}

export interface RangeSeries {
  from: string; // instants, ISO 8601
  to: string;
  stepMinutes: number;
  samples: Sample[];
}

export function fromReadings(readings: ReadingRow[], from: string, to: string): RangeSeries {
  return {
    from,
    to,
    stepMinutes: 1,
    samples: readings.map((r) => ({
      ts: r.ts,
      temp: r.temp_c,
      tempMin: r.temp_c,
      tempMinAt: r.ts,
      tempMax: r.temp_c,
      tempMaxAt: r.ts,
      humidity: r.humidity_pct,
      humidityMin: r.humidity_pct,
      humidityMax: r.humidity_pct,
      pressure: r.pressure_hpa,
      pressureMin: r.pressure_hpa,
      pressureMax: r.pressure_hpa,
      windAvg: msToKmh(r.wind_avg_ms),
      windGust: msToKmh(r.wind_gust_ms),
      windGustAt: r.ts,
      windDir: r.wind_dir_deg,
      dewPoint: dewPoint(r.temp_c, r.humidity_pct),
      rain: r.rain_mm,
    })),
  };
}

// The hour's dew point comes from its mean temperature and humidity: an estimate, not a mean.
export function fromHours(hours: HourlyRow[], from: string, to: string): RangeSeries {
  return {
    from,
    to,
    stepMinutes: 60,
    samples: hours.map((h) => ({
      ts: h.hour,
      temp: h.temp_avg,
      tempMin: h.temp_min,
      tempMinAt: h.temp_min_at,
      tempMax: h.temp_max,
      tempMaxAt: h.temp_max_at,
      humidity: h.humidity_avg,
      humidityMin: h.humidity_min,
      humidityMax: h.humidity_max,
      pressure: h.pressure_avg,
      pressureMin: h.pressure_min,
      pressureMax: h.pressure_max,
      windAvg: msToKmh(h.wind_avg_ms),
      windGust: msToKmh(h.wind_gust_max),
      windGustAt: h.wind_gust_max_at,
      windDir: h.wind_dir_deg,
      dewPoint: dewPoint(h.temp_avg, h.humidity_avg),
      rain: h.rain_mm ?? 0,
    })),
  };
}

// The last `hours` of a range, e.g. the 2 h view cut from the 24 h data: (to - hours, to].
export function lastHours(series: RangeSeries, hours: number): RangeSeries {
  const to = Temporal.Instant.from(series.to);
  const from = to.subtract({ hours });
  return {
    ...series,
    from: from.toString(),
    samples: series.samples.filter((s) => Temporal.Instant.compare(Temporal.Instant.from(s.ts), from) > 0),
  };
}

// The part of a range between two instants, from <= ts < to: shown at once when a stretch is
// dragged on a chart, while the finer data for it loads.
export function sliceSeries(series: RangeSeries, from: string, to: string): RangeSeries {
  const start = Temporal.Instant.from(from);
  const end = Temporal.Instant.from(to);
  return {
    ...series,
    from,
    to,
    samples: series.samples.filter((s) => {
      const ts = Temporal.Instant.from(s.ts);
      return Temporal.Instant.compare(ts, start) >= 0 && Temporal.Instant.compare(ts, end) < 0;
    }),
  };
}

const ms = (iso: string) => Temporal.Instant.from(iso).epochMilliseconds;

// [Madrid wall-clock ms, value] pairs for an ECharts time axis. Where two samples are more than
// two steps apart, a null point breaks the line, so a time the station was off is not bridged.
// It also breaks where the clock falls back: the repeated hour is drawn over the first one, and
// without the break a line would run back across the chart.
export function linePoints(series: RangeSeries, pick: (s: Sample) => number | null): [number, number | null][] {
  return timePoints(series.samples, series.stepMinutes, pick);
}

// The same for anything with a `ts`, `stepMinutes` apart.
export function timePoints<T extends { ts: string }>(
  items: T[],
  stepMinutes: number,
  pick: (item: T) => number | null,
): [number, number | null][] {
  const maxGapMs = 2 * stepMinutes * 60_000;
  const points: [number, number | null][] = [];
  items.forEach((item, i) => {
    const previous = items[i - 1];
    const fallsBack = previous && toMadridWallClockMs(item.ts) < toMadridWallClockMs(previous.ts);
    if (previous && (ms(item.ts) - ms(previous.ts) > maxGapMs || fallsBack)) {
      points.push([toMadridWallClockMs(previous.ts) + 1, null]);
    }
    points.push([toMadridWallClockMs(item.ts), pick(item)]);
  });
  return points;
}

export interface Extreme {
  value: number;
  at: string;
}

// Lowest or highest value in the range and the first time it was reached.
export function rangeExtreme(
  series: RangeSeries,
  kind: 'min' | 'max',
  pick: (s: Sample) => number | null,
  pickAt: (s: Sample) => string | null = (s) => s.ts,
): Extreme | null {
  let best: Extreme | null = null;
  for (const sample of series.samples) {
    const value = pick(sample);
    if (value === null) {
      continue;
    }
    if (!best || (kind === 'min' ? value < best.value : value > best.value)) {
      best = { value, at: pickAt(sample) ?? sample.ts };
    }
  }
  return best;
}

export interface RainBucket {
  start: string; // instant the bucket begins
  mm: number;
}

export type RainUnit = '10min' | 'hour' | 'day';

// Bars that read well for the range: 10 minutes up to 3 hours, hours up to 3 days, then days.
export function rainUnitFor(series: RangeSeries): RainUnit {
  const hours = Temporal.Instant.from(series.from).until(Temporal.Instant.from(series.to)).total('hours');
  return hours <= 3 ? '10min' : hours <= 72 ? 'hour' : 'day';
}

function bucketStart(iso: string, unit: RainUnit): Temporal.Instant {
  const instant = Temporal.Instant.from(iso);
  if (unit === 'day') {
    return instant.toZonedDateTimeISO(TIME_ZONE).startOfDay().toInstant();
  }
  // Madrid offsets are whole hours, so UTC hours and 10 minutes are also Madrid ones.
  return unit === 'hour'
    ? instant.round({ smallestUnit: 'hour', roundingMode: 'floor' })
    : instant.round({ smallestUnit: 'minute', roundingIncrement: 10, roundingMode: 'floor' });
}

export function bucketEnd(start: Temporal.Instant, unit: RainUnit): Temporal.Instant {
  if (unit === 'day') {
    return start.toZonedDateTimeISO(TIME_ZONE).add({ days: 1 }).startOfDay().toInstant();
  }
  return start.add(unit === 'hour' ? { hours: 1 } : { minutes: 10 });
}

// Rain per bucket across the whole range, with 0 for the empty ones.
export function rainBuckets(series: RangeSeries, unit: RainUnit): RainBucket[] {
  const totals = new Map<string, number>();
  const end = Temporal.Instant.from(series.to);
  for (let cursor = bucketStart(series.from, unit); Temporal.Instant.compare(cursor, end) < 0; cursor = bucketEnd(cursor, unit)) {
    totals.set(cursor.toString(), 0);
  }
  for (const sample of series.samples) {
    const key = bucketStart(sample.ts, unit).toString();
    if (totals.has(key)) {
      totals.set(key, totals.get(key)! + sample.rain);
    }
  }
  return [...totals].map(([start, mm]) => ({ start, mm: Math.round(mm * 10000) / 10000 }));
}

export function totalRain(series: RangeSeries): number {
  return Math.round(series.samples.reduce((total, s) => total + s.rain, 0) * 10000) / 10000;
}

// When it last rained in the range: the minute, or the hour for hourly data.
export function lastRain(series: RangeSeries): string | null {
  return series.samples.findLast((s) => s.rain > 0)?.ts ?? null;
}

// Wind for the chart, in stretches that suit the range: one-minute readings are too gusty to
// read over a day (1440 points in a card). Ten-minute means are the meteorological standard.
export interface WindBucket {
  ts: string; // instant the stretch begins
  avg: number | null; // km/h, mean of the samples
  gust: number | null; // km/h, the highest gust
  gustAt: string | null;
  dir: number | null; // degrees the wind comes from, vector mean as in the hourly stats
}

// Stretch lengths in minutes, finest first. From an hour up they follow the Madrid clock.
const WIND_STEPS = [1, 10, 30, 60, 180, 360, 1440];

// The finest stretch, never finer than the data, that leaves at most `maxBuckets` in the range.
export function windStepFor(series: RangeSeries, maxBuckets: number): number {
  const minutes = Temporal.Instant.from(series.from).until(Temporal.Instant.from(series.to)).total('minutes');
  return WIND_STEPS.find((step) => step >= series.stepMinutes && minutes / step <= maxBuckets) ?? WIND_STEPS.at(-1)!;
}

function windStart(iso: string, step: number): Temporal.Instant {
  const instant = Temporal.Instant.from(iso);
  if (step < 60) {
    return instant.round({ smallestUnit: 'minute', roundingIncrement: step, roundingMode: 'floor' });
  }
  const local = instant.toZonedDateTimeISO(TIME_ZONE);
  return step === 1440
    ? local.startOfDay().toInstant()
    : local.round({ smallestUnit: 'hour', roundingIncrement: step / 60, roundingMode: 'floor' }).toInstant();
}

// Mean direction of unit vectors, so 350° and 10° average to 0°, not 180°.
function meanDirection(degrees: number[]): number | null {
  if (degrees.length === 0) {
    return null;
  }
  const rad = degrees.map((d) => (d * Math.PI) / 180);
  const sin = rad.reduce((total, r) => total + Math.sin(r), 0);
  const cos = rad.reduce((total, r) => total + Math.cos(r), 0);
  return Math.round(((Math.atan2(sin, cos) * 180) / Math.PI + 360) % 360) % 360;
}

// Stretches with no samples are left out: the chart breaks the line there.
export function windBuckets(series: RangeSeries, step: number): WindBucket[] {
  const groups = new Map<string, Sample[]>();
  for (const sample of series.samples) {
    const key = windStart(sample.ts, step).toString();
    const group = groups.get(key);
    if (group) {
      group.push(sample);
    } else {
      groups.set(key, [sample]);
    }
  }
  return [...groups].map(([ts, samples]) => {
    const avgs = samples.map((s) => s.windAvg).filter((v) => v !== null);
    const gust = rangeExtreme({ ...series, samples }, 'max', (s) => s.windGust, (s) => s.windGustAt);
    return {
      ts,
      avg: avgs.length > 0 ? avgs.reduce((total, v) => total + v, 0) / avgs.length : null,
      gust: gust?.value ?? null,
      gustAt: gust?.at ?? null,
      dir: meanDirection(samples.map((s) => s.windDir).filter((v) => v !== null)),
    };
  });
}

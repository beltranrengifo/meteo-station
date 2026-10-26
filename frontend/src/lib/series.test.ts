import { describe, expect, it } from 'vitest';
import type { HourlyRow, ReadingRow } from '../../shared/api-types';
import {
  fromHours, fromReadings, lastHours, lastRain, sliceSeries, linePoints, rainBuckets, rainUnitFor, rangeExtreme, totalRain, windBuckets, windStepFor,
} from './series';

function reading(ts: string, values: Partial<ReadingRow> = {}): ReadingRow {
  return {
    ts,
    temp_c: 20,
    humidity_pct: 50,
    pressure_hpa: 945,
    wind_avg_ms: 1,
    wind_gust_ms: 2,
    wind_dir_deg: 0,
    rain_mm: 0,
    ...values,
  };
}

// 2026-10-14 in Madrid (UTC+2) starts at 2026-10-13T22:00Z.
const TODAY_FROM = '2026-10-13T22:00:00Z';

describe('fromReadings', () => {
  it('converts wind to km/h and adds the dew point', () => {
    const [sample] = fromReadings([reading('2026-10-14T08:00:00Z')], TODAY_FROM, '2026-10-14T08:00:30Z').samples;
    expect(sample.windAvg).toBeCloseTo(3.6);
    expect(sample.windGust).toBeCloseTo(7.2);
    expect(sample.dewPoint).toBeCloseTo(9.26, 2);
    expect(sample.tempMaxAt).toBe('2026-10-14T08:00:00Z');
  });
});

describe('fromHours', () => {
  it('keeps the hour extremes and their times', () => {
    const hour = {
      device_id: 'x',
      hour: '2026-10-14T06:00:00+00:00',
      temp_avg: 15,
      temp_min: 14,
      temp_min_at: '2026-10-14T06:10:00+00:00',
      temp_max: 16,
      temp_max_at: '2026-10-14T06:50:00+00:00',
      humidity_avg: 60,
      humidity_min: 55,
      humidity_max: 65,
      pressure_avg: 945,
      pressure_min: 944.8,
      pressure_max: 945.2,
      wind_avg_ms: 1,
      wind_gust_max: 5,
      wind_gust_max_at: '2026-10-14T06:30:00+00:00',
      wind_dir_deg: 90,
      rain_mm: null,
      samples: 60,
    } satisfies HourlyRow;
    const series = fromHours([hour], '2026-10-07T22:00:00Z', '2026-10-14T07:00:00Z');
    expect(series.stepMinutes).toBe(60);
    expect(series.samples[0]).toMatchObject({ tempMin: 14, tempMaxAt: '2026-10-14T06:50:00+00:00', windGust: 18, rain: 0 });
  });
});

describe('linePoints', () => {
  it('uses Madrid wall-clock times and breaks the line over gaps', () => {
    const series = fromReadings(
      [reading('2026-10-14T06:00:00Z'), reading('2026-10-14T06:02:00Z'), reading('2026-10-14T06:05:00Z')],
      TODAY_FROM,
      '2026-10-14T06:05:30Z',
    );
    const wall = (iso: string) => Date.parse(iso);
    expect(linePoints(series, (s) => s.temp)).toEqual([
      [wall('2026-10-14T08:00:00Z'), 20],
      [wall('2026-10-14T08:02:00Z'), 20], // 2 minutes apart: still one line
      [wall('2026-10-14T08:02:00Z') + 1, null], // 3 minutes apart: a gap
      [wall('2026-10-14T08:05:00Z'), 20],
    ]);
  });

  it('breaks the line where the clock falls back, so the repeated hour is not joined', () => {
    // 2026-10-25: 03:00 summer time is 02:00 winter time, so 02:00-03:00 happens twice.
    const series = fromReadings(
      [reading('2026-10-25T00:58:00Z'), reading('2026-10-25T00:59:00Z'), reading('2026-10-25T01:00:00Z')],
      '2026-10-24T22:00:00Z',
      '2026-10-25T01:00:30Z',
    );
    const wall = (iso: string) => Date.parse(iso);
    expect(linePoints(series, (s) => s.temp)).toEqual([
      [wall('2026-10-25T02:58:00Z'), 20],
      [wall('2026-10-25T02:59:00Z'), 20],
      [wall('2026-10-25T02:59:00Z') + 1, null],
      [wall('2026-10-25T02:00:00Z'), 20],
    ]);
  });
});

describe('rainBuckets', () => {
  it('fills every hour from the start of the range, empty ones as 0', () => {
    const series = fromReadings(
      [reading('2026-10-13T22:30:00Z', { rain_mm: 0.2794 }), reading('2026-10-13T22:40:00Z', { rain_mm: 0.2794 })],
      TODAY_FROM,
      '2026-10-14T00:15:00Z',
    );
    expect(rainBuckets(series, 'hour')).toEqual([
      { start: '2026-10-13T22:00:00Z', mm: 0.5588 },
      { start: '2026-10-13T23:00:00Z', mm: 0 },
      { start: '2026-10-14T00:00:00Z', mm: 0 },
    ]);
  });
  it('starts the 24 h range at the hour it falls in', () => {
    const series = fromReadings([], '2026-10-13T06:58:32Z', '2026-10-13T08:10:00Z');
    expect(rainBuckets(series, 'hour').map((b) => b.start)).toEqual([
      '2026-10-13T06:00:00Z', '2026-10-13T07:00:00Z', '2026-10-13T08:00:00Z',
    ]);
  });
  it('splits Madrid days, also across the clock change', () => {
    // From 2026-10-24 00:00 (UTC+2) to 2026-10-26 10:00 (UTC+1); the 25th has 25 hours.
    const series = fromReadings(
      [reading('2026-10-25T22:30:00Z', { rain_mm: 0.2794 })], // 23:30 on the 25th, Madrid
      '2026-10-23T22:00:00Z',
      '2026-10-26T09:00:00Z',
    );
    expect(rainBuckets(series, 'day')).toEqual([
      { start: '2026-10-23T22:00:00Z', mm: 0 },
      { start: '2026-10-24T22:00:00Z', mm: 0.2794 },
      { start: '2026-10-25T23:00:00Z', mm: 0 },
    ]);
  });
});

describe('rainBuckets in 10 minutes', () => {
  it('fills the 2 h range in 10-minute bars', () => {
    const series = fromReadings([reading('2026-10-14T06:15:00Z', { rain_mm: 0.2794 })], '2026-10-14T06:01:30Z', '2026-10-14T06:31:30Z');
    expect(rainBuckets(series, '10min')).toEqual([
      { start: '2026-10-14T06:00:00Z', mm: 0 },
      { start: '2026-10-14T06:10:00Z', mm: 0.2794 },
      { start: '2026-10-14T06:20:00Z', mm: 0 },
      { start: '2026-10-14T06:30:00Z', mm: 0 },
    ]);
  });
  it('picks the bar size by the range length', () => {
    const unit = (from: string, to: string) => rainUnitFor(fromReadings([], from, to));
    expect(unit('2026-10-14T06:00:00Z', '2026-10-14T09:00:00Z')).toBe('10min');
    expect(unit('2026-10-14T06:00:00Z', '2026-10-14T09:01:00Z')).toBe('hour');
    expect(unit('2026-10-11T06:00:00Z', '2026-10-14T06:00:00Z')).toBe('hour');
    expect(unit('2026-10-11T06:00:00Z', '2026-10-14T06:01:00Z')).toBe('day');
  });
});

describe('lastHours', () => {
  it('keeps the readings after to - hours, and moves from there', () => {
    const series = fromReadings(
      [reading('2026-10-14T06:00:00Z'), reading('2026-10-14T06:01:00Z'), reading('2026-10-14T08:00:00Z')],
      '2026-10-13T08:00:00Z',
      '2026-10-14T08:00:00Z',
    );
    const last2h = lastHours(series, 2);
    expect(last2h.from).toBe('2026-10-14T06:00:00Z');
    expect(last2h.to).toBe('2026-10-14T08:00:00Z');
    expect(last2h.samples.map((s) => s.ts)).toEqual(['2026-10-14T06:01:00Z', '2026-10-14T08:00:00Z']);
  });
});

describe('sliceSeries', () => {
  it('keeps from <= ts < to and takes the new bounds', () => {
    const series = fromReadings(
      [reading('2026-10-14T06:00:00Z'), reading('2026-10-14T06:01:00Z'), reading('2026-10-14T06:02:00Z')],
      TODAY_FROM,
      '2026-10-14T06:02:30Z',
    );
    const slice = sliceSeries(series, '2026-10-14T06:01:00Z', '2026-10-14T06:02:00Z');
    expect(slice.from).toBe('2026-10-14T06:01:00Z');
    expect(slice.to).toBe('2026-10-14T06:02:00Z');
    expect(slice.samples.map((s) => s.ts)).toEqual(['2026-10-14T06:01:00Z']);
  });
});

describe('extremes and rain', () => {
  const series = fromReadings(
    [
      reading('2026-10-14T05:00:00Z', { temp_c: 12, rain_mm: 0.2794 }),
      reading('2026-10-14T05:01:00Z', { temp_c: 12 }),
      reading('2026-10-14T13:00:00Z', { temp_c: 21.5, rain_mm: 0.2794 }),
      reading('2026-10-14T13:01:00Z', { temp_c: null }),
    ],
    TODAY_FROM,
    '2026-10-14T13:01:30Z',
  );
  it('finds the first time the extreme was reached', () => {
    expect(rangeExtreme(series, 'min', (s) => s.temp)).toEqual({ value: 12, at: '2026-10-14T05:00:00Z' });
    expect(rangeExtreme(series, 'max', (s) => s.temp)).toEqual({ value: 21.5, at: '2026-10-14T13:00:00Z' });
    expect(rangeExtreme(fromReadings([], TODAY_FROM, TODAY_FROM), 'max', (s) => s.temp)).toBeNull();
  });
  it('adds up the rain and finds when it last rained', () => {
    expect(totalRain(series)).toBe(0.5588);
    expect(lastRain(series)).toBe('2026-10-14T13:00:00Z');
  });
});

describe('windBuckets', () => {
  it('averages the wind, keeps the highest gust and averages the direction as vectors', () => {
    const series = fromReadings(
      [
        reading('2026-10-14T06:00:00Z', { wind_avg_ms: 1, wind_gust_ms: 2, wind_dir_deg: 350 }),
        reading('2026-10-14T06:05:00Z', { wind_avg_ms: 3, wind_gust_ms: 5, wind_dir_deg: 10 }),
        reading('2026-10-14T06:09:00Z', { wind_avg_ms: null, wind_gust_ms: null, wind_dir_deg: null }),
        reading('2026-10-14T06:10:00Z', { wind_avg_ms: 2, wind_gust_ms: 4, wind_dir_deg: 270 }),
      ],
      TODAY_FROM,
      '2026-10-14T06:10:30Z',
    );
    const [first, second] = windBuckets(series, 10);
    expect(first).toMatchObject({ ts: '2026-10-14T06:00:00Z', gust: 18, gustAt: '2026-10-14T06:05:00Z', dir: 0 });
    expect(first.avg).toBeCloseTo(7.2); // (3.6 + 10.8) / 2 km/h
    expect(second).toMatchObject({ ts: '2026-10-14T06:10:00Z', dir: 270 });
  });
  it('follows the Madrid clock from an hour up', () => {
    // 07:30 and 08:30 in Madrid (UTC+2): the same 6-hour stretch, from 06:00.
    const series = fromReadings([reading('2026-10-14T05:30:00Z'), reading('2026-10-14T06:30:00Z')], TODAY_FROM, '2026-10-14T07:00:00Z');
    expect(windBuckets(series, 360).map((b) => b.ts)).toEqual(['2026-10-14T04:00:00Z']);
    expect(windBuckets(series, 1440).map((b) => b.ts)).toEqual([TODAY_FROM]);
  });
  it('picks the stretch by the range length, never finer than the data', () => {
    const from = '2026-10-01T00:00:00Z';
    const step = (hours: number, stepMinutes = 1) =>
      windStepFor({ from, to: new Date(Date.parse(from) + hours * 3_600_000).toISOString(), stepMinutes, samples: [] }, 180);
    expect(step(2)).toBe(1);
    expect(step(24)).toBe(10);
    expect(step(48)).toBe(30);
    expect(step(7 * 24, 60)).toBe(60);
    expect(step(30 * 24, 60)).toBe(360);
  });
});

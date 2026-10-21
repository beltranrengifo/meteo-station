// Today's high and low for the 9:00 notification: Open-Meteo corrected with what the station
// measured. Pure, so it is unit-tested; the data is read in daily-data.ts.
import { Temporal } from 'temporal-polyfill';
import type { TodayHour } from './open-meteo.js';
import { TIME_ZONE } from './params.js';

// A sensor fault must not turn into an absurd forecast.
export const MAX_CORRECTION_C = 5;
// The station is trusted with 80 % of the minutes: 430 of the 540 from 00:00 to 09:00, 1200 of
// a day's 1440.
export const NIGHT_MIN_READINGS = 430;
export const YESTERDAY_MIN_SAMPLES = 1200;
const FIRST_HOUR = 9;

export interface Extreme {
  tempC: number;
  hour: number; // Madrid
}

export interface StationDay {
  temp9: number | null; // measured at 9:00
  nightMin: Extreme | null; // measured since 00:00, null without enough readings
  yesterdayMax: number | null; // measured, null without enough samples
}

export interface TodayRange {
  min: Extreme;
  max: Extreme;
}

export interface TempReading {
  ts: string;
  temp_c: number | null;
}

// The mean of the 9:00 error (measured - model) and yesterday's high error (measured - what
// the run of the day before forecast), each when there is data, capped; 0 with neither.
export function temperatureCorrection(station: StationDay, hours: TodayHour[], yesterdayForecastMax: number | null): number {
  const errors: number[] = [];
  const model9 = hours.find((h) => h.hour === FIRST_HOUR);
  if (station.temp9 !== null && model9) {
    errors.push(station.temp9 - model9.tempC);
  }
  if (station.yesterdayMax !== null && yesterdayForecastMax !== null) {
    errors.push(station.yesterdayMax - yesterdayForecastMax);
  }
  if (errors.length === 0) {
    return 0;
  }
  const mean = errors.reduce((total, e) => total + e, 0) / errors.length;
  return Math.max(-MAX_CORRECTION_C, Math.min(MAX_CORRECTION_C, mean));
}

function lowest(hours: TodayHour[]): TodayHour {
  return hours.reduce((a, b) => (b.tempC < a.tempC ? b : a));
}

// High: the model's from 9:00 on, corrected. Low: at 9:00 the night low has usually been
// measured already, so the lower of that and the model's corrected low for the rest of the day;
// without a measured one, the model's corrected low of the whole day. `hours` must hold 9 to 23.
export function todayRange(hours: TodayHour[], station: StationDay, correction: number): TodayRange {
  const corrected = (h: TodayHour): Extreme => ({ tempC: h.tempC + correction, hour: h.hour });
  const rest = hours.filter((h) => h.hour >= FIRST_HOUR);
  const max = corrected(rest.reduce((a, b) => (b.tempC > a.tempC ? b : a)));
  if (!station.nightMin) {
    return { min: corrected(lowest(hours)), max };
  }
  const later = corrected(lowest(rest));
  return { min: later.tempC < station.nightMin.tempC ? later : station.nightMin, max };
}

// The lowest reading from 00:00 to 09:00 (the query picks them) and its Madrid hour.
export function nightMinimum(readings: TempReading[]): Extreme | null {
  const valid = readings.filter((r): r is { ts: string; temp_c: number } => r.temp_c !== null);
  if (valid.length < NIGHT_MIN_READINGS) {
    return null;
  }
  const min = valid.reduce((a, b) => (b.temp_c < a.temp_c ? b : a));
  return { tempC: min.temp_c, hour: Temporal.Instant.from(min.ts).toZonedDateTimeISO(TIME_ZONE).hour };
}

export function measuredYesterdayMax(row: { temp_max: number | null; samples: number } | null): number | null {
  return row && row.samples >= YESTERDAY_MIN_SAMPLES ? row.temp_max : null;
}

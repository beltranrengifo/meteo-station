// Pure logic of the backfill (backfill-estimates.ts): calibrating Open-Meteo against the station,
// turning hourly reference values into one-minute readings, and planning which readings get
// estimated values. No I/O here, so all of it is unit-tested (estimates.test.ts).
//
// Times are epoch seconds (UTC). A reading's ts is the END of its minute, as in public.readings.
import { scaleLinear } from "npm:d3-scale@4.0.2";
import { linearRegression, mean, rootMeanSquare, sum } from "npm:simple-statistics@7.8.8";

export const MINUTE = 60;
export const HOUR = 3600;
// One tip of the rain gauge (firmware RAIN_MM_PER_TIP).
export const TIP_MM = 0.2794;

// The measured fields of public.readings, in column order. `estimated` lists a subset of them.
export const FIELDS = [
  "temp_c",
  "humidity_pct",
  "pressure_hpa",
  "wind_avg_ms",
  "wind_gust_ms",
  "wind_dir_deg",
  "rain_mm",
] as const;
export type Field = typeof FIELDS[number];

export type Reading = { ts: number } & { [F in Field]: number | null };

// ---------------------------------------------------------------- calibration

// none: y = x. offset: y = x + b. ratio: y = a x. linear: y = a x + b (compared, never chosen:
// see the report). circularOffset: y = (x + b) mod 360, for wind direction.
export type Form = "none" | "offset" | "ratio" | "linear" | "circularOffset";
export interface Calibration {
  form: Form;
  a: number;
  b: number;
}
// One hour: reference value x, station value y.
export interface Pair {
  t: number;
  x: number;
  y: number;
}

// Signed difference a - b in degrees, in [-180, 180).
export function angleDiff(a: number, b: number): number {
  return ((((a - b + 180) % 360) + 360) % 360) - 180;
}

export function circularMean(degrees: number[]): number {
  const rad = degrees.map((d) => (d * Math.PI) / 180);
  const s = mean(rad.map(Math.sin));
  const c = mean(rad.map(Math.cos));
  return (((Math.atan2(s, c) * 180) / Math.PI) + 360) % 360;
}

export function fit(form: Form, pairs: Pair[]): Calibration {
  if (pairs.length === 0 && form !== "none") throw new Error(`no data to fit ${form}`);
  switch (form) {
    case "none":
      return { form, a: 1, b: 0 };
    case "offset":
      return { form, a: 1, b: mean(pairs.map((p) => p.y - p.x)) };
    case "ratio":
      // Least squares through the origin.
      return { form, a: sum(pairs.map((p) => p.x * p.y)) / sum(pairs.map((p) => p.x * p.x)), b: 0 };
    case "linear": {
      const { m, b } = linearRegression(pairs.map((p) => [p.x, p.y]));
      return { form, a: m, b };
    }
    case "circularOffset": {
      const b = angleDiff(circularMean(pairs.map((p) => angleDiff(p.y, p.x) + 360)), 0);
      return { form, a: 1, b };
    }
  }
}

export function calibrate(cal: Calibration, x: number): number {
  if (cal.form === "circularOffset") return (((x + cal.b) % 360) + 360) % 360;
  return cal.a * x + cal.b;
}

// Error of a prediction: plain difference, or the shortest angle for directions.
function error(circular: boolean, predicted: number, actual: number): number {
  return circular ? angleDiff(predicted, actual) : predicted - actual;
}

export interface Score {
  n: number;
  mae: number;
  rmse: number;
  bias: number;
}

// `circular`: the values are directions in degrees (also when comparing them with no calibration).
export function score(cal: Calibration, pairs: Pair[], circular = cal.form === "circularOffset"): Score {
  return summarize(pairs.map((p) => error(circular, calibrate(cal, p.x), p.y)));
}

function summarize(errors: number[]): Score {
  if (errors.length === 0) return { n: 0, mae: NaN, rmse: NaN, bias: NaN };
  return {
    n: errors.length,
    mae: mean(errors.map(Math.abs)),
    rmse: rootMeanSquare(errors),
    bias: mean(errors),
  };
}

// Held-out error: the pairs are cut into blocks of `blockSeconds` (whole days, or 6 hours when
// there is little data); each block is predicted by a calibration fitted on all the others.
export function crossValidate(
  form: Form,
  pairs: Pair[],
  blockSeconds: number,
  circular = form === "circularOffset",
): Score {
  const blockOf = (p: Pair) => Math.floor(p.t / blockSeconds);
  const blocks = [...new Set(pairs.map(blockOf))];
  const errors: number[] = [];
  for (const block of blocks) {
    const train = pairs.filter((p) => blockOf(p) !== block);
    if (train.length === 0) continue;
    const cal = fit(form, train);
    for (const p of pairs.filter((p) => blockOf(p) === block)) {
      errors.push(error(circular, calibrate(cal, p.x), p.y));
    }
  }
  return summarize(errors);
}

// ---------------------------------------------------------------- hourly station values

// The hour a minute belongs to when compared with an instantaneous model value at time t
// (temperature, humidity, pressure, wind speed and direction): minutes ending in [t-30, t+30).
export function centeredHour(ts: number): number {
  return Math.floor((ts + HOUR / 2) / HOUR) * HOUR;
}

// The hour a minute belongs to for Open-Meteo's "preceding hour" values (precipitation, gusts):
// the value at t covers (t-1h, t], so a minute ending at ts goes to the next full hour.
export function trailingHour(ts: number): number {
  return Math.ceil(ts / HOUR) * HOUR;
}

export type Aggregate = "mean" | "max" | "sum" | "circularMean";

// Station values per hour, from minutes; hours with fewer than minCount minutes are dropped.
export function hourly(
  minutes: { ts: number; value: number | null }[],
  hourOf: (ts: number) => number,
  aggregate: Aggregate,
  minCount: number,
): Map<number, number> {
  const groups = new Map<number, number[]>();
  for (const { ts, value } of minutes) {
    if (value === null) continue;
    const h = hourOf(ts);
    const list = groups.get(h);
    if (list) list.push(value);
    else groups.set(h, [value]);
  }
  const out = new Map<number, number>();
  for (const [h, values] of groups) {
    if (values.length < minCount) continue;
    out.set(
      h,
      aggregate === "mean"
        ? mean(values)
        : aggregate === "max"
        ? Math.max(...values)
        : aggregate === "sum"
        ? sum(values)
        : circularMean(values),
    );
  }
  return out;
}

// ---------------------------------------------------------------- hourly to minutes

// Linear interpolation in time between the hourly values; null outside them (no extrapolation)
// and across missing values.
export function interpolate(times: number[], values: (number | null)[], at: number[]): (number | null)[] {
  const known = times.map((t, i) => [t, values[i]] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (known.length === 0) return at.map(() => null);
  const scale = scaleLinear().domain(known.map((p) => p[0])).range(known.map((p) => p[1]));
  const first = known[0][0];
  const last = known[known.length - 1][0];
  return at.map((t) => (t < first || t > last ? null : scale(t)));
}

// Directions are interpolated through their sine and cosine, so 350 to 10 passes through 0.
export function interpolateDirection(times: number[], degrees: (number | null)[], at: number[]): (number | null)[] {
  const rad = degrees.map((d) => (d === null ? null : (d * Math.PI) / 180));
  const s = interpolate(times, rad.map((r) => (r === null ? null : Math.sin(r))), at);
  const c = interpolate(times, rad.map((r) => (r === null ? null : Math.cos(r))), at);
  return at.map((_, i) => {
    const si = s[i];
    const ci = c[i];
    if (si === null || ci === null) return null;
    return ((((Math.atan2(si, ci) * 180) / Math.PI) % 360) + 360) % 360;
  });
}

// Spreads hourly precipitation over one-minute readings and rounds it to whole gauge tips.
// `slots` are all the minute ends of the window, `rows` the ones that get a reading (a missing
// reading's share goes to the others of its hour, so each hour keeps its total). An hour only
// partly inside the window gets its share: 20 of its 60 minutes inside, a third of its rain.
// Tips are placed where the running total crosses each half tip, so the window total is the
// reference total rounded to whole tips and no hour is off by more than one tip.
export function spreadRain(
  precipitation: (hourEnd: number) => number | null,
  slots: number[],
  rows: number[],
): Map<number, number> {
  const slotsPerHour = new Map<number, number>();
  for (const ts of slots) slotsPerHour.set(trailingHour(ts), (slotsPerHour.get(trailingHour(ts)) ?? 0) + 1);
  const rowsPerHour = new Map<number, number>();
  for (const ts of rows) rowsPerHour.set(trailingHour(ts), (rowsPerHour.get(trailingHour(ts)) ?? 0) + 1);

  const out = new Map<number, number>();
  let total = 0;
  let tips = 0;
  for (const ts of [...rows].sort((a, b) => a - b)) {
    const h = trailingHour(ts);
    const mm = Math.max(0, precipitation(h) ?? 0);
    total += (mm * (slotsPerHour.get(h) ?? 0)) / 60 / rowsPerHour.get(h)!;
    const tipsNow = Math.round(total / TIP_MM);
    out.set(ts, round((tipsNow - tips) * TIP_MM, 4));
    tips = tipsNow;
  }
  return out;
}

// Minute ends from `from` to `to`, both included.
export function minuteEnds(from: number, to: number): number[] {
  const out: number[] = [];
  for (let t = from; t <= to; t += MINUTE) out.push(t);
  return out;
}

export function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

// ---------------------------------------------------------------- the plan

// insert: a reading for every minute of the window that has none, every field estimated.
// replace: every reading of the window gets these fields estimated.
// fillNull: readings of the window get these fields estimated where they are null.
export interface Window {
  name: string;
  reason: string;
  mode: "insert" | "replace" | "fillNull";
  from: number; // first minute end
  to: number; // last minute end, included
  fields: Field[];
}

// Estimated value of a field for the minute ending at ts (null: no reference for it).
export type Estimator = (field: Exclude<Field, "rain_mm">, ts: number) => number | null;

export interface PlannedRow {
  reading: Reading; // final values of the seven fields
  estimated: Field[];
  reason: string;
  insert: boolean;
}

export interface Plan {
  rows: PlannedRow[];
  // per window: readings inserted or changed, and per field how many values it estimates
  windows: { name: string; readings: number; fields: Partial<Record<Field, number>> }[];
  missingReference: number; // values left as they were because the reference had no value
}

const DECIMALS: Record<Field, number> = {
  temp_c: 2,
  humidity_pct: 1,
  pressure_hpa: 2,
  wind_avg_ms: 2,
  wind_gust_ms: 2,
  wind_dir_deg: 0,
  rain_mm: 4,
};

// `rows` are the station's readings as measured (originals, never earlier estimates).
export function buildPlan(
  rows: Reading[],
  windows: Window[],
  estimate: Estimator,
  precipitation: (hourEnd: number) => number | null,
): Plan {
  const byTs = new Map(rows.map((r) => [r.ts, r]));
  type Touch = { base: Reading | null; fields: Set<Field>; reasons: Set<string> };
  const touched = new Map<number, Touch>();
  const touch = (ts: number, base: Reading | null, fields: Field[], reason: string) => {
    const t = touched.get(ts) ?? { base, fields: new Set<Field>(), reasons: new Set<string>() };
    fields.forEach((f) => t.fields.add(f));
    t.reasons.add(reason);
    touched.set(ts, t);
  };
  const rain = new Map<number, number>();
  const counts: Plan["windows"] = [];

  for (const w of windows) {
    const slots = minuteEnds(w.from, w.to);
    const fieldCounts: Partial<Record<Field, number>> = {};
    let readings = 0;
    const rainRows: number[] = [];
    for (const ts of slots) {
      const base = byTs.get(ts) ?? null;
      let fields: Field[];
      if (w.mode === "insert") fields = base ? [] : FIELDS.slice();
      else if (!base) fields = [];
      else if (w.mode === "replace") fields = w.fields;
      else fields = w.fields.filter((f) => base[f] === null);
      if (fields.length === 0) continue;
      readings++;
      for (const f of fields) fieldCounts[f] = (fieldCounts[f] ?? 0) + 1;
      if (fields.includes("rain_mm")) rainRows.push(ts);
      touch(ts, base, fields, w.reason);
    }
    // Rain is spread within each window, so the window keeps the reference total.
    for (const [ts, mm] of spreadRain(precipitation, slots, rainRows)) rain.set(ts, mm);
    counts.push({ name: w.name, readings, fields: fieldCounts });
  }

  let missingReference = 0;
  const planned: PlannedRow[] = [];
  for (const [ts, t] of [...touched].sort((a, b) => a[0] - b[0])) {
    const reading: Reading = t.base
      ? { ...t.base }
      : { ts, temp_c: null, humidity_pct: null, pressure_hpa: null, wind_avg_ms: null, wind_gust_ms: null, wind_dir_deg: null, rain_mm: 0 };
    const estimated: Field[] = [];
    for (const f of FIELDS) {
      if (!t.fields.has(f)) continue;
      const value = f === "rain_mm" ? rain.get(ts) ?? null : estimate(f, ts);
      if (value === null) {
        missingReference++;
        continue;
      }
      reading[f] = f === "wind_dir_deg" ? Math.round(value) % 360 : round(value, DECIMALS[f]);
      estimated.push(f);
    }
    if (estimated.length === 0) continue;
    // A gust is never below the minute's average.
    if (reading.wind_avg_ms !== null && reading.wind_gust_ms !== null && reading.wind_gust_ms < reading.wind_avg_ms) {
      reading.wind_gust_ms = reading.wind_avg_ms;
    }
    if (reading.humidity_pct !== null) reading.humidity_pct = Math.min(100, Math.max(0, reading.humidity_pct));
    planned.push({ reading, estimated, reason: [...t.reasons].join("; "), insert: t.base === null });
  }
  return { rows: planned, windows: counts, missingReference };
}

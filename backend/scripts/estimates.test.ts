import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  angleDiff,
  buildPlan,
  calibrate,
  centeredHour,
  circularMean,
  crossValidate,
  type Field,
  fit,
  HOUR,
  hourly,
  interpolate,
  interpolateDirection,
  minuteEnds,
  type Pair,
  type Reading,
  spreadRain,
  TIP_MM,
  trailingHour,
  type Window,
} from "./estimates.ts";

const T0 = Date.parse("2026-11-13T00:00:00Z") / 1000;

function pairs(xs: number[], f: (x: number) => number, step = HOUR): Pair[] {
  return xs.map((x, i) => ({ t: T0 + i * step, x, y: f(x) }));
}

Deno.test("angles: difference and circular mean wrap around north", () => {
  assertEquals(angleDiff(10, 350), 20);
  assertEquals(angleDiff(350, 10), -20);
  assertEquals(angleDiff(180, 0), -180);
  assertAlmostEquals(circularMean([350, 10]), 0, 1e-9);
  assertAlmostEquals(circularMean([80, 100]), 90, 1e-9);
});

Deno.test("fit: offset, ratio and linear recover the parameters", () => {
  const xs = [10, 12, 15, 9, 20];
  assertAlmostEquals(fit("offset", pairs(xs, (x) => x - 1.3)).b, -1.3, 1e-9);
  assertAlmostEquals(fit("ratio", pairs(xs, (x) => 0.42 * x)).a, 0.42, 1e-9);
  const lin = fit("linear", pairs(xs, (x) => 0.9 * x + 2));
  assertAlmostEquals(lin.a, 0.9, 1e-9);
  assertAlmostEquals(lin.b, 2, 1e-9);
  assertEquals(fit("none", []), { form: "none", a: 1, b: 0 });
});

Deno.test("fit: circular offset across north, and calibrate wraps to 0..359", () => {
  const cal = fit("circularOffset", pairs([350, 340, 20], (x) => (x + 30) % 360));
  assertAlmostEquals(cal.b, 30, 1e-9);
  assertAlmostEquals(calibrate(cal, 350), 20, 1e-9);
  assertAlmostEquals(calibrate({ form: "circularOffset", a: 1, b: -30 }, 10), 340, 1e-9);
});

Deno.test("crossValidate: exact model gives no error; held-out blocks are not used to fit", () => {
  const exact = pairs([1, 2, 3, 4, 5, 6], (x) => x + 2, 12 * HOUR);
  const s = crossValidate("offset", exact, 24 * HOUR);
  assertEquals(s.n, 6);
  assertAlmostEquals(s.mae, 0, 1e-9);
  // Two days with different offsets: each day is predicted with the other's offset.
  const twoDays: Pair[] = [
    { t: T0, x: 10, y: 11 },
    { t: T0 + 24 * HOUR, x: 10, y: 13 },
  ];
  const cv = crossValidate("offset", twoDays, 24 * HOUR);
  assertAlmostEquals(cv.mae, 2, 1e-9);
  assertAlmostEquals(cv.bias, 0, 1e-9);
});

Deno.test("hourly: centered hours for instant values, trailing hours for totals", () => {
  // ts is the end of the minute. 00:31 to 01:30 is the hour centered on 01:00.
  assertEquals(centeredHour(T0 + 30 * 60), T0 + HOUR);
  assertEquals(centeredHour(T0 + 29 * 60), T0);
  // 00:01 to 01:00 is the hour ending at 01:00, as Open-Meteo's precipitation at 01:00.
  assertEquals(trailingHour(T0 + 60), T0 + HOUR);
  assertEquals(trailingHour(T0 + HOUR), T0 + HOUR);
  const minutes = minuteEnds(T0 + 60, T0 + HOUR).map((ts, i) => ({ ts, value: i < 3 ? 0.2794 : 0 }));
  const rain = hourly(minutes, trailingHour, "sum", 45);
  assertAlmostEquals(rain.get(T0 + HOUR)!, 3 * 0.2794, 1e-9);
  // Too few minutes: the hour is dropped.
  assertEquals(hourly(minutes.slice(0, 10), trailingHour, "sum", 45).size, 0);
  const dirs = hourly([{ ts: T0, value: 350 }, { ts: T0 + 60, value: 10 }], centeredHour, "circularMean", 1);
  assertAlmostEquals(dirs.get(T0)!, 0, 1e-9);
});

Deno.test("interpolate: linear between hours, null outside and skips missing values", () => {
  const times = [T0, T0 + HOUR, T0 + 2 * HOUR];
  const out = interpolate(times, [10, null, 16], [T0 + 30 * 60, T0 + HOUR, T0 + 2 * HOUR, T0 + 3 * HOUR, T0 - 60]);
  assertAlmostEquals(out[0]!, 11.5, 1e-9);
  assertAlmostEquals(out[1]!, 13, 1e-9);
  assertAlmostEquals(out[2]!, 16, 1e-9);
  assertEquals(out[3], null);
  assertEquals(out[4], null);
  assertEquals(interpolate(times, [null, null, null], [T0]), [null]);
});

Deno.test("interpolateDirection: goes through north, not through south", () => {
  const out = interpolateDirection([T0, T0 + HOUR], [350, 10], [T0 + 30 * 60, T0 + 15 * 60]);
  assertAlmostEquals(angleDiff(out[0]!, 0), 0, 1e-6);
  assertAlmostEquals(out[1]!, 355, 0.1);
});

Deno.test("spreadRain: keeps each hour's total, in whole tips", () => {
  const slots = minuteEnds(T0 + 60, T0 + 3 * HOUR);
  const mm = new Map([[T0 + HOUR, 1.4], [T0 + 2 * HOUR, 0], [T0 + 3 * HOUR, 0.56]]);
  const out = spreadRain((h) => mm.get(h) ?? null, slots, slots);
  const total = [...out.values()].reduce((a, b) => a + b, 0);
  assertAlmostEquals(total, 7 * TIP_MM, 1e-6); // 1.96 mm = 7.01 tips
  for (const v of out.values()) assertAlmostEquals(v / TIP_MM, Math.round(v / TIP_MM), 1e-6);
  const inHour = (h: number) => [...out].filter(([ts]) => trailingHour(ts) === h).reduce((a, [, v]) => a + v, 0);
  assertAlmostEquals(inHour(T0 + HOUR), 5 * TIP_MM, 1e-6); // 1.4 mm = 5.01 tips
  assertEquals(inHour(T0 + 2 * HOUR), 0);
  assertAlmostEquals(inHour(T0 + 3 * HOUR), 2 * TIP_MM, 1e-6);
});

Deno.test("spreadRain: an hour partly in the window gets its share; missing rows pass theirs on", () => {
  // Window starts at 00:41: 20 of the 60 minutes of the hour ending at 01:00.
  const slots = minuteEnds(T0 + 41 * 60, T0 + HOUR);
  const out = spreadRain(() => 3 * 3 * TIP_MM, slots, slots);
  assertAlmostEquals([...out.values()].reduce((a, b) => a + b, 0), 3 * TIP_MM, 1e-6);
  // Only 5 of the 20 minutes have a reading: they carry the whole share.
  const rows = slots.slice(0, 5);
  const fewer = spreadRain(() => 3 * 3 * TIP_MM, slots, rows);
  assertEquals([...fewer.keys()], rows);
  assertAlmostEquals([...fewer.values()].reduce((a, b) => a + b, 0), 3 * TIP_MM, 1e-6);
});

function reading(ts: number, overrides: Partial<Reading> = {}): Reading {
  return {
    ts,
    temp_c: 12,
    humidity_pct: 80,
    pressure_hpa: 935,
    wind_avg_ms: 0.1,
    wind_gust_ms: 0.4,
    wind_dir_deg: 270,
    rain_mm: 0,
    ...overrides,
  };
}

const ESTIMATES: Record<string, number> = {
  temp_c: 14.123,
  humidity_pct: 104,
  pressure_hpa: 930.456,
  wind_avg_ms: 2.5,
  wind_gust_ms: 1.9,
  wind_dir_deg: 359.7,
};

Deno.test("buildPlan: inserts the gap, replaces bad fields, fills nulls, never touches the rest", () => {
  const m = (i: number) => T0 + i * 60;
  // Readings at minutes 1-5 and 11-15; 6-10 is the gap.
  const rows = [1, 2, 3, 4, 5, 11, 12, 13, 14, 15].map((i) => reading(m(i), i === 3 ? { temp_c: null } : {}));
  const windows: Window[] = [
    { name: "gap", reason: "no readings", mode: "insert", from: m(6), to: m(10), fields: [] },
    { name: "wind", reason: "anemometer", mode: "replace", from: m(1), to: m(5), fields: ["wind_avg_ms", "wind_gust_ms"] },
    { name: "sensor", reason: "sensor null", mode: "fillNull", from: m(1), to: m(5), fields: ["temp_c", "humidity_pct"] },
    { name: "rain", reason: "dead terminal", mode: "replace", from: m(11), to: m(14), fields: ["rain_mm"] },
  ];
  const plan = buildPlan(rows, windows, (f) => ESTIMATES[f], () => 0.6 * 60);
  const at = (i: number) => plan.rows.find((r) => r.reading.ts === m(i));

  assertEquals(plan.rows.length, 5 + 5 + 4);
  assertEquals(plan.windows.map((w) => [w.name, w.readings]), [["gap", 5], ["wind", 5], ["sensor", 1], ["rain", 4]]);
  assertEquals(plan.missingReference, 0);

  const gap = at(7)!;
  assertEquals(gap.insert, true);
  assertEquals(gap.estimated.length, 7);
  assertEquals(gap.reading.temp_c, 14.12);
  assertEquals(gap.reading.humidity_pct, 100); // clamped
  assertEquals(gap.reading.wind_dir_deg, 0); // 359.7 rounds to 360, which is 0
  assertEquals(gap.reading.wind_gust_ms, 2.5); // raised to the average

  const both = at(3)!; // wind window and null temperature
  assertEquals(both.insert, false);
  assertEquals(both.estimated, ["temp_c", "wind_avg_ms", "wind_gust_ms"] as Field[]);
  assertEquals(both.reading.humidity_pct, 80); // measured, not null: kept
  assertEquals(both.reason, "anemometer; sensor null");

  const rain = at(12)!;
  assertEquals(rain.estimated, ["rain_mm"] as Field[]);
  assertEquals(rain.reading.temp_c, 12);
  assertEquals(at(15), undefined);
  // 0.6 mm a minute: two tips most minutes, the window total in whole tips.
  const rainTotal = plan.rows.filter((r) => r.estimated.includes("rain_mm") && !r.insert).reduce((a, r) => a + r.reading.rain_mm!, 0);
  assertAlmostEquals(rainTotal, 9 * TIP_MM, 1e-6);
});

Deno.test("buildPlan: the same readings give the same plan (re-running doubles nothing)", () => {
  const m = (i: number) => T0 + i * 60;
  const rows = [1, 2, 9, 10].map((i) => reading(m(i)));
  const windows: Window[] = [{ name: "gap", reason: "no readings", mode: "insert", from: m(1), to: m(10), fields: [] }];
  const a = buildPlan(rows, windows, (f) => ESTIMATES[f], () => 1);
  const b = buildPlan(rows, windows, (f) => ESTIMATES[f], () => 1);
  assertEquals(a, b);
  assertEquals(a.rows.length, 6); // only the minutes with no reading
});

Deno.test("buildPlan: a missing reference leaves the measured value and is counted", () => {
  const rows = [reading(T0 + 60)];
  const windows: Window[] = [{ name: "wind", reason: "x", mode: "replace", from: T0 + 60, to: T0 + 60, fields: ["wind_avg_ms", "wind_gust_ms"] }];
  const plan = buildPlan(rows, windows, (f) => (f === "wind_avg_ms" ? null : 3), () => 0);
  assertEquals(plan.missingReference, 1);
  assertEquals(plan.rows[0].estimated, ["wind_gust_ms"] as Field[]);
  assertEquals(plan.rows[0].reading.wind_avg_ms, 0.1);
});

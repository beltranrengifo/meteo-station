// Fills meteo-station-lasrozas-1's gap and bad readings of November 2026 with estimates from
// Open-Meteo, calibrated against the station's healthy periods (meteo-0hq). Why each window and
// each calibration: docs/superpowers/specs/2026-11-18-backfill-estimates.md.
//
//   pnpm backfill            dry run (default): calibration, held-out errors, what would change
//   pnpm backfill analyze    station vs Open-Meteo: models, calibration forms, suspect days, wind
//   pnpm backfill --apply    writes the plan in one transaction and rebuilds the aggregates
//   pnpm backfill --undo     puts every original reading back and deletes the inserted ones
//
// Estimated values are marked in readings.estimated, and every reading inserted or changed has a
// row in public.readings_originals with the reading as it was (migration 20261118100000).
// --apply first undoes any earlier run and then writes the plan again, so running it twice gives
// the same result. Reads backend/.env.local: SUPABASE_DB_URL (direct Postgres: the secret key
// has no UPDATE) and STATION_COORDINATES (never printed).
import postgres from "npm:postgres@3.4.5";
import {
  type Aggregate,
  buildPlan,
  type Calibration,
  calibrate,
  centeredHour,
  crossValidate,
  type Field,
  FIELDS,
  fit,
  type Form,
  HOUR,
  hourly,
  interpolate,
  interpolateDirection,
  type Pair,
  type Plan,
  type Reading,
  score,
  trailingHour,
  type Window,
} from "./estimates.ts";
import { fail } from "./supabase-admin.ts";

const DEVICE_ID = "meteo-station-lasrozas-1";
const at = (iso: string) => Date.parse(iso) / 1000;
const NOW = Math.floor(Date.now() / 60_000) * 60;
const READ_FROM = at("2026-10-20T00:00:00Z");
const DAY = 24 * HOUR;

// [from, to) on reading timestamps (minute ends).
type Range = [number, number];

// Healthy periods. A: on the mast, before the board started to fail. B: since the new ESP32,
// minus the half hour the owner was at the mast on 2026-11-18 (gauge tipped by hand, vane held).
// Wind speed: the anemometer under-read from 2026-10-25 to the gap, so only its first days on
// the mast and B. Wind direction: B only (the vane offset changed on 2026-11-17).
const HEALTHY_A: Range[] = [[at("2026-10-21T00:00:00Z"), at("2026-11-09T00:00:00Z")]];
const HEALTHY_B: Range[] = [
  [at("2026-11-17T16:30:00Z"), at("2026-11-18T16:00:00Z")],
  [at("2026-11-18T16:30:00Z"), NOW + 60],
];
const ANEMOMETER_OK: Range[] = [[at("2026-10-21T00:00:00Z"), at("2026-10-25T00:00:00Z")]];
// The days before the gap, checked against the calibrated reference (analyze).
const SUSPECT: Range[] = [[at("2026-11-09T00:00:00Z"), at("2026-11-12T06:40:00Z")]];

// What gets estimated. `to` is the last minute end included.
const WINDOWS: Window[] = [
  {
    name: "gap",
    reason: "no readings: the old ESP32 died (corrosion)",
    mode: "insert",
    from: at("2026-11-12T06:40:00Z"),
    to: at("2026-11-17T16:13:00Z"),
    fields: [],
  },
  {
    name: "bme280-null",
    reason: "BME280 not answering: stored as null",
    mode: "fillNull",
    from: at("2026-11-11T08:00:00Z"),
    to: at("2026-11-12T06:39:00Z"),
    fields: ["temp_c", "humidity_pct", "pressure_hpa"],
  },
  {
    name: "anemometer",
    reason: "old anemometer input under-reading",
    mode: "replace",
    from: at("2026-10-25T00:01:00Z"),
    to: at("2026-11-12T06:39:00Z"),
    fields: ["wind_avg_ms", "wind_gust_ms"],
  },
  {
    name: "rain-noise",
    reason: "rain gauge noise (incident 2026-11-10)",
    mode: "replace",
    from: at("2026-11-10T00:01:00Z"),
    to: at("2026-11-10T16:42:00Z"),
    fields: ["rain_mm"],
  },
  {
    name: "rain-dead-terminal",
    reason: "rain gauge wired to a dead terminal",
    mode: "replace",
    from: at("2026-11-17T16:14:00Z"),
    to: at("2026-11-18T16:16:00Z"),
    fields: ["rain_mm"],
  },
];

// The reference: Open-Meteo's Historical Forecast API (archived high-resolution forecasts).
const HISTORICAL_URL = "https://historical-forecast-api.open-meteo.com/v1/forecast";
const MAIN_MODEL = "ecmwf_ifs025";
const PRESSURE_MODEL = "icon_seamless";
const RAIN_REF = "precipitation"; // MAIN_MODEL's, as it is (report: "Rain")
// Compared in `analyze` only.
const CANDIDATE_MODELS = ["ecmwf_ifs025", "icon_seamless", "best_match", "ecmwf_ifs", "meteofrance_seamless", "ukmo_seamless"];
const REF_VARS = [
  "temperature_2m",
  "relative_humidity_2m",
  "surface_pressure",
  "precipitation",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
] as const;
type RefVar = typeof REF_VARS[number];

interface Spec {
  field: Exclude<Field, "rain_mm">;
  model: string;
  ref: RefVar;
  form: Form; // the one used
  compare: Form[]; // shown by analyze
  // Open-Meteo's value at t is the instant t (centered hour of minutes) or the hour before it.
  hour: "centered" | "trailing";
  aggregate: Aggregate;
  periods: Range[];
  older?: Range[]; // analyze: fitted on this part of `periods` alone, tested on B
  block: number; // held-out block size
  circular?: boolean;
  minRefWind?: number; // directions only when there is some wind
}

const SPECS: Spec[] = [
  {
    field: "temp_c",
    model: MAIN_MODEL,
    ref: "temperature_2m",
    form: "offset",
    compare: ["none", "offset", "linear"],
    hour: "centered",
    aggregate: "mean",
    periods: [...HEALTHY_A, ...HEALTHY_B],
    older: HEALTHY_A,
    block: DAY,
  },
  {
    field: "humidity_pct",
    model: MAIN_MODEL,
    ref: "relative_humidity_2m",
    form: "none",
    compare: ["none", "offset", "linear"],
    hour: "centered",
    aggregate: "mean",
    periods: [...HEALTHY_A, ...HEALTHY_B],
    older: HEALTHY_A,
    block: DAY,
  },
  {
    field: "pressure_hpa",
    model: PRESSURE_MODEL,
    ref: "surface_pressure",
    form: "offset",
    compare: ["offset", "linear"],
    hour: "centered",
    aggregate: "mean",
    periods: [...HEALTHY_A, ...HEALTHY_B],
    older: HEALTHY_A,
    block: DAY,
  },
  {
    field: "wind_avg_ms",
    model: MAIN_MODEL,
    ref: "wind_speed_10m",
    form: "ratio",
    compare: ["none", "ratio", "linear"],
    hour: "centered",
    aggregate: "mean",
    periods: [...ANEMOMETER_OK, ...HEALTHY_B],
    older: ANEMOMETER_OK,
    block: DAY,
  },
  {
    field: "wind_gust_ms",
    model: MAIN_MODEL,
    ref: "wind_gusts_10m",
    form: "ratio",
    compare: ["none", "ratio", "linear"],
    hour: "trailing",
    aggregate: "max",
    periods: [...ANEMOMETER_OK, ...HEALTHY_B],
    older: ANEMOMETER_OK,
    block: DAY,
  },
  {
    field: "wind_dir_deg",
    model: MAIN_MODEL,
    ref: "wind_direction_10m",
    form: "circularOffset",
    compare: ["none", "circularOffset"],
    hour: "centered",
    aggregate: "circularMean",
    periods: HEALTHY_B,
    block: 6 * HOUR,
    circular: true,
    minRefWind: 2,
  },
];

// ---------------------------------------------------------------- Open-Meteo

class Reference {
  readonly time: number[];
  private readonly index: Map<number, number>;
  constructor(readonly model: string, private readonly hourly: Record<string, (number | null)[]> & { time: number[] }) {
    this.time = hourly.time;
    this.index = new Map(this.time.map((t, i) => [t, i]));
  }
  series(v: RefVar): (number | null)[] {
    return this.hourly[v];
  }
  at(v: RefVar, t: number): number | null {
    const i = this.index.get(t);
    return i === undefined ? null : this.hourly[v][i] ?? null;
  }
}

function coordinates(): [number, number] {
  try {
    const all = JSON.parse(Deno.env.get("STATION_COORDINATES") ?? "");
    const c = all[DEVICE_ID];
    if (Array.isArray(c) && c.length === 2 && c.every((x) => typeof x === "number")) return [c[0], c[1]];
  } catch {
    // reported below
  }
  fail(`STATION_COORDINATES in backend/.env.local has no [latitude, longitude] for ${DEVICE_ID}`);
}

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

async function fetchReference(model: string): Promise<Reference> {
  const [latitude, longitude] = coordinates();
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: REF_VARS.join(","),
    models: model,
    start_date: day(READ_FROM),
    end_date: day(NOW),
    timezone: "UTC",
    timeformat: "unixtime",
    wind_speed_unit: "ms",
  });
  // The URL carries the coordinates: never print it.
  const response = await fetch(`${HISTORICAL_URL}?${params}`, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) fail(`Open-Meteo (${model}) answered HTTP ${response.status}`);
  const body = await response.json();
  return new Reference(model, body.hourly);
}

// ---------------------------------------------------------------- the station

type Sql = ReturnType<typeof postgres>;

function connectDb(): Sql {
  const url = Deno.env.get("SUPABASE_DB_URL");
  if (!url) fail("SUPABASE_DB_URL must be set in backend/.env.local");
  return postgres(url, { max: 1, onnotice: () => {} });
}

function toReading(ts: number, row: Record<string, unknown>): Reading {
  const r = { ts } as Reading;
  for (const f of FIELDS) r[f] = row[f] === null || row[f] === undefined ? null : Number(row[f]);
  return r;
}

interface Station {
  rows: Reading[]; // as measured: earlier estimates are replaced by their originals
  migrated: boolean;
  logged: number; // rows in readings_originals (earlier runs)
}

async function readStation(sql: Sql): Promise<Station> {
  return await sql.begin("read only", async (tx) => {
    const [{ migrated }] = await tx`select to_regclass('public.readings_originals') is not null as migrated`;
    const rows = await tx`
      select extract(epoch from ts)::float8 as ts, ${tx(FIELDS as unknown as string[])}
      from public.readings
      where device_id = ${DEVICE_ID} and ts >= ${new Date(READ_FROM * 1000)}
      order by ts`;
    const byTs = new Map<number, Reading>(rows.map((r) => [Number(r.ts), toReading(Number(r.ts), r)]));
    let logged = 0;
    if (migrated) {
      const originals = await tx`
        select extract(epoch from ts)::float8 as ts, original
        from public.readings_originals where device_id = ${DEVICE_ID}`;
      for (const o of originals) {
        const ts = Number(o.ts);
        if (o.original === null) byTs.delete(ts);
        else byTs.set(ts, toReading(ts, o.original));
      }
      logged = originals.length;
    }
    return { rows: [...byTs.values()].sort((a, b) => a.ts - b.ts), migrated, logged };
  });
}

// ---------------------------------------------------------------- calibration

const inRanges = (t: number, ranges: Range[]) => ranges.some(([a, b]) => t >= a && t < b);

// Hourly station values vs the reference, from the minutes inside `periods`.
function pairsFor(spec: Spec, rows: Reading[], ref: Reference, periods: Range[]): Pair[] {
  const minutes = rows.filter((r) => inRanges(r.ts, periods)).map((r) => ({ ts: r.ts, value: r[spec.field] }));
  const station = hourly(minutes, spec.hour === "centered" ? centeredHour : trailingHour, spec.aggregate, 45);
  const pairs: Pair[] = [];
  for (const [t, y] of station) {
    const x = ref.at(spec.ref, t);
    if (x === null) continue;
    if (spec.minRefWind !== undefined && (ref.at("wind_speed_10m", t) ?? 0) < spec.minRefWind) continue;
    pairs.push({ t, x, y });
  }
  return pairs.sort((a, b) => a.t - b.t);
}

interface Fitted {
  spec: Spec;
  cal: Calibration;
  pairs: Pair[];
  heldOut: ReturnType<typeof crossValidate>;
}

function fitAll(rows: Reading[], refs: Map<string, Reference>): Fitted[] {
  return SPECS.map((spec) => {
    const pairs = pairsFor(spec, rows, refs.get(spec.model)!, spec.periods);
    if (pairs.length < 12) fail(`only ${pairs.length} healthy hours to calibrate ${spec.field}`);
    return {
      spec,
      cal: fit(spec.form, pairs),
      pairs,
      heldOut: crossValidate(spec.form, pairs, spec.block, spec.circular),
    };
  });
}

function describe(cal: Calibration): string {
  switch (cal.form) {
    case "none":
      return "reference as it is";
    case "offset":
      return `reference ${cal.b >= 0 ? "+" : "-"} ${Math.abs(cal.b).toFixed(2)}`;
    case "ratio":
      return `${cal.a.toFixed(3)} x reference`;
    case "linear":
      return `${cal.a.toFixed(3)} x reference ${cal.b >= 0 ? "+" : "-"} ${Math.abs(cal.b).toFixed(2)}`;
    case "circularOffset":
      return `reference ${cal.b >= 0 ? "+" : "-"} ${Math.abs(cal.b).toFixed(0)} deg`;
  }
}

const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : "-");

// ---------------------------------------------------------------- the plan

function makePlan(rows: Reading[], fitted: Fitted[], refs: Map<string, Reference>): Plan {
  // Every minute any window can touch, to interpolate each field once.
  const targets = [...new Set(WINDOWS.flatMap((w) => {
    const out: number[] = [];
    for (let t = w.from; t <= w.to; t += 60) out.push(t);
    return out;
  }))].sort((a, b) => a - b);
  const values = new Map<Field, Map<number, number | null>>();
  for (const { spec, cal } of fitted) {
    const ref = refs.get(spec.model)!;
    const series = ref.series(spec.ref).map((x) => (x === null ? null : calibrate(cal, x)));
    let out: (number | null)[];
    if (spec.hour === "trailing") {
      // The hour's gust for each of its minutes, so the hourly maximum keeps the calibrated value.
      out = targets.map((ts) => {
        const x = ref.at(spec.ref, trailingHour(ts));
        return x === null ? null : calibrate(cal, x);
      });
    } else {
      // Instant values, interpolated at the middle of each minute.
      const mid = targets.map((ts) => ts - 30);
      out = spec.circular ? interpolateDirection(ref.time, series, mid) : interpolate(ref.time, series, mid);
    }
    values.set(spec.field, new Map(targets.map((ts, i) => [ts, out[i]])));
  }
  const rain = refs.get(MAIN_MODEL)!;
  return buildPlan(rows, WINDOWS, (field, ts) => values.get(field)?.get(ts) ?? null, (h) => rain.at(RAIN_REF, h));
}

const madridDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" });

// Per Madrid day (as readings_daily): readings, rain, wind and temperature, before and after.
function dayTable(before: Reading[], plan: Plan): string[] {
  const after = new Map(before.map((r) => [r.ts, r]));
  for (const p of plan.rows) after.set(p.reading.ts, p.reading);
  const days = new Set(plan.rows.map((p) => madridDay.format(new Date(p.reading.ts * 1000))));
  const stats = (rows: Iterable<Reading>) => {
    const out = new Map<string, { n: number; rain: number; wind: number[]; temp: number[] }>();
    for (const r of rows) {
      const d = madridDay.format(new Date(r.ts * 1000));
      if (!days.has(d)) continue;
      const s = out.get(d) ?? { n: 0, rain: 0, wind: [], temp: [] };
      s.n++;
      s.rain += r.rain_mm ?? 0;
      if (r.wind_avg_ms !== null) s.wind.push(r.wind_avg_ms);
      if (r.temp_c !== null) s.temp.push(r.temp_c);
      out.set(d, s);
    }
    return out;
  };
  const avg = (x: number[]) => (x.length ? (x.reduce((a, b) => a + b, 0) / x.length).toFixed(2) : "-");
  const b = stats(before);
  const a = stats(after.values());
  const lines = ["  Madrid day   readings     rain mm          wind avg m/s    temp avg C"];
  for (const d of [...days].sort()) {
    const x = b.get(d) ?? { n: 0, rain: 0, wind: [], temp: [] };
    const y = a.get(d)!;
    lines.push(
      `  ${d}  ${String(x.n).padStart(4)} -> ${String(y.n).padStart(4)}  ${x.rain.toFixed(1).padStart(5)} -> ${y.rain.toFixed(1).padStart(5)}` +
        `   ${avg(x.wind).padStart(5)} -> ${avg(y.wind).padStart(5)}   ${avg(x.temp).padStart(5)} -> ${avg(y.temp).padStart(5)}`,
    );
  }
  return lines;
}

function printCalibration(fitted: Fitted[]) {
  console.log(`Reference: Open-Meteo historical forecast, ${MAIN_MODEL} (pressure: ${PRESSURE_MODEL}), hourly, UTC.`);
  console.log("Calibration, fitted on the healthy hours; held-out error with leave-one-block-out:");
  for (const { spec, cal, pairs, heldOut } of fitted) {
    const block = spec.block === DAY ? "days" : "6 h blocks";
    console.log(
      `  ${spec.field.padEnd(13)} ${describe(cal).padEnd(26)} held-out MAE ${f2(heldOut.mae)} RMSE ${f2(heldOut.rmse)} ` +
        `bias ${f2(heldOut.bias)}  (${pairs.length} h, ${block})`,
    );
  }
  console.log(`  ${"rain_mm".padEnd(13)} ${MAIN_MODEL} precipitation as it is, spread over the minutes in 0.2794 mm tips`);
}

function printPlan(station: Station, plan: Plan) {
  console.log("\nWindows (UTC):");
  for (const w of WINDOWS) {
    const c = plan.windows.find((x) => x.name === w.name)!;
    const fields = Object.entries(c.fields).map(([f, n]) => `${f} ${n}`).join(", ");
    console.log(
      `  ${w.name.padEnd(19)} ${w.mode.padEnd(8)} ${new Date(w.from * 1000).toISOString().slice(0, 16)} .. ` +
        `${new Date(w.to * 1000).toISOString().slice(0, 16)}  ${String(c.readings).padStart(5)} readings: ${fields}`,
    );
  }
  const inserted = plan.rows.filter((r) => r.insert).length;
  const changed = plan.rows.length - inserted;
  const values = plan.rows.reduce((n, r) => n + r.estimated.length, 0);
  console.log(
    `\nTotal: ${inserted} readings inserted, ${changed} readings changed, ${values} values estimated; ` +
      `${plan.rows.length} rows in public.readings_originals.`,
  );
  if (plan.missingReference > 0) console.log(`WARNING: ${plan.missingReference} values have no reference and stay as they are.`);
  if (station.logged > 0) console.log(`An earlier run is in the database (${station.logged} rows logged): --apply undoes it first.`);
  console.log("\nEffect on the days (readings_daily is computed the same way):");
  for (const line of dayTable(station.rows, plan)) console.log(line);
}

// ---------------------------------------------------------------- analyze

async function analyze(rows: Reading[], refs: Map<string, Reference>, fitted: Fitted[]) {
  for (const model of CANDIDATE_MODELS) if (!refs.has(model)) refs.set(model, await fetchReference(model));

  console.log("\n1. Held-out MAE of the chosen form, per model (healthy hours):");
  console.log("   " + "".padEnd(14) + CANDIDATE_MODELS.map((m) => m.padStart(21)).join(""));
  for (const spec of SPECS) {
    const cells = CANDIDATE_MODELS.map((m) => {
      const pairs = pairsFor(spec, rows, refs.get(m)!, spec.periods);
      return f2(crossValidate(spec.form, pairs, spec.block, spec.circular).mae).padStart(21);
    });
    console.log(`   ${spec.field.padEnd(14)}${cells.join("")}`);
  }

  console.log("\n2. Calibration forms, MAE: held-out | fitted on the older healthy period, tested on B |");
  console.log("   fitted on all healthy hours, tested on 2026-11-09 to the gap:");
  for (const spec of SPECS) {
    const ref = refs.get(spec.model)!;
    const cells = spec.compare.map((form) => {
      const pairs = pairsFor(spec, rows, ref, spec.periods);
      const cv = crossValidate(form, pairs, spec.block, spec.circular).mae;
      const olderToB = spec.older
        ? f2(score(fit(form, pairsFor(spec, rows, ref, spec.older)), pairsFor(spec, rows, ref, HEALTHY_B), spec.circular).mae)
        : "-";
      const toSuspect = f2(score(fit(form, pairs), pairsFor(spec, rows, ref, SUSPECT), spec.circular).mae);
      return `${form} ${f2(cv)} | ${olderToB} | ${toSuspect}`;
    });
    console.log(`   ${spec.field.padEnd(14)} (${spec.model}) ${cells.join("    ")}`);
  }
  console.log("   (Older period: A for temperature, humidity and pressure; 2026-10-21..24 for wind.)");

  console.log("\n3. Each day from 11-09 vs the calibrated reference: MAE (bias = reference - station) hours;");
  console.log("   held-out MAE of the healthy hours in brackets; * = healthy day, for comparison:");
  for (const { spec, cal, heldOut } of fitted) {
    const ref = refs.get(spec.model)!;
    const cells: string[] = [];
    for (let d = SUSPECT[0][0]; d < NOW; d += DAY) {
      const s = score(cal, pairsFor(spec, rows, ref, [[d, Math.min(d + DAY, NOW + 60)]]), spec.circular);
      if (s.n === 0) continue;
      const mark = d + DAY > HEALTHY_B[0][0] ? "*" : " ";
      cells.push(`${mark}${day(d).slice(5)} ${f2(s.mae)} (${f2(s.bias)}) ${s.n}h`);
    }
    console.log(`   ${spec.field.padEnd(14)} [${f2(heldOut.mae)}] ${cells.join("  ")}`);
  }

  console.log("\n4. Anemometer response per UTC day: station / reference wind, hours with reference 1.5..5 m/s;");
  console.log("   and minutes with wind 0. (Uncalibrated, each model's own wind.)");
  const wind = SPECS.find((s) => s.field === "wind_avg_ms")!;
  const models = [MAIN_MODEL, "icon_seamless", "best_match"];
  console.log("   day       " + models.map((m) => m.padStart(20)).join("") + "   zero-wind minutes");
  const days = [...new Set(rows.map((r) => Math.floor(r.ts / DAY) * DAY))].sort((a, b) => a - b);
  for (const d of days) {
    const cells = models.map((m) => {
      const pairs = pairsFor({ ...wind, minRefWind: undefined }, rows, refs.get(m)!, [[d, d + DAY]]).filter((p) => p.x >= 1.5 && p.x <= 5);
      if (pairs.length === 0) return "-".padStart(20);
      const r = pairs.reduce((a, p) => a + p.y, 0) / pairs.reduce((a, p) => a + p.x, 0);
      return `${r.toFixed(2)} (${pairs.length} h)`.padStart(20);
    });
    const dayRows = rows.filter((r) => r.ts > d && r.ts <= d + DAY && r.wind_avg_ms !== null);
    const zero = dayRows.filter((r) => r.wind_avg_ms === 0).length;
    console.log(`   ${day(d)}${cells.join("")}   ${dayRows.length ? ((100 * zero) / dayRows.length).toFixed(0) : "-"}%`);
  }

  console.log("\n5. Rain per UTC day, mm: station vs each model (11-07 on):");
  console.log("   day        station" + CANDIDATE_MODELS.map((m) => m.slice(0, 12).padStart(14)).join(""));
  for (const d of days.filter((d) => d >= at("2026-11-07T00:00:00Z"))) {
    const st = rows.filter((r) => r.ts > d && r.ts <= d + DAY).reduce((a, r) => a + (r.rain_mm ?? 0), 0);
    const cells = CANDIDATE_MODELS.map((m) => {
      let mm = 0;
      for (let h = d + HOUR; h <= d + DAY; h += HOUR) mm += refs.get(m)!.at("precipitation", h) ?? 0;
      return mm.toFixed(1).padStart(14);
    });
    console.log(`   ${day(d)} ${st.toFixed(1).padStart(7)}${cells.join("")}`);
  }
  console.log("   (Days after the last reading: no station values; the gap is 11-12 06:40 to 11-17 16:13.)");
}

// ---------------------------------------------------------------- writing

async function undo(tx: Sql): Promise<{ restored: number; deleted: number }> {
  const restored = await tx`
    update public.readings r set
      temp_c       = (o.original ->> 'temp_c')::real,
      humidity_pct = (o.original ->> 'humidity_pct')::real,
      pressure_hpa = (o.original ->> 'pressure_hpa')::real,
      wind_avg_ms  = (o.original ->> 'wind_avg_ms')::real,
      wind_gust_ms = (o.original ->> 'wind_gust_ms')::real,
      wind_dir_deg = (o.original ->> 'wind_dir_deg')::smallint,
      rain_mm      = (o.original ->> 'rain_mm')::real,
      estimated    = null
    from public.readings_originals o
    where o.device_id = ${DEVICE_ID} and o.original is not null
      and r.device_id = o.device_id and r.ts = o.ts`;
  const deleted = await tx`
    delete from public.readings r
    using public.readings_originals o
    where o.device_id = ${DEVICE_ID} and o.original is null
      and r.device_id = o.device_id and r.ts = o.ts`;
  await tx`delete from public.readings_originals where device_id = ${DEVICE_ID}`;
  const [{ left }] = await tx`
    select count(*)::int as left from public.readings where device_id = ${DEVICE_ID} and estimated is not null`;
  if (left !== 0) throw new Error(`${left} estimated readings have no original in readings_originals; nothing written`);
  return { restored: restored.count, deleted: deleted.count };
}

async function apply(sql: Sql, plan: Plan) {
  const rows = plan.rows.map((p) => ({
    ...Object.fromEntries(FIELDS.map((f) => [f, p.reading[f]])),
    ts: new Date(p.reading.ts * 1000).toISOString(),
    estimated: p.estimated,
    reason: p.reason,
    insert: p.insert,
  }));
  const inserts = rows.filter((r) => r.insert);
  const updates = rows.filter((r) => !r.insert);

  await sql.begin(async (tx) => {
    // The planned readings as a table, sent as one jsonb parameter.
    const records = (data: typeof rows) =>
      tx`jsonb_to_recordset(${tx.json(data)}) as v(
        ts timestamptz, temp_c real, humidity_pct real, pressure_hpa real, wind_avg_ms real,
        wind_gust_ms real, wind_dir_deg smallint, rain_mm real, estimated text[], reason text)`;
    const undone = await undo(tx);
    if (undone.restored + undone.deleted > 0) {
      console.log(`Undid the earlier run: ${undone.restored} readings restored, ${undone.deleted} deleted.`);
    }
    // Originals first, while the readings are still as measured. No reading yet: original null.
    await tx`
      insert into public.readings_originals (device_id, ts, original, reason)
      select ${DEVICE_ID}, v.ts, to_jsonb(r), v.reason
      from ${records(rows)}
      left join public.readings r on r.device_id = ${DEVICE_ID} and r.ts = v.ts`;
    const [logged] = await tx`
      select count(*) filter (where original is null)::int as inserted,
             count(*) filter (where original is not null)::int as changed
      from public.readings_originals where device_id = ${DEVICE_ID}`;
    if (logged.inserted !== inserts.length || logged.changed !== updates.length) {
      throw new Error(`the readings changed since they were read (${JSON.stringify(logged)}); nothing written`);
    }
    const updated = await tx`
      update public.readings r set
        temp_c = v.temp_c, humidity_pct = v.humidity_pct, pressure_hpa = v.pressure_hpa,
        wind_avg_ms = v.wind_avg_ms, wind_gust_ms = v.wind_gust_ms, wind_dir_deg = v.wind_dir_deg,
        rain_mm = v.rain_mm, estimated = v.estimated
      from ${records(updates)}
      where r.device_id = ${DEVICE_ID} and r.ts = v.ts`;
    const inserted = await tx`
      insert into public.readings
        (device_id, ts, temp_c, humidity_pct, pressure_hpa, wind_avg_ms, wind_gust_ms, wind_dir_deg, rain_mm, estimated)
      select ${DEVICE_ID}, v.ts, v.temp_c, v.humidity_pct, v.pressure_hpa, v.wind_avg_ms, v.wind_gust_ms,
             v.wind_dir_deg, v.rain_mm, v.estimated
      from ${records(inserts)}
      on conflict (device_id, ts) do nothing`;
    if (updated.count !== updates.length || inserted.count !== inserts.length) {
      throw new Error(`expected ${updates.length} updates and ${inserts.length} inserts, got ${updated.count} and ${inserted.count}; nothing written`);
    }
    await tx`select public.refresh_aggregates_rebuild()`;
    console.log(`Applied: ${inserted.count} readings inserted, ${updated.count} changed; aggregates rebuilt.`);
  });
}

// ---------------------------------------------------------------- main

const USAGE = "usage: pnpm backfill [analyze | --apply | --undo]";
const mode = Deno.args[0] ?? "dry-run";
if (!["dry-run", "analyze", "--apply", "--undo"].includes(mode) || Deno.args.length > 1) fail(USAGE);

const sql = connectDb();
try {
  const station = await readStation(sql);
  if ((mode === "--apply" || mode === "--undo") && !station.migrated) {
    fail("public.readings_originals does not exist: run pnpm db:push first (migration 20261118100000)");
  }
  if (mode === "--undo") {
    await sql.begin(async (tx) => {
      const { restored, deleted } = await undo(tx);
      await tx`select public.refresh_aggregates_rebuild()`;
      console.log(`Undone: ${restored} readings restored, ${deleted} inserted readings deleted; aggregates rebuilt.`);
    });
  } else {
    const refs = new Map<string, Reference>();
    for (const model of new Set([MAIN_MODEL, PRESSURE_MODEL])) refs.set(model, await fetchReference(model));
    const fitted = fitAll(station.rows, refs);
    console.log(`${DEVICE_ID}: ${station.rows.length} measured readings since ${day(READ_FROM)}.`);
    printCalibration(fitted);
    if (mode === "analyze") {
      await analyze(station.rows, refs, fitted);
    } else {
      const plan = makePlan(station.rows, fitted, refs);
      printPlan(station, plan);
      if (mode === "--apply") {
        if (plan.missingReference > 0) fail("some values have no reference: not applying");
        await apply(sql, plan);
      } else {
        console.log("\nDry run: nothing written. pnpm backfill --apply writes it.");
      }
    }
  }
} finally {
  await sql.end();
}

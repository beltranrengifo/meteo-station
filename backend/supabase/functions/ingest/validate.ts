// Pure validation for the ingest function: no I/O, so it is unit-tested with `deno test`.

// Upper bound per request: the station buffer holds 24 h = 1440 readings.
export const MAX_BATCH = 2000;
// The station keeps far fewer events than this in RAM.
export const MAX_EVENTS = 100;

export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;
const TS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/;

export type ReadingRow = {
  device_id: string;
  ts: string;
  temp_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  wind_avg_ms: number;
  wind_gust_ms: number;
  wind_dir_deg: number | null;
  rain_mm: number;
  rssi: number | null;
  uptime_s: number;
  fw: string;
  free_heap: number | null;
  wifi_disconnects: number | null;
};

// More rain than this in one minute is gauge noise, not weather: about 3 mm/min (180 mm/h)
// is already a rare cloudburst. The reading is kept with rain 0, so its other fields are not lost.
export const MAX_RAIN_MM_PER_MINUTE = 3;

// A value the station sent that is not weather: stored as `stored` instead, so the rest of
// the reading is kept. index.ts turns each one into an event.
export type DroppedValue = { field: string; sent: number; stored: number | null; why: string };

// The BME280 computes humidity and pressure from its temperature: if one is garbage, so are all.
const BME280_FIELDS = ["temp_c", "humidity_pct", "pressure_hpa"];

export type ValidationResult =
  | { ok: true; row: ReadingRow; dropped: DroppedValue[] }
  | { ok: false; reason: string };

type FieldRule = {
  required: boolean;
  integer: boolean;
  min: number;
  max: number;
};

// Physical limits: anything outside is a sensor or firmware fault, not weather. An optional
// field out of range is stored as null; a required one rejects the reading.
const NUMBER_FIELDS: Record<string, FieldRule> = {
  temp_c: { required: false, integer: false, min: -40, max: 60 },
  humidity_pct: { required: false, integer: false, min: 0, max: 100 },
  pressure_hpa: { required: false, integer: false, min: 850, max: 1100 },
  wind_avg_ms: { required: true, integer: false, min: 0, max: 75 },
  wind_gust_ms: { required: true, integer: false, min: 0, max: 100 },
  wind_dir_deg: { required: false, integer: true, min: 0, max: 359 },
  // No upper bound here: too much rain is stored as 0 (MAX_RAIN_MM_PER_MINUTE), not rejected.
  rain_mm: { required: true, integer: false, min: 0, max: Number.MAX_VALUE },
  rssi: { required: false, integer: true, min: -127, max: 0 },
  uptime_s: { required: true, integer: true, min: 0, max: Number.MAX_SAFE_INTEGER },
  // Health, sent from firmware 0.4.0 on.
  free_heap: { required: false, integer: true, min: 0, max: 10_000_000 },
  wifi_disconnects: { required: false, integer: true, min: 0, max: 2_147_483_647 },
};

function checkNumber(name: string, value: unknown, rule: FieldRule): string | null {
  if (value === null || value === undefined) {
    return rule.required ? `${name} is required` : null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return rule.integer ? `${name} must be an integer or null` : `${name} must be a number or null`;
  }
  if (rule.integer && !Number.isInteger(value)) {
    return `${name} must be an integer or null`;
  }
  if (value < rule.min || value > rule.max) {
    return `${name} out of range`;
  }
  return null;
}

// deviceId is the station the request's key belongs to: a reading may only be for that station.
export function validateReading(raw: unknown, now: Date, deviceId: string): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "reading must be an object" };
  }
  const r = raw as Record<string, unknown>;

  if (r.device_id !== deviceId) {
    return { ok: false, reason: "device_id does not match the device key" };
  }

  if (typeof r.ts !== "string" || !TS_PATTERN.test(r.ts)) {
    return { ok: false, reason: "ts must be a UTC minute (YYYY-MM-DDTHH:MM:00Z)" };
  }
  const ts = new Date(r.ts);
  // Date rolls 2026-02-30 over to March; comparing back catches impossible dates.
  if (Number.isNaN(ts.getTime()) || ts.toISOString().slice(0, 19) + "Z" !== r.ts) {
    return { ok: false, reason: "ts is not a valid date" };
  }
  if (ts.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) {
    return { ok: false, reason: "ts is in the future" };
  }
  if (ts.getTime() < now.getTime() - MAX_AGE_MS) {
    return { ok: false, reason: "ts is older than 7 days" };
  }

  const values: Record<string, number | null> = {};
  const dropped: DroppedValue[] = [];
  for (const [name, rule] of Object.entries(NUMBER_FIELDS)) {
    const error = checkNumber(name, r[name], rule);
    const value = (r[name] ?? null) as number | null;
    if (error === `${name} out of range` && !rule.required) {
      dropped.push({ field: name, sent: value as number, stored: null, why: "out of range" });
      values[name] = null;
    } else if (error) {
      return { ok: false, reason: error };
    } else {
      values[name] = value;
    }
  }
  const badBme = dropped.find((d) => BME280_FIELDS.includes(d.field));
  if (badBme) {
    for (const name of BME280_FIELDS) {
      const value = values[name];
      if (value !== null) {
        dropped.push({ field: name, sent: value, stored: null, why: `same sensor as ${badBme.field}` });
        values[name] = null;
      }
    }
  }
  const rainSent = values.rain_mm as number;
  if (rainSent > MAX_RAIN_MM_PER_MINUTE) {
    dropped.push({ field: "rain_mm", sent: rainSent, stored: 0, why: `over ${MAX_RAIN_MM_PER_MINUTE} mm in one minute` });
    values.rain_mm = 0;
  }

  if (typeof r.fw !== "string" || r.fw.length === 0 || r.fw.length > 32) {
    return { ok: false, reason: "fw must be a short string" };
  }

  // Only known fields reach the database.
  const row: ReadingRow = {
    device_id: deviceId,
    ts: r.ts,
    temp_c: values.temp_c,
    humidity_pct: values.humidity_pct,
    pressure_hpa: values.pressure_hpa,
    wind_avg_ms: values.wind_avg_ms as number,
    wind_gust_ms: values.wind_gust_ms as number,
    wind_dir_deg: values.wind_dir_deg,
    rain_mm: values.rain_mm as number,
    rssi: values.rssi,
    uptime_s: values.uptime_s as number,
    fw: r.fw,
    free_heap: values.free_heap,
    wifi_disconnects: values.wifi_disconnects,
  };
  return { ok: true, row, dropped };
}

export type ParsedBody = { ok: true; readings: unknown[]; events: unknown[] } | { ok: false; reason: string };

// Three shapes: one reading, an array of readings (firmware before 0.4.0), or
// { readings: [...], events: [...] } with the station's events next to its readings.
export function parseBody(body: unknown): ParsedBody {
  let readings: unknown[];
  let events: unknown[] = [];
  if (Array.isArray(body)) {
    readings = body;
  } else if (typeof body === "object" && body !== null && Array.isArray((body as Record<string, unknown>).readings)) {
    const envelope = body as Record<string, unknown>;
    readings = envelope.readings as unknown[];
    if (envelope.events !== undefined) {
      if (!Array.isArray(envelope.events)) return { ok: false, reason: "events must be an array" };
      events = envelope.events;
    }
  } else {
    readings = [body];
  }
  if (readings.length === 0 && events.length === 0) return { ok: false, reason: "empty batch" };
  if (readings.length > MAX_BATCH) return { ok: false, reason: `batch larger than ${MAX_BATCH}` };
  if (events.length > MAX_EVENTS) return { ok: false, reason: `more than ${MAX_EVENTS} events` };
  return { ok: true, readings, events };
}

// SHA-256 of a device key, as lowercase hex: what public.devices stores instead of the key.
// The lookup compares hashes, so timing says nothing about the key itself.
export async function keyHash(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

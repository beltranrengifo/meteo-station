// Pure validation for the ingest function: no I/O, so it is unit-tested with `deno test`.

// Upper bound per request: the station buffer holds 24 h = 1440 readings.
export const MAX_BATCH = 2000;

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000;
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
};

export type ValidationResult = { ok: true; row: ReadingRow } | { ok: false; reason: string };

type FieldRule = {
  required: boolean;
  integer: boolean;
  min: number;
  max: number;
};

// Physical limits: anything outside is a sensor or firmware fault, not weather.
const NUMBER_FIELDS: Record<string, FieldRule> = {
  temp_c: { required: false, integer: false, min: -40, max: 60 },
  humidity_pct: { required: false, integer: false, min: 0, max: 100 },
  pressure_hpa: { required: false, integer: false, min: 850, max: 1100 },
  wind_avg_ms: { required: true, integer: false, min: 0, max: 75 },
  wind_gust_ms: { required: true, integer: false, min: 0, max: 100 },
  wind_dir_deg: { required: false, integer: true, min: 0, max: 359 },
  rain_mm: { required: true, integer: false, min: 0, max: 50 },
  rssi: { required: false, integer: true, min: -127, max: 0 },
  uptime_s: { required: true, integer: true, min: 0, max: Number.MAX_SAFE_INTEGER },
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

export function validateReading(raw: unknown, now: Date, allowedDevices: string[]): ValidationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "reading must be an object" };
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.device_id !== "string" || !allowedDevices.includes(r.device_id)) {
    return { ok: false, reason: "device_id not allowed" };
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

  for (const [name, rule] of Object.entries(NUMBER_FIELDS)) {
    const error = checkNumber(name, r[name], rule);
    if (error) return { ok: false, reason: error };
  }

  if (typeof r.fw !== "string" || r.fw.length === 0 || r.fw.length > 32) {
    return { ok: false, reason: "fw must be a short string" };
  }

  // Only known fields reach the database.
  const row: ReadingRow = {
    device_id: r.device_id,
    ts: r.ts,
    temp_c: (r.temp_c ?? null) as number | null,
    humidity_pct: (r.humidity_pct ?? null) as number | null,
    pressure_hpa: (r.pressure_hpa ?? null) as number | null,
    wind_avg_ms: r.wind_avg_ms as number,
    wind_gust_ms: r.wind_gust_ms as number,
    wind_dir_deg: (r.wind_dir_deg ?? null) as number | null,
    rain_mm: r.rain_mm as number,
    rssi: (r.rssi ?? null) as number | null,
    uptime_s: r.uptime_s as number,
    fw: r.fw,
  };
  return { ok: true, row };
}

export function parseBatch(body: unknown): { ok: true; items: unknown[] } | { ok: false; reason: string } {
  const items = Array.isArray(body) ? body : [body];
  if (items.length === 0) return { ok: false, reason: "empty batch" };
  if (items.length > MAX_BATCH) return { ok: false, reason: `batch larger than ${MAX_BATCH}` };
  return { ok: true, items };
}

// Constant-time string comparison, so the device key cannot be guessed byte by byte from timing.
export function safeEqual(a: string, b: string): boolean {
  if (a.length === 0 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

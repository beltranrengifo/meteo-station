import { assertEquals } from "jsr:@std/assert@1";
import { MAX_BATCH, parseBatch, safeEqual, validateReading } from "./validate.ts";

const NOW = new Date("2026-10-20T10:15:30Z");
const ALLOWED = ["meteo-station-1", "meteo-station-bench"];

function reading(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    device_id: "meteo-station-1",
    ts: "2026-10-20T10:15:00Z",
    temp_c: 18.4,
    humidity_pct: 62.1,
    pressure_hpa: 1016.3,
    wind_avg_ms: 2.1,
    wind_gust_ms: 4.6,
    wind_dir_deg: 225,
    rain_mm: 0.2794,
    rssi: -67,
    uptime_s: 86400,
    fw: "0.1.0",
    ...overrides,
  };
}

function reasonOf(raw: unknown): string | null {
  const result = validateReading(raw, NOW, ALLOWED);
  return result.ok ? null : result.reason;
}

// ---- valid readings ----

Deno.test("accepts the firmware payload as-is", () => {
  const result = validateReading(reading(), NOW, ALLOWED);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.row, reading());
});

Deno.test("accepts nulls where the station may have no data", () => {
  assertEquals(
    reasonOf(reading({ temp_c: null, humidity_pct: null, pressure_hpa: null, wind_dir_deg: null, rssi: null })),
    null,
  );
});

Deno.test("drops unknown fields from the stored row", () => {
  const result = validateReading(reading({ extra: "x" }), NOW, ALLOWED);
  assertEquals(result.ok && "extra" in result.row, false);
});

Deno.test("accepts readings from the station buffer up to 7 days old", () => {
  assertEquals(reasonOf(reading({ ts: "2026-10-14T10:16:00Z" })), null);
});

// ---- rejected readings ----

Deno.test("rejects an unknown device", () => {
  assertEquals(reasonOf(reading({ device_id: "someone-else" })), "device_id not allowed");
});

Deno.test("rejects timestamps not on a whole minute or not UTC", () => {
  assertEquals(reasonOf(reading({ ts: "2026-10-20T10:15:07Z" })), "ts must be a UTC minute (YYYY-MM-DDTHH:MM:00Z)");
  assertEquals(reasonOf(reading({ ts: "2026-10-20T12:15:00+02:00" })), "ts must be a UTC minute (YYYY-MM-DDTHH:MM:00Z)");
});

Deno.test("rejects impossible dates", () => {
  assertEquals(reasonOf(reading({ ts: "2026-02-30T10:15:00Z" })), "ts is not a valid date");
});

Deno.test("rejects readings from the future", () => {
  assertEquals(reasonOf(reading({ ts: "2026-10-20T10:20:00Z" })), "ts is in the future");
});

Deno.test("rejects readings older than 7 days", () => {
  assertEquals(reasonOf(reading({ ts: "2026-10-13T10:15:00Z" })), "ts is older than 7 days");
});

Deno.test("rejects values outside physical ranges", () => {
  assertEquals(reasonOf(reading({ temp_c: 75 })), "temp_c out of range");
  assertEquals(reasonOf(reading({ humidity_pct: 101 })), "humidity_pct out of range");
  assertEquals(reasonOf(reading({ pressure_hpa: 500 })), "pressure_hpa out of range");
  assertEquals(reasonOf(reading({ wind_avg_ms: -1 })), "wind_avg_ms out of range");
  assertEquals(reasonOf(reading({ wind_dir_deg: 360 })), "wind_dir_deg out of range");
  assertEquals(reasonOf(reading({ rain_mm: -0.1 })), "rain_mm out of range");
  assertEquals(reasonOf(reading({ rssi: 5 })), "rssi out of range");
});

Deno.test("rejects wrong types and missing required fields", () => {
  assertEquals(reasonOf(reading({ temp_c: "18.4" })), "temp_c must be a number or null");
  assertEquals(reasonOf(reading({ wind_dir_deg: 22.5 })), "wind_dir_deg must be an integer or null");
  assertEquals(reasonOf(reading({ rain_mm: null })), "rain_mm is required");
  assertEquals(reasonOf(reading({ wind_avg_ms: undefined })), "wind_avg_ms is required");
  assertEquals(reasonOf("not an object"), "reading must be an object");
});

// ---- batch ----

Deno.test("a single object is a batch of one", () => {
  assertEquals(parseBatch(reading()), { ok: true, items: [reading()] });
});

Deno.test("rejects an empty or oversized batch", () => {
  assertEquals(parseBatch([]).ok, false);
  assertEquals(parseBatch(new Array(MAX_BATCH + 1).fill(reading())).ok, false);
});

// ---- key comparison ----

Deno.test("safeEqual compares keys without early exit", () => {
  assertEquals(safeEqual("abc123", "abc123"), true);
  assertEquals(safeEqual("abc123", "abc124"), false);
  assertEquals(safeEqual("abc", "abc123"), false);
  assertEquals(safeEqual("", ""), false);
});

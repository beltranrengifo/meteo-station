import { assertEquals } from "jsr:@std/assert@1";
import { keyHash, MAX_BATCH, MAX_EVENTS, MAX_RAIN_MM_PER_MINUTE, parseBody, validateReading } from "./validate.ts";

const NOW = new Date("2026-10-20T10:15:30Z");
const DEVICE = "meteo-station-1";

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
    fw: "0.4.0",
    free_heap: 151200,
    wifi_disconnects: 2,
    ...overrides,
  };
}

function reasonOf(raw: unknown): string | null {
  const result = validateReading(raw, NOW, DEVICE);
  return result.ok ? null : result.reason;
}

// ---- valid readings ----

Deno.test("accepts the firmware payload as-is", () => {
  const result = validateReading(reading(), NOW, DEVICE);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.row, reading());
});

Deno.test("accepts nulls where the station may have no data", () => {
  assertEquals(
    reasonOf(reading({ temp_c: null, humidity_pct: null, pressure_hpa: null, wind_dir_deg: null, rssi: null })),
    null,
  );
});

Deno.test("accepts readings without health, from firmware before 0.4.0", () => {
  const result = validateReading(reading({ free_heap: undefined, wifi_disconnects: undefined }), NOW, DEVICE);
  assertEquals(result.ok && [result.row.free_heap, result.row.wifi_disconnects], [null, null]);
});

Deno.test("drops unknown fields from the stored row", () => {
  const result = validateReading(reading({ extra: "x" }), NOW, DEVICE);
  assertEquals(result.ok && "extra" in result.row, false);
});

Deno.test("keeps rain up to the plausible limit per minute", () => {
  const result = validateReading(reading({ rain_mm: MAX_RAIN_MM_PER_MINUTE }), NOW, DEVICE);
  assertEquals(result.ok && [result.row.rain_mm, result.dropped], [MAX_RAIN_MM_PER_MINUTE, []]);
});

Deno.test("keeps the reading but stores rain 0 when the gauge sent more than a minute can rain", () => {
  const result = validateReading(reading({ rain_mm: 35.4838, temp_c: 12.4 }), NOW, DEVICE);
  assertEquals(
    result.ok && [result.row.rain_mm, result.row.temp_c, result.dropped],
    [0, 12.4, [{ field: "rain_mm", sent: 35.4838, stored: 0, why: "over 3 mm in one minute" }]],
  );
});

Deno.test("keeps the reading but stores null for an optional field out of its physical range", () => {
  const result = validateReading(reading({ rssi: 5, wind_avg_ms: 3.2 }), NOW, DEVICE);
  assertEquals(
    result.ok && [result.row.rssi, result.row.wind_avg_ms, result.dropped],
    [null, 3.2, [{ field: "rssi", sent: 5, stored: null, why: "out of range" }]],
  );
});

Deno.test("one BME280 value out of range drops all three: the sensor derives them together", () => {
  // 2026-11-11 on the mast: a wet BME280 sent impossible temperatures for hours.
  const result = validateReading(reading({ temp_c: 145.6, humidity_pct: 100, pressure_hpa: 940.2 }), NOW, DEVICE);
  assertEquals(
    result.ok && [result.row.temp_c, result.row.humidity_pct, result.row.pressure_hpa, result.dropped],
    [null, null, null, [
      { field: "temp_c", sent: 145.6, stored: null, why: "out of range" },
      { field: "humidity_pct", sent: 100, stored: null, why: "same sensor as temp_c" },
      { field: "pressure_hpa", sent: 940.2, stored: null, why: "same sensor as temp_c" },
    ]],
  );
});

Deno.test("a BME280 that sent nothing drops nothing", () => {
  const result = validateReading(reading({ temp_c: null, humidity_pct: null, pressure_hpa: null }), NOW, DEVICE);
  assertEquals(result.ok && result.dropped, []);
});

Deno.test("accepts readings from the station buffer up to 7 days old", () => {
  assertEquals(reasonOf(reading({ ts: "2026-10-14T10:16:00Z" })), null);
});

// ---- rejected readings ----

Deno.test("rejects a reading for another station than the key's", () => {
  assertEquals(reasonOf(reading({ device_id: "meteo-station-bench" })), "device_id does not match the device key");
  assertEquals(reasonOf(reading({ device_id: undefined })), "device_id does not match the device key");
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

Deno.test("rejects required values outside physical ranges", () => {
  // Required fields have no null to fall back on.
  assertEquals(reasonOf(reading({ wind_avg_ms: -1 })), "wind_avg_ms out of range");
  assertEquals(reasonOf(reading({ wind_gust_ms: 101 })), "wind_gust_ms out of range");
  assertEquals(reasonOf(reading({ rain_mm: -0.1 })), "rain_mm out of range");
  assertEquals(reasonOf(reading({ uptime_s: -1 })), "uptime_s out of range");
});

Deno.test("rejects wrong types and missing required fields", () => {
  assertEquals(reasonOf(reading({ temp_c: "18.4" })), "temp_c must be a number or null");
  assertEquals(reasonOf(reading({ wind_dir_deg: 22.5 })), "wind_dir_deg must be an integer or null");
  assertEquals(reasonOf(reading({ rain_mm: null })), "rain_mm is required");
  assertEquals(reasonOf(reading({ wind_avg_ms: undefined })), "wind_avg_ms is required");
  assertEquals(reasonOf(reading({ wifi_disconnects: 1.5 })), "wifi_disconnects must be an integer or null");
  assertEquals(reasonOf("not an object"), "reading must be an object");
});

// ---- batch ----

Deno.test("a single object is a batch of one", () => {
  assertEquals(parseBody(reading()), { ok: true, readings: [reading()], events: [] });
});

Deno.test("an array is a batch of readings without events", () => {
  assertEquals(parseBody([reading(), reading()]), { ok: true, readings: [reading(), reading()], events: [] });
});

Deno.test("an envelope carries readings and events", () => {
  const event = { ts: "2026-10-20T10:14:07Z", kind: "boot", message: "" };
  assertEquals(parseBody({ readings: [reading()], events: [event] }), {
    ok: true,
    readings: [reading()],
    events: [event],
  });
  assertEquals(parseBody({ readings: [reading()] }), { ok: true, readings: [reading()], events: [] });
});

Deno.test("rejects an empty or oversized batch", () => {
  assertEquals(parseBody([]).ok, false);
  assertEquals(parseBody({ readings: [], events: [] }).ok, false);
  assertEquals(parseBody(new Array(MAX_BATCH + 1).fill(reading())).ok, false);
  assertEquals(parseBody({ readings: [reading()], events: new Array(MAX_EVENTS + 1).fill({}) }).ok, false);
  assertEquals(parseBody({ readings: [reading()], events: "boot" }), { ok: false, reason: "events must be an array" });
});

// ---- device key ----

Deno.test("keyHash is the SHA-256 of the key as lowercase hex", async () => {
  assertEquals(await keyHash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

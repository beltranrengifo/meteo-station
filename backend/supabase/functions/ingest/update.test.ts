import { assertEquals } from "jsr:@std/assert@1";
import { needsUpdate, runningFirmware } from "./update.ts";
import type { ReadingRow } from "./validate.ts";

function row(ts: string, fw: string): ReadingRow {
  return {
    device_id: "meteo-station-1",
    ts,
    temp_c: null,
    humidity_pct: null,
    pressure_hpa: null,
    wind_avg_ms: 0,
    wind_gust_ms: 0,
    wind_dir_deg: null,
    rain_mm: 0,
    rssi: null,
    uptime_s: 60,
    fw,
    free_heap: null,
    wifi_disconnects: null,
  };
}

Deno.test("the running firmware is the one in the newest reading, in any order", () => {
  const rows = [row("2026-10-20T10:16:00Z", "0.2.0"), row("2026-10-20T10:15:00Z", "0.1.2")];
  assertEquals(runningFirmware(rows), "0.2.0");
  assertEquals(runningFirmware(rows.reverse()), "0.2.0");
});

Deno.test("no accepted readings: the running firmware is unknown", () => {
  assertEquals(runningFirmware([]), null);
});

Deno.test("updates only to a set target that differs from the running firmware", () => {
  assertEquals(needsUpdate("0.1.2", "0.2.0"), true);
  assertEquals(needsUpdate("0.2.0", "0.2.0"), false);
  assertEquals(needsUpdate("0.1.2", null), false);
  assertEquals(needsUpdate(null, "0.2.0"), false);
});

Deno.test("an older target also counts: it rolls a station back on purpose", () => {
  assertEquals(needsUpdate("0.2.0", "0.1.2"), true);
});

// Made-up readings for a test station, to try the dashboard with more than one station.
// They go through the real ingest function with the test station's own key, like a board.
// Deterministic per minute, so re-sending a minute stores nothing new.

const MINUTE_MS = 60_000;
const BATCH = 500;

// Cheap repeatable noise in [-1, 1] for a minute and a channel.
function noise(minute: number, channel: number): number {
  const x = Math.sin(minute * 12.9898 + channel * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

// A mild autumn day: coldest near 07:00 UTC, warmest near 14:00, a shower most afternoons.
export function fakeReading(deviceId: string, minuteStart: number, startedAt: number) {
  const minute = minuteStart / MINUTE_MS;
  const hourUtc = (minuteStart % 86_400_000) / 3_600_000;
  const day = Math.floor(minuteStart / 86_400_000);
  const daily = Math.sin(((hourUtc - 8) / 24) * 2 * Math.PI);
  const wind = Math.max(0, 1.6 + 1.2 * Math.max(0, daily) + 0.6 * noise(minute, 1));
  const showery = day % 3 !== 0 && hourUtc >= 15 && hourUtc < 16.5;
  return {
    device_id: deviceId,
    ts: new Date(minuteStart + MINUTE_MS).toISOString().slice(0, 17) + "00Z",
    temp_c: round(13 + 6 * daily + 0.3 * noise(minute, 2), 1),
    humidity_pct: round(Math.min(100, 72 - 20 * daily + 2 * noise(minute, 3)), 1),
    pressure_hpa: round(940 + 3 * Math.sin(day / 2) + 0.2 * noise(minute, 4), 1),
    wind_avg_ms: round(wind, 2),
    wind_gust_ms: round(wind * (1.5 + 0.3 * Math.abs(noise(minute, 5))), 2),
    wind_dir_deg: Math.round(270 + 35 * noise(minute, 6) + 360) % 360,
    rain_mm: showery && noise(minute, 7) > 0.3 ? 0.2794 : 0,
    rssi: Math.round(-70 + 3 * noise(minute, 8)),
    uptime_s: Math.max(0, Math.round((minuteStart + MINUTE_MS - startedAt) / 1000)),
    fw: "fake",
    free_heap: 140_000,
    wifi_disconnects: 0,
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function post(ingestUrl: string, key: string, body: unknown): Promise<string> {
  const response = await fetch(ingestUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-key": key },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`ingest answered HTTP ${response.status}: ${text}`);
  }
  const result = JSON.parse(text) as { accepted: number; rejected: unknown[] };
  return `${result.accepted} accepted, ${result.rejected.length} rejected`;
}

// Fills the last 24 h, then sends one reading a minute until Ctrl+C.
export async function runFakeStation(deviceId: string, supabaseUrl: string, key: string) {
  const ingestUrl = `${supabaseUrl}/functions/v1/ingest`;
  const now = Date.now();
  const lastFull = Math.floor(now / MINUTE_MS) * MINUTE_MS - MINUTE_MS;  // minute that ended last
  const startedAt = lastFull - 24 * 60 * MINUTE_MS;

  const minutes: number[] = [];
  for (let t = startedAt; t <= lastFull; t += MINUTE_MS) minutes.push(t);
  console.log(`Sending the last 24 h for ${deviceId} (${minutes.length} readings)...`);
  for (let i = 0; i < minutes.length; i += BATCH) {
    const readings = minutes.slice(i, i + BATCH).map((t) => fakeReading(deviceId, t, startedAt));
    const events = i === 0
      ? [{ ts: new Date(now).toISOString().slice(0, 19) + "Z", kind: "boot", message: "fake station: last 24 h sent" }]
      : [];
    console.log(`  ${await post(ingestUrl, key, { readings, events })}`);
  }

  console.log("Now one reading a minute, like a board. Ctrl+C to stop.");
  let next = lastFull + MINUTE_MS;
  for (;;) {
    const wait = next + MINUTE_MS - Date.now() + 2_000;  // just after the minute ends
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, wait)));
    const reading = fakeReading(deviceId, next, startedAt);
    try {
      console.log(`  ${reading.ts}: ${await post(ingestUrl, key, [reading])}`);
    } catch (error) {
      console.error(`  ${reading.ts}: ${(error as Error).message}`);
    }
    next += MINUTE_MS;
  }
}

// A station's remote log: what it says about itself through its uploads, for stations with no
// USB cable (firmware 0.4.0 or later; older readings have no health fields).
//
//   pnpm station logs <device_id> [hours]   health and events of the last hours (default 24)
//   pnpm station show <device_id>           list it on the dashboard (needs its display_name)
//   pnpm station hide <device_id>           take it off the dashboard; nothing is deleted
//   pnpm station fake <device_id>           made-up readings for a test station (FAKE_STATION_KEY),
//                                           listed on the dashboard until Ctrl+C
//
// Times are Madrid time. Reads backend/.env.local, like pnpm firmware.
import { runFakeStation } from "./fake-station.ts";
import { connect, fail } from "./supabase-admin.ts";

const USAGE = `usage:
  pnpm station logs <device_id> [hours]
  pnpm station show <device_id>
  pnpm station hide <device_id>
  pnpm station fake <device_id>`;
const MAX_HOURS = 24 * 30;

const madrid = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function madridTime(iso: string): string {
  return madrid.format(new Date(iso));
}

function duration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

type Health = {
  ts: string;
  fw: string | null;
  uptime_s: number | null;
  rssi: number | null;
  free_heap: number | null;
  wifi_disconnects: number | null;
};

async function logs(deviceId: string | undefined, hoursArg: string | undefined) {
  if (!deviceId) {
    fail(USAGE);
  }
  const hours = hoursArg === undefined ? 24 : Number(hoursArg);
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_HOURS) {
    fail(`hours must be a number from 1 to ${MAX_HOURS}`);
  }
  const supabase = connect();
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  const device = await supabase.from("devices").select("name, active").eq("device_id", deviceId).maybeSingle();
  if (device.error) fail(`could not read devices: ${device.error.message}`);
  if (!device.data) fail(`no station ${deviceId} in public.devices`);

  const [newest, lowestHeap, count, events] = await Promise.all([
    supabase
      .from("readings")
      .select("ts, fw, uptime_s, rssi, free_heap, wifi_disconnects")
      .eq("device_id", deviceId)
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle<Health>(),
    supabase
      .from("readings")
      .select("ts, free_heap")
      .eq("device_id", deviceId)
      .gte("ts", since)
      .not("free_heap", "is", null)
      .order("free_heap", { ascending: true })
      .limit(1)
      .maybeSingle<{ ts: string; free_heap: number }>(),
    supabase.from("readings").select("id", { count: "exact", head: true }).eq("device_id", deviceId).gte("ts", since),
    supabase
      .from("device_events")
      .select("ts, kind, message")
      .eq("device_id", deviceId)
      .gte("ts", since)
      .order("ts", { ascending: true })
      // Same second (boot and OTA at startup): in the order the station logged them.
      .order("id", { ascending: true })
      .limit(1000),
  ]);
  for (const result of [newest, lowestHeap, count, events]) {
    if (result.error) fail(`could not read the log: ${result.error.message}`);
  }

  console.log(`${deviceId} (${device.data.name})${device.data.active ? "" : ", inactive"}`);
  const last = newest.data;
  if (!last) {
    console.log("  no readings yet");
  } else {
    const ago = duration((Date.now() - new Date(last.ts).getTime()) / 1000);
    const parts = [`last reading ${madridTime(last.ts)} (${ago} ago)`, `fw ${last.fw ?? "?"}`];
    if (last.uptime_s !== null) parts.push(`up ${duration(last.uptime_s)}`);
    if (last.rssi !== null) parts.push(`RSSI ${last.rssi} dBm`);
    if (last.free_heap !== null) parts.push(`free heap ${Math.round(last.free_heap / 1024)} KB`);
    if (last.wifi_disconnects !== null) parts.push(`${last.wifi_disconnects} WiFi drops since boot`);
    console.log(`  ${parts.join(", ")}`);
  }
  const expected = Math.round(hours * 60);
  console.log(`  last ${hours} h: ${count.count ?? 0} readings (one a minute would be ${expected})`);
  if (lowestHeap.data) {
    console.log(
      `  lowest free heap: ${Math.round(lowestHeap.data.free_heap / 1024)} KB at ${madridTime(lowestHeap.data.ts)}`,
    );
  }

  console.log("");
  if (events.data!.length === 0) {
    console.log(`No events in the last ${hours} h.`);
    return;
  }
  console.log(`Events in the last ${hours} h (Madrid time):`);
  for (const event of events.data!) {
    console.log(`  ${madridTime(event.ts)}  ${event.kind.padEnd(6)}  ${event.message}`);
  }
}

// The dashboard picks the change up within a minute (its station list cache).
async function setListed(deviceId: string | undefined, listed: boolean) {
  if (!deviceId) {
    fail(USAGE);
  }
  const result = await connect()
    .from("devices")
    .update({ listed })
    .eq("device_id", deviceId)
    .select("device_id, display_name");
  if (result.error) {
    fail(`could not change ${deviceId}: ${result.error.message}`);
  }
  if (result.data.length === 0) {
    fail(`no station ${deviceId} in public.devices`);
  }
  const name = result.data[0].display_name;
  console.log(listed ? `${deviceId} is on the dashboard as "${name}"` : `${deviceId} is off the dashboard`);
}

const [command, ...args] = Deno.args;
switch (command) {
  case "logs":
    await logs(args[0], args[1]);
    break;
  case "show":
    await setListed(args[0], true);
    break;
  case "hide":
    await setListed(args[0], false);
    break;
  case "fake": {
    const deviceId = args[0];
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("FAKE_STATION_KEY");
    if (!deviceId || !url || !key) {
      fail(`${USAGE}\nfake needs SUPABASE_URL and FAKE_STATION_KEY (the test station's key) in backend/.env.local`);
    }
    // A test station is only on the dashboard while it sends data.
    Deno.addSignalListener("SIGINT", async () => {
      await setListed(deviceId, false);
      Deno.exit(0);
    });
    await setListed(deviceId, true);
    await runFakeStation(deviceId, url, key);
    break;
  }
  default:
    fail(USAGE);
}

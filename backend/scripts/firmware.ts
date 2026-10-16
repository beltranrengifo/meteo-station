// Firmware releases for OTA updates (docs/nueva-estacion.md, step 5).
//
//   pnpm firmware publish <bench|station> ["notes"]   build that env and publish it
//   pnpm firmware target <device_id> <version|none>  the version a station should run
//   pnpm firmware status                             target and running version per station
//
// The version is FW_VERSION in firmware/include/config.h. Reads SUPABASE_URL and
// SUPABASE_SECRET_KEY from backend/.env.local (git-ignored; see docs/nueva-estacion.md).
import { connect, fail } from "./supabase-admin.ts";

// The bucket's limit: an app slot of the default partition table. Stations use min_spiffs.csv
// (1.9 MB slots), so there is room to raise both if a build ever needs it.
const MAX_SIZE_BYTES = 0x140000;
// First byte of every ESP32 app image.
const ESP_IMAGE_MAGIC = 0xe9;
const ENVS = ["bench", "station"];
const FIRMWARE_DIR = new URL("../../firmware/", import.meta.url);

const USAGE = `usage:
  pnpm firmware publish <bench|station> ["notes"]
  pnpm firmware target <device_id> <version|none>
  pnpm firmware status`;

async function configVersion(): Promise<string> {
  const configH = await Deno.readTextFile(new URL("include/config.h", FIRMWARE_DIR));
  const version = configH.match(/#define FW_VERSION "([0-9]+\.[0-9]+\.[0-9]+)"/)?.[1];
  if (!version) {
    fail("FW_VERSION not found in firmware/include/config.h");
  }
  return version;
}

// `pio` when it is on the PATH (PlatformIO terminal), else the PlatformIO Core install.
function pioPath(): string {
  for (const dir of (Deno.env.get("PATH") ?? "").split(":")) {
    try {
      Deno.statSync(`${dir}/pio`);
      return "pio";
    } catch {
      // not in this dir
    }
  }
  return `${Deno.env.get("HOME")}/.platformio/penv/bin/pio`;
}

async function publish(env: string | undefined, notes: string | undefined) {
  if (!env || !ENVS.includes(env)) {
    fail(USAGE);
  }
  const supabase = connect();
  const version = await configVersion();

  // Fail before the build: a published version is never overwritten.
  const existing = await supabase.from("firmware_releases").select("version").eq("version", version).maybeSingle();
  if (existing.error) {
    fail(`could not read firmware_releases: ${existing.error.message}`);
  }
  if (existing.data) {
    fail(`${version} is already published: raise FW_VERSION in firmware/include/config.h`);
  }

  console.log(`Building ${version} (pio run -e ${env})...`);
  let build: Deno.CommandStatus;
  try {
    build = await new Deno.Command(pioPath(), { args: ["run", "-e", env], cwd: FIRMWARE_DIR }).spawn().status;
  } catch {
    fail("pio not found: install PlatformIO Core, or run this from the PlatformIO terminal");
  }
  if (!build.success) {
    fail("build failed");
  }

  const binPath = new URL(`.pio/build/${env}/firmware.bin`, FIRMWARE_DIR);
  const bin = await Deno.readFile(binPath);
  if (bin[0] !== ESP_IMAGE_MAGIC) {
    fail("firmware.bin is not an ESP32 app image");
  }
  if (bin.length > MAX_SIZE_BYTES) {
    fail(`firmware.bin is ${bin.length} bytes, more than the bucket allows (${MAX_SIZE_BYTES})`);
  }
  if (!new TextDecoder("latin1").decode(bin).includes(version)) {
    fail(`firmware.bin does not contain version ${version}`);
  }

  const digest = await crypto.subtle.digest("SHA-256", bin);
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");

  // Never overwrite: a station may be downloading the published file of this version.
  const path = `${version}.bin`;
  const upload = await supabase.storage
    .from("firmware")
    .upload(path, bin, { contentType: "application/octet-stream", upsert: false });
  if (upload.error) {
    fail(`upload failed: ${upload.error.message} (to publish again, raise FW_VERSION)`);
  }
  const release = await supabase
    .from("firmware_releases")
    .insert({ version, path, sha256, size_bytes: bin.length, notes: notes ?? `${env} build` });
  if (release.error) {
    // Keep bucket and table in step: without its row the file is useless.
    await supabase.storage.from("firmware").remove([path]);
    fail(`release row failed: ${release.error.message}`);
  }

  console.log(`Published ${version} (${env} build): ${bin.length} bytes, sha256 ${sha256}`);
  console.log(`To send it to a station: pnpm firmware target <device_id> ${version}`);
}

async function target(deviceId: string | undefined, version: string | undefined) {
  if (!deviceId || !version) {
    fail(USAGE);
  }
  const supabase = connect();
  const targetFw = version === "none" ? null : version;
  // target_fw references firmware_releases, so an unpublished version is refused.
  const result = await supabase
    .from("devices")
    .update({ target_fw: targetFw })
    .eq("device_id", deviceId)
    .select("device_id");
  if (result.error) {
    fail(`could not set the target: ${result.error.message}`);
  }
  if (result.data.length === 0) {
    fail(`no station ${deviceId} in public.devices`);
  }
  console.log(
    targetFw === null
      ? `${deviceId} keeps whatever firmware it runs`
      : `${deviceId} installs ${targetFw} after its next upload (within a minute)`,
  );
}

async function status() {
  const supabase = connect();
  const devices = await supabase.from("devices").select("device_id, target_fw, active").order("device_id");
  if (devices.error) {
    fail(`could not read devices: ${devices.error.message}`);
  }
  for (const device of devices.data) {
    const newest = await supabase
      .from("readings")
      .select("ts, fw")
      .eq("device_id", device.device_id)
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (newest.error) {
      fail(`could not read readings: ${newest.error.message}`);
    }
    const running = newest.data ? `runs ${newest.data.fw} (newest reading ${newest.data.ts})` : "no readings yet";
    const wanted = device.target_fw ? `target ${device.target_fw}` : "no target";
    console.log(`${device.device_id}${device.active ? "" : " (inactive)"}: ${running}, ${wanted}`);
  }
}

const [command, ...args] = Deno.args;
switch (command) {
  case "publish":
    await publish(args[0], args[1]);
    break;
  case "target":
    await target(args[0], args[1]);
    break;
  case "status":
    await status();
    break;
  default:
    fail(USAGE);
}

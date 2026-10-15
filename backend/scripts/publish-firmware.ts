// Publishes a built firmware for OTA: uploads the .bin to the private firmware bucket and adds
// its row to public.firmware_releases. The version is FW_VERSION in firmware/include/config.h.
// Stations only move to it once their devices.target_fw is set (docs/nueva-estacion.md).
//
//   pnpm publish:firmware <path to firmware.bin> ["notes"]
//
// Reads SUPABASE_URL and SUPABASE_SECRET_KEY from frontend/.env.local (vercel env pull).
import { createClient } from "npm:@supabase/supabase-js@2";

// One OTA app partition of the default partition table; the bucket has the same limit.
const MAX_SIZE_BYTES = 0x140000;
// First byte of every ESP32 app image.
const ESP_IMAGE_MAGIC = 0xe9;

function fail(message: string): never {
  console.error(message);
  Deno.exit(1);
}

const [binPath, notes] = Deno.args;
if (!binPath) {
  fail('usage: pnpm publish:firmware <path to firmware.bin> ["notes"]');
}

const configH = await Deno.readTextFile(new URL("../../firmware/include/config.h", import.meta.url));
const version = configH.match(/#define FW_VERSION "([0-9]+\.[0-9]+\.[0-9]+)"/)?.[1];
if (!version) {
  fail("FW_VERSION not found in firmware/include/config.h");
}

const bin = await Deno.readFile(binPath);
if (bin[0] !== ESP_IMAGE_MAGIC) {
  fail(`${binPath} is not an ESP32 app image`);
}
if (bin.length > MAX_SIZE_BYTES) {
  fail(`${binPath} is ${bin.length} bytes, more than an OTA partition (${MAX_SIZE_BYTES})`);
}
// A build from before the last FW_VERSION change would be published under the wrong version.
if (!new TextDecoder("latin1").decode(bin).includes(version)) {
  fail(`${binPath} does not contain version ${version}: build it again after changing FW_VERSION`);
}

const digest = await crypto.subtle.digest("SHA-256", bin);
const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SECRET_KEY");
if (!url || !key) {
  fail("SUPABASE_URL and SUPABASE_SECRET_KEY must be set (frontend/.env.local)");
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

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
  .insert({ version, path, sha256, size_bytes: bin.length, notes: notes ?? null });
if (release.error) {
  // Keep bucket and table in step: without its row the file is useless.
  await supabase.storage.from("firmware").remove([path]);
  fail(`release row failed: ${release.error.message}`);
}

console.log(`Published firmware ${version}: ${bin.length} bytes, sha256 ${sha256}`);
console.log("To update a station, in Supabase (SQL Editor):");
console.log(`update public.devices set target_fw = '${version}' where device_id = '<device_id>';`);

// Ingest endpoint for the weather stations: POST one reading or an array of readings.
// Auth: x-device-key header, each station its own key (public.devices). Invalid readings are
// skipped and reported, so one bad reading never blocks a station from emptying its buffer.
// When a station runs another firmware than its target, the response offers the update.
import { createClient } from "npm:@supabase/supabase-js@2";
import { needsUpdate, runningFirmware, SIGNED_URL_TTL_S, type UpdateOffer } from "./update.ts";
import { keyHash, parseBatch, type ReadingRow, validateReading } from "./validate.ts";

// New-style secret key ("default" entry of SUPABASE_SECRET_KEYS), legacy service role as fallback.
function secretKey(): string {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), {
  auth: { persistSession: false },
});

// The download for a station's target release, or null (logged) if it cannot be offered now:
// the readings are already stored, so an update problem never fails the upload.
async function updateOffer(target: string): Promise<UpdateOffer | null> {
  const release = await supabase
    .from("firmware_releases")
    .select("path, sha256, size_bytes")
    .eq("version", target)
    .maybeSingle<{ path: string; sha256: string; size_bytes: number }>();
  if (release.error || !release.data) {
    console.error("release lookup failed", target, release.error?.message ?? "not found");
    return null;
  }
  const signed = await supabase.storage.from("firmware").createSignedUrl(release.data.path, SIGNED_URL_TTL_S);
  if (signed.error) {
    console.error("signed URL failed", target, signed.error.message);
    return null;
  }
  return { version: target, url: signed.data.signedUrl, sha256: release.data.sha256, size: release.data.size_bytes };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }
  const key = req.headers.get("x-device-key") ?? "";
  if (key.length === 0) {
    return json({ error: "unauthorized" }, 401);
  }
  const device = await supabase
    .from("devices")
    .select("device_id, target_fw")
    .eq("key_sha256", await keyHash(key))
    .eq("active", true)
    .maybeSingle<{ device_id: string; target_fw: string | null }>();
  if (device.error) {
    console.error("device lookup failed", device.error.message);
    // 500 makes the station keep its readings and retry later.
    return json({ error: "database error" }, 500);
  }
  if (!device.data) {
    return json({ error: "unauthorized" }, 401);
  }
  const deviceId = device.data.device_id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "body is not valid JSON" }, 400);
  }

  const batch = parseBatch(body);
  if (!batch.ok) {
    return json({ error: batch.reason }, 400);
  }

  const now = new Date();
  const rows: ReadingRow[] = [];
  const rejected: { index: number; reason: string }[] = [];
  batch.items.forEach((item, index) => {
    const result = validateReading(item, now, deviceId);
    if (result.ok) rows.push(result.row);
    else rejected.push({ index, reason: result.reason });
  });

  if (rows.length > 0) {
    // Re-sent readings hit the (device_id, ts) unique key and are ignored.
    const { error } = await supabase
      .from("readings")
      .upsert(rows, { onConflict: "device_id,ts", ignoreDuplicates: true });
    if (error) {
      console.error("insert failed", error.message);
      // 500 makes the station keep the batch and retry later.
      return json({ error: "database error" }, 500);
    }
  }

  if (rejected.length > 0) {
    console.warn("rejected readings", JSON.stringify(rejected));
  }
  const running = runningFirmware(rows);
  const target = device.data.target_fw;
  const update = needsUpdate(running, target) ? await updateOffer(target) : null;
  return json({ accepted: rows.length, rejected, ...(update && { update }) }, 200);
});

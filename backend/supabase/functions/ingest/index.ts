// Ingest endpoint for the weather station: POST one reading or an array of readings.
// Auth: x-device-key header. Invalid readings are skipped and reported, so one bad reading
// never blocks the station from emptying its buffer.
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseBatch, type ReadingRow, safeEqual, validateReading } from "./validate.ts";

const DEVICE_KEY = Deno.env.get("DEVICE_KEY") ?? "";
const ALLOWED_DEVICES = (Deno.env.get("ALLOWED_DEVICES") ?? "")
  .split(",")
  .map((device) => device.trim())
  .filter(Boolean);

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
  if (!DEVICE_KEY || !safeEqual(req.headers.get("x-device-key") ?? "", DEVICE_KEY)) {
    return json({ error: "unauthorized" }, 401);
  }

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
    const result = validateReading(item, now, ALLOWED_DEVICES);
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
  return json({ accepted: rows.length, rejected }, 200);
});

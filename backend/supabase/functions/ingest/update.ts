// Pure OTA decision for the ingest function: no I/O, so it is unit-tested with `deno test`.
import type { ReadingRow } from "./validate.ts";

// How long a station has to start downloading its update.
export const SIGNED_URL_TTL_S = 600;

// What the ingest response tells a station that should update.
export type UpdateOffer = { version: string; url: string; sha256: string; size: number };

// The firmware a station runs now: the one in its newest accepted reading. Its buffer lives in
// RAM and is lost on reboot, so all readings of a batch come from the running firmware anyway.
export function runningFirmware(rows: ReadingRow[]): string | null {
  let newest: ReadingRow | null = null;
  for (const row of rows) {
    if (newest === null || row.ts > newest.ts) newest = row;
  }
  return newest?.fw ?? null;
}

// A station updates when it has a target version and runs another one.
export function needsUpdate(running: string | null, target: string | null): target is string {
  return running !== null && target !== null && running !== target;
}

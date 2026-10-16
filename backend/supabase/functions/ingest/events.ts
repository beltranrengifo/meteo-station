// Pure validation of station events (public.device_events): no I/O, unit-tested with `deno test`.
import { MAX_AGE_MS, MAX_CLOCK_SKEW_MS } from "./validate.ts";

export const MAX_MESSAGE_LENGTH = 200;

const TS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const KIND_PATTERN = /^[a-z][a-z_]{0,31}$/;

export type EventRow = { device_id: string; ts: string; kind: string; message: string };

export type EventResult = { ok: true; row: EventRow } | { ok: false; reason: string };

// The station comes from the request's key, never from the event.
export function validateEvent(raw: unknown, now: Date, deviceId: string): EventResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: "event must be an object" };
  }
  const e = raw as Record<string, unknown>;

  if (typeof e.ts !== "string" || !TS_PATTERN.test(e.ts)) {
    return { ok: false, reason: "ts must be a UTC second (YYYY-MM-DDTHH:MM:SSZ)" };
  }
  const ts = new Date(e.ts);
  if (Number.isNaN(ts.getTime()) || ts.toISOString().slice(0, 19) + "Z" !== e.ts) {
    return { ok: false, reason: "ts is not a valid date" };
  }
  if (ts.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) {
    return { ok: false, reason: "ts is in the future" };
  }
  if (ts.getTime() < now.getTime() - MAX_AGE_MS) {
    return { ok: false, reason: "ts is older than 7 days" };
  }
  if (typeof e.kind !== "string" || !KIND_PATTERN.test(e.kind)) {
    return { ok: false, reason: "kind must be a lowercase word" };
  }
  if (typeof e.message !== "string" || e.message.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, reason: `message must be a string of at most ${MAX_MESSAGE_LENGTH} characters` };
  }

  return { ok: true, row: { device_id: deviceId, ts: e.ts, kind: e.kind, message: e.message } };
}

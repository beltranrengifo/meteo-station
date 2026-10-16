import { assertEquals } from "jsr:@std/assert@1";
import { MAX_MESSAGE_LENGTH, validateEvent } from "./events.ts";

const NOW = new Date("2026-10-20T10:15:30Z");
const DEVICE = "meteo-station-1";

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ts: "2026-10-20T10:14:07Z", kind: "boot", message: "fw 0.4.0, reset power_on", ...overrides };
}

function reasonOf(raw: unknown): string | null {
  const result = validateEvent(raw, NOW, DEVICE);
  return result.ok ? null : result.reason;
}

Deno.test("accepts a station event and takes the station from the key", () => {
  assertEquals(validateEvent(event({ device_id: "someone-else" }), NOW, DEVICE), {
    ok: true,
    row: { device_id: DEVICE, ts: "2026-10-20T10:14:07Z", kind: "boot", message: "fw 0.4.0, reset power_on" },
  });
});

Deno.test("accepts an empty message and one of the maximum length", () => {
  assertEquals(reasonOf(event({ message: "" })), null);
  assertEquals(reasonOf(event({ message: "x".repeat(MAX_MESSAGE_LENGTH) })), null);
});

Deno.test("rejects a message that is too long or not text", () => {
  const reason = `message must be a string of at most ${MAX_MESSAGE_LENGTH} characters`;
  assertEquals(reasonOf(event({ message: "x".repeat(MAX_MESSAGE_LENGTH + 1) })), reason);
  assertEquals(reasonOf(event({ message: 42 })), reason);
  assertEquals(reasonOf(event({ message: undefined })), reason);
});

Deno.test("rejects kinds that are not a lowercase word", () => {
  for (const kind of ["", "Boot", "wifi lost", "1boot", "x".repeat(33), 3]) {
    assertEquals(reasonOf(event({ kind })), "kind must be a lowercase word");
  }
  assertEquals(reasonOf(event({ kind: "upload_failed" })), null);
});

Deno.test("rejects timestamps that are not a UTC second", () => {
  const reason = "ts must be a UTC second (YYYY-MM-DDTHH:MM:SSZ)";
  assertEquals(reasonOf(event({ ts: "2026-10-20T10:14:07.120Z" })), reason);
  assertEquals(reasonOf(event({ ts: "2026-10-20T12:14:07+02:00" })), reason);
  assertEquals(reasonOf(event({ ts: undefined })), reason);
  assertEquals(reasonOf(event({ ts: "2026-02-30T10:14:07Z" })), "ts is not a valid date");
});

Deno.test("rejects events from the future or older than 7 days", () => {
  assertEquals(reasonOf(event({ ts: "2026-10-20T10:20:00Z" })), "ts is in the future");
  assertEquals(reasonOf(event({ ts: "2026-10-13T10:15:00Z" })), "ts is older than 7 days");
});

Deno.test("rejects anything that is not an object", () => {
  assertEquals(reasonOf("boot"), "event must be an object");
  assertEquals(reasonOf([event()]), "event must be an object");
  assertEquals(reasonOf(null), "event must be an object");
});

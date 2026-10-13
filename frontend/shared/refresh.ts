// When new data for today exists, shared by the API cache (server) and the dashboard refresh
// (browser), so both turn over together, right after each reading lands.

// The station posts each reading just after the minute; it is stored about 3 s past it.
// From this many seconds past each minute, the new reading is taken to be in the database.
export const READING_LANDED_S = 8;

const MINUTE_MS = 60_000;

// Milliseconds from nowMs until the next point READING_LANDED_S past a minute (1 to 60 000).
export function msUntilNextReading(nowMs: number): number {
  const sinceLanding = (((nowMs - READING_LANDED_S * 1000) % MINUTE_MS) + MINUTE_MS) % MINUTE_MS;
  return MINUTE_MS - sinceLanding;
}

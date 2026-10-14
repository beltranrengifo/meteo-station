// The custom chart range and the checks the API also makes (server/params.ts parseRange).
import { Temporal } from 'temporal-polyfill';

// Same limit as the API (server/params.ts RANGE_MAX_DAYS).
export const CUSTOM_MAX_DAYS = 31;

export interface CustomRange {
  from: string; // instants, ISO 8601, whole minutes
  to: string;
}

// Problem with a picked range, in Spanish, or null when the API will accept it.
export function customRangeProblem(range: CustomRange): string | null {
  const from = Temporal.Instant.from(range.from);
  const to = Temporal.Instant.from(range.to);
  if (Temporal.Instant.compare(from, to) >= 0) {
    return '"Desde" tiene que ser anterior a "Hasta".';
  }
  if (Temporal.Instant.compare(from, Temporal.Now.instant()) >= 0) {
    return '"Desde" no puede ser futuro.';
  }
  if (Temporal.Duration.compare(from.until(to), { hours: CUSTOM_MAX_DAYS * 24 }) > 0) {
    return `El periodo puede durar como mucho ${CUSTOM_MAX_DAYS} días.`;
  }
  return null;
}

// Shorter selections are taken as a stray click, not a range.
const MIN_SELECTION_MINUTES = 2;

// A range dragged on a chart, as a custom range: kept inside the chart's from..to and widened
// to whole minutes, as the API asks. Null for a selection too short to mean anything.
export function selectionToRange(
  start: Temporal.Instant,
  end: Temporal.Instant,
  bounds: CustomRange,
): CustomRange | null {
  const [low, high] = Temporal.Instant.compare(start, end) <= 0 ? [start, end] : [end, start];
  const boundFrom = Temporal.Instant.from(bounds.from);
  const boundTo = Temporal.Instant.from(bounds.to);
  const from = (Temporal.Instant.compare(low, boundFrom) < 0 ? boundFrom : low)
    .round({ smallestUnit: 'minute', roundingMode: 'floor' });
  const to = (Temporal.Instant.compare(high, boundTo) > 0 ? boundTo : high)
    .round({ smallestUnit: 'minute', roundingMode: 'ceil' });
  if (Temporal.Duration.compare(from.until(to), { minutes: MIN_SELECTION_MINUTES }) < 0) {
    return null;
  }
  return { from: from.toString(), to: to.toString() };
}

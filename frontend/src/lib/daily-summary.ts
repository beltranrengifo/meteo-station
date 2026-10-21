// The "El aviso de hoy" card: today's notification text laid out in rows, and whether the reader
// already closed it on this device.
import { Temporal } from 'temporal-polyfill';

export interface SummaryRow {
  emoji: string;
  text: string;
  warning: boolean;
}

const WARNING = '⚠️';
// When the last message read on this device was sent: every send (the 9:05 one or a test) has its
// own, so a new one shows the card again. Only a convenience: without storage the card shows.
const DISMISSED_KEY = 'daily-summary-dismissed';

const graphemes = new Intl.Segmenter('es', { granularity: 'grapheme' });

function row(part: string): SummaryRow {
  const first = graphemes.segment(part)[Symbol.iterator]().next().value?.segment ?? '';
  return { emoji: first, text: part.slice(first.length).trim(), warning: first === WARNING };
}

// The body has one line per topic (sky, temperature, rain, wind); the sky line may end with
// "⚠️ …" warnings, which get a row each so they stand out.
export function summaryRows(body: string): SummaryRow[] {
  return body
    .split('\n')
    .flatMap((line) => line.split(/\s+(?=⚠️)/))
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(row);
}

// One spelling per instant ("…+00:00" and "…Z" are the same send).
function sendKey(sentAt: string): string {
  return Temporal.Instant.from(sentAt).toString();
}

export function isSummaryDismissed(sentAt: string): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === sendKey(sentAt);
  } catch {
    return false;
  }
}

export function dismissSummary(sentAt: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, sendKey(sentAt));
  } catch {
    // Private mode or blocked storage: the card just comes back on the next open.
  }
}

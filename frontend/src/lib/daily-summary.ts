// The "El aviso de hoy" card: today's notification text laid out in rows, and whether the reader
// already closed it on this device.

export interface SummaryRow {
  emoji: string;
  text: string;
  warning: boolean;
}

const WARNING = '⚠️';
// Which day's card was closed on this device. Only a convenience: without storage the card shows.
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

export function isSummaryDismissed(day: string): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === day;
  } catch {
    return false;
  }
}

export function dismissSummary(day: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, day);
  } catch {
    // Private mode or blocked storage: the card just comes back on the next open.
  }
}

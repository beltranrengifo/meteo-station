import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissSummary, isSummaryDismissed, summaryRows } from './daily-summary';

const BODY = [
  '☀️ Soleado por la mañana, 🌤️ poco nuboso por la tarde y 🌙 despejado por la noche. Anticiclón, tiempo estable. ⚠️ Helada al amanecer. ⚠️ Niebla por la mañana.',
  '🌡️ Entre 0 °C (7 h) y 14 °C (16 h).',
  '☂️ Sin lluvia (0 %).',
  '💨 Viento flojo, hasta 12 km/h del norte.',
].join('\n');

describe('summaryRows', () => {
  it('gives one row per line, the emoji apart, and each warning its own row', () => {
    expect(summaryRows(BODY)).toEqual([
      { emoji: '☀️', text: 'Soleado por la mañana, 🌤️ poco nuboso por la tarde y 🌙 despejado por la noche. Anticiclón, tiempo estable.', warning: false },
      { emoji: '⚠️', text: 'Helada al amanecer.', warning: true },
      { emoji: '⚠️', text: 'Niebla por la mañana.', warning: true },
      { emoji: '🌡️', text: 'Entre 0 °C (7 h) y 14 °C (16 h).', warning: false },
      { emoji: '☂️', text: 'Sin lluvia (0 %).', warning: false },
      { emoji: '💨', text: 'Viento flojo, hasta 12 km/h del norte.', warning: false },
    ]);
  });
  it('skips empty lines', () => {
    expect(summaryRows('🌡️ Entre 9 °C (7 h) y 21 °C (16 h).\n\n')).toHaveLength(1);
  });
});

describe('dismissing the summary', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubStorage() {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });
  }

  it('is remembered for that day only', () => {
    stubStorage();
    expect(isSummaryDismissed('2026-10-22')).toBe(false);
    dismissSummary('2026-10-22');
    expect(isSummaryDismissed('2026-10-22')).toBe(true);
    expect(isSummaryDismissed('2026-10-23')).toBe(false);
  });
  it('shows the card when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(isSummaryDismissed('2026-10-22')).toBe(false);
    expect(() => dismissSummary('2026-10-22')).not.toThrow();
  });
});

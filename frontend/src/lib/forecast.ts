// Pure helpers for the forecast tab.
import type { ForecastHour } from '../../shared/api-types';

export interface Precipitation {
  mm: number | null;             // total over the stretch, rain and snow as water
  probabilityPct: number | null; // the highest hourly chance in it
  snowCm: number | null;         // total snowfall
}

function present(values: (number | null)[]): number[] {
  return values.filter((value) => value !== null);
}

// Rounded to tenths, the model's own step, so sums do not show float noise.
function total(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 10) / 10 : null;
}

// Precipitation over a stretch of hours, for a slot that stands for several. Null where no hour
// has a value.
export function precipitationOver(hours: ForecastHour[]): Precipitation {
  const chances = present(hours.map((hour) => hour.precipProbabilityPct));
  return {
    mm: total(present(hours.map((hour) => hour.precipMm))),
    probabilityPct: chances.length ? Math.max(...chances) : null,
    snowCm: total(present(hours.map((hour) => hour.snowCm))),
  };
}

// "0.4 mm", "0 mm" for none, "—" without data.
export function formatRain(mm: number | null): string {
  if (mm === null) {
    return '—';
  }
  return mm === 0 ? '0 mm' : `${mm.toFixed(1)} mm`;
}

// "3 cm", "0.7 cm" below 1 cm.
export function formatSnow(cm: number): string {
  return cm < 1 ? `${cm.toFixed(1)} cm` : `${Math.round(cm)} cm`;
}

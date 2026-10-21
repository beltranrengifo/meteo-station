// Quantities derived from the readings, and Spanish texts for the sky and UV from Open-Meteo.
import { Temporal } from 'temporal-polyfill';
import type { ReadingRow } from '../../shared/api-types';

// Magnus formula with the Sonntag (1990) constants.
const MAGNUS_A = 17.62;
const MAGNUS_B = 243.12;

// The pressure trend compares the latest reading with the one this many hours before it.
export const PRESSURE_TREND_HOURS = 3;
// How far from that point the older reading may be; with no reading that close there is no trend.
const PRESSURE_TREND_TOLERANCE_MS = 10 * 60_000;

// Dew point in °C from temperature (°C) and relative humidity (%).
export function dewPoint(tempC: number | null, humidityPct: number | null): number | null {
  if (tempC === null || humidityPct === null || humidityPct <= 0) {
    return null;
  }
  const gamma = Math.log(humidityPct / 100) + (MAGNUS_A * tempC) / (MAGNUS_B + tempC);
  return (MAGNUS_B * gamma) / (MAGNUS_A - gamma);
}

// How the temperature feels (°C), from temperature (°C), relative humidity (%) and wind (m/s):
// Steadman's (1994) apparent temperature, as used by the Australian Bureau of Meteorology,
// without solar radiation. One formula for every weather, so it has no jumps between a wind
// chill and a heat index. The formula expects wind at 10 m; the station's is lower.
export function feelsLike(tempC: number | null, humidityPct: number | null, windMs: number | null): number | null {
  if (tempC === null || humidityPct === null || windMs === null) {
    return null;
  }
  const vapourPressureHpa = (humidityPct / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
  return tempC + 0.33 * vapourPressureHpa - 0.7 * windMs - 4;
}

// Pressure change in hPa over the last PRESSURE_TREND_HOURS, from readings sorted by time.
// Null when there is no reading close enough to that point (the station was off).
export function pressureTrend(readings: ReadingRow[]): number | null {
  const withPressure = readings.filter((r) => r.pressure_hpa !== null);
  const latest = withPressure.at(-1);
  if (!latest) {
    return null;
  }
  const target = Temporal.Instant.from(latest.ts).subtract({ hours: PRESSURE_TREND_HOURS }).epochMilliseconds;
  let closest: ReadingRow | null = null;
  let closestDistance = Infinity;
  for (const reading of withPressure) {
    const distance = Math.abs(Temporal.Instant.from(reading.ts).epochMilliseconds - target);
    if (distance < closestDistance) {
      closest = reading;
      closestDistance = distance;
    }
  }
  if (!closest || closestDistance > PRESSURE_TREND_TOLERANCE_MS) {
    return null;
  }
  return Math.round((latest.pressure_hpa! - closest.pressure_hpa!) * 10) / 10;
}

// WMO weather interpretation codes, as listed in the Open-Meteo docs (open-meteo.com/en/docs).
const SKY_LABELS: Record<number, string> = {
  0: 'Despejado',
  1: 'Mayormente despejado',
  2: 'Parcialmente nublado',
  3: 'Cubierto',
  45: 'Niebla',
  48: 'Niebla con escarcha',
  51: 'Llovizna débil',
  53: 'Llovizna moderada',
  55: 'Llovizna intensa',
  56: 'Llovizna helada débil',
  57: 'Llovizna helada intensa',
  61: 'Lluvia débil',
  63: 'Lluvia moderada',
  65: 'Lluvia fuerte',
  66: 'Lluvia helada débil',
  67: 'Lluvia helada fuerte',
  71: 'Nevada débil',
  73: 'Nevada moderada',
  75: 'Nevada fuerte',
  77: 'Granos de nieve',
  80: 'Chubascos débiles',
  81: 'Chubascos moderados',
  82: 'Chubascos violentos',
  85: 'Chubascos de nieve débiles',
  86: 'Chubascos de nieve fuertes',
  95: 'Tormenta',
  96: 'Tormenta con granizo débil',
  97: 'Tormenta fuerte',
  99: 'Tormenta con granizo fuerte',
};

export function skyLabel(code: number): string {
  return SKY_LABELS[code] ?? 'Cielo sin datos';
}

// What the sky picture draws for a WMO code.
export type SkyKind = 'clear' | 'partly' | 'cloudy' | 'rain' | 'snow' | 'storm';

export function skyKind(code: number): SkyKind {
  if (code <= 1) {
    return 'clear';
  }
  if (code === 2) {
    return 'partly';
  }
  if (code >= 95) {
    return 'storm';
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return 'snow';
  }
  if (code >= 51) {
    return 'rain';
  }
  return 'cloudy'; // 3 overcast, 45 and 48 fog
}

// How hard it rains or snows, for the sky picture. Drizzle (51-57) is always light: its drops
// are tiny even when dense. Thunderstorms count as heavy.
export type PrecipIntensity = 'light' | 'moderate' | 'heavy';

const MODERATE_CODES = new Set([63, 73, 81]);
const HEAVY_CODES = new Set([65, 67, 75, 82, 86, 95, 96, 97, 99]);

export function precipIntensity(code: number): PrecipIntensity | null {
  const kind = skyKind(code);
  if (kind !== 'rain' && kind !== 'snow' && kind !== 'storm') {
    return null;
  }
  if (HEAVY_CODES.has(code)) {
    return 'heavy';
  }
  return MODERATE_CODES.has(code) ? 'moderate' : 'light';
}

const SKY_KIND_LABELS: Record<SkyKind, string> = {
  clear: 'Despejado',
  partly: 'Poco nuboso',
  cloudy: 'Nublado',
  rain: 'Lluvia',
  snow: 'Nieve',
  storm: 'Tormenta',
};

// One word for the forecast cards, above the exact label.
export function skyKindLabel(kind: SkyKind): string {
  return SKY_KIND_LABELS[kind];
}

// WHO UV index categories.
export function uvCategory(uvIndex: number): string {
  const uv = Math.round(uvIndex);
  if (uv <= 2) {
    return 'bajo';
  }
  if (uv <= 5) {
    return 'moderado';
  }
  if (uv <= 7) {
    return 'alto';
  }
  return uv <= 10 ? 'muy alto' : 'extremo';
}

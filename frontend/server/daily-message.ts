// The text of the 9:00 notification, from today's hourly forecast and the corrected high and
// low. Pure, so every rule is unit-tested. The format is in section 4 of
// docs/superpowers/specs/2026-10-21-daily-forecast-push-design.md.
import { Temporal } from 'temporal-polyfill';
import type { Extreme, TodayRange } from './daily-temperature.js';
import type { TodayHour } from './open-meteo.js';
import { TIME_ZONE } from './params.js';

export const SEND_HOUR = 9;

export interface DailyMessage {
  title: string;
  body: string;
}

export interface DailyInput {
  stationName: string;
  today: Temporal.PlainDate;
  hours: TodayHour[]; // today, 0-23 h
  range: TodayRange;
}

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'showers' | 'rain' | 'snow' | 'storm';

// Least to most severe.
const SEVERITY: Sky[] = ['clear', 'partly', 'cloudy', 'fog', 'showers', 'rain', 'snow', 'storm'];

const SKY_TEXT: Record<Sky, string> = {
  clear: 'soleado', partly: 'poco nuboso', cloudy: 'nuboso', fog: 'niebla',
  showers: 'chubascos', rain: 'lluvia', snow: 'nieve', storm: 'tormenta',
};

const SKY_EMOJI: Record<Sky, string> = {
  clear: '☀️', partly: '🌤️', cloudy: '☁️', fog: '🌫️', showers: '🌦️', rain: '🌧️', snow: '🌨️', storm: '⛈️',
};

interface Period {
  from: number; // first hour
  to: number; // hour after the last
  label: string;
}

const MORNING: Period = { from: 9, to: 14, label: 'por la mañana' };
const AFTERNOON: Period = { from: 14, to: 20, label: 'por la tarde' };
const NIGHT: Period = { from: 20, to: 24, label: 'por la noche' };
const PERIODS = [MORNING, AFTERNOON, NIGHT];

const DIRECTIONS = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function isSendHour(now: Temporal.Instant): boolean {
  return now.toZonedDateTimeISO(TIME_ZONE).hour === SEND_HOUR;
}

export function skyOf(code: number): Sky {
  if (code >= 95) {
    return 'storm';
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return 'snow';
  }
  if (code >= 80 && code <= 82) {
    return 'showers';
  }
  if (code >= 51 && code <= 67) {
    return 'rain';
  }
  if (code === 45 || code === 48) {
    return 'fog';
  }
  if (code === 3) {
    return 'cloudy';
  }
  return code === 2 ? 'partly' : 'clear';
}

function restOfDay(hours: TodayHour[]): TodayHour[] {
  return hours.filter((h) => h.hour >= SEND_HOUR);
}

function inPeriod(hours: TodayHour[], period: Period): TodayHour[] {
  return hours.filter((h) => h.hour >= period.from && h.hour < period.to);
}

function mostSevere(skies: Sky[]): Sky {
  return skies.reduce((a, b) => (SEVERITY.indexOf(b) > SEVERITY.indexOf(a) ? b : a));
}

// The sky most hours of a period have; a tie goes to the more severe one.
function dominantSky(hours: TodayHour[]): Sky {
  const counts = new Map<Sky, number>();
  for (const h of hours) {
    const sky = skyOf(h.weatherCode);
    counts.set(sky, (counts.get(sky) ?? 0) + 1);
  }
  const top = Math.max(...counts.values());
  return mostSevere([...counts].filter(([, n]) => n === top).map(([sky]) => sky));
}

function periodSkies(hours: TodayHour[]): { period: Period; sky: Sky }[] {
  return PERIODS
    .map((period) => ({ period, list: inPeriod(hours, period) }))
    .filter(({ list }) => list.length > 0)
    .map(({ period, list }) => ({ period, sky: dominantSky(list) }));
}

function skyWords(sky: Sky, night: boolean): { emoji: string; text: string } {
  return sky === 'clear' && night ? { emoji: '🌙', text: 'despejado' } : { emoji: SKY_EMOJI[sky], text: SKY_TEXT[sky] };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// "a", "a y b", "a, b y c".
function joinSpanish(parts: string[]): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`;
}

export function skyLine(hours: TodayHour[]): string {
  const periods = periodSkies(hours);
  if (periods.every((p) => p.sky === periods[0].sky)) {
    const { emoji, text } = skyWords(periods[0].sky, false);
    return `${emoji} ${capitalize(text)} todo el día.`;
  }
  const parts = periods.map(({ period, sky }, i) => {
    const { emoji, text } = skyWords(sky, period === NIGHT);
    return `${emoji} ${i === 0 ? capitalize(text) : text} ${period.label}`;
  });
  return `${joinSpanish(parts)}.`;
}

// A guess from the sea-level pressure from 9 to 23 h, not an official analysis.
export function pressureSituation(hours: TodayHour[]): string | null {
  const rest = restOfDay(hours);
  const first = rest[0];
  const last = rest.at(-1);
  if (!first || !last) {
    return null;
  }
  const mean = rest.reduce((total, h) => total + h.pressureHpa, 0) / rest.length;
  const change = last.pressureHpa - first.pressureHpa;
  if (mean >= 1020 && Math.abs(change) < 3) {
    return 'Anticiclón, tiempo estable.';
  }
  if (change <= -5 || mean <= 1005) {
    return 'Se acerca una borrasca, la presión baja.';
  }
  return null;
}

// Rounded like the temperature line, so a "0 °C" low also warns of frost.
const degrees = (tempC: number) => Math.round(tempC) + 0; // + 0 turns -0 into 0

export function warnings(hours: TodayHour[], range: TodayRange): string[] {
  const list: string[] = [];
  const rest = restOfDay(hours);
  const stormy = PERIODS.filter((period) => inPeriod(rest, period).some((h) => skyOf(h.weatherCode) === 'storm'));
  if (stormy.length === 1) {
    list.push(`⚠️ Ojo: tormentas ${stormy[0].label}.`);
  } else if (stormy.length > 1) {
    list.push('⚠️ Ojo: tormentas a lo largo del día.');
  }
  if (degrees(range.min.tempC) <= 0) {
    list.push('⚠️ Helada al amanecer.');
  }
  if (degrees(range.max.tempC) >= 35) {
    list.push('⚠️ Calor intenso.');
  }
  if (rest.some((h) => (h.hour === 9 || h.hour === 10) && skyOf(h.weatherCode) === 'fog')) {
    list.push('⚠️ Niebla por la mañana.');
  }
  return list;
}

const extreme = ({ tempC, hour }: Extreme) => `${degrees(tempC)} °C (${hour} h)`;

export function temperatureLine(range: TodayRange): string {
  return `🌡️ Entre ${extreme(range.min)} y ${extreme(range.max)}.`;
}

export function rainLine(hours: TodayHour[]): string {
  const rest = restOfDay(hours);
  const chance = (h: TodayHour) => h.precipProbabilityPct ?? 0;
  const top = Math.max(0, ...rest.map(chance));
  if (top < 20) {
    return `☂️ Sin lluvia (${top} %).`;
  }
  const likely = rest.filter((h) => chance(h) >= 30);
  const when = likely.length > 0 ? ` de ${likely[0].hour} a ${likely.at(-1)!.hour + 1} h` : '';
  const mm = rest.reduce((total, h) => total + (h.precipMm ?? 0), 0);
  const amount = mm < 1 ? 'menos de 1 mm' : `unos ${Math.round(mm)} mm`;
  return `💧 ${top >= 50 ? 'Lluvia' : 'Posible lluvia'} (${top} %)${when}, ${amount}.`;
}

// AEMET terms by the top mean speed.
function windTerm(kmh: number): string {
  return kmh <= 20 ? 'flojo' : kmh <= 40 ? 'moderado' : kmh <= 70 ? 'fuerte' : 'muy fuerte';
}

export function windLine(hours: TodayHour[]): string {
  const rest = restOfDay(hours);
  const strongest = rest.reduce((a, b) => (b.windKmh > a.windKmh ? b : a));
  const speed = Math.round(strongest.windKmh);
  const from = DIRECTIONS[Math.round(strongest.windDirDeg / 45) % 8];
  const gusty = rest.filter((h): h is TodayHour & { gustKmh: number } => h.gustKmh !== null);
  const gust = gusty.length > 0 ? gusty.reduce((a, b) => (b.gustKmh > a.gustKmh ? b : a)) : null;
  const term = windTerm(speed);
  if (!gust || Math.round(gust.gustKmh) < 20) {
    return `💨 Viento ${term}, hasta ${speed} km/h del ${from}.`;
  }
  return `💨 Viento ${term}, ${speed} km/h del ${from}, con rachas de ${Math.round(gust.gustKmh)} km/h hacia las ${gust.hour} h.`;
}

// The emoji of the most severe period sky, the station and the day: "🌦️ Madrid, Las Rozas · jueves 22".
export function title(stationName: string, today: Temporal.PlainDate, hours: TodayHour[]): string {
  const sky = mostSevere(periodSkies(hours).map((p) => p.sky));
  return `${SKY_EMOJI[sky]} ${stationName} · ${WEEKDAYS[today.dayOfWeek - 1]} ${today.day}`;
}

export function buildDailyMessage({ stationName, today, hours, range }: DailyInput): DailyMessage {
  const first = [skyLine(hours), pressureSituation(hours), ...warnings(hours, range)].filter((part) => part !== null).join(' ');
  return {
    title: title(stationName, today, hours),
    body: [first, temperatureLine(range), rainLine(hours), windLine(hours)].join('\n'),
  };
}

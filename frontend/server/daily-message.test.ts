import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import {
  buildDailyMessage, isSendHour, pressureSituation, rainLine, skyLine, skyOf, temperatureLine, title, warnings, windLine,
} from './daily-message';
import type { TodayRange } from './daily-temperature';
import type { TodayHour } from './open-meteo';

function hour(h: number, values: Partial<TodayHour> = {}): TodayHour {
  return {
    hour: h, tempC: 12, weatherCode: 0, isDay: true, pressureHpa: 1015, windKmh: 10, windDirDeg: 0,
    gustKmh: 10, precipMm: 0, precipProbabilityPct: 0, ...values,
  };
}

// A whole day where `change(h)` sets each hour's values.
const day = (change: (h: number) => Partial<TodayHour> = () => ({})) => Array.from({ length: 24 }, (_, h) => hour(h, change(h)));
const range = (min: number, max: number): TodayRange => ({ min: { tempC: min, hour: 7 }, max: { tempC: max, hour: 16 } });

describe('isSendHour', () => {
  it('is 9 in Madrid, summer or winter', () => {
    expect(isSendHour(Temporal.Instant.from('2026-10-22T07:05:00Z'))).toBe(true); // UTC+2
    expect(isSendHour(Temporal.Instant.from('2026-10-22T08:05:00Z'))).toBe(false);
    expect(isSendHour(Temporal.Instant.from('2026-12-10T07:05:00Z'))).toBe(false); // UTC+1
    expect(isSendHour(Temporal.Instant.from('2026-12-10T08:05:00Z'))).toBe(true);
  });
});

describe('skyOf', () => {
  it('groups the WMO codes', () => {
    expect([0, 1, 2, 3, 45, 48, 51, 61, 67, 71, 77, 80, 82, 85, 86, 95, 99].map(skyOf)).toEqual([
      'clear', 'clear', 'partly', 'cloudy', 'fog', 'fog', 'rain', 'rain', 'rain', 'snow', 'snow',
      'showers', 'showers', 'snow', 'snow', 'storm', 'storm',
    ]);
  });
});

describe('skyLine', () => {
  it('says it once when the whole day is the same', () => {
    expect(skyLine(day())).toBe('☀️ Soleado todo el día.');
  });
  it('names each period with its emoji, the moon for a clear night', () => {
    const hours = day((h) => ({ weatherCode: h >= 14 && h < 20 ? 80 : 0 }));
    expect(skyLine(hours)).toBe('☀️ Soleado por la mañana, 🌦️ chubascos por la tarde y 🌙 despejado por la noche.');
  });
  it('breaks a tie in favour of the more severe sky', () => {
    // Morning 9-13: two cloudy hours, two rainy ones, one clear.
    const codes: Record<number, number> = { 9: 3, 10: 3, 11: 61, 12: 61 };
    expect(skyLine(day((h) => ({ weatherCode: codes[h] ?? 0 })))).toBe(
      '🌧️ Lluvia por la mañana, ☀️ soleado por la tarde y 🌙 despejado por la noche.',
    );
  });
  it('ignores the hours before 9', () => {
    expect(skyLine(day((h) => ({ weatherCode: h < 9 ? 95 : 0 })))).toBe('☀️ Soleado todo el día.');
  });
});

describe('pressureSituation', () => {
  it('sees a high when the pressure is high and steady', () => {
    expect(pressureSituation(day(() => ({ pressureHpa: 1022 })))).toBe('Anticiclón, tiempo estable.');
  });
  it('sees a low when the pressure falls 5 hPa or is low', () => {
    expect(pressureSituation(day((h) => ({ pressureHpa: h === 23 ? 1006 : h === 9 ? 1012 : 1009 })))).toBe(
      'Se acerca una borrasca, la presión baja.',
    );
    expect(pressureSituation(day(() => ({ pressureHpa: 1004 })))).toBe('Se acerca una borrasca, la presión baja.');
  });
  it('says nothing otherwise', () => {
    expect(pressureSituation(day())).toBeNull();
  });
});

describe('warnings', () => {
  it('warns of storms in one period or across the day', () => {
    expect(warnings(day((h) => ({ weatherCode: h === 17 ? 95 : 0 })), range(5, 20))).toEqual(['⚠️ Ojo: tormentas por la tarde.']);
    expect(warnings(day((h) => ({ weatherCode: h === 10 || h === 21 ? 95 : 0 })), range(5, 20))).toEqual([
      '⚠️ Ojo: tormentas a lo largo del día.',
    ]);
  });
  it('warns of frost when the rounded low is 0 or less, heat at 35, and morning fog', () => {
    expect(warnings(day((h) => ({ weatherCode: h === 10 ? 45 : 0 })), range(-0.4, 35))).toEqual([
      '⚠️ Helada al amanecer.', '⚠️ Calor intenso.', '⚠️ Niebla por la mañana.',
    ]);
    expect(warnings(day(), range(0.5, 34.4))).toEqual([]);
  });
});

describe('temperatureLine', () => {
  it('rounds to whole degrees, never writing -0', () => {
    expect(temperatureLine(range(-0.4, 20.6))).toBe('🌡️ Entre 0 °C (7 h) y 21 °C (16 h).');
  });
});

describe('rainLine', () => {
  it('says no rain under 20 %, with the chance', () => {
    expect(rainLine(day((h) => ({ precipProbabilityPct: h === 12 ? 10 : 0 })))).toBe('☂️ Sin lluvia (10 %).');
  });
  it('treats a missing chance as 0 and ignores the hours before 9', () => {
    expect(rainLine(day((h) => ({ precipProbabilityPct: h === 7 ? 80 : null })))).toBe('☂️ Sin lluvia (0 %).');
  });
  it('gives the chance, the hours with 30 % or more and the amount', () => {
    const possible = day((h) => (h >= 16 && h <= 18 ? { precipProbabilityPct: 40, precipMm: 0.2 } : {}));
    expect(rainLine(possible)).toBe('💧 Posible lluvia (40 %) de 16 a 19 h, menos de 1 mm.');
    const rain = day((h) => (h >= 15 && h <= 19 ? { precipProbabilityPct: 70, precipMm: 0.8 } : {}));
    expect(rainLine(rain)).toBe('💧 Lluvia (70 %) de 15 a 20 h, unos 4 mm.');
  });
  it('leaves out the hours when none reaches 30 %', () => {
    expect(rainLine(day((h) => ({ precipProbabilityPct: h === 12 ? 25 : 0 })))).toBe('💧 Posible lluvia (25 %), menos de 1 mm.');
  });
});

describe('windLine', () => {
  it('gives the top speed and direction when gusts stay under 20 km/h', () => {
    expect(windLine(day((h) => (h === 12 ? { windKmh: 12, gustKmh: 15 } : {})))).toBe('💨 Viento flojo, hasta 12 km/h del norte.');
  });
  it('adds the top gust and its hour', () => {
    const hours = day((h) => ({ ...(h === 15 ? { windKmh: 25, windDirDeg: 270 } : {}), ...(h === 17 ? { gustKmh: 45 } : {}) }));
    expect(windLine(hours)).toBe('💨 Viento moderado, 25 km/h del oeste, con rachas de 45 km/h hacia las 17 h.');
  });
  it('uses the AEMET terms and 8 directions', () => {
    expect(windLine(day((h) => (h === 12 ? { windKmh: 50, windDirDeg: 225, gustKmh: 80 } : {})))).toMatch(/^💨 Viento fuerte, 50 km\/h del suroeste,/);
    expect(windLine(day((h) => (h === 12 ? { windKmh: 75, windDirDeg: 350, gustKmh: 100 } : {})))).toMatch(/^💨 Viento muy fuerte, 75 km\/h del norte,/);
  });
});

describe('title', () => {
  it('has the most severe sky of the day, the station and the day', () => {
    const hours = day((h) => ({ weatherCode: h >= 14 && h < 20 ? 80 : 0 }));
    expect(title('Madrid, Las Rozas', Temporal.PlainDate.from('2026-10-22'), hours)).toBe('🌦️ Madrid, Las Rozas · jueves 22');
  });
});

describe('buildDailyMessage', () => {
  it('writes the title and four lines', () => {
    const hours = day((h) => ({
      weatherCode: h >= 14 && h < 20 ? 80 : 0,
      pressureHpa: h === 9 ? 1012 : h === 23 ? 1006 : 1009,
      ...(h >= 15 && h <= 19 ? { precipProbabilityPct: 70, precipMm: 0.8 } : {}),
      ...(h === 15 ? { windKmh: 25, windDirDeg: 270 } : {}),
      ...(h === 17 ? { gustKmh: 45 } : {}),
    }));
    const message = buildDailyMessage({
      stationName: 'Madrid, Las Rozas',
      today: Temporal.PlainDate.from('2026-10-22'),
      hours,
      range: { min: { tempC: 9.2, hour: 7 }, max: { tempC: 20.8, hour: 16 } },
    });
    expect(message).toEqual({
      title: '🌦️ Madrid, Las Rozas · jueves 22',
      body: [
        '☀️ Soleado por la mañana, 🌦️ chubascos por la tarde y 🌙 despejado por la noche. Se acerca una borrasca, la presión baja.',
        '🌡️ Entre 9 °C (7 h) y 21 °C (16 h).',
        '💧 Lluvia (70 %) de 15 a 20 h, unos 4 mm.',
        '💨 Viento moderado, 25 km/h del oeste, con rachas de 45 km/h hacia las 17 h.',
      ].join('\n'),
    });
  });
});

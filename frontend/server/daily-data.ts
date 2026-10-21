// Everything the 9:00 message needs, read from Supabase and Open-Meteo, for the default station.
import { Temporal } from 'temporal-polyfill';
import { buildDailyMessage, type DailyMessage } from './daily-message.js';
import {
  measuredYesterdayMax, nightMinimum, temperatureCorrection, todayRange, type StationDay,
} from './daily-temperature.js';
import { fetchToday, fetchYesterdayForecastMax } from './open-meteo.js';
import { TIME_ZONE, localMidnight, localToday } from './params.js';
import { stationCoordinates } from './station-choice.js';
import { db, defaultStation, listedStations } from './supabase.js';

export interface DailyResult {
  message: DailyMessage;
  // For ?mode=preview: what the correction was built from. Never the coordinates.
  details: { station: StationDay; yesterdayForecastMax: number | null; correction: number };
}

function check(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

// Station readings for today and yesterday. Missing data gives nulls: the message then uses
// Open-Meteo alone.
async function readStationDay(deviceId: string, today: Temporal.PlainDate): Promise<StationDay> {
  const midnight = localMidnight(today);
  const nine = today.toZonedDateTime({ timeZone: TIME_ZONE, plainTime: Temporal.PlainTime.from('09:00') }).toInstant();
  const [night, at9, yesterday] = await Promise.all([
    // At most 540 rows: one page.
    db().from('readings').select('ts, temp_c').eq('device_id', deviceId)
      .gte('ts', midnight.toString()).lt('ts', nine.toString()).order('ts'),
    db().from('readings').select('temp_c').eq('device_id', deviceId)
      .gte('ts', nine.toString()).lt('ts', nine.add({ minutes: 5 }).toString())
      .not('temp_c', 'is', null).order('ts').limit(1),
    db().from('readings_daily').select('temp_max, samples').eq('device_id', deviceId)
      .eq('day', today.subtract({ days: 1 }).toString()).maybeSingle(),
  ]);
  check(night.error);
  check(at9.error);
  check(yesterday.error);
  return {
    temp9: at9.data?.[0]?.temp_c ?? null,
    nightMin: nightMinimum(night.data ?? []),
    yesterdayMax: measuredYesterdayMax(yesterday.data),
  };
}

export async function dailyMessage(now: Temporal.Instant): Promise<DailyResult> {
  const stations = await listedStations();
  const deviceId = defaultStation(stations);
  const station = stations.find((s) => s.id === deviceId);
  if (!deviceId || !station) {
    throw new Error('no listed station');
  }
  const coordinates = stationCoordinates(process.env.STATION_COORDINATES, deviceId);
  if (!coordinates) {
    throw new Error('no coordinates for the default station');
  }
  const today = localToday(now);
  const [hours, yesterdayForecastMax, stationDay] = await Promise.all([
    fetchToday(coordinates, today),
    fetchYesterdayForecastMax(coordinates, today.subtract({ days: 1 })),
    readStationDay(deviceId, today),
  ]);
  const correction = temperatureCorrection(stationDay, hours, yesterdayForecastMax);
  const range = todayRange(hours, stationDay, correction);
  return {
    message: buildDailyMessage({ stationName: station.name, today, hours, range }),
    details: { station: stationDay, yesterdayForecastMax, correction },
  };
}

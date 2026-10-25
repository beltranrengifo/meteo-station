// GET /api/day?date=YYYY-MM-DD: every one-minute reading of that local (Madrid) day,
// plus the day's summary.
import { Temporal } from 'temporal-polyfill';
import type { DayResponse, ReadingRow } from '../../shared/api-types.js';
import { badRequest, json, notFound, serverError } from '../http.js';
import { cachePolicy, localMidnight, parseDay, rejectUnexpectedParams } from '../params.js';
import { READING_COLUMNS, db, fetchAll, requestStation } from '../supabase.js';

export async function getDay(url: URL): Promise<Response> {
  const invalid = rejectUnexpectedParams(url, ['date']);
  if (invalid) {
    return badRequest(invalid);
  }

  try {
    const station = await requestStation(url);
    if (!station.ok) {
      return notFound(station.error);
    }
    const { deviceId, installDay } = station.value;
    const now = Temporal.Now.instant();
    const date = parseDay(url.searchParams.get('date')!, now, installDay);
    if (!date.ok) {
      return badRequest(date.error);
    }
    const day = date.value;
    const from = localMidnight(day).toString();
    const to = localMidnight(day.add({ days: 1 })).toString();

    const [readings, summary] = await Promise.all([
      fetchAll((first, last) =>
        db().from('readings').select(READING_COLUMNS).eq('device_id', deviceId)
          .gte('ts', from).lt('ts', to).order('ts').range(first, last)
          .overrideTypes<ReadingRow[], { merge: false }>(),
      ),
      db().from('readings_daily').select('*').eq('device_id', deviceId).eq('day', day.toString()).maybeSingle(),
    ]);
    if (summary.error) {
      throw new Error(summary.error.message);
    }

    return json<DayResponse>({ date: day.toString(), summary: summary.data, readings }, cachePolicy(day, now));
  } catch (error) {
    return serverError(error);
  }
}

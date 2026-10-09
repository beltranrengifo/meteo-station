// GET /api/day?date=YYYY-MM-DD: every one-minute reading of that local (Madrid) day,
// plus the day's summary.
import { Temporal } from 'temporal-polyfill';
import { badRequest, json, serverError } from '../server/http.js';
import { cacheSeconds, localMidnight, parseDay, rejectUnexpectedParams } from '../server/params.js';
import { READING_COLUMNS, fetchAll, station } from '../server/supabase.js';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const invalid = rejectUnexpectedParams(url, ['date']);
  if (invalid) {
    return badRequest(invalid);
  }

  try {
    const { db, deviceId, installDay } = station();
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
        db.from('readings').select(READING_COLUMNS).eq('device_id', deviceId)
          .gte('ts', from).lt('ts', to).order('ts').range(first, last),
      ),
      db.from('readings_daily').select('*').eq('device_id', deviceId).eq('day', day.toString()).maybeSingle(),
    ]);
    if (summary.error) {
      throw new Error(summary.error.message);
    }

    return json({ date: day.toString(), summary: summary.data, readings }, cacheSeconds(day, now));
  } catch (error) {
    return serverError(error);
  }
}

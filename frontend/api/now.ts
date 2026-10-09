// GET /api/now: the latest reading and today's summary so far (min/max, rain since midnight).
// The summary comes from the aggregates, which the database refreshes every 10 minutes.
import { Temporal } from 'temporal-polyfill';
import { badRequest, json, serverError } from '../server/http.js';
import { cacheSeconds, localToday, rejectUnexpectedParams } from '../server/params.js';
import { READING_COLUMNS, station } from '../server/supabase.js';

export async function GET(request: Request): Promise<Response> {
  const invalid = rejectUnexpectedParams(new URL(request.url), []);
  if (invalid) {
    return badRequest(invalid);
  }

  try {
    const { db, deviceId } = station();
    const now = Temporal.Now.instant();
    const today = localToday(now);

    const [latest, summary] = await Promise.all([
      db.from('readings').select(READING_COLUMNS).eq('device_id', deviceId)
        .order('ts', { ascending: false }).limit(1).maybeSingle(),
      db.from('readings_daily').select('*').eq('device_id', deviceId).eq('day', today.toString()).maybeSingle(),
    ]);
    if (latest.error || summary.error) {
      throw new Error((latest.error ?? summary.error)?.message);
    }

    return json({ reading: latest.data, today: summary.data }, cacheSeconds(today, now));
  } catch (error) {
    return serverError(error);
  }
}

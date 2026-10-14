// GET /api/now: the latest reading, today's summary so far (min/max, rain since midnight) and
// the install day, so the dashboard does not offer dates before it.
// The summary comes from the aggregates, which the database refreshes every 10 minutes.
import { Temporal } from 'temporal-polyfill';
import type { NowResponse, ReadingRow } from '../shared/api-types.js';
import { badRequest, json, serverError } from '../server/http.js';
import { cachePolicy, localToday, rejectUnexpectedParams } from '../server/params.js';
import { READING_COLUMNS, station } from '../server/supabase.js';

export async function GET(request: Request): Promise<Response> {
  const invalid = rejectUnexpectedParams(new URL(request.url), []);
  if (invalid) {
    return badRequest(invalid);
  }

  try {
    const { db, deviceId, installDay } = station();
    const now = Temporal.Now.instant();
    const today = localToday(now);

    const [latest, summary] = await Promise.all([
      db.from('readings').select(READING_COLUMNS).eq('device_id', deviceId)
        .order('ts', { ascending: false }).limit(1).maybeSingle<ReadingRow>(),
      db.from('readings_daily').select('*').eq('device_id', deviceId).eq('day', today.toString()).maybeSingle(),
    ]);
    if (latest.error || summary.error) {
      throw new Error((latest.error ?? summary.error)?.message);
    }

    return json<NowResponse>(
      { reading: latest.data, today: summary.data, installDate: installDay.toString() },
      cachePolicy(today, now),
    );
  } catch (error) {
    return serverError(error);
  }
}

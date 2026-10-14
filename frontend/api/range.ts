// GET /api/range?from=&to=: a custom range picked on the dashboard. Short ranges come as
// one-minute readings, long ones as hourly stats computed live (hourly_stats), so the current
// hour is exact. Limits and resolution live in server/params.ts.
import { Temporal } from 'temporal-polyfill';
import type { RangeResponse, ReadingRow } from '../shared/api-types.js';
import { badRequest, json, serverError } from '../server/http.js';
import { cachePolicy, localToday, parseRange, rangeResolution, rejectUnexpectedParams } from '../server/params.js';
import { READING_COLUMNS, fetchAll, station } from '../server/supabase.js';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const invalid = rejectUnexpectedParams(url, ['from', 'to']);
  if (invalid) {
    return badRequest(invalid);
  }

  try {
    const { db, deviceId, installDay } = station();
    const now = Temporal.Now.instant();
    const range = parseRange(url.searchParams.get('from')!, url.searchParams.get('to')!, now, installDay);
    if (!range.ok) {
      return badRequest(range.error);
    }
    const from = range.value.from.toString();
    const to = range.value.to.toString();
    const cache = cachePolicy(localToday(range.value.to), now);

    if (rangeResolution(range.value) === 'minute') {
      const readings = await fetchAll((first, last) =>
        db.from('readings').select(READING_COLUMNS).eq('device_id', deviceId)
          .gte('ts', from).lt('ts', to).order('ts').range(first, last)
          .overrideTypes<ReadingRow[], { merge: false }>(),
      );
      return json<RangeResponse>({ from, to, resolution: 'minute', readings }, cache);
    }

    // At most 31 x 24 + 1 rows: one page is enough.
    const { data, error } = await db.rpc('hourly_stats', { p_device_id: deviceId, p_from: from, p_to: to });
    if (error) {
      throw new Error(error.message);
    }
    return json<RangeResponse>({ from, to, resolution: 'hour', hours: data }, cache);
  } catch (error) {
    return serverError(error);
  }
}

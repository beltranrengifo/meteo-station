// GET /api/last-7-days: hourly stats from 00:00 Madrid time six days ago until now.
// Computed from the readings on each request (hourly_stats), so the current hour is exact;
// the stored aggregates can be up to 10 minutes behind.
import { Temporal } from 'temporal-polyfill';
import type { Last7DaysResponse } from '../../shared/api-types.js';
import { badRequest, json, notFound, serverError } from '../http.js';
import { cachePolicy, last7DaysStart, localToday, rejectUnexpectedParams } from '../params.js';
import { db, requestStation } from '../supabase.js';

export async function getLast7Days(url: URL): Promise<Response> {
  const invalid = rejectUnexpectedParams(url, []);
  if (invalid) {
    return badRequest(invalid);
  }

  try {
    const station = await requestStation(url);
    if (!station.ok) {
      return notFound(station.error);
    }
    const { deviceId } = station.value;
    const now = Temporal.Now.instant();
    const from = last7DaysStart(now).toString();
    const to = now.toString();

    // At most 7 x 24 + 1 rows (one extra hour on the day summer time ends): one page is enough.
    const { data, error } = await db().rpc('hourly_stats', { p_device_id: deviceId, p_from: from, p_to: to });
    if (error) {
      throw new Error(error.message);
    }

    return json<Last7DaysResponse>({ from, to, hours: data }, cachePolicy(localToday(now), now));
  } catch (error) {
    return serverError(error);
  }
}

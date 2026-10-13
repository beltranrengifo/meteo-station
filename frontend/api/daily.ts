// GET /api/daily: one summary row per local day since the station was installed (~365 a year).
import type { DailyResponse } from '../shared/api-types.js';
import { badRequest, json, serverError } from '../server/http.js';
import { rejectUnexpectedParams } from '../server/params.js';
import { fetchAll, station } from '../server/supabase.js';

// Today's row changes with every aggregate refresh (10 min), so the whole list does too.
const CACHE = { sMaxAge: 600, staleWhileRevalidate: 600 };

export async function GET(request: Request): Promise<Response> {
  const invalid = rejectUnexpectedParams(new URL(request.url), []);
  if (invalid) {
    return badRequest(invalid);
  }

  try {
    const { db, deviceId } = station();
    const days = await fetchAll((from, to) =>
      db.from('readings_daily').select('*').eq('device_id', deviceId).order('day').range(from, to),
    );
    return json<DailyResponse>({ days }, CACHE);
  } catch (error) {
    return serverError(error);
  }
}

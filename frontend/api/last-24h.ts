// GET /api/last-24h: every one-minute reading of the last 24 hours, crossing midnight.
import { Temporal } from 'temporal-polyfill';
import type { Last24hResponse, ReadingRow } from '../shared/api-types.js';
import { badRequest, json, serverError } from '../server/http.js';
import { cachePolicy, last24hStart, localToday, rejectUnexpectedParams } from '../server/params.js';
import { READING_COLUMNS, fetchAll, station } from '../server/supabase.js';

export async function GET(request: Request): Promise<Response> {
  const invalid = rejectUnexpectedParams(new URL(request.url), []);
  if (invalid) {
    return badRequest(invalid);
  }

  try {
    const { db, deviceId } = station();
    const now = Temporal.Now.instant();
    const from = last24hStart(now).toString();
    const to = now.toString();

    // Each reading's ts is the end of its minute: (from, to] holds exactly 24 h of minutes.
    const readings = await fetchAll((first, last) =>
      db.from('readings').select(READING_COLUMNS).eq('device_id', deviceId)
        .gt('ts', from).lte('ts', to).order('ts').range(first, last)
        .overrideTypes<ReadingRow[], { merge: false }>(),
    );

    return json<Last24hResponse>({ from, to, readings }, cachePolicy(localToday(now), now));
  } catch (error) {
    return serverError(error);
  }
}

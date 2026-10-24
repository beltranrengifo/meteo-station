// GET /api/last-24h: every one-minute reading of the last 24 hours, crossing midnight.
import { Temporal } from 'temporal-polyfill';
import type { Last24hResponse, ReadingRow } from '../../shared/api-types.js';
import { badRequest, json, notFound, serverError } from '../http.js';
import { cachePolicy, last24hStart, localToday, rejectUnexpectedParams } from '../params.js';
import { READING_COLUMNS, db, fetchAll, requestStation } from '../supabase.js';

export async function getLast24h(url: URL): Promise<Response> {
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
    const from = last24hStart(now).toString();
    const to = now.toString();

    // Each reading's ts is the end of its minute: (from, to] holds exactly 24 h of minutes.
    const readings = await fetchAll((first, last) =>
      db().from('readings').select(READING_COLUMNS).eq('device_id', deviceId)
        .gt('ts', from).lte('ts', to).order('ts').range(first, last)
        .overrideTypes<ReadingRow[], { merge: false }>(),
    );

    return json<Last24hResponse>({ from, to, readings }, cachePolicy(localToday(now), now));
  } catch (error) {
    return serverError(error);
  }
}

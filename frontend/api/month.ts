// GET /api/month?month=YYYY-MM: hourly and daily aggregates of that local (Madrid) month.
import { Temporal } from 'temporal-polyfill';
import { badRequest, json, serverError } from '../server/http.js';
import { cacheSeconds, localMidnight, parseMonth, rejectUnexpectedParams } from '../server/params.js';
import { fetchAll, station } from '../server/supabase.js';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const invalid = rejectUnexpectedParams(url, ['month']);
  if (invalid) {
    return badRequest(invalid);
  }

  try {
    const { db, deviceId, installDay } = station();
    const now = Temporal.Now.instant();
    const parsed = parseMonth(url.searchParams.get('month')!, now, installDay);
    if (!parsed.ok) {
      return badRequest(parsed.error);
    }
    const month = parsed.value;
    const first = month.toPlainDate({ day: 1 });
    const next = month.add({ months: 1 }).toPlainDate({ day: 1 });
    const last = month.toPlainDate({ day: month.daysInMonth });

    const [hours, days] = await Promise.all([
      fetchAll((from, to) =>
        db.from('readings_hourly').select('*').eq('device_id', deviceId)
          .gte('hour', localMidnight(first).toString()).lt('hour', localMidnight(next).toString())
          .order('hour').range(from, to),
      ),
      fetchAll((from, to) =>
        db.from('readings_daily').select('*').eq('device_id', deviceId)
          .gte('day', first.toString()).lt('day', next.toString()).order('day').range(from, to),
      ),
    ]);

    // The month's last day decides how long it can be cached (today if the month is not over).
    return json({ month: month.toString(), days, hours }, cacheSeconds(last, now));
  } catch (error) {
    return serverError(error);
  }
}

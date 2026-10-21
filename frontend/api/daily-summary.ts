// GET /api/daily-summary: today's 9:00 notification as it was sent, for the "El aviso de hoy"
// card. Only the default station gets the notification, so there is no ?station=.
import { Temporal } from 'temporal-polyfill';
import type { DailySummaryResponse } from '../shared/api-types.js';
import { badRequest, json, notFound, serverError } from '../server/http.js';
import { localToday, rejectUnexpectedParams } from '../server/params.js';
import { dailyMessageOf } from '../server/push-store.js';

// A test send or the 9:05 one shows up within a minute.
const CACHE = { sMaxAge: 60, staleWhileRevalidate: 60 };

export async function GET(request: Request): Promise<Response> {
  const invalid = rejectUnexpectedParams(new URL(request.url), [], []);
  if (invalid) {
    return badRequest(invalid);
  }
  try {
    const today = localToday(Temporal.Now.instant());
    const message = await dailyMessageOf(today);
    if (!message) {
      return notFound('no summary today');
    }
    return json<DailySummaryResponse>({ day: today.toString(), title: message.title, body: message.body, sentAt: message.sent_at }, CACHE);
  } catch (error) {
    return serverError(error);
  }
}

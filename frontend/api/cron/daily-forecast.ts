// POST /api/cron/daily-forecast: the 9:00 notification. pg_cron in Supabase calls it at 07:05
// and 08:05 UTC (one of them is 9:05 in Madrid) with Authorization: Bearer CRON_SECRET.
// ?mode=preview returns the message without sending. ?mode=send-now sends at once, without the
// 9:00 check or the once-a-day claim: for testing while the owner is the only subscriber.
import { Temporal } from 'temporal-polyfill';
import { dailyMessage, type DailyResult } from '../../server/daily-data.js';
import { isSendHour } from '../../server/daily-message.js';
import { noStore, serverError } from '../../server/http.js';
import { localToday } from '../../server/params.js';
import { sendToAll, vapidDetails, type VapidDetails } from '../../server/push-sender.js';
import {
  allSubscriptions, claimDay, deleteSubscriptions, markSent, recordRun, saveDailyMessage,
} from '../../server/push-store.js';
import { bearerMatches } from '../../server/push-validation.js';

// Tapping the notification opens the forecast tab, where the "El aviso de hoy" card shows the
// same message (saved in daily_messages before sending).
const OPEN_URL = '/?view=forecast';

export async function POST(request: Request): Promise<Response> {
  if (!bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET ?? '')) {
    return noStore({ error: 'unauthorized' }, 401);
  }
  const mode = new URL(request.url).searchParams.get('mode');
  if (mode !== null && mode !== 'preview' && mode !== 'send-now') {
    return noStore({ error: 'unknown mode' }, 400);
  }
  const now = Temporal.Now.instant();
  if (mode === null && !isSendHour(now)) {
    return noStore({ status: 'not 9:00 in Madrid' });
  }

  // The keys are checked before the data and the claim: a missing variable must not burn the day.
  let vapid: VapidDetails | null = null; // only preview leaves it null, and preview never sends
  if (mode !== 'preview') {
    try {
      vapid = vapidDetails();
    } catch (error) {
      return serverError(error);
    }
  }

  // The data comes before the claim: if Open-Meteo is down nothing is claimed or sent.
  let daily: DailyResult;
  try {
    daily = await dailyMessage(now);
  } catch (error) {
    console.error(error);
    return noStore({ error: 'forecast unavailable' }, 502);
  }
  if (mode === 'preview') {
    return noStore(daily);
  }

  try {
    const today = localToday(now);
    if (mode === null && !(await claimDay(today))) {
      return noStore({ status: 'already sent today' });
    }
    await saveDailyMessage(today, daily.message, now);
    const result = await sendToAll(
      await allSubscriptions(),
      JSON.stringify({ ...daily.message, url: OPEN_URL }),
      vapid!,
    );
    await deleteSubscriptions(result.gone);
    await markSent(result.sent, now);
    const counts = { sent: result.sent.length, failed: result.failed, removed: result.gone.length };
    if (mode === null) {
      await recordRun(today, daily.message, counts);
    }
    return noStore(counts);
  } catch (error) {
    return serverError(error);
  }
}

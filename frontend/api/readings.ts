// GET /api/readings?view=: one Vercel Function for the station's readings and aggregates (the
// Hobby plan allows 12 functions per deployment). The public URLs stay /api/now, /api/day...:
// vercel.json rewrites each one here with its view. Each view is in server/readings/.
import { badRequest } from '../server/http.js';
import { getDaily } from '../server/readings/daily.js';
import { getDay } from '../server/readings/day.js';
import { getLast24h } from '../server/readings/last-24h.js';
import { getLast7Days } from '../server/readings/last-7-days.js';
import { getMonth } from '../server/readings/month.js';
import { getNow } from '../server/readings/now.js';
import { getRange } from '../server/readings/range.js';
import { pickRoute } from '../server/route.js';

const VIEWS = {
  now: getNow,
  day: getDay,
  'last-24h': getLast24h,
  'last-7-days': getLast7Days,
  range: getRange,
  month: getMonth,
  daily: getDaily,
};

export async function GET(request: Request): Promise<Response> {
  const picked = pickRoute(new URL(request.url), 'view', Object.keys(VIEWS) as (keyof typeof VIEWS)[]);
  if (!picked.ok) {
    return badRequest(picked.error);
  }
  return VIEWS[picked.value.name](picked.value.url);
}

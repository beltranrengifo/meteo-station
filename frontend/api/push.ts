// POST /api/push/subscribe and /api/push/unsubscribe, in one Vercel Function (the Hobby plan
// allows 12 per deployment): vercel.json rewrites both here with ?action=.
//
// subscribe: saves a browser's push subscription (PushSubscription.toJSON()). Repeating it is
// harmless (upsert by endpoint): the app sends it again on every open.
// unsubscribe: { endpoint }. Deletes that subscription. Only the phone knows its endpoint, so
// nobody can unsubscribe someone else. 204 even when it did not exist.
import { Temporal } from 'temporal-polyfill';
import { requireEnv } from '../server/env.js';
import { noStore, serverError } from '../server/http.js';
import { allowRequest, deleteSubscription, saveSubscription } from '../server/push-store.js';
import { clientIp, hashIp, parseSubscription, parseUnsubscribe } from '../server/push-validation.js';
import { pickRoute } from '../server/route.js';

const ACTIONS = { subscribe, unsubscribe };

export async function POST(request: Request): Promise<Response> {
  const picked = pickRoute(new URL(request.url), 'action', Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]);
  if (!picked.ok) {
    return noStore({ error: picked.error }, 400);
  }
  return ACTIONS[picked.value.name](request);
}

async function subscribe(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore({ error: 'invalid JSON' }, 400);
  }
  const subscription = parseSubscription(body);
  if (!subscription.ok) {
    return noStore({ error: subscription.error }, 400);
  }
  try {
    const ipHash = hashIp(clientIp(request.headers), requireEnv('CRON_SECRET'));
    if (!(await allowRequest(ipHash, Temporal.Now.instant()))) {
      return noStore({ error: 'too many requests' }, 429);
    }
    if ((await saveSubscription(subscription.value)) === 'full') {
      return noStore({ error: 'no more subscriptions accepted' }, 503);
    }
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return serverError(error);
  }
}

async function unsubscribe(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStore({ error: 'invalid JSON' }, 400);
  }
  const endpoint = parseUnsubscribe(body);
  if (!endpoint.ok) {
    return noStore({ error: endpoint.error }, 400);
  }
  try {
    const ipHash = hashIp(clientIp(request.headers), requireEnv('CRON_SECRET'));
    if (!(await allowRequest(ipHash, Temporal.Now.instant()))) {
      return noStore({ error: 'too many requests' }, 429);
    }
    await deleteSubscription(endpoint.value);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return serverError(error);
  }
}

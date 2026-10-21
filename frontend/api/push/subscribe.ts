// POST /api/push/subscribe: saves a browser's push subscription (PushSubscription.toJSON()).
// Repeating it is harmless (upsert by endpoint): the app sends it again on every open.
import { Temporal } from 'temporal-polyfill';
import { requireEnv } from '../../server/env.js';
import { noStore, serverError } from '../../server/http.js';
import { allowRequest, saveSubscription } from '../../server/push-store.js';
import { clientIp, hashIp, parseSubscription } from '../../server/push-validation.js';

export async function POST(request: Request): Promise<Response> {
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

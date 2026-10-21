// POST /api/push/unsubscribe: { endpoint }. Deletes that subscription. Only the phone knows its
// endpoint, so nobody can unsubscribe someone else. 204 even when it did not exist.
import { Temporal } from 'temporal-polyfill';
import { requireEnv } from '../../server/env.js';
import { noStore, serverError } from '../../server/http.js';
import { allowRequest, deleteSubscription } from '../../server/push-store.js';
import { clientIp, hashIp, parseUnsubscribe } from '../../server/push-validation.js';

export async function POST(request: Request): Promise<Response> {
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

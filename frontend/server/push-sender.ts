// Sends one payload to every subscription with web-push (VAPID), 10 at a time.
import webpush from 'web-push';
import { requireEnv } from './env.js';
import type { StoredSubscription } from './push-store.js';

const BATCH_SIZE = 10;
// A phone offline for a while still gets the morning's forecast, up to 15:00.
const TTL_SECONDS = 6 * 60 * 60;
// A newer message with the same topic replaces an undelivered one.
const TOPIC = 'daily-forecast';

export interface SendResult {
  sent: number[]; // subscription ids
  gone: number[]; // the push service answered 404 or 410: delete them
  failed: number;
}

function statusOf(error: unknown): number | null {
  const status = (error as { statusCode?: unknown }).statusCode;
  return typeof status === 'number' ? status : null;
}

export async function sendToAll(subscriptions: StoredSubscription[], payload: string): Promise<SendResult> {
  const vapidDetails = {
    subject: requireEnv('VAPID_SUBJECT'),
    // Public by design: the browser needs it to subscribe, the server to sign.
    publicKey: requireEnv('VITE_VAPID_PUBLIC_KEY'),
    privateKey: requireEnv('VAPID_PRIVATE_KEY'),
  };
  const result: SendResult = { sent: [], gone: [], failed: 0 };
  for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
    await Promise.all(subscriptions.slice(i, i + BATCH_SIZE).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: TTL_SECONDS, urgency: 'normal', topic: TOPIC, vapidDetails },
        );
        result.sent.push(s.id);
      } catch (error) {
        const status = statusOf(error);
        if (status === 404 || status === 410) {
          result.gone.push(s.id);
        } else {
          result.failed += 1;
          console.error(`push to subscription ${s.id} failed`, status ?? error);
        }
      }
    }));
  }
  return result;
}

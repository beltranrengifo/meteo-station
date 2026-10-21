// Supabase access for push: subscriptions, the limit per IP and the once-a-day claim. Server
// only (secret key); never import it from src/.
import { Temporal } from 'temporal-polyfill';
import type { DailyMessage } from './daily-message.js';
import type { PushSubscriptionInput } from './push-validation.js';
import { db, fetchAll } from './supabase.js';

export const MAX_REQUESTS_PER_HOUR = 10;
export const MAX_SUBSCRIPTIONS = 1000;

export interface StoredSubscription {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface RunCounts {
  sent: number;
  failed: number;
  removed: number;
}

function check(error: { message: string } | null): void {
  if (error) {
    throw new Error(error.message);
  }
}

// Counts this request against the IP's hour; false when it is over the limit.
export async function allowRequest(ipHash: string, now: Temporal.Instant): Promise<boolean> {
  const since = now.subtract({ hours: 1 }).toString();
  const { count, error } = await db()
    .from('push_requests').select('ip_hash', { count: 'exact', head: true })
    .eq('ip_hash', ipHash).gte('at', since);
  check(error);
  if ((count ?? 0) >= MAX_REQUESTS_PER_HOUR) {
    return false;
  }
  check((await db().from('push_requests').insert({ ip_hash: ipHash })).error);
  return true;
}

// Saves or refreshes a subscription. A new one is refused once there are MAX_SUBSCRIPTIONS.
export async function saveSubscription(sub: PushSubscriptionInput): Promise<'saved' | 'full'> {
  const existing = await db().from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).maybeSingle();
  check(existing.error);
  if (!existing.data) {
    const { count, error } = await db().from('push_subscriptions').select('id', { count: 'exact', head: true });
    check(error);
    if ((count ?? 0) >= MAX_SUBSCRIPTIONS) {
      return 'full';
    }
  }
  check((await db().from('push_subscriptions').upsert(sub, { onConflict: 'endpoint' })).error);
  return 'saved';
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  check((await db().from('push_subscriptions').delete().eq('endpoint', endpoint)).error);
}

export async function allSubscriptions(): Promise<StoredSubscription[]> {
  return fetchAll((from, to) => db().from('push_subscriptions').select('id, endpoint, p256dh, auth').order('id').range(from, to));
}

export async function deleteSubscriptions(ids: number[]): Promise<void> {
  if (ids.length > 0) {
    check((await db().from('push_subscriptions').delete().in('id', ids)).error);
  }
}

export async function markSent(ids: number[], at: Temporal.Instant): Promise<void> {
  if (ids.length > 0) {
    check((await db().from('push_subscriptions').update({ last_sent_at: at.toString() }).in('id', ids)).error);
  }
}

// Inserts today's row; false when it was already there (sent, or being sent, by another run).
export async function claimDay(day: Temporal.PlainDate): Promise<boolean> {
  const { data, error } = await db()
    .from('push_daily_runs').upsert({ day: day.toString() }, { onConflict: 'day', ignoreDuplicates: true })
    .select('day');
  check(error);
  return (data ?? []).length > 0;
}

// The message as sent today, for the in-app card. Saved before sending, so a tap on the
// notification already finds it.
export async function saveDailyMessage(day: Temporal.PlainDate, message: DailyMessage, at: Temporal.Instant): Promise<void> {
  const row = { day: day.toString(), ...message, sent_at: at.toString() };
  check((await db().from('daily_messages').upsert(row, { onConflict: 'day' })).error);
}

export async function dailyMessageOf(day: Temporal.PlainDate): Promise<{ title: string; body: string; sent_at: string } | null> {
  const { data, error } = await db().from('daily_messages').select('title, body, sent_at').eq('day', day.toString()).maybeSingle();
  check(error);
  return data;
}

export async function recordRun(day: Temporal.PlainDate, message: DailyMessage, counts: RunCounts): Promise<void> {
  check((await db().from('push_daily_runs').update({ ...message, ...counts }).eq('day', day.toString())).error);
}

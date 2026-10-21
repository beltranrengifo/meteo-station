// Checks for the push endpoints and the cron: what a browser may send, and who may call.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Parsed } from './params.js';

// Apple (iPhone), Google (Chrome, Android), Mozilla (Firefox) and Microsoft (Edge on Windows).
const PUSH_HOSTS = new Set(['web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com']);
const WINDOWS_PUSH_SUFFIX = '.notify.windows.com';
const MAX_ENDPOINT_LENGTH = 1000;
// An uncompressed P-256 public key, and the auth secret.
const P256DH_BYTES = 65;
const AUTH_BYTES = 16;

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function parseEndpoint(value: unknown): Parsed<string> {
  if (typeof value !== 'string' || value.length > MAX_ENDPOINT_LENGTH) {
    return { ok: false, error: 'invalid endpoint' };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: 'invalid endpoint' };
  }
  const known = PUSH_HOSTS.has(url.hostname) || url.hostname.endsWith(WINDOWS_PUSH_SUFFIX);
  if (url.protocol !== 'https:' || !known) {
    return { ok: false, error: 'unknown push service' };
  }
  return { ok: true, value };
}

// Bytes in a base64url string (with or without padding), or null when it is not one.
function base64UrlBytes(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) {
    return null;
  }
  return Buffer.from(value, 'base64url').length;
}

// The body PushSubscription.toJSON() gives: { endpoint, expirationTime, keys: { p256dh, auth } }.
export function parseSubscription(body: unknown): Parsed<PushSubscriptionInput> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'invalid body' };
  }
  const { endpoint, keys } = body as { endpoint?: unknown; keys?: unknown };
  const parsed = parseEndpoint(endpoint);
  if (!parsed.ok) {
    return parsed;
  }
  if (typeof keys !== 'object' || keys === null) {
    return { ok: false, error: 'invalid keys' };
  }
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  if (base64UrlBytes(p256dh) !== P256DH_BYTES || base64UrlBytes(auth) !== AUTH_BYTES) {
    return { ok: false, error: 'invalid keys' };
  }
  return { ok: true, value: { endpoint: parsed.value, p256dh: p256dh as string, auth: auth as string } };
}

export function parseUnsubscribe(body: unknown): Parsed<string> {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'invalid body' };
  }
  return parseEndpoint((body as { endpoint?: unknown }).endpoint);
}

// On Vercel the platform sets x-forwarded-for; its first address is the client's.
export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

// The rate limit stores only this keyed hash: without the secret it cannot be traced back.
export function hashIp(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip).digest('hex');
}

// "Authorization: Bearer <secret>", compared in constant time. timingSafeEqual throws on
// different lengths, so those are rejected first.
export function bearerMatches(header: string | null, secret: string): boolean {
  if (!secret || header === null) {
    return false;
  }
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

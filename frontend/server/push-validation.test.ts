import { describe, expect, it } from 'vitest';
import { bearerMatches, clientIp, hashIp, parseEndpoint, parseSubscription, parseUnsubscribe } from './push-validation';

const key = (bytes: number) => Buffer.alloc(bytes, 7).toString('base64url');
const APPLE = 'https://web.push.apple.com/QGuQyavXutnMH2ApsRnQ';
const valid = { endpoint: APPLE, expirationTime: null, keys: { p256dh: key(65), auth: key(16) } };

describe('parseEndpoint', () => {
  it('accepts the known push services over HTTPS', () => {
    for (const endpoint of [APPLE, 'https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://db5p.notify.windows.com/w/?token=abc']) {
      expect(parseEndpoint(endpoint)).toEqual({ ok: true, value: endpoint });
    }
  });
  it('rejects anything else', () => {
    for (const endpoint of ['http://fcm.googleapis.com/fcm/send/abc', 'https://evil.example/fcm', 'https://fcm.googleapis.com.evil.example/x', 'not a url', 42, null, `${APPLE}/${'a'.repeat(1000)}`]) {
      expect(parseEndpoint(endpoint).ok).toBe(false);
    }
  });
});

describe('parseSubscription', () => {
  it('takes what PushSubscription.toJSON gives', () => {
    expect(parseSubscription(valid)).toEqual({ ok: true, value: { endpoint: APPLE, p256dh: key(65), auth: key(16) } });
  });
  it('accepts base64url keys with padding', () => {
    expect(parseSubscription({ ...valid, keys: { p256dh: `${key(65)}=`, auth: `${key(16)}==` } }).ok).toBe(true);
  });
  it('rejects keys of the wrong size or alphabet', () => {
    expect(parseSubscription({ ...valid, keys: { p256dh: key(64), auth: key(16) } }).ok).toBe(false);
    expect(parseSubscription({ ...valid, keys: { p256dh: key(65), auth: key(17) } }).ok).toBe(false);
    expect(parseSubscription({ ...valid, keys: { p256dh: `${key(65)}+/`, auth: key(16) } }).ok).toBe(false);
    expect(parseSubscription({ ...valid, keys: null }).ok).toBe(false);
    expect(parseSubscription('nope').ok).toBe(false);
  });
});

describe('parseUnsubscribe', () => {
  it('needs a valid endpoint', () => {
    expect(parseUnsubscribe({ endpoint: APPLE })).toEqual({ ok: true, value: APPLE });
    expect(parseUnsubscribe({}).ok).toBe(false);
    expect(parseUnsubscribe(null).ok).toBe(false);
  });
});

describe('clientIp and hashIp', () => {
  it('takes the first forwarded address', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(new Headers())).toBe('unknown');
  });
  it('hashes with the secret, never keeping the IP', () => {
    const hash = hashIp('203.0.113.7', 'secret-a');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashIp('203.0.113.7', 'secret-a'));
    expect(hash).not.toBe(hashIp('203.0.113.7', 'secret-b'));
  });
});

describe('bearerMatches', () => {
  it('accepts only the exact secret', () => {
    expect(bearerMatches('Bearer s3cret', 's3cret')).toBe(true);
    expect(bearerMatches('Bearer s3creT', 's3cret')).toBe(false);
  });
  it('is false, never throwing, for other lengths, no header or no secret', () => {
    expect(bearerMatches('Bearer s3cret-longer', 's3cret')).toBe(false);
    expect(bearerMatches(null, 's3cret')).toBe(false);
    expect(bearerMatches('Bearer ', '')).toBe(false);
  });
});

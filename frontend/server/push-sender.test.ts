import { afterEach, describe, expect, it, vi } from 'vitest';
import { vapidDetails } from './push-sender.js';

afterEach(() => vi.unstubAllEnvs());

function stubAll() {
  vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.com');
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'public-key');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
}

describe('vapidDetails', () => {
  it('reads the three variables', () => {
    stubAll();
    expect(vapidDetails()).toEqual({
      subject: 'mailto:test@example.com',
      publicKey: 'public-key',
      privateKey: 'private-key',
    });
  });

  it.each(['VAPID_SUBJECT', 'VITE_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'])('throws naming %s when it is missing', (name) => {
    stubAll();
    vi.stubEnv(name, '');
    expect(() => vapidDetails()).toThrow(`missing env var ${name}`);
  });

  it('does not put the values in the error', () => {
    stubAll();
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    expect(() => vapidDetails()).toThrow(/^missing env var VAPID_PRIVATE_KEY$/);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { alertState, base64UrlToBytes, subscribe, unsubscribe } from './push';

interface Browser {
  standalone?: boolean; // display-mode: standalone (Android, desktop)
  iosStandalone?: boolean; // navigator.standalone (iPhone home screen)
  push?: boolean;
  permission?: NotificationPermission;
  subscription?: unknown;
}

function stubBrowser({ standalone = true, iosStandalone = false, push = true, permission = 'default', subscription = null }: Browser) {
  const pushManager = { getSubscription: vi.fn(async () => subscription), subscribe: vi.fn() };
  const registration = { pushManager };
  const win: Record<string, unknown> = { matchMedia: () => ({ matches: standalone }) };
  if (push) {
    win.PushManager = class {};
    win.Notification = class {};
  }
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', {
    standalone: iosStandalone,
    ...(push ? { serviceWorker: { getRegistration: async () => registration, ready: Promise.resolve(registration) } } : {}),
  });
  vi.stubGlobal('Notification', { permission, requestPermission: vi.fn(async () => 'granted') });
  return { pushManager };
}

function fakeSubscription() {
  return {
    endpoint: 'https://web.push.apple.com/abc',
    toJSON: () => ({ endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'x', auth: 'y' } }),
    unsubscribe: vi.fn(async () => true),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('alertState', () => {
  it('asks to install the app first', async () => {
    stubBrowser({ standalone: false });
    expect(await alertState()).toBe('not-installed');
  });
  it('counts an iPhone home screen app as installed', async () => {
    stubBrowser({ standalone: false, iosStandalone: true });
    expect(await alertState()).toBe('off');
  });
  it('knows when push is missing or blocked', async () => {
    stubBrowser({ push: false });
    expect(await alertState()).toBe('unsupported');
    stubBrowser({ permission: 'denied' });
    expect(await alertState()).toBe('blocked');
  });
  it('is on when the browser has a subscription', async () => {
    stubBrowser({ subscription: fakeSubscription() });
    expect(await alertState()).toBe('on');
  });
});

describe('subscribe', () => {
  it('sends the subscription to the server', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID');
    const { pushManager } = stubBrowser({});
    pushManager.subscribe.mockResolvedValue(fakeSubscription());
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await subscribe()).toBe('on');
    expect(fetchMock).toHaveBeenCalledWith('/api/push/subscribe', expect.objectContaining({ method: 'POST' }));
  });
  it('keeps the original error when undoing the browser subscription fails too', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID');
    const { pushManager } = stubBrowser({});
    const subscription = fakeSubscription();
    subscription.unsubscribe.mockRejectedValue(new Error('unsubscribe failed'));
    pushManager.subscribe.mockResolvedValue(subscription);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 429 })));
    await expect(subscribe()).rejects.toThrow('429');
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
  it('undoes the browser subscription when the server refuses it', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'AQID');
    const { pushManager } = stubBrowser({});
    const subscription = fakeSubscription();
    pushManager.subscribe.mockResolvedValue(subscription);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 429 })));
    await expect(subscribe()).rejects.toThrow('429');
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
});

describe('unsubscribe', () => {
  it('tells the server first, then drops the browser subscription', async () => {
    const subscription = fakeSubscription();
    stubBrowser({ subscription });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await unsubscribe()).toBe('off');
    expect(fetchMock).toHaveBeenCalledWith('/api/push/unsubscribe', expect.objectContaining({ method: 'POST' }));
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
});

describe('syncSubscription', () => {
  it('sends the subscription once per page load', async () => {
    // The once-per-load flag lives in the module, so each test gets a fresh copy.
    vi.resetModules();
    const { syncSubscription } = await import('./push');
    stubBrowser({ subscription: fakeSubscription() });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([syncSubscription(), syncSubscription()]);
    await syncSubscription();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/push/subscribe', expect.objectContaining({ method: 'POST' }));
  });
});

describe('base64UrlToBytes', () => {
  it('decodes base64url without padding', () => {
    expect([...base64UrlToBytes('AQID')]).toEqual([1, 2, 3]);
    expect([...base64UrlToBytes('-_8')]).toEqual([251, 255]);
  });
});

// The daily forecast notification on this device. The subscription lives in the browser:
// pushManager.getSubscription() says whether this phone is subscribed, and the server keeps a
// copy to send to. Push only works with the dashboard installed as an app (required on iPhone,
// and the same flow everywhere).
export type AlertState = 'not-installed' | 'unsupported' | 'blocked' | 'off' | 'on';

export function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register('/sw.js');
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

export async function alertState(): Promise<AlertState> {
  if (!isInstalled()) {
    return 'not-installed';
  }
  if (!isPushSupported()) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') {
    return 'blocked';
  }
  return (await currentSubscription()) ? 'on' : 'off';
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function postJson(path: string, body: unknown): Promise<void> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`);
  }
}

// Must run straight from a tap: iPhone only asks for permission inside a user gesture.
export async function subscribe(): Promise<AlertState> {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!key) {
    throw new Error('VITE_VAPID_PUBLIC_KEY is not set');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return permission === 'denied' ? 'blocked' : 'off';
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) });
  try {
    await postJson('/api/push/subscribe', subscription.toJSON());
  } catch (error) {
    // Otherwise this phone would think it is subscribed while the server has no copy.
    await subscription.unsubscribe();
    throw error;
  }
  return 'on';
}

// The server first: if it fails, the phone stays subscribed and the user can try again.
export async function unsubscribe(): Promise<AlertState> {
  const subscription = await currentSubscription();
  if (subscription) {
    await postJson('/api/push/unsubscribe', { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  return 'off';
}

// Sends this phone's subscription again on every open, so the server gets it back if lost.
export async function syncSubscription(): Promise<void> {
  const subscription = await currentSubscription();
  if (subscription) {
    await postJson('/api/push/subscribe', subscription.toJSON());
  }
}

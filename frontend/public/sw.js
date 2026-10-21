// Service worker for the daily forecast notification: it shows the push and opens the dashboard
// when it is tapped. No fetch handler and no cache: the page always loads from the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Payload from api/cron/daily-forecast: { title, body, url }.
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Gorraplanistas', {
      body: data.body || '',
      icon: '/icon-192.png',
      tag: 'daily-forecast',
      data: { url: data.url || '/' },
    }),
  );
});

// Focus an open dashboard window and take it to the notification's URL, or open one there.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(url);
      // navigate() can be missing or reject (e.g. an uncontrolled client): then just focus.
      try {
        await open.focus();
        return await open.navigate(url);
      } catch {
        return open.focus();
      }
    }),
  );
});

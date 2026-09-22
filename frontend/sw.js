const CACHE_NAME = 'sportmancar-offline-v4';
const APP_SHELL = [
  '/',
  '/index.html',
  '/attendance.html',
  '/manifest.webmanifest',
  '/src/js/app.js',
  '/src/js/public/attendance.js',
  '/src/js/lib/offlineAttendanceQueue.js',
  '/src/js/lib/qrcode.browser.js',
  '/src/js/views/instructor/AttendanceQrModal.js',
  '/src/js/services/practicalSessionService.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin === self.location.origin && requestUrl.pathname === '/env.js') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // Los estados de agenda y asistencia deben reflejar siempre el backend.
  if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  const networkFirst = event.request.destination === 'document'
    || event.request.destination === 'script'
    || event.request.destination === 'style';

  event.respondWith(
    (networkFirst ? fetch(event.request).then((response) => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => undefined);
      return response;
    }).catch(() => caches.match(event.request)) : caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => undefined);
        return response;
      }).catch(() => caches.match('/index.html'));
    }))
  );
});

const CACHE_NAME = 'asagi-pwa-v13';
const APP_SHELL = [
  './',
  './index.html',
  './brain-router.js',
  './asagi-browser.js',
  './asagi-apps.js',
  './sync-memoria.js',
  './personalidad.js',
  './razonamiento.js',
  './noticias.js',
  './memoria.js',
  './rea.js',
  './voz.js',
  './ads.js',
  './launcher.js',
  './bots.js',
  './wallpaper.js',
  './defensa.js',
  './gestures.js',
  './palette.js',
  './conocimiento.js',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './assets/icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

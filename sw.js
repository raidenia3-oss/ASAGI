const CACHE_NAME = 'asagi-pwa-v75';
const APP_SHELL = [
  './',
  './index.html',
  './brain-router.js',
  './asagi-browser.js',
  './asagi-apps.js',
  './sync-memoria.js',
  './enlace.js',
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
  './enjambre.js',
  './foto-ia.js',
  './monitor.js',
  './recon.js',
  './retro.js',
  './ui-fx.js',
  './avatar.js',
  './dictado.js',
  './pendientes.js',
  './notificar.js',
  './enlace-adb.js',
  './herramientas.js',
  './bandeja.js',
  './enlace-lan.js',
  './actualizador.js',
  './niveles.js',
  './manos.js',
  './vistas.js',
  './estudia.js',
  './citas.js',
  './personajes.js',
  './sin-cerebro.js',
  './navegador-lector.js',
  './navegador.js',
  './personajes/indice.json',
  './personajes/patrick-jane.json',
  './personajes/barney-stinson.json',
  './piensa.js',
  './discord.js',
  './styles.css',
  './tema-asagi.css',
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
  // Solo la propia app (mismo origen) pasa por la cache. Todo lo externo
  // (GitHub del enlace, DNS, monitor, noticias, IA) va SIEMPRE directo a la red:
  // cachearlo devolvia respuestas viejas para siempre.
  if (new URL(event.request.url).origin !== self.location.origin) return;

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

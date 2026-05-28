const CACHE = 'velo-v3';
const BASE = '/Velo/';

// Al instalar: cachea los assets principales
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([
      BASE,
      BASE + 'index.html',
      BASE + 'game.js',
      BASE + 'manifest.json',
      BASE + 'icon-192.png',
      BASE + 'icon-512.png',
    ])).then(() => self.skipWaiting())
  );
});

// Al activar: borra caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: red primero, caché como fallback
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Guarda copia fresca en caché
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

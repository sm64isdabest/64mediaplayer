const CACHE = '64-media-player-shell-v1';
const FILES = ['./', './index.html', './style.css', './manifest.json', './assets/app-icon.svg', './app.js', './db.js', './metadata.js', './vendor/jsmediatags.min.js'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const base = new URL('./', self.registration.scope);
    await cache.addAll(FILES.map((file) => new URL(file, base).href));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('64-media-player-shell-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === 'navigate') return (await caches.match(new URL('./index.html', self.registration.scope))) || Response.error();
      throw error;
    }
  })());
});

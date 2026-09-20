const CACHE = 'kit-conversion-shell-v1';
const SHELL = ['./', './index.html', './client.bundle.js', './worker.bundle.js', './model.wasm', './cases.json'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  // WebLLM stores weight shards in IndexedDB. Cache shell and small metadata here.
  if (url.pathname.endsWith('.bin')) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(event.request);
    if (hit) return hit;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  }));
});

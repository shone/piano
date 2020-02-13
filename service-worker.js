self.addEventListener('install', event => {
  event.waitUntil(async function() {
    const cache = await caches.open('static-assets-v1');
    await cache.addAll([
      'index.html',
      'main.js',
      'style.css',
    ]);
  }());
});

self.addEventListener('fetch', event => {
  event.respondWith(async function() {
    const cache = await caches.open('static-assets-v1');
    const cachedResponse = await cache.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }
    const networkResponse = await fetch(event.request);
    cache.put(event.request, networkResponse.clone());
    return networkResponse;
  }());
});

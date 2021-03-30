self.addEventListener('install', event => {
  event.waitUntil(async function installWaitUntil() {
    // Cache everything the app should need to run offline
    const cache = await caches.open('static-assets-v1');
    await cache.addAll([
      './',
      './index.html',
      './manifest.webmanifest',
      './main.js',
      './style.css',
      './favicon.png',
      './favicon_192x192.png',
      './favicon_512x512.png',
    ]);
  }());
});

self.addEventListener('fetch', event => {
  event.respondWith(async function fetchRespondWith() {
    const cache = await caches.open('static-assets-v1');

    // Start fetching from network (but don't await it)
    const networkResponse = fetch(event.request).then(networkResponse => {
      cache.put(event.request, networkResponse.clone());
      return networkResponse;
    });

    // If there's a cached response, use that immediately while the fetch
    // completes and updates the cache in the background.
    const cachedResponse = await cache.match(event.request);
    if (cachedResponse) {
      return cachedResponse;
    }

    return networkResponse;
  }());
});

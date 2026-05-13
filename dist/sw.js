const CACHE_NAME = 'an-q-v2';
const BASE_URL = '/An-Q/';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll([
          BASE_URL,
          BASE_URL + 'manifest.json',
          BASE_URL + 'icon-192.png',
          BASE_URL + 'icon-512.png',
        ]);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // An-Q スコープ外のリクエストはスルー
  if (!url.pathname.startsWith(BASE_URL)) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).catch(() => {
          // オフライン時はindex.htmlにフォールバック
          return caches.match(BASE_URL);
        });
      })
  );
});

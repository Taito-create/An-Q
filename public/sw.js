const CACHE_NAME = 'an-q-v2';
const urlsToCache = ['/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(err => console.warn('[An-Q SW] Cache addAll failed:', err))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // HTML / JS は network-first（デプロイ後のハッシュ不一致で MIME エラーになるのを防ぐ）
  if (
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('.js') ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

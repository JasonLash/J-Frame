'use strict';

// Update cache names any time any of the cached files change.
const CACHE_NAME = 'static-cache-v13';

// Add list of files to cache here.
const FILES_TO_CACHE = [
  '/index.html',
];

self.addEventListener('install', (evt) => {
  console.log('[ServiceWorker] Install');

  evt.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      console.log("[Service Worker] Caching all: app shell and content");
      await cache.addAll(FILES_TO_CACHE);
    })()
  );

  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  console.log('[ServiceWorker] Activate');
  // Remove previous cached data from disk.
  evt.waitUntil(
      caches.keys().then((keyList) => {
        return Promise.all(keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache', key);
            return caches.delete(key);
          }
        }));
      })
  );

  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  console.log('[ServiceWorker] Fetch', evt.request.url);
  // Add fetch event handler here.
  if (evt.request.mode !== 'navigate') {
    // Not a page navigation, bail.
    return;
  }
  evt.respondWith(
    fetch(evt.request)
        .catch(() => {
          return caches.open(CACHE_NAME)
              .then((cache) => {
                console.log(evt.request);
                return cache.match('index.html');
              });
        })
    );
  evt.respondWith(
    (async () => {
      const r = await caches.match(evt.request);
      console.log(`[Service Worker] Fetching resource: ${evt.request.url}`);
      if (r) {
        return r;
      }
      const response = await fetch(evt.request);
      const cache = await caches.open(CACHE_NAME);
      console.log(`[Service Worker] Caching new resource: ${evt.request.url}`);
      cache.put(evt.request, response.clone());
      return response;
    })()
  );

});

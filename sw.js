const CACHE = 'breathe-deep-v8';
const CROSS_ORIGIN_CACHE_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js?v=2',
  './vendor/web-haptics.js?v=2',
  './manifest.webmanifest',
  './favicon.png',
  './img/apple-touch-icon-iphone.png',
  './img/touch-icon-ipad.png',
  './img/touch-icon-iphone-retina.png',
  './img/touch-icon-ipad-retina.png',
];
// Best-effort precache so the first paint already has Fraunces.
// Kept separate from SHELL because cache.addAll fails atomically on a single
// 4xx/5xx and we don't want a transient Google Fonts hiccup to brick install.
const SHELL_OPTIONAL = [
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@14..144,300..480,50..100&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    await Promise.allSettled(SHELL_OPTIONAL.map((u) => cache.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Same-origin: cache-first. Cross-origin (Google Fonts): network with cache fallback.
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (!res || res.status !== 200 || res.type !== 'basic') return res;
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        }).catch(() => {
          // Only navigation requests get the app-shell fallback. Returning
          // index.html for an image / script / css request would render as
          // a broken asset with the wrong Content-Type.
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      }),
    );
  } else if (CROSS_ORIGIN_CACHE_HOSTS.has(url.hostname)) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req)),
    );
  }
});

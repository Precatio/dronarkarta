const CACHE = 'dronarkarta-v3';
const ALWAYS_FETCH = [
  'opendata-download-metfcst.smhi.se',
  'googletagmanager.com',
  'google-analytics.com',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'nominatim.openstreetmap.org',
  'basemaps.cartocdn.com',
  'arcgisonline.com'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['/', '/manifest.json']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go to network for third-party/analytics/map tiles
  if (ALWAYS_FETCH.some(h => url.hostname.includes(h))) return;

  // Network-first for data JSON (so weekly updates come through)
  if (url.pathname.startsWith('/data/')) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for app shell (HTML, CSS, JS, images)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp && resp.ok && e.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match('/'));
    })
  );
});

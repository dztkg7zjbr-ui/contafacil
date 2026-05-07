/**
 * ContaFácil Service Worker
 *
 * Strategy:
 *  - App shell (index.html, icons, manifest) → cache-first, update in background
 *  - CDN scripts (Tesseract, PDF.js) → network-first, fall back to cache
 *  - Everything else → network-first, no caching
 *
 * This means the app loads instantly and works fully offline for all
 * accounting features. OCR receipt scanning needs a connection the first
 * time (to download Tesseract), but once cached it works offline too.
 */

const VER   = 'cf-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

// ── Install: pre-cache the app shell ──
self.addEventListener('install', e => {
  self.skipWaiting(); // activate immediately
  e.waitUntil(
    caches.open(VER).then(c => c.addAll(SHELL)).catch(() => {})
  );
});

// ── Activate: clean up old cache versions ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache or network ──
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // CDN resources (Tesseract.js, PDF.js, worker scripts)
  // Network-first: try live, fall back to cached copy
  if (url.includes('cdn.jsdelivr') || url.includes('cdnjs.cloudflare') ||
      url.includes('tesseract') || url.includes('pdf.worker')) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(VER).then(c => c.put(e.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // App shell — cache-first, update in background
  if (SHELL.some(s => url.endsWith(s.replace('./',''))) || url.endsWith('/contafacil/')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(VER).then(c => c.put(e.request, clone));
          }
          return resp;
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  // Everything else — network only
  e.respondWith(fetch(e.request).catch(() => new Response('Offline', { status: 503 })));
});

// Simple cache-first Service Worker for card images
// Note: Service Workers require HTTPS or localhost. When opened via file:// this will not register.

const VERSION = 'v1';
const IMG_CACHE = `card-images-${VERSION}`;
const IMG_HOSTS = new Set([
  'cdn.jsdelivr.net'
]);

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('card-images-') && k !== IMG_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Cache-first for images from approved hosts; network fallback, then optional placeholder
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isImage = req.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|webp|gif)$/i);
  const fromKnownHost = IMG_HOSTS.has(url.host);
  const isCardPath = /\/CS_Images|\/pics|\/pics_small/i.test(url.pathname);
  if (req.method !== 'GET' || !isImage || !(fromKnownHost && isCardPath)) return; // passthrough

  event.respondWith((async () => {
    const cache = await caches.open(IMG_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req, { mode: 'cors', credentials: 'omit' });
      if (res && res.ok) {
        // Clone because responses are one-use
        cache.put(req, res.clone()).catch(()=>{});
        return res;
      }
    } catch (e) {
      // network fail -> fall through to placeholder below
    }
    // Tiny transparent PNG as last resort
    return new Response(
      Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,10,73,68,65,84,120,156,99,248,15,4,0,9,251,3,253,167,4,13,95,0,0,0,0,73,69,78,68,174,66,96,130]),
      { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' } }
    );
  })());
});

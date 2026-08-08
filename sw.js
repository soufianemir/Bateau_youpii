const CACHE = 'marine-companion-v3';
const APP_SHELL = ['./', './index.html', './styles.css', './app.js', './runtime-data.js', './manifest.webmanifest', './assets/icon.svg'];

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

async function networkFirst(req) {
  try {
    const response = await fetch(req);
    if (response && response.ok) {
      const clone = response.clone();
      caches.open(CACHE).then(cache => cache.put(req, clone));
    }
    return response;
  } catch {
    return (await caches.match(req)) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin && url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(cache => cache.put(req, clone));
        return res;
      }).catch(() => caches.match('./index.html')))
    );
    return;
  }

  if (url.hostname.includes('open-meteo.com')) {
    event.respondWith(networkFirst(req));
  }
});

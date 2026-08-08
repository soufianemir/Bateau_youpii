const CACHE = 'marine-companion-v1';
const APP_SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './assets/icon-192.png', './assets/icon-512.png', './assets/apple-touch-icon.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(res => { const clone = res.clone(); caches.open(CACHE).then(c => c.put(req, clone)); return res; }).catch(() => caches.match('./index.html'))));
    return;
  }
  if (url.hostname.includes('open-meteo.com')) {
    event.respondWith(fetch(req).then(res => { const clone = res.clone(); caches.open(CACHE).then(c => c.put(req, clone)); return res; }).catch(() => caches.match(req)));
  }
});
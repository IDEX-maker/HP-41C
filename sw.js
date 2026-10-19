// Offline cache for the app shell. ROMs and memory live in IndexedDB/localStorage, not here.
const CACHE = 'hp41-v4';
const SHELL = ['./', './index.html', './app.js', './nut.js', './mod.js', './raw.js', './chargen.js', './manifest.webmanifest',
  './roms/NUT0-N.ROM', './roms/NUT1-F.ROM', './roms/NUT2-L.ROM', './roms/XFNS3-3B.ROM', './roms/TIME-3B.ROM', './roms/XFNS5-2D.ROM',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html'))));
});

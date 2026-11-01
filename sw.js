/* Service worker · Zona Gamer
   Cambia VERSION cuando quieras forzar que todos descarguen de nuevo el "esqueleto" de la app. */
const VERSION = 'zg-v1';
const SHELL = `shell-${VERSION}`;
const CDN = `cdn-${VERSION}`;
const IMGS = 'imgs';          // carátulas y logo (se conservan entre versiones)
const MAX_IMGS = 80;

const APP_FILES = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [SHELL, CDN, IMGS];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function recortar(nombre, max) {
  const c = await caches.open(nombre), ks = await c.keys();
  for (let i = 0; i < ks.length - max; i++) await c.delete(ks[i]);
}

/* red primero; si no hay conexión, lo último guardado */
async function redPrimero(req, cacheName, fallback) {
  const c = await caches.open(cacheName);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch {
    return (await c.match(req)) || (fallback && await c.match(fallback)) || Response.error();
  }
}

/* lo guardado al instante y se actualiza en segundo plano */
async function guardadoPrimero(req, cacheName, max) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  const red = fetch(req).then(r => {
    if (r.ok || r.type === 'opaque') { c.put(req, r.clone()); if (max) recortar(cacheName, max); }
    return r;
  }).catch(() => null);
  return hit || (await red) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Páginas: red primero (siempre la última versión), con respaldo sin conexión
  if (req.mode === 'navigate') {
    e.respondWith(redPrimero(req, SHELL, './index.html'));
    return;
  }
  // Mismo origen: juegos.json y archivos de la app → red primero
  if (url.origin === location.origin) {
    e.respondWith(redPrimero(req, SHELL));
    return;
  }
  // Fuentes e iconos de CDN
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(guardadoPrimero(req, CDN));
    return;
  }
  // Carátulas y logo (imágenes de otros sitios)
  if (req.destination === 'image') {
    e.respondWith(guardadoPrimero(req, IMGS, MAX_IMGS));
  }
});

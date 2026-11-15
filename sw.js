/* ScoutMap : fonctionnement hors connexion.
   - l'application (pages, scripts, bibliothèques) est gardée en mémoire après la première visite ;
   - les tuiles de cartes enregistrées par l'utilisateur (« Hors connexion ») sont servies sans réseau ;
   - les autres services (itinéraire, altitude, recherche) restent en ligne. */
const V = '__V__';
const SHELL = 'sm-shell-' + V, TILES = 'sm-tiles-v1';
const EXT = /^https:\/\/(cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;
const EMPTY = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    const cache = await caches.open(SHELL), base = self.registration.scope;
    let urls = [base, base + 'index.html', base + 'manifest.webmanifest', base + 'assets/fsggb.png', base + 'assets/icon-192.png', base + 'js/themes.js', base + 'js/themes-art.js'];
    try {
      const html = await (await fetch(base, { cache: 'reload' })).text();
      const re = /(?:src|href)="([^"#]+)"/g; let m;
      while ((m = re.exec(html))) { try { const u = new URL(m[1], base).href; if (u.indexOf(base) === 0 || EXT.test(u)) urls.push(u); } catch (er) { /* ignoré */ } }
    } catch (er) { /* hors connexion à l'installation : on réessaiera à la prochaine visite */ }
    await Promise.all(Array.from(new Set(urls)).map(function (u) { return cache.add(new Request(u, { cache: 'reload' })).catch(function () { /* ressource facultative */ }); }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k.indexOf('sm-shell-') === 0 && k !== SHELL; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

function isTile(url) { return /^https:\/\/(data\.geopf\.fr\/wmts|mapserver\.openig\.org|server\.arcgisonline\.com|[abc]?\.?tile\.)/.test(url) || /\/wmts\?/.test(url); }

self.addEventListener('fetch', function (e) {
  const req = e.request; if (req.method !== 'GET') return;
  const url = req.url;
  // 1. tuiles de cartes : d'abord celles enregistrées sur l'appareil, sinon le réseau ; sans réseau, une tuile vide (pas d'erreur rouge)
  if (isTile(url)) {
    e.respondWith((async function () {
      const c = await caches.open(TILES), hit = await c.match(url, { ignoreVary: true });
      if (hit) return hit;
      try { return await fetch(req); }
      catch (er) { return new Response(Uint8Array.from(atob(EMPTY), function (ch) { return ch.charCodeAt(0); }), { status: 200, headers: { 'Content-Type': 'image/png' } }); }
    })());
    return;
  }
  // 2. l'application elle-même : le réseau d'abord (nouvelle version dès qu'elle existe), la mémoire en secours
  const sameOrigin = url.indexOf(self.registration.scope) === 0;
  if (sameOrigin || EXT.test(url)) {
    e.respondWith((async function () {
      const cache = await caches.open(SHELL);
      try {
        const ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, sameOrigin ? 5000 : 8000);
        const r = await fetch(req, { signal: ctl.signal }); clearTimeout(t);
        if (r && r.ok) cache.put(req, r.clone());
        return r;
      } catch (er) {
        const hit = await cache.match(req, { ignoreSearch: false }) || await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') { const idx = await cache.match(self.registration.scope) || await cache.match(self.registration.scope + 'index.html', { ignoreSearch: true }); if (idx) return idx; }
        return new Response('Hors connexion', { status: 503, statusText: 'Hors connexion' });
      }
    })());
  }
});

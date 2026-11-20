// Service de tuiles SCAN 25 (Cloudflare Workers, offre gratuite, sans carte bancaire).
// La clé IGN est un « secret » du Worker (SCAN25_KEY) : elle n'apparaît ni dans ce code, ni dans ScoutMap, ni dans le navigateur.
// Les tuiles sont gardées dans le cache de Cloudflare (7 jours) : la 2e demande d'une même tuile est instantanée pour tout le monde.

const AUTORISES = ['https://fsggb.github.io', 'http://localhost', 'http://127.0.0.1'];   // sites qui ont le droit d'afficher les tuiles
const COUCHE = 'GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN25TOUR';

function sources(z, x, y, cle) {
  const k = encodeURIComponent(cle);
  return [
    `https://data.geopf.fr/private/wmts?apikey=${k}&SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${COUCHE}&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`,
    `https://data.geopf.fr/private/tms/1.0.0/${COUCHE}/${z}/${x}/${y}.jpeg?apikey=${k}`
  ];
}

function siteAutorise(request) {
  const o = request.headers.get('Origin') || request.headers.get('Referer') || '';
  return !o || AUTORISES.some((a) => o === a || o.startsWith(a + '/') || o.startsWith(a + ':'));   // sans en-tête : ouverture directe (test) autorisée
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const m = /^\/scan25\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})(?:\.\w+)?$/.exec(url.pathname);
    if (request.method !== 'GET' || !m) return new Response('tuile invalide', { status: 400 });
    const z = +m[1], x = +m[2], y = +m[3], n = 2 ** z;
    if (z > 17 || x >= n || y >= n) return new Response('tuile invalide', { status: 400 });
    if (!siteAutorise(request)) return new Response('site non autorisé', { status: 403 });
    if (!env.SCAN25_KEY) return new Response('clé SCAN25_KEY absente', { status: 500 });

    const cache = caches.default, cleCache = new Request(url.origin + url.pathname, { method: 'GET' });
    let rep = await cache.match(cleCache);
    if (!rep) {
      for (const src of sources(z, x, y, env.SCAN25_KEY)) {
        try {
          const r = await fetch(src, { cf: { cacheTtl: 604800, cacheEverything: true } });
          if (!r.ok) continue;
          rep = new Response(await r.arrayBuffer(), { status: 200, headers: {
            'Content-Type': r.headers.get('Content-Type') || 'image/jpeg',
            'Cache-Control': 'public, max-age=604800',
            'Access-Control-Allow-Origin': '*'
          } });
          ctx.waitUntil(cache.put(cleCache, rep.clone()));
          break;
        } catch (e) { /* source suivante */ }
      }
      if (!rep) return new Response('IGN indisponible', { status: 502 });
    }
    return rep;
  }
};

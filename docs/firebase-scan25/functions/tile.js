// Logique du service : une tuile SCAN 25 demandée à l'IGN avec la clé (côté serveur), renvoyée en binaire.
const LAYER = 'GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN25TOUR';

function sources(z, x, y, key) {
  const k = encodeURIComponent(key);
  return [
    `https://data.geopf.fr/private/wmts?apikey=${k}&SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${LAYER}&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`,
    `https://data.geopf.fr/private/tms/1.0.0/${LAYER}/${z}/${x}/${y}.jpeg?apikey=${k}`
  ];
}

async function tile(req, res, key, fetchImpl = fetch) {
  const m = /\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})(?:\.\w+)?$/.exec(req.path || '');
  if (!m) { res.status(400).send('tuile invalide'); return; }
  const z = +m[1], x = +m[2], y = +m[3], n = 2 ** z;
  if (z > 17 || x >= n || y >= n) { res.status(400).send('tuile invalide'); return; }
  res.set('Access-Control-Allow-Origin', '*');
  for (const url of sources(z, x, y, key)) {
    try {
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      res.set('Content-Type', r.headers.get('content-type') || 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=604800, s-maxage=2592000');   // le CDN Firebase garde la tuile 30 jours : la 2e demande est instantanée
      res.status(200).send(buf);
      return;
    } catch (e) { /* source suivante */ }
  }
  res.status(502).send('IGN indisponible');
}

module.exports = { tile, sources };

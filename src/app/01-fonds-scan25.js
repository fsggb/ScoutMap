  /* ==== src/app/01-fonds-scan25.js : fonds de carte et couches (LAYERS), SCAN 25 (serveur ScoutHub), vérification de nouvelle version ==== */
  // ---------- Fonds et couches ----------
  var ATTR = '© <a href="https://geoservices.ign.fr/" target="_blank" rel="noopener">IGN</a> – Géoplateforme';
  var OSMA = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  /* Fonds (base:true) et couches. ign:true = données ouvertes de la Géoplateforme (impression multi-feuilles autorisée) ;
     les autres sont des serveurs de tuiles libres (OpenStreetMap…) réservés à la consultation. */
  var LAYERS = {
    plan: { base: true, ign: true, label: 'Plan IGN', l: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', f: 'png', n: 19 },
    ortho: { base: true, ign: true, label: 'Photographies', l: 'ORTHOIMAGERY.ORTHOPHOTOS', f: 'jpeg', n: 19 },
    otm: { base: true, label: 'Topo (OpenTopoMap)', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', n: 17,
      attr: OSMA + ' contributors · © <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)' },
    scan25: { base: true, hidden: true, label: 'SCAN 25 (Occitanie)', scan: true, n: 16,
      attr: '© IGN – SCAN 25® Topographique, diffusé par <a href="https://www.openig.org" target="_blank" rel="noopener">OPenIG</a> (Occitanie seulement)' },
    esri: { base: true, label: 'Satellite (Esri)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', n: 19,
      attr: 'Tiles © Esri — Source : Esri, Maxar, Earthstar Geographics et la communauté SIG' },
    osm: { base: true, label: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', n: 19, attr: OSMA + ' contributors' },
    osmfr: { base: true, label: 'OSM France', url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', n: 20, attr: OSMA + ' contributors · © OpenStreetMap France' },
    cyclosm: { base: true, label: 'CyclOSM', url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', n: 20,
      attr: OSMA + ' contributors · © <a href="https://www.cyclosm.org" target="_blank" rel="noopener">CyclOSM</a>' },
    etat: { base: true, ign: true, label: 'État-major (1820-66)', l: 'GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40', f: 'jpeg', n: 15 },
    cassini: { base: true, ign: true, label: 'Cassini (XVIIIe)', l: 'BNF-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI', f: 'png', n: 14 },
    cassiniroi: { base: true, ign: true, label: 'Cassini, exemplaire du roi', l: 'AN-IGNF_GEOGRAPHICALGRIDSYSTEMS.CASSINI', f: 'jpeg', n: 14 },
    carte1950: { base: true, ign: true, label: 'Carte de 1950', l: 'GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN50.1950', f: 'jpeg', n: 15 },
    photo1950: { base: true, ign: true, label: 'Photos aériennes 1950-65', l: 'ORTHOIMAGERY.ORTHOPHOTOS.1950-1965', f: 'png', n: 18 },
    contour: { ign: true, label: 'Courbes de niveau', icon: 'contour', l: 'ELEVATION.CONTOUR.LINE', f: 'png', n: 18, o: { minZoom: 12, opacity: 0.9 } },
    shade: { ign: true, label: 'Ombrage du relief', icon: 'shade', l: 'ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW', f: 'png', n: 15, o: { opacity: 0.55 } },
    lidar: { ign: true, label: 'Relief LiDAR HD', icon: 'mountain', l: 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW', f: 'png', n: 18, o: { opacity: 0.55 } },
    slope: { ign: true, label: 'Pentes', icon: 'slope', l: 'ELEVATION.SLOPES', f: 'jpeg', n: 14, o: { minZoom: 6, opacity: 0.5 } },
    cadastre: { ign: true, label: 'Cadastre', icon: 'parcel', l: 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS', f: 'png', n: 19, o: { minZoom: 12, opacity: 0.85 } },
    water: { label: 'Eau potable', icon: 'drop', vector: true, n: 19, o: {} },
    hiking: { label: 'Sentiers balisés (GR…)', icon: 'route', url: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', n: 18,
      attr: '© <a href="https://hiking.waymarkedtrails.org" target="_blank" rel="noopener">Waymarked Trails</a> / ' + OSMA + ' contributors', o: { opacity: 0.9, minZoom: 10 } }
  };
  var BASES = Object.keys(LAYERS).filter(function (k) { return LAYERS[k].base; });
  var OVERS = Object.keys(LAYERS).filter(function (k) { return !LAYERS[k].base; });
  function srcUrl(key, z, x, y) {
    var d = LAYERS[key];
    if (d.scan) return s25ProxyUrl(z, x, y);   // SCAN 25 : serveur de tuiles ScoutHub (utilisé pour l'enregistrement hors connexion)
    if (d.url) return d.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    return GP + '/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' + d.l + '&STYLE=normal&FORMAT=image/' + d.f +
      '&TILEMATRIXSET=PM&TILEMATRIX=' + z + '&TILEROW=' + y + '&TILECOL=' + x;
  }
  var wmtsUrl = srcUrl;
  /* « Netteté » : on demande des tuiles du niveau (z + off), affichées 2^off fois plus petites.
     Le fond affiché à une échelle donnée est donc celui du niveau juste au-dessus, au lieu d'un niveau dézoomé.
     Les serveurs libres (hors IGN) sont limités à un niveau de plus, pour rester raisonnables. */
  // ---------- SCAN 25 (Occitanie), flux d'OPenIG : on cherche automatiquement l'adresse de tuiles qui répond depuis cet appareil ----------
  var SCAN25 = { cfg: null, busy: null, tried: 0 };
  // SCAN 25 IGN : nécessite une clé personnelle (gratuite, cartes.gouv.fr), conservée sur CET appareil seulement : jamais dans le site ni dans les projets partagés.
  SCAN25.cfg = null;
  try {
    var k25 = scan25Src();
    if (k25 === 'hub') {   // membre ScoutHub : tuiles demandées au serveur ScoutHub (clé IGN dans ses propriétés)
      SCAN25.cfg = { t: 'gas', hub: true };
      LAYERS.scan25.hidden = false; LAYERS.scan25.label = 'SCAN 25 (IGN)'; LAYERS.scan25.attr = '© IGN – SCAN 25® (licence IGN, via ScoutHub)';
    } else if (/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(k25)) {   // relais Apps Script : la clé reste dans les propriétés du script
      SCAN25.key = k25; SCAN25.cfg = { t: 'gas', url: k25 };
      LAYERS.scan25.hidden = false; LAYERS.scan25.label = 'SCAN 25 (IGN)'; LAYERS.scan25.attr = '© IGN – SCAN 25® (licence IGN)';
    } else if (/^[0-9a-f]{32}$/i.test(k25)) {
      SCAN25.key = k25;
      SCAN25.cfg = { t: 'xyz', url: 'https://data.geopf.fr/private/wmts?apikey=' + k25 + '&SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.MAPS.SCAN25TOUR&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}' };
      LAYERS.scan25.hidden = false; LAYERS.scan25.label = 'SCAN 25 (IGN)'; LAYERS.scan25.attr = '© IGN – SCAN 25® (licence IGN, clé personnelle)';
    }
  } catch (e) { /* ignoré */ }
  var OPG = 'https://mapserver.openig.org';
  var OPG_DEPTS = ['d09_8f5762d', 'd11_71de4eb', 'd12_8c2053d', 'd30_ac5415a', 'd31_21bcd34', 'd32_a7b79f5', 'd34_a0e34f8', 'd46_45ac667', 'd48_567dec6', 'd65_635bbbc', 'd66_c19e31f', 'd81_3388d52', 'd82_c843727'].map(function (x) { return 'sc25_topo_jp2-e100_lamb93_' + x; });
  function scan25Candidates() {
    var c = [], B = OPG + '/mapcache', ly = ['scan25topo'];
    ['GoogleMapsCompatible', 'g'].forEach(function (g) {
      ['png', 'jpg'].forEach(function (f) { c.push({ t: 'xyz', url: B + '/wmts/1.0.0/scan25topo/default/' + g + '/{z}/{y}/{x}.' + f }); });
      ['image/png', 'image/jpeg'].forEach(function (f) { c.push({ t: 'xyz', url: B + '/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=scan25topo&STYLE=default&TILEMATRIXSET=' + g + '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=' + f }); });
      c.push({ t: 'xyz', url: B + '/tms/1.0.0/scan25topo@' + g + '/{z}/{x}/{y}.png', tms: true });
      c.push({ t: 'xyz', url: B + '/tms/1.0.0/scan25topo@' + g + '/{z}/{x}/{y}.jpg', tms: true });
    });
    ['image/png', 'image/jpeg'].forEach(function (f) { c.push({ t: 'wms', url: B + '/', layers: 'scan25topo', fmt: f }); });
    ['image/jpeg', 'image/png'].forEach(function (f) { c.push({ t: 'wms', url: OPG + '/maps/openig', layers: OPG_DEPTS.join(','), fmt: f }); });
    return c;
  }
  function scan25TestUrl(c, z, x, y) {
    if (c.t === 'wms') {
      var n = Math.pow(2, z), R = 20037508.34, w = 2 * R / n, x0 = -R + x * w, y1 = R - y * w;
      return c.url + (c.url.indexOf('?') < 0 ? '?' : '&') + 'SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=' + encodeURIComponent(c.layers) + '&STYLES=&SRS=EPSG:3857&BBOX=' + [x0, y1 - w, x0 + w, y1].join(',') + '&WIDTH=256&HEIGHT=256&FORMAT=' + encodeURIComponent(c.fmt);
    }
    return c.url.replace('{z}', z).replace('{x}', x).replace('{y}', c.tms ? Math.pow(2, z) - 1 - y : y);
  }
  function scan25Probe() {
    var z = 12, lat = 43.6, lon = 1.44, n = Math.pow(2, z), x = Math.floor((lon + 180) / 360 * n), r = lat * Math.PI / 180, y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
    var cands = scan25Candidates();
    return Promise.all(cands.map(function (c) {
      return new Promise(function (res) {
        var im = new Image(), done = false, t = setTimeout(function () { if (!done) { done = true; res(false); } }, 9000);
        im.onload = function () { if (!done) { done = true; clearTimeout(t); res(im.naturalWidth >= 200); } };
        im.onerror = function () { if (!done) { done = true; clearTimeout(t); res(false); } };
        im.src = scan25TestUrl(c, z, x, y);
      });
    })).then(function (oks) { var k = oks.indexOf(true); return k < 0 ? null : cands[k]; });
  }
  function ensureScan25() {
    if (SCAN25.cfg) return Promise.resolve(SCAN25.cfg);
    if (SCAN25.busy) return SCAN25.busy;
    toast('Recherche du service SCAN 25 d’OPenIG…');
    return (SCAN25.busy = scan25Probe().then(function (c) {
      SCAN25.busy = null;
      if (c) { SCAN25.cfg = c; try { localStorage.setItem('scoutmap.scan25', JSON.stringify(c)); } catch (e) { /* ignoré */ } return c; }
      SCAN25.tried++; return null;
    }));
  }
  // Nouvelle version du site publiée ? On compare l'identifiant de version avec celui de la page d'accueil du serveur ; le bandeau propose de recharger.
  (function () {
    if (SITE_V === 'locale') return;
    var shown = false;
    function check() {
      if (shown || document.visibilityState === 'hidden') return;
      fetch(location.pathname + '?_=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
        var m = /js\/app\.js\?v=([0-9a-f]{6,})/.exec(t); if (!m || m[1] === SITE_V || shown) return; shown = true;
        var act = { label: 'Mettre à jour', fn: forceUpdate };
        setNote('update', 'Une nouvelle version de ScoutMap est disponible.', 'info', act);
        toast('Une nouvelle version de ScoutMap est disponible.', { kind: 'info', action: act });
      }).catch(function () { /* hors ligne : on réessaiera */ });
    }
    setTimeout(check, 8000); setInterval(check, 10 * 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setTimeout(check, 1500); });
  })();
  // Adresse du serveur ScoutHub : lue dans config.js de ScoutHub (même site), chargée à la demande.
  var HUB_P = null;
  function hubApi() {
    if (window.SCOUTHUB_API) return Promise.resolve(window.SCOUTHUB_API);
    if (HUB_P) return HUB_P;
    function load(src) { return new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = src; sc.onload = function () { window.SCOUTHUB_API ? res(window.SCOUTHUB_API) : rej(new Error('adresse du serveur absente')); }; sc.onerror = function () { rej(new Error('config ScoutHub introuvable')); }; document.head.appendChild(sc); }); }
    HUB_P = load('/ScoutHub/config.js').catch(function () { return load('https://fsggb.github.io/ScoutHub/config.js'); }).catch(function (e) { HUB_P = null; throw new Error('ScoutHub injoignable (' + (e && e.message) + ')'); });
    return HUB_P;
  }
  // ---- Tuiles SCAN 25 par lots : une seule requête au serveur pour jusqu'à 16 tuiles (le serveur les demande à l'IGN en parallèle) + mémoire durable sur l'appareil.
  var S25 = { q: [], timer: null, busy: 0, mem: {}, nmem: 0, store: null, batchOk: true };
  function s25Store() { return S25.store || (S25.store = window.caches ? caches.open('sm-s25').catch(function () { return null; }) : Promise.resolve(null)); }
  function s25Url(z, x, y) { return 'https://s25.local/' + z + '/' + x + '/' + y; }
  function s25Get(z, x, y) {
    var k = z + '/' + x + '/' + y; if (S25.mem[k]) return Promise.resolve(S25.mem[k]);
    return s25Store().then(function (c) { return c ? c.match(s25Url(z, x, y)) : null; }).then(function (r) { return r ? r.text() : null; }).then(function (t) { if (t) { S25.mem[k] = t; S25.nmem++; } return t; }, function () { return null; });
  }
  function s25Put(z, x, y, d) {
    if (S25.nmem > 250) { S25.mem = {}; S25.nmem = 0; }
    S25.mem[z + '/' + x + '/' + y] = d; S25.nmem++;
    s25Store().then(function (c) { if (c) return c.put(s25Url(z, x, y), new Response(d)); }).catch(function () { /* stockage plein : ignoré */ });
  }
  function s25Fetch(z, x, y) {
    return s25Get(z, x, y).then(function (hit) { return hit || new Promise(function (res, rej) { S25.q.push({ z: z, x: x, y: y, res: res, rej: rej, n: 0 }); s25Kick(); }); });
  }
  function s25Kick() { if (S25.q.length >= 16) { s25Pump(); return; } if (!S25.timer) S25.timer = setTimeout(function () { S25.timer = null; s25Pump(); }, 30); }
  function s25Pump() {
    while (S25.busy < 3 && S25.q.length) s25Send(S25.q.splice(Math.max(0, S25.q.length - 16)));   // les tuiles les plus récentes d'abord (la vue actuelle)
  }
  function s25Retry(it, msg) {
    if (/non configur|Limite|Action inconnue|invalide/.test(msg || '') || ++it.n >= 3) { it.rej(new Error(msg || 'échec')); return; }
    setTimeout(function () { S25.q.push(it); s25Kick(); }, 600 * it.n);
  }
  function s25One(it) {   // ancien serveur sans lots : une tuile par requête
    return hubApi().then(function (api) { return fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'scan25', z: it.z, x: it.x, y: it.y }) }); })
      .then(function (r) { return r.json(); }).then(function (j) { if (j.d) { s25Put(it.z, it.x, it.y, j.d); it.res(j.d); } else s25Retry(it, j.error || j.err); }, function (e) { s25Retry(it, e && e.message); });
  }
  function s25Send(items) {
    S25.busy++;
    var done = function () { S25.busy--; s25Pump(); };
    if (!S25.batchOk) { Promise.all(items.map(s25One)).then(done, done); return; }
    hubApi().then(function (api) { return fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'scan25b', t: items.map(function (i) { return [i.z, i.x, i.y]; }) }) }); })
      .then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok && j.error === 'Action inconnue.') { S25.batchOk = false; return Promise.all(items.map(s25One)); }
        if (!j.ok) throw new Error(j.error || 'erreur du serveur');
        items.forEach(function (it, k) { var d = j.t && j.t[k]; if (d) { s25Put(it.z, it.x, it.y, d); it.res(d); } else s25Retry(it, j.e || 'tuile absente'); });
      }).catch(function (e) { items.forEach(function (it) { s25Retry(it, e && e.message); }); }).then(done, done);
  }
  // Service de tuiles SCAN 25 (Cloudflare Workers, gratuit) : la clé IGN reste dans le coffre du service, les tuiles sont servies en binaire et mises en cache :
  // aussi rapide que les autres fonds. Sans adresse configurée (ou si le service tombe), on retombe sur les lots du serveur ScoutHub.
  // Service SCAN 25 : le serveur Cloudflare de ScoutHub (clé IGN dans le magasin de secrets du compte, cache 30 jours)
  var S25P = { url: 'https://scouthub.fsggb.workers.dev/scan25/{z}/{x}/{y}.jpg', ok: true, fails: 0, seen: false };
  try { var u25 = localStorage.getItem('scoutmap.s25url'); if (u25 && /^https:\/\/[\w.-]+\/scan25\/\{z\}\/\{x\}\/\{y\}\.jpg$/.test(u25)) { S25P.url = u25; S25P.ok = true; } } catch (e) { /* ignoré */ }
  function s25ProxyUrl(z, x, y) { return S25P.url.replace('{z}', z).replace('{x}', x).replace('{y}', y); }
  // Aperçu réel du SCAN 25 (vraie tuile, comme les autres fonds) pour les vignettes
  function s25Thumb(img) {
    if (!img) return;
    var n = 1 << 10, lat = 45.19 * Math.PI / 180, x = Math.floor((5.72 + 180) / 360 * n), y = Math.floor((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * n);
    if (S25P.ok) { img.onerror = function () { img.onerror = null; s25Fetch(10, x, y).then(function (d) { img.src = 'data:image/jpeg;base64,' + d; }, function () { /* garde le dessin de remplacement */ }); }; img.src = s25ProxyUrl(10, x, y); return; }
    s25Fetch(10, x, y).then(function (d) { img.src = 'data:image/jpeg;base64,' + d; }, function () { /* garde le dessin de remplacement */ });
  }
  function scan25Layer(off, extra) {
    var c = SCAN25.cfg; if (!c) return L.featureGroup();
    var so = Math.max(0, Math.min(2, off | 0));   // 2 : tuiles du niveau 16 (la meilleure définition de l'IGN) affichées en 64 px, soit environ 380 ppp à l'impression
    var o = Object.assign({ maxZoom: 19, maxNativeZoom: 16 - so, tileSize: 256 / Math.pow(2, so), attribution: LAYERS.scan25.attr, keepBuffer: 2 }, extra || {});
    if (c.t === 'gas') {
      // Tuiles demandées au serveur Apps Script : 6 à la fois au plus (Google refuse les rafales), 3 essais, cause de l'échec signalée une fois.
      if (c.hub) {
        var H = L.GridLayer.extend({ createTile: function (co, done) {
          var im = document.createElement('img'); im.alt = '';
          var viaRelay = function () {   // secours : lots demandés au serveur ScoutHub
            s25Fetch(co.z + so, co.x, co.y).then(function (d) { im.onload = function () { done(null, im); }; im.onerror = function () { done(new Error('image illisible'), im); }; im.src = 'data:image/jpeg;base64,' + d; }, function (e) {
              var m = (e && e.message) || 'échec'; if (m === 'Action inconnue.') m = 'mise à jour Code.gs de ScoutHub à redéployer';
              if (!SCAN25.warned) { SCAN25.warned = true; toast('SCAN 25 : tuiles indisponibles (' + m + ').'); } done(new Error(m), im);
            });
          };
          if (!S25P.ok) { viaRelay(); return im; }
          var plain = false;
          im.crossOrigin = 'anonymous';
          im.onload = function () { S25P.seen = true; S25P.fails = 0; done(null, im); };
          im.onerror = function () {
            if (!plain) { plain = true; im.removeAttribute('crossorigin'); im.src = s25ProxyUrl(co.z + so, co.x, co.y); return; }   // sans CORS : l'affichage marche quand même
            if (!S25P.seen && ++S25P.fails >= 4) S25P.ok = false;
            viaRelay();
          };
          im.src = s25ProxyUrl(co.z + so, co.x, co.y);
          return im;
        } });
        return new H(Object.assign({ minNativeZoom: Math.max(0, 6 - so) }, o));
      }
      var running = 0, queue = [];
      var pump = function () { while (running < 6 && queue.length) { running++; queue.shift()(); } };
      var G = L.GridLayer.extend({ createTile: function (co, done) {
        var im = document.createElement('img'), n = 0; im.alt = '';
        var fail = function (msg) { if (!SCAN25.warned) { SCAN25.warned = true; toast('SCAN 25 : tuiles indisponibles (' + msg + ').'); } if (window.console) console.warn('SCAN 25 :', msg); done(new Error(msg), im); };
        var go = function () {
          var req = c.hub
            ? hubApi().then(function (api) {
                return fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'scan25', token: localStorage.getItem('scouthub.token') || '', z: co.z + so, x: co.x, y: co.y }) });
              })
            : fetch(c.url + '?z=' + (co.z + so) + '&x=' + co.x + '&y=' + co.y);
          req.then(function (r) { return r.json(); }).then(function (j) {
            running--; pump();
            if (!j.d) { var m = j.err || j.error || 'réponse vide'; if (m === 'Action inconnue.') m = 'mise à jour Code.gs de ScoutHub à redéployer'; if (/HTTP 40[134]|Session|session|non configur|invalide|inconnue|redéployer/.test(m) || ++n >= 3) return fail(m); queue.push(go); pump(); return; }
            im.onload = function () { done(null, im); }; im.onerror = function () { fail('image illisible'); }; im.src = 'data:image/jpeg;base64,' + j.d;
          }).catch(function (e) { running--; pump(); if (++n < 3) setTimeout(function () { queue.push(go); pump(); }, 700 * n); else fail((e && e.message) || 'serveur injoignable'); });
        };
        queue.push(go); pump();
        return im;
      } });
      return new G(Object.assign({ minNativeZoom: Math.max(0, 6 - so) }, o));
    }
    if (c.t === 'wms') return L.tileLayer.wms(c.url, Object.assign({ layers: c.layers, format: c.fmt, version: '1.1.1', transparent: false }, o));
    return L.tileLayer(c.url, Object.assign({ tms: !!c.tms }, o));
  }
  function tile(key, off, extra) {
    var d = LAYERS[key]; off = d.ign || d.scan ? off : Math.min(off, extra && extra.hires ? 2 : 1);
    if (d.scan) return scan25Layer(off, extra);
    var layer = L.tileLayer(srcUrl(key, '{z}', '{x}', '{y}'), Object.assign({
      maxZoom: 19, maxNativeZoom: d.n - off, tileSize: 256 / Math.pow(2, off), zoomOffset: off, attribution: d.attr || ATTR, keepBuffer: 2, crossOrigin: 'anonymous',
      subdomains: 'abc'
    }, d.o || {}, extra || {}));
    // Une tuile en erreur (panne ponctuelle du serveur) est redemandée jusqu'à 3 fois : pas de trou sur une carte imprimée.
    layer.on('tileerror', function (e) {
      var t = e.tile; t._retry = (t._retry || 0) + 1;
      if (t._retry <= 3) setTimeout(function () { var u = t.src; t.src = ''; t.src = u; }, 500 * t._retry);
    });
    return layer;
  }
  var tiles = {}, curOff = 1;


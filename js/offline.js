/* Hors connexion : installation comme application, mémorisation de zones de carte, indicateur de réseau. */
(function () {
  'use strict';
  var SM = window.SM, S = SM.S, map = SM.map, esc = SM.esc, toast = SM.toast;
  function $(s, r) { return (r || document).querySelector(s); }
  var TILES = 'sm-tiles-v1', KEY = 'scoutmap.offline', MAXTILES = 16000;

  // ---------- Service worker (pas dans une page web exportée) ----------
  var swOk = false;
  if ('serviceWorker' in navigator && (!window.SM_VIEWER || window.SM_LIVE_ROOM) && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').then(function () { swOk = true; render(); }, function () { /* sans service worker : fonctionnement normal en ligne */ });
  }

  // ---------- Installation (bouton « Installer l'application ») ----------
  var deferred = null, standalone = window.matchMedia && (matchMedia('(display-mode: standalone)').matches || navigator.standalone);
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; render(); if (SM.offRefresh) SM.offRefresh(); });
  window.addEventListener('appinstalled', function () { deferred = null; standalone = true; toast('ScoutMap est installée : retrouvez-la parmi vos applications.'); render(); });
  function install() {
    if (deferred) { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; render(); }); return; }
    if (ios) { help('Sur iPhone et iPad : touchez le bouton Partager de Safari (le carré avec une flèche), puis « Sur l’écran d’accueil ».'); return; }
    help('Dans le menu de votre navigateur (⋮ ou ⋯), choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ». Sur ordinateur, une icône d’installation apparaît aussi dans la barre d’adresse.');
  }
  function help(t) { var n = $('#off-help'); if (n) { n.textContent = t; n.hidden = false; } toast(t.length > 120 ? t.slice(0, 117) + '…' : t); }

  // ---------- Indicateur de réseau ----------
  var pill = document.createElement('div'); pill.id = 'net-pill'; pill.setAttribute('role', 'status'); pill.hidden = true; pill.textContent = 'Hors connexion';
  document.body.appendChild(pill);
  function net() { pill.hidden = navigator.onLine !== false; document.body.classList.toggle('offline', navigator.onLine === false); }
  window.addEventListener('offline', function () { net(); toast('Vous êtes hors connexion : vos cartes enregistrées, vos projets et le GPS restent disponibles. Le calcul d’itinéraire et la recherche demandent du réseau ; en attendant, les points sont reliés en ligne droite.'); });
  window.addEventListener('online', function () { net(); toast('De retour en ligne.'); });
  net();

  // ---------- Zones enregistrées ----------
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function save(l) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { /* ignoré */ } }
  // Fonds enregistrables : le SCAN 25 d'abord (carte IGN au 1 : 25 000, la référence sur le terrain), coché par défaut.
  function zl() { return (SM.LAYERS.scan25 && !SM.LAYERS.scan25.hidden ? [['scan25', 'SCAN 25 (carte IGN)']] : []).concat([['plan', 'Plan IGN'], ['ortho', 'Photographies aériennes']]); }
  /* Zone enregistrée : par défaut, ce qu'il faudrait pour imprimer une feuille A0 au 1 : 25 000 avec la netteté maximale
     (tuiles du niveau 16, la meilleure définition du SCAN 25), centrée sur le milieu de l'écran. Un cadre sur la carte montre la zone :
     on déplace la carte pour recadrer. « Écran » garde l'ancien fonctionnement (ce qui est affiché). */
  var FMT = [['A0', 841, 1189], ['A1', 594, 841], ['A2', 420, 594], ['A3', 297, 420], ['A4', 210, 297], ['ecran', 0, 0]];
  var st = { prec: 16, fmt: 'A0', land: false, layers: { scan25: true, plan: false, ortho: false }, busy: false, stop: false };
  try { var sv = JSON.parse(localStorage.getItem('scoutmap.offline.cfg') || 'null'); if (sv) { if (FMT.some(function (f) { return f[0] === sv.fmt; })) st.fmt = sv.fmt; st.land = !!sv.land; } } catch (e) { /* ignoré */ }
  function saveCfg() { try { localStorage.setItem('scoutmap.offline.cfg', JSON.stringify({ fmt: st.fmt, land: st.land })); } catch (e) { /* ignoré */ } }
  // emprise au sol (en mètres) de la feuille au 1 : 25 000, centrée sur le milieu de la carte
  function frameBounds() {
    var f = FMT.filter(function (x) { return x[0] === st.fmt; })[0];
    if (!f || !f[1]) { var bd = map.getBounds(); return [bd.getSouth(), bd.getWest(), bd.getNorth(), bd.getEast()]; }
    var w = (st.land ? f[2] : f[1]) * 25, h = (st.land ? f[1] : f[2]) * 25, c = map.getCenter();
    var dLat = h / 2 / 111320, dLon = w / 2 / (111320 * Math.cos(c.lat * Math.PI / 180));
    return [c.lat - dLat, c.lng - dLon, c.lat + dLat, c.lng + dLon];
  }
  var frame = null;
  function drawFrame() {
    var pop = $('#off-pop'), on = pop && !pop.hidden && st.fmt !== 'ecran';
    if (!on) { if (frame) { map.removeLayer(frame); frame = null; } return; }
    var b = frameBounds(), ll = [[b[0], b[1]], [b[2], b[3]]];
    if (!frame) frame = L.rectangle(ll, { color: '#c6a24e', weight: 3, dashArray: '10 6', fill: true, fillColor: '#c6a24e', fillOpacity: 0.06, interactive: false }).addTo(map);
    else frame.setBounds(ll);
  }
  function fitFrame() {   // à l'ouverture : la carte se règle pour montrer tout le cadre
    if (st.fmt === 'ecran') return;
    var b = frameBounds(), lb = L.latLngBounds([[b[0], b[1]], [b[2], b[3]]]);
    if (!map.getBounds().contains(lb)) map.fitBounds(lb, { padding: [30, 30], animate: false });
  }

  function offAt(z, lat) { return SM.scaleAt(z, lat) >= 200000 ? 0 : 1; }       // même règle que l'affichage : tuiles du niveau z + 1
  function tx(lon, z) { return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
  function ty(lat, z) { var r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z)); }
  // liste des tuiles d'une zone : [{k: couche, z, x, y}]
  function tilesOf(z0) {
    var out = [], b = z0.b, lat = (b[0] + b[2]) / 2;
    z0.layers.forEach(function (k) {
      var d = SM.LAYERS[k]; if (!d) return;
      for (var z = z0.zmin; z <= z0.zmax; z++) {
        var tz = Math.min(d.n, z + offAt(z, lat)), x0 = tx(b[1], tz), x1 = tx(b[3], tz), y0 = ty(b[2], tz), y1 = ty(b[0], tz);
        for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) out.push({ k: k, z: tz, x: x, y: y });
      }
    });
    var seen = {}; return out.filter(function (t) { var u = SM.srcUrl(t.k, t.z, t.x, t.y); if (seen[u]) return false; seen[u] = 1; return true; });
  }
  function current() {
    var z = map.getZoom(), ecran = st.fmt === 'ecran';
    return { b: frameBounds(), zmin: ecran ? Math.max(8, Math.floor(z) - 3) : 10, zmax: st.prec, fmt: st.fmt, layers: zl().filter(function (l) { return st.layers[l[0]]; }).map(function (l) { return l[0]; }) };
  }
  function countTiles(z0) {   // dénombrement par calcul (sans lister les tuiles) : rapide même pour une zone immense
    var n = 0, b = z0.b, lat = (b[0] + b[2]) / 2;
    z0.layers.forEach(function (k) {
      var d = SM.LAYERS[k]; if (!d) return;
      var seen = {};   // plusieurs niveaux d'affichage peuvent demander les mêmes tuiles : comptées une fois
      for (var z = z0.zmin; z <= z0.zmax; z++) { var tz = Math.min(d.n, z + offAt(z, lat)); if (seen[tz]) continue; seen[tz] = 1; n += (tx(b[3], tz) - tx(b[1], tz) + 1) * (ty(b[0], tz) - ty(b[2], tz) + 1); }
    });
    return n;
  }
  // tuiles déjà présentes grâce aux autres zones enregistrées : elles ne sont ni redemandées ni enregistrées deux fois (le stockage est indexé par adresse de tuile)
  // Calcul potentiellement long (énumérer toutes les tuiles de toutes les zones enregistrées) : mis en cache par signature des
  // zones, et plafonné (SAVEDSET_MAX) pour ne jamais bloquer longtemps la page même avec beaucoup de grandes zones enregistrées.
  var keepCache = { sig: '', set: null };
  var SAVEDSET_MAX = 60000;   // au-delà, l'estimation se contente d'un calcul approximatif (pas de dédoublonnage tuile à tuile)
  function savedSetSync(l) {
    var set = {}, total = 0;
    for (var i = 0; i < l.length && total <= SAVEDSET_MAX; i++) {
      var z = l[i]; if (countTiles(z) > MAXTILES) continue;
      var ts = tilesOf(z);
      for (var j = 0; j < ts.length && total <= SAVEDSET_MAX; j++) { set[tileUrl(ts[j])] = 1; total++; }
    }
    return total > SAVEDSET_MAX ? null : set;   // trop de tuiles pour un calcul instantané : pas d'estimation de doublons cette fois
  }
  function savedSet() {
    var l = load(), sig = l.map(function (z) { return z.id; }).join(',');
    if (keepCache.sig === sig) return keepCache.set;
    var set = savedSetSync(l);
    keepCache = { sig: sig, set: set }; return set;
  }
  function estimate() {
    var c = current(), n = countTiles(c), dup = 0;
    if (n && n <= MAXTILES && load().length) { var have = savedSet(); if (have) tilesOf(c).forEach(function (t) { if (have[tileUrl(t)]) dup++; }); }
    var avg = { scan25: 26, plan: 22, ortho: 28 }, per = c.layers.map(function (k) { return avg[k] || 25; }), mean = per.length ? per.reduce(function (a, b) { return a + b; }, 0) / per.length : 25;
    return { n: n, dup: dup, mb: Math.round((n - dup) * mean / 1024) };
  }
  function tileUrl(t) { return SM.srcUrl(t.k, t.z, t.x, t.y); }

  /* Téléchargement d'une zone. Sans argument : la zone du cadre. Avec { zone } : compléter une carte déjà enregistrée
     (seules les tuiles manquantes sont demandées) ; avec { zone, refresh: true } : la mettre à jour (tout est redemandé).
     Pendant le téléchargement : l'écran reste allumé (si l'appareil le permet) et une notification suit l'avancement,
     même si on ferme la fenêtre. */
  var wake = null;
  function keepAwake(on) {
    try {
      if (on && navigator.wakeLock && !wake) navigator.wakeLock.request('screen').then(function (w) { wake = w; w.addEventListener('release', function () { wake = null; }); }, function () { /* refusé : pas grave */ });
      if (!on && wake) { wake.release(); wake = null; }
    } catch (e) { /* ignoré */ }
  }
  document.addEventListener('visibilitychange', function () { if (st.busy && document.visibilityState === 'visible') keepAwake(true); });
  function download(opt) {
    opt = opt || {};
    if (st.busy) { toast('Un enregistrement est déjà en cours.'); return; }
    if (!('caches' in window)) { toast('Cet appareil ne permet pas l’enregistrement hors connexion.'); return; }
    if (navigator.onLine === false) { toast('Pas de réseau : connectez-vous pour enregistrer une carte.'); return; }
    var z = opt.zone || current(); if (!z.layers.length) { toast('Choisissez au moins un fond de carte.'); return; }
    if (countTiles(z) > MAXTILES) { toast('Zone trop grande (plus de ' + MAXTILES + ' tuiles) : choisissez un format plus petit ou un seul fond.'); return; }
    var list = tilesOf(z);
    var name = opt.zone ? opt.zone.name : (($('#off-name') && $('#off-name').value) || '').trim() || ('Carte du ' + new Date().toLocaleDateString('fr-FR'));
    st.busy = true; st.stop = false; var done = 0, fail = 0, bytes = 0, got = 0;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(function () { renderStorage(); });
    keepAwake(true);
    var card = toast((opt.refresh ? 'Mise à jour' : opt.zone ? 'Compléter' : 'Enregistrement') + ' de « ' + name + ' » : 0 %', { kind: 'info', sticky: true, action: { label: 'Arrêter', fn: function () { st.stop = true; } } });
    var lastPct = -1;
    function prog() {
      var pct = Math.round(done / list.length * 100), bar = $('#off-bar'), txt = $('#off-prog');
      if (bar) { bar.hidden = false; bar.firstElementChild.style.width = pct + '%'; }
      if (txt) txt.textContent = done + ' / ' + list.length + ' tuiles' + (fail ? ' (' + fail + ' absentes)' : '');
      if (card && pct !== lastPct) { lastPct = pct; var t = card.querySelector('.ntf-t'); if (t) t.textContent = (opt.refresh ? 'Mise à jour' : opt.zone ? 'Compléter' : 'Enregistrement') + ' de « ' + name + ' » : ' + pct + ' % (' + done + ' / ' + list.length + ' tuiles)'; }
    }
    render(); prog();
    caches.open(TILES).then(function (c) {
      var idx = 0, workers = 6;
      function grab(u) {
        return fetch(u, { mode: 'cors', cache: opt.refresh ? 'reload' : 'default' }).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.clone().blob().then(function (b) { bytes += b.size; got++; return c.put(u, r); });
        });
      }
      function next() {
        if (st.stop || idx >= list.length) return Promise.resolve();
        var t = list[idx++], u = tileUrl(t);
        var job = opt.refresh ? grab(u) : c.match(u, { ignoreVary: true }).then(function (hit) { if (!hit) return grab(u); });
        return job.then(function () { done++; prog(); }, function (e) { if (e && e.name === 'QuotaExceededError') { st.stop = true; st.quota = true; } fail++; done++; prog(); }).then(next);
      }
      var ps = []; for (var i = 0; i < workers; i++) ps.push(next());
      return Promise.all(ps);
    }).then(function () {
      st.busy = false; keepAwake(false); var bar = $('#off-bar'); if (bar) bar.hidden = true;
      if (card) SM.ntfStow(card);
      if (st.quota) { st.quota = false; toast('Espace de stockage plein sur l’appareil : supprimez une carte enregistrée ou choisissez un format plus petit.', { kind: 'bad' }); }
      else if (st.stop) toast('Enregistrement arrêté : « Compléter » reprendra là où il s’est arrêté.', { kind: 'warn' });
      var l = load(), mb = Math.round(bytes / 1048576 * 10) / 10;
      if (opt.zone) l.forEach(function (x) { if (x.id === opt.zone.id) { x.fail = fail; x.t = opt.refresh ? Date.now() : x.t; x.checked = Date.now(); if (opt.refresh) x.mb = mb || x.mb; else x.mb = Math.round(((x.mb || 0) + mb) * 10) / 10; x.partial = !!(st.stop || fail); } });
      else l.push({ id: Date.now(), name: name, b: z.b, zmin: z.zmin, zmax: z.zmax, fmt: z.fmt, layers: z.layers, n: list.length, fail: fail, mb: mb || estimate().mb, t: Date.now(), partial: !!(st.stop || fail) });
      save(l);
      if (!st.stop) toast(fail > list.length * 0.3 ? '« ' + name + ' » : beaucoup de tuiles manquent (' + fail + '). Touchez « Compléter » avec du réseau.' : fail ? '« ' + name + ' » enregistrée (' + fail + ' tuiles manquantes : « Compléter » pour les reprendre).' : '« ' + name + ' » est enregistrée : elle fonctionne maintenant sans réseau.', { kind: fail > list.length * 0.3 ? 'warn' : 'ok' });
      st.stop = false; render(); refreshAll();
    }).catch(function (e) { st.busy = false; keepAwake(false); if (card) SM.ntfStow(card); var bar = $('#off-bar'); if (bar) bar.hidden = true; toast('Enregistrement impossible : ' + (e && e.name === 'QuotaExceededError' ? 'espace de stockage plein sur l’appareil.' : 'erreur.'), { kind: 'bad' }); render(); });
  }
  // vérifier qu'une carte est complète (tuiles réellement présentes sur l'appareil)
  function verify(id) {
    var z = load().filter(function (x) { return x.id === id; })[0]; if (!z || !('caches' in window)) return Promise.resolve(null);
    var list = tilesOf(z);
    return caches.open(TILES).then(function (c) { return Promise.all(list.map(function (t) { return c.match(tileUrl(t), { ignoreVary: true }).then(function (h) { return h ? 1 : 0; }); })); }).then(function (r) {
      var have = r.reduce(function (a, b) { return a + b; }, 0), l = load();
      l.forEach(function (x) { if (x.id === id) { x.fail = list.length - have; x.partial = have < list.length; x.checked = Date.now(); } }); save(l);
      return { have: have, n: list.length };
    });
  }
  function rename(id, v) { v = (v || '').trim().slice(0, 50); if (!v) return; var l = load(); l.forEach(function (x) { if (x.id === id) x.name = v; }); save(l); refreshAll(); }
  // espace occupé sur l'appareil et protection contre l'effacement automatique par le navigateur
  var STORE = { used: null, quota: null, persisted: null };
  function renderStorage() {
    if (!navigator.storage || !navigator.storage.estimate) return;
    Promise.all([navigator.storage.estimate(), navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null)]).then(function (r) {
      STORE.used = r[0].usage; STORE.quota = r[0].quota; STORE.persisted = r[1];
      document.querySelectorAll('[data-off-storage]').forEach(function (el) { el.innerHTML = storageHtml(); });
    }).catch(function () { /* ignoré */ });
  }
  function fmtMb(b) { return b >= 1073741824 ? (b / 1073741824).toFixed(1).replace('.', ',') + ' Go' : Math.round(b / 1048576) + ' Mo'; }
  function storageHtml() {
    if (STORE.used == null) return '<p class="set-hint">Espace de stockage : information indisponible sur ce navigateur.</p>';
    var pct = STORE.quota ? Math.min(100, STORE.used / STORE.quota * 100) : 0;
    return '<div class="off-store"><div class="off-store-bar"><i style="width:' + Math.max(1, pct).toFixed(1) + '%"></i></div><small>' + fmtMb(STORE.used) + ' utilisés' + (STORE.quota ? ' sur ' + fmtMb(STORE.quota) + ' disponibles pour ScoutMap' : '') + '</small>' +
      (STORE.persisted === true ? '<small class="ok">✓ Protégé : le navigateur ne videra pas ces cartes de lui-même.</small>' : STORE.persisted === false ? '<small class="warn">Non protégé : le navigateur peut effacer ces cartes s’il manque de place. <button type="button" class="linkbtn" data-off-persist>Protéger</button> (installer l’application aide aussi).</small>' : '') + '</div>';
  }
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-off-persist]') && navigator.storage && navigator.storage.persist) navigator.storage.persist().then(function (ok) { toast(ok ? 'Cartes protégées contre l’effacement automatique.' : 'Le navigateur a refusé : installez l’application pour protéger vos cartes.', { kind: ok ? 'ok' : 'warn' }); renderStorage(); });
  });
  // les cartes enregistrées dessinées sur la carte (pointillés verts) : sans réseau, on voit où l'on a une carte
  var gZones = L.layerGroup();
  /* Union de rectangles alignés (les zones enregistrées) : renvoie les contours extérieurs (et les trous) sous forme d'anneaux [[lat,lon],…].
     Principe : on découpe le plan avec toutes les coordonnées, on marque les cases couvertes, puis on relie les côtés de cases qui touchent le vide. */
  function unionRings(rects) {
    var xs = [], ys = [];
    rects.forEach(function (r) { ys.push(r[0], r[2]); xs.push(r[1], r[3]); });
    function uniq(a) { a.sort(function (p, q) { return p - q; }); return a.filter(function (v, i) { return !i || v !== a[i - 1]; }); }
    xs = uniq(xs); ys = uniq(ys);
    var nx = xs.length - 1, ny = ys.length - 1; if (nx < 1 || ny < 1) return [];
    var cov = []; for (var i = 0; i < nx; i++) { cov.push([]); for (var j = 0; j < ny; j++) cov[i].push(false); }
    function ix(v) { return xs.indexOf(v); } function iy(v) { return ys.indexOf(v); }
    rects.forEach(function (r) { for (var a = ix(r[1]); a < ix(r[3]); a++) for (var b = iy(r[0]); b < iy(r[2]); b++) cov[a][b] = true; });
    function c(a, b) { return a >= 0 && b >= 0 && a < nx && b < ny && cov[a][b]; }
    var next = {};   // sommet « a,b » → sommets suivants (côtés orientés, intérieur à gauche)
    function add(p, q) { (next[p] = next[p] || []).push(q); }
    for (var a = 0; a < nx; a++) for (var b = 0; b < ny; b++) {
      if (!cov[a][b]) continue;
      if (!c(a, b - 1)) add(a + ',' + b, (a + 1) + ',' + b);
      if (!c(a + 1, b)) add((a + 1) + ',' + b, (a + 1) + ',' + (b + 1));
      if (!c(a, b + 1)) add((a + 1) + ',' + (b + 1), a + ',' + (b + 1));
      if (!c(a - 1, b)) add(a + ',' + (b + 1), a + ',' + b);
    }
    var rings = [];
    Object.keys(next).forEach(function (start) {
      while (next[start] && next[start].length) {
        var ring = [], cur = start, guard = 0;
        do { var n = next[cur].pop(); ring.push(cur); cur = n; } while (cur !== start && next[cur] && next[cur].length && ++guard < 100000);
        // on retire les sommets alignés
        var pts = ring.map(function (k) { var q = k.split(','); return [+q[0], +q[1]]; }), out = [];
        for (var m = 0; m < pts.length; m++) { var p0 = pts[(m + pts.length - 1) % pts.length], p1 = pts[m], p2 = pts[(m + 1) % pts.length]; if ((p1[0] - p0[0]) * (p2[1] - p1[1]) !== (p1[1] - p0[1]) * (p2[0] - p1[0])) out.push(p1); }
        if (out.length >= 3) rings.push(out.map(function (q) { return [ys[q[1]], xs[q[0]]]; }));
      }
    });
    return rings;
  }
  function drawZones() {
    gZones.clearLayers();
    var on = navigator.onLine === false || ($('#off-pop') && !$('#off-pop').hidden) || zonesShown;
    if (!on) { if (map.hasLayer(gZones)) map.removeLayer(gZones); return; }
    // un seul tracé pour l'ensemble des zones enregistrées (les chevauchements ne se voient pas) ; leurs noms en infobulle
    var zs = load(), rings = zs.length ? unionRings(zs.map(function (z) { return z.b; })) : [];
    if (rings.length) L.polygon(rings, { color: '#1a7f37', weight: 2.5, dashArray: '6 6', fillColor: '#1a7f37', fillOpacity: 0.07, interactive: true, bubblingMouseEvents: true }).bindTooltip(zs.map(function (z) { return z.name; }).join(' · '), { sticky: true }).addTo(gZones);
    if (!map.hasLayer(gZones)) gZones.addTo(map);
  }
  var zonesShown = false;
  function refreshAll() { render(); drawZones(); renderStorage(); if (SM.settings && SM.settings.refreshOffline) SM.settings.refreshOffline(); }
  window.addEventListener('offline', drawZones); window.addEventListener('online', drawZones);
  function remove(id) {
    var l = load(), z = l.filter(function (x) { return x.id === id; })[0]; if (!z) return;
    save(l.filter(function (x) { return x.id !== id; }));
    var others = l.filter(function (x) { return x.id !== id; }), keep = {};
    others.forEach(function (o) { tilesOf(o).forEach(function (t) { keep[tileUrl(t)] = 1; }); });
    caches.open(TILES).then(function (c) { return Promise.all(tilesOf(z).filter(function (t) { return !keep[tileUrl(t)]; }).map(function (t) { return c.delete(tileUrl(t)); })); }).then(function () { toast('Carte supprimée de l’appareil.'); refreshAll(); });
  }
  function show(id) { var z = load().filter(function (x) { return x.id === id; })[0]; if (z) { map.fitBounds([[z.b[0], z.b[1]], [z.b[2], z.b[3]]], { animate: true }); } }

  function render() {
    var box = $('#off-box'); if (!box) return;
    var l = load(), e = estimate(), canInstall = !standalone;
    var h = '';
    h += '<div class="off-card"><b>Application</b>' + (standalone ? '<p>ScoutMap est installée sur cet appareil.</p>' : '<p>Installez ScoutMap comme une application : une icône sur l’écran d’accueil, plein écran, et un démarrage même sans réseau.</p><button type="button" class="btn-primary sm" id="off-install">Installer l’application</button><p class="off-help" id="off-help" hidden></p>') + '</div>';
    h += '<div class="off-card"><b>Enregistrer une carte pour l’utiliser sans réseau</b><p>' + (st.fmt === 'ecran' ? 'La zone enregistrée est celle affichée à l’écran.' : 'Le cadre doré sur la carte montre la zone : une feuille ' + st.fmt + ' au 1 : 25 000, avec la meilleure netteté. Déplacez la carte pour recadrer.') + '</p>';
    h += '<div class="off-layers">' + zl().map(function (x) { return '<label class="off-ck"><input type="checkbox" data-ol="' + x[0] + '"' + (st.layers[x[0]] ? ' checked' : '') + '><span class="gcal-box"></span>' + esc(x[1]) + '</label>'; }).join('') + '</div>';
    h += '<div class="off-prec" role="radiogroup" aria-label="Taille de la zone">' + FMT.map(function (f) { return '<button type="button" role="radio" aria-checked="' + (st.fmt === f[0]) + '" class="off-p' + (st.fmt === f[0] ? ' on' : '') + '" data-ofmt="' + f[0] + '"><b>' + (f[1] ? f[0] : 'Écran') + '</b><small>' + (f[1] ? Math.round(f[1] * 25 / 100) / 10 + ' × ' + Math.round(f[2] * 25 / 100) / 10 + ' km' : 'ce qui est affiché') + '</small></button>'; }).join('') + '</div>';
    if (st.fmt !== 'ecran') h += '<div class="off-orient"><label class="off-ck"><input type="checkbox" id="off-land"' + (st.land ? ' checked' : '') + '><span class="gcal-box"></span>Paysage (cadre couché)</label></div>';
    h += '<input id="off-name" class="off-name" type="text" maxlength="50" placeholder="Nom de la zone (ex. Camp de Pâques)" aria-label="Nom de la zone">';
    h += '<p class="off-est' + (e.n > MAXTILES ? ' bad' : '') + '">' + (e.n > MAXTILES ? 'Zone trop grande : ' + e.n + ' tuiles (maximum ' + MAXTILES + '). Choisissez un format plus petit ou un seul fond.' : '≈ ' + e.n + ' tuiles' + (e.dup ? ', dont ' + e.dup + ' déjà enregistrées (non retéléchargées, non doublées) : environ ' + e.mb + ' Mo de plus' : ', environ ' + e.mb + ' Mo')) + '</p>';
    h += '<div class="off-bar" id="off-bar" hidden><i></i></div><p class="off-prog" id="off-prog"></p>';
    h += st.busy ? '<button type="button" class="btn-ghost sm" id="off-cancel">Annuler</button>' : '<button type="button" class="btn-primary sm" id="off-dl"' + (e.n > MAXTILES || !e.n ? ' disabled' : '') + '>Enregistrer cette zone</button>';
    h += '</div>';
    h += '<div class="off-card"><b>Cartes enregistrées</b><div data-off-storage>' + storageHtml() + '</div>' + zoneListHtml() + '</div>';
    h += '<p class="off-note">Sans réseau, ScoutMap affiche les zones enregistrées, ouvre vos projets déjà enregistrés et suit votre position GPS. Le calcul d’un chemin, l’altitude, la recherche d’un lieu et le partage en direct demandent du réseau ; les points posés en « ligne droite » fonctionnent partout. ' + (swOk ? '' : 'Le mode hors connexion de l’application se prépare au prochain chargement de la page.') + '</p>';
    var keepName = $('#off-name') ? $('#off-name').value : ''; box.innerHTML = h; if ($('#off-name')) $('#off-name').value = keepName;
    if (st.busy) { var b = $('#off-bar'); if (b) b.hidden = false; }
    // les boutons d'installation partout
    document.querySelectorAll('[data-install]').forEach(function (b) { b.hidden = standalone; });
  }
  var box = $('#off-box');
  if (box) {
    box.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t.closest('#off-install')) install();
      else if (t.closest('#off-dl')) download();
      else if (t.closest('#off-cancel')) { st.stop = true; }
      else if (t.closest('[data-ofmt]')) { st.fmt = t.closest('[data-ofmt]').dataset.ofmt; saveCfg(); fitFrame(); drawFrame(); SM.offRender(); }
      else if (t.closest('[data-odel]')) { if (confirm('Supprimer cette zone enregistrée ?')) remove(+t.closest('[data-odel]').dataset.odel); }
      else if (t.closest('[data-oshow]')) show(+t.closest('[data-oshow]').dataset.oshow);
    });
    box.addEventListener('change', function (ev) {
      var c = ev.target.closest('[data-ol]'); if (c) { st.layers[c.dataset.ol] = c.checked; SM.offRender(); }
      if (ev.target.id === 'off-land') { st.land = ev.target.checked; saveCfg(); fitFrame(); drawFrame(); SM.offRender(); }
    });
    // le cadre suit le milieu de la carte tant que la fenêtre est ouverte
    map.on('move', function () { if (frame) drawFrame(); });
    var pop = $('#off-pop');
    if (pop && window.MutationObserver) new MutationObserver(function () { if (!pop.hidden) fitFrame(); drawFrame(); drawZones(); renderStorage(); }).observe(pop, { attributes: true, attributeFilter: ['hidden'] });
  // la fenêtre « Hors connexion » est indépendante : rendue au démarrage et à chaque déplacement de la carte
    map.on('moveend', function () { if (!$('#off-pop').hidden && !st.busy) { var n = $('#off-name') ? $('#off-name').value : ''; render(); if ($('#off-name')) $('#off-name').value = n; } });
  }
  var ho = $('#home-offline'); if (ho) ho.addEventListener('click', function () { if (SM.openOffline) SM.openOffline(); });
  // liste des cartes enregistrées, avec leurs actions (utilisée dans la fenêtre Hors connexion et dans Réglages)
  function zoneListHtml() {
    var l = load();
    if (!l.length) return '<p class="set-hint">Aucune carte enregistrée sur cet appareil.</p>';
    return '<ul class="off-list off-zones">' + l.map(function (z) {
      var age = Math.floor((Date.now() - z.t) / 86400000), old = age > 180;
      return '<li data-zid="' + z.id + '"><div class="oz-main"><b class="oz-name" title="Double-clic pour renommer">' + esc(z.name) + '</b><small>' + (z.fmt && z.fmt !== 'ecran' ? z.fmt + ' · ' : '') + z.n + ' tuiles · ' + z.mb + ' Mo · ' + z.layers.map(function (k) { return SM.LAYERS[k] ? SM.LAYERS[k].label : k; }).join(', ') + ' · ' + new Date(z.t).toLocaleDateString('fr-FR') + '</small>' +
        (z.partial ? '<small class="warn">Incomplète' + (z.fail ? ' : ' + z.fail + ' tuiles manquent' : '') + '</small>' : old ? '<small class="warn">Enregistrée il y a plus de 6 mois : pensez à la mettre à jour.</small>' : '') + '</div>' +
        '<div class="oz-act"><button type="button" class="btn-ghost sm" data-oact="show">Voir</button>' +
        (z.partial ? '<button type="button" class="btn-primary sm" data-oact="complete">Compléter</button>' : '') +
        '<button type="button" class="ibtn" data-oact="menu" title="Autres actions" aria-label="Autres actions">⋯</button></div>' +
        '<div class="oz-more" hidden><button type="button" class="btn-ghost sm" data-oact="verify">Vérifier</button><button type="button" class="btn-ghost sm" data-oact="refresh">Mettre à jour</button><button type="button" class="btn-ghost sm" data-oact="rename">Renommer</button><button type="button" class="btn-ghost sm danger" data-oact="del">Supprimer</button></div></li>';
    }).join('') + '</ul>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-oact]'); if (!b) return;
    var li = b.closest('[data-zid]'), id = li ? +li.dataset.zid : 0, z = load().filter(function (x) { return x.id === id; })[0]; if (!z) return;
    var a = b.dataset.oact;
    if (a === 'menu') { var m = li.querySelector('.oz-more'); m.hidden = !m.hidden; return; }
    if (a === 'show') { if (SM.settings) SM.settings.close(); zonesShown = true; show(id); drawZones(); return; }
    if (a === 'complete') { download({ zone: z }); return; }
    if (a === 'refresh') { if (confirm('Télécharger de nouveau toute la carte « ' + z.name + ' » (' + z.n + ' tuiles) ?')) download({ zone: z, refresh: true }); return; }
    if (a === 'verify') { toast('Vérification de « ' + z.name + ' »…'); verify(id).then(function (r) { if (!r) return; toast(r.have === r.n ? '« ' + z.name + ' » est complète (' + r.n + ' tuiles).' : '« ' + z.name + ' » : ' + (r.n - r.have) + ' tuiles manquent sur ' + r.n + '. Touchez « Compléter ».', { kind: r.have === r.n ? 'ok' : 'warn' }); refreshAll(); }); return; }
    if (a === 'rename') { var v = prompt('Nouveau nom de la carte :', z.name); if (v) rename(id, v); return; }
    if (a === 'del') { if (confirm('Supprimer la carte « ' + z.name + ' » de cet appareil ?')) remove(id); }
  });
  document.addEventListener('dblclick', function (e) { var n = e.target.closest('.oz-name'); if (!n) return; var id = +n.closest('[data-zid]').dataset.zid, z = load().filter(function (x) { return x.id === id; })[0]; var v = z && prompt('Nouveau nom de la carte :', z.name); if (v) rename(id, v); });
  // aide à l'installation, adaptée à l'appareil
  function platform() {
    var ua = navigator.userAgent;
    if (ios) return /CriOS|FxiOS|EdgiOS/.test(ua) ? 'ios-other' : 'ios';
    if (/Android/i.test(ua)) return /SamsungBrowser/.test(ua) ? 'samsung' : /Firefox/.test(ua) ? 'android-firefox' : 'android';
    if (/Firefox/.test(ua)) return 'desktop-firefox';
    if (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) return 'mac-safari';
    return 'desktop';
  }
  var STEPS = {
    ios: ['Touchez le bouton <b>Partager</b> de Safari (le carré avec une flèche vers le haut).', 'Faites défiler et choisissez <b>Sur l’écran d’accueil</b>.', 'Touchez <b>Ajouter</b> : l’icône ScoutMap apparaît avec vos applications.'],
    'ios-other': ['Sur iPhone et iPad, l’installation se fait depuis <b>Safari</b> : ouvrez cette page dans Safari.', 'Puis bouton <b>Partager</b> › <b>Sur l’écran d’accueil</b>.'],
    android: ['Menu <b>⋮</b> de Chrome › <b>Installer l’application</b> (ou le bouton ci-dessous quand il apparaît).', 'Confirmez : l’icône ScoutMap apparaît avec vos applications.'],
    samsung: ['Menu <b>≡</b> de Samsung Internet › <b>Ajouter la page à</b> › <b>Écran d’accueil</b>.'],
    'android-firefox': ['Menu <b>⋮</b> de Firefox › <b>Installer</b> (ou <b>Ajouter à l’écran d’accueil</b>).'],
    desktop: ['Cliquez sur l’icône d’installation à droite de la barre d’adresse (Chrome, Edge), ou menu <b>⋮</b> › <b>Installer ScoutMap</b>.', 'ScoutMap s’ouvre alors dans sa propre fenêtre, avec son icône dans le menu Démarrer ou le Dock.'],
    'desktop-firefox': ['Firefox sur ordinateur ne sait pas installer d’application web : utilisez <b>Chrome</b> ou <b>Edge</b>, ou gardez simplement ScoutMap en favori (le hors connexion fonctionne aussi dans Firefox).'],
    'mac-safari': ['Menu <b>Fichier</b> de Safari › <b>Ajouter au Dock</b>.']
  };
  function installHtml() {
    if (standalone) return '<p class="ok">✓ ScoutMap est installée sur cet appareil : elle démarre même sans réseau.</p>';
    var pf = platform();
    return '<ol class="off-steps">' + (STEPS[pf] || STEPS.desktop).map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>' +
      (deferred ? '<button type="button" class="btn-primary sm" data-install>Installer l’application</button>' : '') +
      '<p class="set-hint">Installée, ScoutMap a son icône, s’ouvre en plein écran, démarre sans réseau et ses cartes enregistrées sont mieux protégées.</p>';
  }
  document.addEventListener('click', function (e) { if (e.target.closest('#setpage [data-install], #off-box [data-install]')) install(); });
  function appReady() {   // l'application elle-même est-elle gardée pour un démarrage sans réseau ?
    if (!('caches' in window)) return Promise.resolve(false);
    return caches.keys().then(function (ks) { var k = ks.filter(function (x) { return x.indexOf('sm-shell-') === 0; })[0]; if (!k) return false; return caches.open(k).then(function (c) { return c.keys(); }).then(function (r) { return r.length > 8; }); }).catch(function () { return false; });
  }
  SM.offListHtml = function () { return '<div data-off-storage>' + storageHtml() + '</div>' + zoneListHtml(); };
  SM.offInstallHtml = installHtml;
  SM.offAppReady = appReady;
  SM.offRemove = function (id, cb) { remove(id); setTimeout(function () { if (cb) cb(); }, 400); };
  SM.offShow = show;
  SM.offRefresh = refreshAll;
  SM.install = install; SM.offRender = function () { var n = $('#off-name') ? $('#off-name').value : ''; render(); if ($('#off-name')) $('#off-name').value = n; };
  document.querySelectorAll('[data-install]').forEach(function (b) { b.addEventListener('click', install); });
  render();
  renderStorage(); drawZones();
})();

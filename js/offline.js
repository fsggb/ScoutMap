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
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; render(); });
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
  function estimate() {
    var c = current(), n = countTiles(c);
    var avg = { scan25: 26, plan: 22, ortho: 28 }, per = c.layers.map(function (k) { return avg[k] || 25; }), mean = per.length ? per.reduce(function (a, b) { return a + b; }, 0) / per.length : 25;
    return { n: n, mb: Math.round(n * mean / 1024) };
  }
  function tileUrl(t) { return SM.srcUrl(t.k, t.z, t.x, t.y); }

  function download() {
    if (st.busy || !('caches' in window)) { if (!('caches' in window)) toast('Cet appareil ne permet pas l’enregistrement hors connexion.'); return; }
    var z = current(); if (!z.layers.length) { toast('Choisissez au moins un fond de carte.'); return; }
    if (countTiles(z) > MAXTILES) { toast('Zone trop grande (plus de ' + MAXTILES + ' tuiles) : choisissez un format plus petit ou un seul fond.'); return; }
    var list = tilesOf(z);
    if (!z.layers.length) { toast('Choisissez au moins un fond de carte.'); return; }
    if (list.length > MAXTILES) { toast('Zone trop grande (' + list.length + ' tuiles, maximum ' + MAXTILES + ') : zoomez sur la zone utile ou choisissez moins de précision.'); return; }
    var name = ($('#off-name').value || '').trim() || ('Zone du ' + new Date().toLocaleDateString('fr-FR'));
    st.busy = true; st.stop = false; var done = 0, fail = 0, bytes = 0;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    var bar = $('#off-bar'), txt = $('#off-prog'); bar.hidden = false;
    function prog() { bar.firstElementChild.style.width = Math.round(done / list.length * 100) + '%'; txt.textContent = done + ' / ' + list.length + ' tuiles' + (fail ? ' (' + fail + ' absentes)' : ''); }
    render(); prog();
    caches.open(TILES).then(function (c) {
      var idx = 0, workers = 6;
      function next() {
        if (st.stop || idx >= list.length) return Promise.resolve();
        var t = list[idx++], u = tileUrl(t);
        return c.match(u, { ignoreVary: true }).then(function (hit) {
          if (hit) { done++; prog(); return; }
          return fetch(u, { mode: 'cors' }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.clone().blob().then(function (b) { bytes += b.size; return c.put(u, r); });
          }).then(function () { done++; prog(); }, function () { fail++; done++; prog(); });
        }).then(next);
      }
      var ps = []; for (var i = 0; i < workers; i++) ps.push(next());
      return Promise.all(ps);
    }).then(function () {
      st.busy = false; bar.hidden = true;
      if (st.stop) { toast('Enregistrement interrompu.'); render(); return; }
      var l = load(); l.push({ id: Date.now(), name: name, b: z.b, zmin: z.zmin, zmax: z.zmax, layers: z.layers, n: list.length, fail: fail, mb: Math.round(bytes / 1048576 * 10) / 10 || estimate().mb, t: Date.now() }); save(l);
      toast(fail > list.length * 0.3 ? 'Zone enregistrée, mais beaucoup de tuiles manquent (' + fail + ') : réessayez avec du réseau.' : 'Zone « ' + name + ' » enregistrée : elle fonctionne maintenant sans réseau.');
      render();
    }).catch(function (e) { st.busy = false; bar.hidden = true; toast('Enregistrement impossible : ' + (e && e.name === 'QuotaExceededError' ? 'espace de stockage plein sur l’appareil.' : 'erreur.')); render(); });
  }
  function remove(id) {
    var l = load(), z = l.filter(function (x) { return x.id === id; })[0]; if (!z) return;
    save(l.filter(function (x) { return x.id !== id; }));
    var others = l.filter(function (x) { return x.id !== id; }), keep = {};
    others.forEach(function (o) { tilesOf(o).forEach(function (t) { keep[tileUrl(t)] = 1; }); });
    caches.open(TILES).then(function (c) { return Promise.all(tilesOf(z).filter(function (t) { return !keep[tileUrl(t)]; }).map(function (t) { return c.delete(tileUrl(t)); })); }).then(function () { toast('Zone supprimée.'); render(); });
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
    h += '<p class="off-est' + (e.n > MAXTILES ? ' bad' : '') + '">' + (e.n > MAXTILES ? 'Zone trop grande : ' + e.n + ' tuiles (maximum ' + MAXTILES + '). Choisissez un format plus petit ou un seul fond.' : '≈ ' + e.n + ' tuiles, environ ' + e.mb + ' Mo') + '</p>';
    h += '<div class="off-bar" id="off-bar" hidden><i></i></div><p class="off-prog" id="off-prog"></p>';
    h += st.busy ? '<button type="button" class="btn-ghost sm" id="off-cancel">Annuler</button>' : '<button type="button" class="btn-primary sm" id="off-dl"' + (e.n > MAXTILES || !e.n ? ' disabled' : '') + '>Enregistrer cette zone</button>';
    h += '</div>';
    h += '<div class="off-card"><b>Zones enregistrées</b>' + (l.length ? '<ul class="off-list">' + l.map(function (z) { return '<li><div><b>' + esc(z.name) + '</b><small>' + z.n + ' tuiles · ' + z.mb + ' Mo · ' + z.layers.map(function (k) { return SM.LAYERS[k] ? SM.LAYERS[k].label : k; }).join(', ') + '</small></div><button type="button" class="btn-ghost sm" data-oshow="' + z.id + '">Voir</button><button type="button" class="ibtn danger" data-odel="' + z.id + '" title="Supprimer cette zone" aria-label="Supprimer cette zone"><svg class="ic"><use href="#i-trash"/></svg></button></li>'; }).join('') + '</ul>' : '<p>Aucune zone pour l’instant.</p>') + '</div>';
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
    if (pop && window.MutationObserver) new MutationObserver(function () { if (!pop.hidden) fitFrame(); drawFrame(); }).observe(pop, { attributes: true, attributeFilter: ['hidden'] });
  // la fenêtre « Hors connexion » est indépendante : rendue au démarrage et à chaque déplacement de la carte
    map.on('moveend', function () { if (!$('#off-pop').hidden && !st.busy) { var n = $('#off-name') ? $('#off-name').value : ''; render(); if ($('#off-name')) $('#off-name').value = n; } });
  }
  var ho = $('#home-offline'); if (ho) ho.addEventListener('click', function () { if (SM.openOffline) SM.openOffline(); });
  SM.install = install; SM.offRender = function () { var n = $('#off-name') ? $('#off-name').value : ''; render(); if ($('#off-name')) $('#off-name').value = n; };
  document.querySelectorAll('[data-install]').forEach(function (b) { b.addEventListener('click', install); });
  render();
})();

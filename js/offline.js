/* Hors connexion : installation comme application, mémorisation de zones de carte, indicateur de réseau. */
(function () {
  'use strict';
  var SM = window.SM, S = SM.S, map = SM.map, esc = SM.esc, toast = SM.toast;
  function $(s, r) { return (r || document).querySelector(s); }
  var TILES = 'sm-tiles-v1', KEY = 'scoutmap.offline', MAXTILES = 6000;

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
  var ZL = [['plan', 'Plan IGN'], ['ortho', 'Photographies aériennes']];
  var PREC = [[15, 'Standard', 'jusqu’au 1 : 10 000'], [16, 'Détaillé', 'jusqu’au 1 : 5 000'], [17, 'Très détaillé', 'jusqu’au 1 : 2 500, plus lourd']];
  var st = { prec: 16, layers: { plan: true, ortho: false }, busy: false, stop: false };

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
    var bd = map.getBounds(), z = map.getZoom();
    return { b: [bd.getSouth(), bd.getWest(), bd.getNorth(), bd.getEast()], zmin: Math.max(8, Math.floor(z) - 3), zmax: st.prec, layers: ZL.filter(function (l) { return st.layers[l[0]]; }).map(function (l) { return l[0]; }) };
  }
  function countTiles(z0) {   // dénombrement par calcul (sans lister les tuiles) : rapide même pour une zone immense
    var n = 0, b = z0.b, lat = (b[0] + b[2]) / 2;
    z0.layers.forEach(function (k) {
      var d = SM.LAYERS[k]; if (!d) return;
      for (var z = z0.zmin; z <= z0.zmax; z++) { var tz = Math.min(d.n, z + offAt(z, lat)); n += (tx(b[3], tz) - tx(b[1], tz) + 1) * (ty(b[0], tz) - ty(b[2], tz) + 1); }
    });
    return n;
  }
  function estimate() {
    var c = current(), n = countTiles(c);
    var avg = { plan: 22, ortho: 28 }, per = c.layers.map(function (k) { return avg[k] || 25; }), mean = per.length ? per.reduce(function (a, b) { return a + b; }, 0) / per.length : 25;
    return { n: n, mb: Math.round(n * mean / 1024) };
  }
  function tileUrl(t) { return SM.srcUrl(t.k, t.z, t.x, t.y); }

  function download() {
    if (st.busy || !('caches' in window)) { if (!('caches' in window)) toast('Cet appareil ne permet pas l’enregistrement hors connexion.'); return; }
    var z = current(); if (!z.layers.length) { toast('Choisissez au moins un fond de carte.'); return; }
    if (countTiles(z) > MAXTILES) { toast('Zone trop grande (plus de ' + MAXTILES + ' tuiles) : zoomez sur la zone utile ou choisissez moins de précision.'); return; }
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
    h += '<div class="off-card"><b>Enregistrer cette zone pour l’utiliser sans réseau</b><p>Cadrez la zone voulue sur la carte (elle sera enregistrée telle qu’affichée), puis choisissez les fonds et la précision.</p>';
    h += '<div class="off-layers">' + ZL.map(function (x) { return '<label class="off-ck"><input type="checkbox" data-ol="' + x[0] + '"' + (st.layers[x[0]] ? ' checked' : '') + '><span class="gcal-box"></span>' + esc(x[1]) + '</label>'; }).join('') + '</div>';
    h += '<div class="off-prec" role="radiogroup" aria-label="Précision">' + PREC.map(function (p) { return '<button type="button" role="radio" aria-checked="' + (st.prec === p[0]) + '" class="off-p' + (st.prec === p[0] ? ' on' : '') + '" data-op="' + p[0] + '"><b>' + p[1] + '</b><small>' + p[2] + '</small></button>'; }).join('') + '</div>';
    h += '<input id="off-name" class="off-name" type="text" maxlength="50" placeholder="Nom de la zone (ex. Camp de Pâques)" aria-label="Nom de la zone">';
    h += '<p class="off-est' + (e.n > MAXTILES ? ' bad' : '') + '">' + (e.n > MAXTILES ? 'Zone trop grande : ' + e.n + ' tuiles (maximum ' + MAXTILES + '). Zoomez sur la zone utile.' : '≈ ' + e.n + ' tuiles, environ ' + e.mb + ' Mo') + '</p>';
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
      else if (t.closest('[data-op]')) { st.prec = +t.closest('[data-op]').dataset.op; render(); }
      else if (t.closest('[data-odel]')) { if (confirm('Supprimer cette zone enregistrée ?')) remove(+t.closest('[data-odel]').dataset.odel); }
      else if (t.closest('[data-oshow]')) show(+t.closest('[data-oshow]').dataset.oshow);
    });
    box.addEventListener('change', function (ev) { var c = ev.target.closest('[data-ol]'); if (c) { st.layers[c.dataset.ol] = c.checked; render(); } });
  // la fenêtre « Hors connexion » est indépendante : rendue au démarrage et à chaque déplacement de la carte
    map.on('moveend', function () { if (!$('#off-pop').hidden && !st.busy) { var n = $('#off-name') ? $('#off-name').value : ''; render(); if ($('#off-name')) $('#off-name').value = n; } });
  }
  var ho = $('#home-offline'); if (ho) ho.addEventListener('click', function () { if (SM.openOffline) SM.openOffline(); });
  SM.install = install; SM.offRender = function () { var n = $('#off-name') ? $('#off-name').value : ''; render(); if ($('#off-name')) $('#off-name').value = n; };
  document.querySelectorAll('[data-install]').forEach(function (b) { b.addEventListener('click', install); });
  render();
})();

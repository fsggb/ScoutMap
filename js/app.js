/* ScoutMap : application cartographique FSGGB (Géoplateforme IGN). */
(function () {
  'use strict';
  var G = Geo;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = G.esc;
  var GP = 'https://data.geopf.fr';
  var KEY = 'scoutmap.v3';
  function ic(n, c) { return '<svg class="ic' + (c ? ' ' + c : '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  function sp(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function arr(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }

  // ---------- État ----------
  /* Chaque tracé est un calque. S.route / S.az / S.meas sont les calques en cours d'édition ;
     S.layers contient les autres calques (itinéraires, azimuts, mesures déjà tracés). */
  var ROUTE_PAL = ['#000761', '#0e7490', '#7a3db8', '#d97706', '#1a7f37', '#2563eb'];
  var AZ_PAL = ['#c6a24e', '#d97706', '#7a3db8', '#0e7490', '#b4232c'];
  var MEAS_PAL = ['#2563eb', '#0e7490', '#7a3db8', '#d97706'];
  var uidc = 0;
  function nid() { return Date.now() * 100 + (uidc++ % 100); }
  function freshRoute(prev, n) {
    return { id: nid(), name: 'Itinéraire ' + n, color: ROUTE_PAL[(n - 1) % ROUTE_PAL.length], opt: prev ? prev.opt : 'fastest', loop: false,
      maxOn: false, maxKm: prev ? prev.maxKm : 10, avoidMotorway: prev ? prev.avoidMotorway : true, noBack: prev ? prev.noBack : true, snapChurch: prev ? prev.snapChurch : true, flagNat: prev ? prev.flagNat : true, wps: [] };
  }
  function freshAz(prev, n) {
    return { id: nid(), name: 'Azimuts ' + n, color: AZ_PAL[(n - 1) % AZ_PAL.length], pts: [], unit: prev ? prev.unit : 'deg', ref: prev ? prev.ref : 'true', decl: prev ? prev.decl : 0 };
  }
  function freshMeas(prev, n) {
    return { id: nid(), name: 'Mesure ' + n, color: MEAS_PAL[(n - 1) % MEAS_PAL.length], mode: prev ? prev.mode : 'dist', pts: [] };
  }
  var GAME_PAL = ['#c0262d', '#2563eb', '#1a7f37', '#d97706', '#7a3db8'];
  function freshGame(prev, n) { return { id: nid(), name: 'Grand jeu ' + n, color: GAME_PAL[(n - 1) % GAME_PAL.length], shapes: [] }; }
  var FRESH = { route: freshRoute, az: freshAz, meas: freshMeas, game: freshGame };
  var TYPES = ['route', 'az', 'meas', 'game'];
  var MODE_INFO = { route: { label: 'Itinéraire', icon: 'route' }, az: { label: 'Azimuts', icon: 'compass' }, meas: { label: 'Mesure', icon: 'ruler' }, game: { label: 'Grand jeu', icon: 'flag' } };
  var S = {
    name: '', mode: null, rail: 'route', panelOpen: true,
    base: 'plan', ov: { contour: false, shade: false, slope: false, cadastre: false, hiking: false, lidar: false },
    detail: 'auto', speed: 5, profileSrc: 'route', dockOpen: true, dockH: 230,
    vis: { route: true, az: true, meas: true, game: true },
    route: freshRoute(null, 1), az: freshAz(null, 1), meas: freshMeas(null, 1), game: freshGame(null, 1), layers: [],
    gameStyle: { fill: '#c0262d', alpha: 0.35, stroke: '#c0262d', linked: true, weight: 3, size: 18, fontColor: '#12142b', dash: false },
    tracks: [], view: { c: [46.6, 2.5], z: 5.6 }
  };
  try {
    var raw = localStorage.getItem(KEY), old = false;
    if (!raw) { raw = localStorage.getItem('scoutmap.v2') || localStorage.getItem('scoutmap.v1'); old = true; }
    var saved = JSON.parse(raw || 'null');
    if (saved) {
      if (old) { delete saved.detail; delete saved.snap; if (saved.speed === 4) delete saved.speed; }
      ['route', 'az', 'meas', 'game', 'vis', 'ov', 'gameStyle'].forEach(function (k) { if (saved[k]) Object.assign(S[k], saved[k]); });
      ['name', 'mode', 'rail', 'panelOpen', 'base', 'detail', 'speed', 'profileSrc', 'dockOpen', 'dockH', 'tracks', 'view'].forEach(function (k) { if (saved[k] !== undefined) S[k] = saved[k]; });
      if (Array.isArray(saved.layers)) S.layers = saved.layers.filter(function (l) { return l && l.data && l.type && FRESH[l.type]; });
      if (['route', 'az', 'meas', 'game', 'layers'].indexOf(S.rail) < 0) S.rail = 'route';
      if (!S.view || !S.view.c) S.view = { c: [46.6, 2.5], z: 5.6 };
      delete S.route.profile;
    }
  } catch (e) { /* stockage indisponible */ }
  if (TYPES.indexOf(S.mode) < 0) S.mode = null;
  if (['plan', 'ortho', 'otm', 'osm', 'osmfr', 'cyclosm', 'etat'].indexOf(S.base) < 0) S.base = 'plan';
  if (TYPES.indexOf(S.rail) >= 0 && S.mode && S.rail !== S.mode) S.rail = S.mode;
  if (!S.game.shapes) S.game.shapes = [];
  S.layers.forEach(function (l) { if (l.type === 'game' && !l.data.shapes) l.data.shapes = []; });
  function isMobile() { return !!(window.matchMedia && window.matchMedia('(max-width:860px)').matches); }
  if (isMobile() && !saved) { S.panelOpen = false; S.dockOpen = false; }
  ['route', 'az', 'meas', 'game'].forEach(function (k) { if (!S[k].id) S[k].id = nid(); });
  S.layers.forEach(function (l) { if (!l.data.id) l.data.id = nid(); });
  // ---------- Historique (annuler / rétablir) ----------
  var H = { undo: [], redo: [], lastKey: null, lastSnap: null, lastT: 0, ready: false };
  function hKey() {
    return JSON.stringify([S.route, S.az, S.meas, S.game, S.layers.map(function (l) { return { t: l.type, v: l.vis, d: l.data }; }), S.vis, S.tracks],
      function (k, v) { return k === 'place' ? undefined : v; });
  }
  function hSnap() { return JSON.stringify({ route: S.route, az: S.az, meas: S.meas, game: S.game, layers: S.layers, vis: S.vis, tracks: S.tracks, res: RT.route }); }
  function hButtons() {
    var u = document.getElementById('btn-undo'), r = document.getElementById('btn-redo');
    if (u) u.disabled = !H.undo.length; if (r) r.disabled = !H.redo.length;
  }
  // Appelée après chaque modification : les modifications rapprochées (frappe, glissement) forment une seule étape.
  function hTrack() {
    if (!H.ready) return;
    var k = hKey(); if (k === H.lastKey) return;
    var now = Date.now();
    if (H.lastSnap && now - H.lastT > 500) { H.undo.push(H.lastSnap); if (H.undo.length > 60) H.undo.shift(); }
    H.redo = []; H.lastT = now; H.lastKey = k; H.lastSnap = hSnap(); hButtons();
  }
  var saveTimer;
  function persist() {
    updateHint(); hTrack();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* quota */ }
    }, 250);
  }

  var RT = { route: null, elevCache: {}, routeCtl: null, tool: 'pan' };

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
    osm: { base: true, label: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', n: 19, attr: OSMA + ' contributors' },
    osmfr: { base: true, label: 'OSM France', url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', n: 20, attr: OSMA + ' contributors · © OpenStreetMap France' },
    cyclosm: { base: true, label: 'CyclOSM', url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', n: 20,
      attr: OSMA + ' contributors · © <a href="https://www.cyclosm.org" target="_blank" rel="noopener">CyclOSM</a>' },
    etat: { base: true, ign: true, label: 'État-major (1820-66)', l: 'GEOGRAPHICALGRIDSYSTEMS.ETATMAJOR40', f: 'jpeg', n: 15 },
    contour: { ign: true, label: 'Courbes de niveau', icon: 'contour', l: 'ELEVATION.CONTOUR.LINE', f: 'png', n: 18, o: { minZoom: 12, opacity: 0.9 } },
    shade: { ign: true, label: 'Ombrage du relief', icon: 'shade', l: 'ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW', f: 'png', n: 15, o: { opacity: 0.55 } },
    lidar: { ign: true, label: 'Relief LiDAR HD', icon: 'mountain', l: 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW', f: 'png', n: 18, o: { opacity: 0.55 } },
    slope: { ign: true, label: 'Pentes', icon: 'slope', l: 'ELEVATION.SLOPES', f: 'jpeg', n: 14, o: { minZoom: 6, opacity: 0.5 } },
    cadastre: { ign: true, label: 'Cadastre', icon: 'parcel', l: 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS', f: 'png', n: 19, o: { minZoom: 12, opacity: 0.85 } },
    hiking: { label: 'Sentiers balisés (GR…)', icon: 'route', url: 'https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', n: 18,
      attr: '© <a href="https://hiking.waymarkedtrails.org" target="_blank" rel="noopener">Waymarked Trails</a> / ' + OSMA + ' contributors', o: { opacity: 0.9 } }
  };
  var BASES = Object.keys(LAYERS).filter(function (k) { return LAYERS[k].base; });
  var OVERS = Object.keys(LAYERS).filter(function (k) { return !LAYERS[k].base; });
  function srcUrl(key, z, x, y) {
    var d = LAYERS[key];
    if (d.url) return d.url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    return GP + '/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' + d.l + '&STYLE=normal&FORMAT=image/' + d.f +
      '&TILEMATRIXSET=PM&TILEMATRIX=' + z + '&TILEROW=' + y + '&TILECOL=' + x;
  }
  var wmtsUrl = srcUrl;
  /* « Netteté » : on demande des tuiles du niveau (z + off), affichées 2^off fois plus petites.
     Le fond affiché à une échelle donnée est donc celui du niveau juste au-dessus, au lieu d'un niveau dézoomé.
     Les serveurs libres (hors IGN) sont limités à un niveau de plus, pour rester raisonnables. */
  function tile(key, off, extra) {
    var d = LAYERS[key]; off = d.ign ? off : Math.min(off, 1);
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

  // ---------- Carte ----------
  var map = L.map('map', { zoomControl: false, zoomSnap: 0, zoomDelta: 1, wheelPxPerZoomLevel: 90, maxZoom: 19, minZoom: 4,
    doubleClickZoom: false, attributionControl: false }).setView(S.view.c, S.view.z);
  L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);
  var gStored = L.layerGroup().addTo(map), gSearch = L.layerGroup().addTo(map), gTracks = L.layerGroup().addTo(map), gMeas = L.layerGroup().addTo(map),
    gAz = L.layerGroup().addTo(map), gRoute = L.layerGroup().addTo(map), gCursor = L.layerGroup().addTo(map);
  var gGame = L.layerGroup().addTo(map);
  var GROUPS = { route: gRoute, az: gAz, meas: gMeas, game: gGame };

  // Netteté : automatique = fond standard quand on voit une grande étendue, détaillé quand on s'approche.
  function wantOff() { return S.detail === 'auto' ? (curScale() >= 200000 ? 0 : 1) : +S.detail; }
  function buildTiles() {
    Object.keys(tiles).forEach(function (k) { map.removeLayer(tiles[k]); });
    tiles = {};
    Object.keys(LAYERS).forEach(function (k) { tiles[k] = tile(k, curOff); });
    applyLayers();
  }
  function applyLayers() {
    Object.keys(LAYERS).forEach(function (k) {
      var on = LAYERS[k].base ? k === S.base : !!S.ov[k];
      if (on) { if (!map.hasLayer(tiles[k])) tiles[k].addTo(map); } else if (map.hasLayer(tiles[k])) map.removeLayer(tiles[k]);
    });
    tiles[S.base].bringToBack();
    $$('#base-grid button').forEach(function (b) { b.classList.toggle('on', b.dataset.base === S.base); });
    $$('#ov-grid button').forEach(function (b) { b.classList.toggle('on', !!S.ov[b.dataset.ov]); });
    $$('#detail-seg button').forEach(function (b) { b.classList.toggle('on', String(b.dataset.v) === String(S.detail)); });
    $('#layer-thumb').src = thumbUrl(S.base);
    $('#base-note').hidden = !!LAYERS[S.base].ign;
    var nOv = OVERS.filter(function (k) { return S.ov[k]; }).length;
    [$('#tab-badge'), $('#lb-badge')].forEach(function (b) { b.hidden = !nOv; b.textContent = '+' + nOv; });
  }
  // Panneau « Fonds et informations » : trois onglets (fond de carte / informations affichées / netteté).
  function popTab(tab) {
    $$('#pop-tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    $$('#layer-pop .pop-sec').forEach(function (sec) { sec.hidden = sec.dataset.tab !== tab; });
  }
  function thumbUrl(key) {
    var z = 10, n = 1 << z, lon = 5.72, lat = 45.19, r = lat * Math.PI / 180;
    return srcUrl(key, z, Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)).replace('{s}', 'a');
  }
  // Un seul type de travail est visible à la fois : les autres calques sont masqués.
  function applyVis() {
    Object.keys(GROUPS).forEach(function (k) {
      var on = S.mode === k && S.vis[k] !== false, g = GROUPS[k];
      if (on && !map.hasLayer(g)) g.addTo(map); else if (!on && map.hasLayer(g)) map.removeLayer(g);
    });
    var tOn = S.mode === 'route';
    if (tOn && !map.hasLayer(gTracks)) gTracks.addTo(map); else if (!tOn && map.hasLayer(gTracks)) map.removeLayer(gTracks);
  }
  function ensureVisible(k) { if (S.vis[k] === false) { S.vis[k] = true; applyVis(); renderLayerList(); } }

  map.on('moveend', function () { var c = map.getCenter(); S.view = { c: [c.lat, c.lng], z: map.getZoom() }; persist(); });

  // ---------- Échelle ----------
  var MPP0 = 156543.03392, PXM = 0.00026458333;
  var SCALES = [25000, 50000];                       // seules échelles prédéfinies
  function scaleAt(z, lat) { return MPP0 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z) / PXM; }
  function zoomFor(sc, lat) { return Math.log(MPP0 * Math.cos(lat * Math.PI / 180) / (sc * PXM)) / Math.LN2; }
  function curScale() { var c = map.getCenter(); return scaleAt(map.getZoom(), c.lat); }
  function fit(bounds, opts) { map.fitBounds(bounds, opts); }
  function setScale(sc, center) {
    var c = center ? L.latLng(center[0], center[1]) : map.getCenter();
    map.setView(c, Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoomFor(sc, c.lat))), { animate: true });
  }
  function niceScale(sc) {
    for (var i = 0; i < SCALES.length; i++) if (Math.abs(sc / SCALES[i] - 1) < 0.004) return SCALES[i];
    var step = sc < 3000 ? 10 : sc < 30000 ? 100 : sc < 300000 ? 1000 : 10000;
    return Math.round(sc / step) * step;
  }
  function updateScaleUI() {
    var sc = niceScale(curScale());
    $('#scale-val').textContent = '1 : ' + sp(sc);
    $$('#scale-list button').forEach(function (b) { b.classList.toggle('on', +b.dataset.s === sc); });
  }
  map.on('zoom move', updateScaleUI);
  map.on('zoomend', function () {
    updateScaleUI();
    if (S.detail === 'auto') { var o = wantOff(); if (o !== curOff) { curOff = o; buildTiles(); } }
  });
  $('#zoom-in').addEventListener('click', function () { map.zoomIn(); });
  $('#zoom-out').addEventListener('click', function () { map.zoomOut(); });
  $('#scale-list').innerHTML = SCALES.map(function (s) { return '<button data-s="' + s + '">1 : ' + sp(s) + '</button>'; }).join('');
  $('#scale-list').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setScale(+b.dataset.s); });
  $('#scale-custom').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { var v = +this.value; if (v >= 200) { setScale(v); this.value = ''; } }
  });

  // ---------- Utilitaires UI ----------
  var toastT;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3400);
  }
  function pin(label, cls, wrap) {
    return L.divIcon({ className: 'pin-wrap' + (wrap ? ' ' + wrap : ''), html: '<div class="pin ' + (cls || '') + '">' + esc(label) + '</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
  }
  function ll(p) { return L.latLng(p[0], p[1]); }
  function fmtP(p) { return G.formatCoord('wgs', p[0], p[1]); }
  function lastPoint() { var a = S.az.pts; return a.length ? a[a.length - 1] : null; }
  function openDlg(id) { var d = $('#' + id); if (!d.open) d.showModal(); }
  $$('[data-close-dlg]').forEach(function (b) { b.addEventListener('click', function () { b.closest('dialog').close(); }); });

  // ---------- Sélection de points (carte ↔ panneau) ----------
  var SEL = null;                                    // { k: 'route'|'az'|'meas', i }
  var routeMarkers = [], azMarkers = [], measMarkers = [];
  function select(k, i, scrollRow) {
    SEL = k ? { k: k, i: i } : null;
    // Sélection depuis la carte : on quitte tout champ de saisie, pour que Suppr retire le point et non du texte.
    if (k && scrollRow) { var a = document.activeElement; if (a && /^(input|select|textarea)$/i.test(a.tagName)) a.blur(); }
    applySel(scrollRow);
  }
  function applySel(scrollRow) {
    function mark(list, k) { list.forEach(function (m, i) { var el = m.getElement && m.getElement(); if (el) el.classList.toggle('sel', !!SEL && SEL.k === k && SEL.i === i); }); }
    mark(routeMarkers, 'route'); mark(azMarkers, 'az'); mark(measMarkers, 'meas');
    var row = null;
    $$('#wps li[data-i]').forEach(function (li) { var on = !!SEL && SEL.k === 'route' && +li.dataset.i === SEL.i; li.classList.toggle('sel', on); if (on) row = li; });
    $$('#az-table tr[data-i]').forEach(function (tr) {
      var want = SEL && SEL.k === 'az' ? Math.max(1, SEL.i) : -1, on = +tr.dataset.i === want; tr.classList.toggle('sel', on); if (on) row = tr;
    });
    if (row && scrollRow && row.scrollIntoView) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function deleteSelected() {
    if (!SEL) return false;
    var k = SEL.k, i = SEL.i;
    if (k === 'route') { removeWp(i); select(S.route.wps.length ? 'route' : null, Math.min(i, S.route.wps.length - 1)); }
    else if (k === 'az') {
      var n = S.az.pts.length, closed = azClosed();
      if (closed && (i === 0 || i === n - 1)) { S.az.pts.splice(n - 1, 1); S.az.pts.splice(0, 1); } else S.az.pts.splice(i, 1);
      renderAz(); persist(); select(S.az.pts.length ? 'az' : null, Math.min(i, S.az.pts.length - 1));
    } else if (k === 'meas') { S.meas.pts.splice(i, 1); renderMeas(); persist(); select(S.meas.pts.length ? 'meas' : null, Math.min(i, S.meas.pts.length - 1)); }
    return true;
  }
  function panToIfHidden(latlng) { if (!map.getBounds().pad(-0.1).contains(latlng)) map.panTo(latlng); }

  // ---------- Outils, panneau, rail ----------
  function setTool(t) {
    RT.tool = t;
    var c = map.getContainer();
    c.classList.toggle('tool-draw', t !== 'pan' && t !== 'game'); c.classList.toggle('tool-pan', t === 'pan'); c.classList.toggle('tool-game', t === 'game');
    renderRouteMarkers(); renderAz(); updateHint();
    if (window.SM && SM.game && SM.game.onTool) SM.game.onTool(t);
  }
  function updateRailMode() {
    var info = MODE_INFO[S.mode || 'route'];
    $('#rail-mode-l').textContent = info.label; $('#rail-mode use').setAttribute('href', '#i-' + info.icon);
  }
  function setMode(m) {
    if (m === S.mode) { showHome(false); return; }
    if (SIM.open) simClose(true);
    select(null);
    if (window.SM && SM.game && SM.game.leave) SM.game.leave();
    S.mode = m; showHome(false);
    applyVis(); renderStored(); renderLayerList(); refreshProfile(); updateRailMode(); applyDock();
    if (window.SM && SM.game) SM.game.render();
    persist();
  }
  function setRail(r) {
    if (r !== 'sim' && SIM.open) simClose(true);
    if (TYPES.indexOf(r) >= 0) setMode(r);
    else if (!S.mode) { showHome(true); return; }
    S.rail = r; S.panelOpen = true;
    $$('.pane').forEach(function (p) { p.hidden = p.dataset.pane !== r; });
    $$('.rail-btn[data-rail]').forEach(function (b) { b.classList.toggle('on', b.dataset.rail === r || (b.dataset.rail === 'mode' && TYPES.indexOf(r) >= 0)); });
    applyPanel();
    setTool(TYPES.indexOf(r) >= 0 ? r : 'pan');
    if (r === 'layers') renderLayerList();
    persist();
  }
  function applyPanel() {
    $('#app').classList.toggle('nopanel', !S.panelOpen);
    setTimeout(function () { map.invalidateSize(); drawProfile(); }, 220);
  }
  function togglePanel() { S.panelOpen = !S.panelOpen; applyPanel(); persist(); }
  $$('.rail-btn[data-rail]').forEach(function (b) {
    b.addEventListener('click', function () {
      var r = b.dataset.rail;
      if (r === 'home') { showHome(true); return; }
      if (r === 'mode') r = S.mode || 'route';
      if (S.rail === r && S.panelOpen && S.mode) { if (RT.tool === 'pan' && TYPES.indexOf(r) >= 0) setTool(r); else togglePanel(); }
      else setRail(r);
    });
  });
  $('#rail-toggle').addEventListener('click', togglePanel);
  $('#panel-close').addEventListener('click', function () { S.panelOpen = false; applyPanel(); persist(); });

  // ---------- Accueil : choix du type de travail ----------
  function homeCount(t) { return S.layers.filter(function (l) { return l.type === t; }).length + (isEmpty(t, S[t]) ? 0 : 1) + (t === 'route' ? S.tracks.length : 0); }
  function showHome(show) {
    var h = $('#home'); h.hidden = !show;
    if (show) {
      TYPES.forEach(function (t) { var n = homeCount(t), b = $('[data-badge="' + t + '"]'); b.hidden = !n; b.textContent = n + (n > 1 ? ' éléments' : ' élément'); });
      $('#home-continue').hidden = !S.mode;
      if (SIM.open) simClose(true);
      closePops(); hideCtx(); map.closePopup();
    }
    updateHint();
  }
  function startType(t) {
    setRail(t);
    if (isMobile()) { S.panelOpen = false; applyPanel(); persist(); }
  }
  $$('[data-start]').forEach(function (b) { b.addEventListener('click', function () { startType(b.dataset.start); }); });
  $('#home-import').addEventListener('click', function () { startType('route'); $('#file-gpx').click(); });
  $('#home-continue').addEventListener('click', function () { showHome(false); });
  $('.brand').addEventListener('click', function (e) { e.preventDefault(); showHome(true); });

  function hintText() {
    var r = S.rail, n = S.route.wps.length;
    if (r === 'route') {
      if (S.route.loop) return n === 0 ? 'Boucle : cliquez sur la carte pour poser le départ.' : 'Ajoutez des points de passage : le retour au départ est automatique.';
      if (n === 0) return 'Cliquez sur la carte pour poser le départ (A).';
      if (n === 1) return 'Cliquez pour poser l’arrivée.';
      return 'Cliquez pour prolonger (ou sur le tracé pour insérer) · clic sur A : boucle · Suppr : retirer le point choisi.';
    }
    if (r === 'az') return S.az.pts.length < 1 ? 'Cliquez pour poser le premier point.' : S.az.pts.length > 2 ? 'Cliquez pour ajouter un point · clic sur le point 1 : fermer · Suppr : retirer le point choisi.' : 'Cliquez pour ajouter un point.';
    return 'Cliquez pour poser les sommets · Suppr : retirer le point choisi.';
  }
  function updateHint() {
    var el = $('#toolhint'), r = S.rail;
    if (!S.mode || !$('#home').hidden) { el.hidden = true; return; }
    if (r === 'game' && window.SM && SM.game) {
      el.hidden = false; $('#hint-ic').innerHTML = '<use href="#i-flag"/>';
      $('#hint-txt').textContent = SM.game.hint(); $('#hint-btn').textContent = SM.game.hintBtn(); $('#hint-btn').hidden = !SM.game.hintBtn();
      return;
    }
    if (r !== 'route' && r !== 'az' && r !== 'meas') { el.hidden = true; return; }
    el.hidden = false; $('#hint-btn').hidden = false;
    $('#hint-ic').innerHTML = '<use href="#i-' + { route: 'route', az: 'compass', meas: 'ruler' }[r] + '"/>';
    if (RT.tool === 'pan') { $('#hint-txt').textContent = 'Mode déplacement : la carte se déplace sans poser de point.'; $('#hint-btn').textContent = 'Reprendre le tracé'; }
    else { $('#hint-txt').textContent = hintText(); $('#hint-btn').textContent = 'Terminer'; }
  }
  $('#hint-btn').addEventListener('click', function () { if (S.rail === 'game' && window.SM && SM.game) { SM.game.hintAction(); return; } setTool(RT.tool === 'pan' ? S.rail : 'pan'); });

  // ---------- Calques : modèle ----------
  function isEmpty(t, d) { return t === 'route' ? !d.wps.length : t === 'game' ? !d.shapes.length : !d.pts.length; }
  // Liste unifiée des calques de tracé (en cours d'édition + stockés), regroupés par type.
  function layersList(all) {
    var out = [];
    ['route', 'az', 'meas', 'game'].forEach(function (t) {
      var d = S[t];
      out.push({ type: t, id: d.id, key: t, active: true, name: d.name, color: d.color, vis: S.vis[t] !== false, data: d, res: t === 'route' ? RT.route : null, empty: isEmpty(t, d) });
    });
    S.layers.forEach(function (l) {
      out.push({ type: l.type, id: l.data.id, key: 'L' + l.data.id, active: false, name: l.data.name, color: l.data.color, vis: l.vis !== false, data: l.data, res: l.res || null, empty: false, item: l });
    });
    var order = { route: 0, az: 1, meas: 2, game: 3 };
    out.sort(function (a, b) { return order[a.type] - order[b.type] || a.id - b.id; });
    return all ? out : out.filter(function (l) { return l.type === S.mode; });   // seul le type en cours est visible
  }
  function archiveActive(t) {
    if (isEmpty(t, S[t])) return false;
    S.layers.push({ type: t, vis: S.vis[t] !== false, data: S[t], res: t === 'route' ? RT.route : null });
    return true;
  }
  function newLayer(t, opts) {
    var archived = archiveActive(t);
    if (archived || !S[t].id) {
      var n = S.layers.filter(function (l) { return l.type === t; }).length + 1;
      var prev = S[t]; S[t] = FRESH[t](prev, n);
      if (t === 'route') RT.route = null;
    }
    S.vis[t] = true; applyVis();
    if (t === 'route' && opts && opts.loop !== undefined) S.route.loop = opts.loop;
    renderType(t); setRail(t); persist();
  }
  function activate(id) {
    var i = -1;
    S.layers.forEach(function (l, k) { if (l.data.id === id) i = k; });
    if (i < 0) return;
    var it = S.layers.splice(i, 1)[0], t = it.type;
    archiveActive(t);
    S[t] = it.data; S.vis[t] = true; applyVis();
    RT.route = t === 'route' ? (it.res || null) : RT.route;
    if (t !== 'route') { /* rien : azimuts et mesures se redessinent depuis leurs points */ }
    select(null);
    renderType(t); setRail(t); setTool('pan'); persist();
    var b = layerBounds(t); if (b) fit(b, { padding: [70, 70], maxZoom: 17 });
  }
  function renderType(t) {
    if (t === 'route') refreshRouteView(); else if (t === 'az') renderAz(); else if (t === 'meas') renderMeas(); else if (window.SM && SM.game) SM.game.render();
    renderStored(); renderLayerList(); refreshProfile();
  }
  function removeLayer(key) {
    if (key === 'route') { S.route.wps = []; S.route.loop = false; RT.route = null; select(null); refreshRouteView(); }
    else if (key === 'az') { S.az.pts = []; select(null); renderAz(); }
    else if (key === 'meas') { S.meas.pts = []; select(null); renderMeas(); }
    else if (key === 'game') { S.game.shapes = []; if (window.SM && SM.game) SM.game.render(); renderLayerList(); }
    else if (key[0] === 'L') { S.layers = S.layers.filter(function (l) { return 'L' + l.data.id !== key; }); renderStored(); renderLayerList(); refreshProfile(); }
    persist();
  }
  function renameLayer(key, name) {
    name = (name || '').trim(); if (!name) return;
    var L0 = layersList().filter(function (l) { return l.key === key; })[0];
    if (L0) { L0.data.name = name; syncNames(); renderLayerList(); refreshProfile(); renderStored(); persist(); }
  }
  function syncNames() {
    $('#route-name').value = S.route.name; $('#az-name').value = S.az.name; $('#meas-name').value = S.meas.name; $('#game-name').value = S.game.name;
  }
  [['route-name', 'route'], ['az-name', 'az'], ['meas-name', 'meas'], ['game-name', 'game']].forEach(function (p) {
    $('#' + p[0]).addEventListener('input', function () { S[p[1]].name = this.value || ''; renderLayerList(); persist(); });
    $('#' + p[0]).addEventListener('change', function () { if (!this.value.trim()) { this.value = S[p[1]].name = 'Sans nom'; renderLayerList(); } });
  });
  $('#route-new').addEventListener('click', function () { newLayer('route'); });
  $('#az-new').addEventListener('click', function () { newLayer('az'); });
  $('#meas-new').addEventListener('click', function () { newLayer('meas'); });
  $('#game-new').addEventListener('click', function () { newLayer('game'); });
  $('#game-pdf').addEventListener('click', function () { openPdf('map'); });
  $$('[data-newlayer]').forEach(function (b) { b.addEventListener('click', function () { newLayer(b.dataset.newlayer); }); });

  // Calques stockés : dessin statique, clic = reprendre l'édition
  function renderStored() {
    gStored.clearLayers();
    S.layers.forEach(function (l) {
      if (l.vis === false || l.type !== S.mode) return;
      var d = l.data, col = d.color, id = d.id;
      function click(e) { if (RT.tool === 'pan') { L.DomEvent.stopPropagation(e); activate(id); } }
      function ctxs(e) { L.DomEvent.stop(e); showCtx(e.originalEvent.clientX, e.originalEvent.clientY, storedMenu(id)); }
      function tip(layer) { layer.bindTooltip(esc(d.name) + ' – cliquer pour modifier', { sticky: true }); return layer; }
      if (l.type === 'route' && l.res) {
        L.polyline(l.res.line, { color: '#fff', weight: 8, opacity: 0.85, interactive: false, lineCap: 'round' }).addTo(gStored);
        tip(L.polyline(l.res.line, { color: col, weight: 4.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', className: 'stored-line' }).on('click', click).on('contextmenu', ctxs)).addTo(gStored);
      }
      if (l.type === 'route') {
        d.wps.forEach(function (p, i) { L.marker([p.lat, p.lon], { icon: pin(lblOf(d, i), clsOf(d, i)), zIndexOffset: 500 }).on('click', click).on('contextmenu', ctxs).addTo(gStored); });
      } else if (l.type === 'az') {
        if (d.pts.length > 1) tip(L.polyline(d.pts, { color: col, weight: 4, dashArray: '10 6', opacity: 0.95, className: 'stored-line' }).on('click', click).on('contextmenu', ctxs)).addTo(gStored);
        d.pts.forEach(function (p, i) { L.marker(p, { icon: pin(String(i + 1), 'az'), zIndexOffset: 400 }).on('click', click).on('contextmenu', ctxs).addTo(gStored); });
      } else if (l.type === 'game') {
        if (window.SM && SM.game) SM.game.build(d, gStored, { stored: true, click: click, ctx: ctxs, tip: esc(d.name) + ' – cliquer pour modifier' });
      } else if (l.type === 'meas') {
        if (d.pts.length > 1) tip((d.mode === 'area' && d.pts.length > 2 ? L.polygon(d.pts, { color: col, weight: 3, fillColor: col, fillOpacity: 0.2, dashArray: '2 6', className: 'stored-line' }) : L.polyline(d.pts, { color: col, weight: 3, dashArray: '2 6', className: 'stored-line' })).on('click', click).on('contextmenu', ctxs)).addTo(gStored);
        d.pts.forEach(function (p) { L.circleMarker(p, { radius: 5, color: '#fff', weight: 2, fillColor: col, fillOpacity: 1, interactive: false }).addTo(gStored); });
      }
    });
  }

  // ---------- Altimétrie & profil ----------
  function lineKey(line) {
    return line.length + ':' + line[0].join(',') + ':' + line[Math.floor(line.length / 2)].join(',') + ':' + line[line.length - 1].join(',');
  }
  function fetchElev(points) {
    var chunks = [], i;
    for (i = 0; i < points.length; i += 150) chunks.push(points.slice(i, i + 150));
    return Promise.all(chunks.map(function (c) {
      var url = GP + '/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true&lon=' +
        encodeURIComponent(c.map(function (p) { return p.lon.toFixed(5); }).join('|')) + '&lat=' +
        encodeURIComponent(c.map(function (p) { return p.lat.toFixed(5); }).join('|'));
      return fetch(url).then(function (r) { if (!r.ok) throw new Error('Altimétrie indisponible (' + r.status + ')'); return r.json(); })
        .then(function (j) { return j.elevations; });
    })).then(function (parts) { return [].concat.apply([], parts); });
  }
  function analyse(pts) {
    var z = pts.map(function (p) { return p.z; });
    var s = z.map(function (v, i) { var a = z[Math.max(0, i - 1)], b = z[Math.min(z.length - 1, i + 1)]; return (a + v + b) / 3; });
    var asc = 0, desc = 0, ref = s[0];
    for (var i = 1; i < s.length; i++) {
      var d = s[i] - ref;
      if (d >= 2) { asc += d; ref = s[i]; } else if (d <= -2) { desc -= d; ref = s[i]; }
    }
    return { asc: asc, desc: desc, min: Math.min.apply(null, z), max: Math.max.apply(null, z) };
  }
  function profileFor(line, knownEle) {
    var key = lineKey(line);
    if (RT.elevCache[key]) return Promise.resolve(RT.elevCache[key]);
    var len = G.pathLength(line), n = Math.max(30, Math.min(300, Math.round(len / 40)));
    var pts = G.resample(line, n), p;
    if (knownEle && knownEle.length === line.length) {
      var cum = G.cumDist(line);
      p = Promise.resolve(pts.map(function (q) {
        var j = 0; while (j < cum.length - 1 && cum[j] < q.d) j++;
        var v = knownEle[j]; return v == null ? 0 : v;
      }));
    } else p = fetchElev(pts);
    return p.then(function (zs) {
      var last = null;
      pts.forEach(function (q, i) {
        var v = zs[i];
        if (v == null || v < -500) v = last == null ? 0 : last;
        q.z = v; last = v;
      });
      var res = Object.assign({ pts: pts }, analyse(pts));
      RT.elevCache[key] = res; return res;
    });
  }

  var currentProfile = null;
  function sources() {
    var out = [];
    layersList().forEach(function (l) {
      if (!l.vis || l.empty) return;
      var line = l.type === 'route' ? (l.res && l.res.line) : l.type === 'az' ? l.data.pts : (l.data.mode === 'dist' ? l.data.pts : null);
      if (line && line.length > 1) out.push({ id: l.key, label: l.name, line: line });
    });
    if (S.mode === 'route') S.tracks.forEach(function (t) { if (t.show !== false) out.push({ id: 't' + t.id, label: t.name, line: t.coords, ele: t.ele }); });
    return out;
  }
  var profToken = 0;
  function chip(label, val, cls) { return '<span class="chip' + (cls ? ' ' + cls : '') + '">' + label + ' <b>' + val + '</b></span>'; }
  function refreshProfile() {
    var src = sources(), sel = $('#profile-src');
    sel.innerHTML = src.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.label) + '</option>'; }).join('');
    var cur = src.filter(function (s) { return s.id === S.profileSrc; })[0] || src[0];
    $('#pempty').hidden = !!cur; $('#profile').style.display = cur ? '' : 'none';
    sel.style.display = src.length > 1 ? '' : 'none';
    if (!cur) { currentProfile = null; $('#pstats').innerHTML = ''; simSync(); return; }
    sel.value = cur.id;
    var tok = ++profToken;
    $('#pstats').innerHTML = chip('', 'Calcul du profil…');
    profileFor(cur.line, cur.ele).then(function (p) {
      if (tok !== profToken) return;
      currentProfile = p; currentProfile.src = cur.id; simSync();
      var over = cur.id === 'route' && overMax();
      $('#pstats').innerHTML = chip('Distance', G.fmtDist(p.pts[p.pts.length - 1].d), over ? 'bad' : '') + chip('D+', Math.round(p.asc) + ' m') + chip('D−', Math.round(p.desc) + ' m') +
        chip('Altitude', Math.round(p.min) + ' – ' + Math.round(p.max) + ' m');
      drawProfile();
      if (cur.id === 'route') renderRouteStats();
    }).catch(function (e) {
      if (tok !== profToken) return;
      currentProfile = null; $('#pstats').innerHTML = chip('', esc(e.message || 'Profil indisponible.'), 'bad');
      $('#profile').innerHTML = '';
    });
  }
  $('#profile-src').addEventListener('change', function () { S.profileSrc = this.value; persist(); refreshProfile(); });
  $('#dock-head').addEventListener('click', function (e) { if (!e.target.closest('select')) toggleDock(); });
  function toggleDock() { S.dockOpen = !S.dockOpen; applyDock(); persist(); }
  function applyDock() {
    var d = $('#dock');
    d.hidden = !(S.mode === 'route' || S.mode === 'az' || S.mode === 'meas');
    d.classList.toggle('closed', !S.dockOpen);
    d.style.height = S.dockH + 'px';
    $('#dock-toggle').setAttribute('aria-expanded', S.dockOpen);
    setTimeout(function () { map.invalidateSize(); drawProfile(); }, 60);
  }
  (function dockResize() {
    var g = $('#dock-grip');
    g.addEventListener('pointerdown', function (e) {
      e.preventDefault(); g.setPointerCapture(e.pointerId);
      var y0 = e.clientY, h0 = $('#dock').offsetHeight;
      function mv(ev) {
        S.dockH = Math.round(Math.max(130, Math.min(window.innerHeight * 0.6, h0 + (y0 - ev.clientY))));
        $('#dock').style.height = S.dockH + 'px'; map.invalidateSize(); drawProfile();
      }
      function up() { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); persist(); }
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
    });
  })();

  function niceStep(range, n) {
    var raw = range / n, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / mag;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
  }
  // Dessine un profil dans un <svg> ; uid distingue les dégradés quand plusieurs profils coexistent.
  function renderProfileSvg(svg, p, w, h, uid, marks) {
    uid = uid || 'pg';
    var m = { l: 46, r: 14, t: 12, b: 24 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
    var total = p.pts[p.pts.length - 1].d || 1;
    var lo = p.min, hi = p.max, pad = Math.max(5, (hi - lo) * 0.1);
    lo = Math.floor((lo - pad) / 10) * 10; hi = Math.ceil((hi + pad) / 10) * 10;
    var X = function (d) { return m.l + d / total * iw; }, Y = function (z) { return m.t + ih - (z - lo) / (hi - lo) * ih; };
    var ys = niceStep(hi - lo, Math.max(2, Math.floor(ih / 34))), xs = niceStep(total, Math.max(2, Math.floor(iw / 90)));
    var s = '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c6a24e" stop-opacity=".6"/><stop offset="1" stop-color="#c6a24e" stop-opacity=".08"/></linearGradient></defs>';
    for (var z = Math.ceil(lo / ys) * ys; z <= hi; z += ys)
      s += '<line class="grid" x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + Y(z) + '" y2="' + Y(z) + '"/><text class="ax" x="' + (m.l - 6) + '" y="' + (Y(z) + 4) + '" text-anchor="end">' + Math.round(z) + ' m</text>';
    for (var d = 0; d <= total + 1; d += xs)
      s += '<line class="grid v" x1="' + X(d) + '" x2="' + X(d) + '" y1="' + m.t + '" y2="' + (h - m.b) + '"/><text class="ax" x="' + X(d) + '" y="' + (h - 7) + '" text-anchor="middle">' + (total >= 2000 ? (d / 1000).toFixed(xs < 1000 ? 1 : 0).replace('.', ',') + ' km' : Math.round(d) + ' m') + '</text>';
    var line = p.pts.map(function (q, i) { return (i ? 'L' : 'M') + X(q.d).toFixed(1) + ' ' + Y(q.z).toFixed(1); }).join('');
    s += '<path d="' + line + 'L' + X(total).toFixed(1) + ' ' + (m.t + ih) + 'L' + m.l + ' ' + (m.t + ih) + 'Z" fill="url(#' + uid + ')"/>';
    s += '<path d="' + line + '" fill="none" stroke="#000761" stroke-width="2" stroke-linejoin="round"/>';
    (marks || []).forEach(function (mk) {
      var x = X(Math.min(total, mk.d)), y = Y(mk.z);
      s += '<line x1="' + x + '" x2="' + x + '" y1="' + y + '" y2="' + (m.t + ih) + '" stroke="#000761" stroke-opacity=".35" stroke-dasharray="3 3"/><circle cx="' + x + '" cy="' + y + '" r="8.5" fill="' + mk.c + '" stroke="#fff" stroke-width="2"/><text x="' + x + '" y="' + (y + 3.8) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">' + esc(mk.t) + '</text>';
    });
    s += '<g class="cur" visibility="hidden"><line y1="' + m.t + '" y2="' + (h - m.b) + '"/><circle r="4.5"/></g>';
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.innerHTML = s;
    svg._geom = { m: m, iw: iw, total: total, X: X, Y: Y };
  }
  function drawProfile() {
    if (!currentProfile || !S.dockOpen) return;
    var body = $('#dock-body'), w = Math.max(280, body.clientWidth), h = Math.max(90, body.clientHeight);
    var svg = $('#profile'); svg.setAttribute('width', w); svg.setAttribute('height', h);
    renderProfileSvg(svg, currentProfile, w, h, 'pg');
  }
  window.addEventListener('resize', function () { map.invalidateSize(); drawProfile(); });
  (function bindProfileHover() {
    var svg = $('#profile'), tip = $('#ptip');
    function leave() {
      var c = svg.querySelector('.cur'); if (c) c.setAttribute('visibility', 'hidden'); tip.hidden = true; gCursor.clearLayers();
    }
    function move(ev) {
      var g = svg._geom; if (!g || !currentProfile) return;
      var rect = svg.getBoundingClientRect(), cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      var d = Math.max(0, Math.min(g.total, (cx - g.m.l) / g.iw * g.total)), pts = currentProfile.pts, i = 0;
      while (i < pts.length - 1 && pts[i + 1].d < d) i++;
      var a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
      var q = b.d > a.d ? (d - a.d) / (b.d - a.d) : 0, z = a.z + (b.z - a.z) * q;
      var slope = b.d > a.d ? (b.z - a.z) / (b.d - a.d) * 100 : 0;
      var c = svg.querySelector('.cur'); c.setAttribute('visibility', 'visible');
      c.querySelector('line').setAttribute('x1', g.X(d)); c.querySelector('line').setAttribute('x2', g.X(d));
      c.querySelector('circle').setAttribute('cx', g.X(d)); c.querySelector('circle').setAttribute('cy', g.Y(z));
      tip.hidden = false; tip.textContent = G.fmtDist(d) + ' · ' + Math.round(z) + ' m · pente ' + slope.toFixed(0) + ' %';
      tip.style.left = Math.min(rect.width - 200, Math.max(0, cx + 10)) + 'px';
      gCursor.clearLayers();
      L.circleMarker([a.lat + (b.lat - a.lat) * q, a.lon + (b.lon - a.lon) * q], { radius: 7, color: '#fff', weight: 2, fillColor: '#c6a24e', fillOpacity: 1, interactive: false }).addTo(gCursor);
    }
    svg.addEventListener('mousemove', move); svg.addEventListener('touchmove', move, { passive: true });
    svg.addEventListener('mouseleave', leave); svg.addEventListener('touchend', leave);
  })();

  // ---------- Noms de lieux (village ou hameau) ----------
  var PLACE = {};
  function placeFor(lat, lon) {
    var key = lat.toFixed(3) + ',' + lon.toFixed(3);
    if (PLACE[key] !== undefined) return Promise.resolve(PLACE[key]);
    function q(cat) {
      return fetch(GP + '/geocodage/reverse?index=poi&limit=1&lon=' + lon.toFixed(5) + '&lat=' + lat.toFixed(5) + '&category=' + encodeURIComponent(cat))
        .then(function (r) { return r.ok ? r.json() : { features: [] }; })
        .then(function (j) { var f = (j.features || [])[0]; return f ? (arr(f.properties.toponym || f.properties.name)[0] || '') : ''; })
        .catch(function () { return ''; });
    }
    // Le hameau (lieu-dit habité) s'il est tout proche, sinon la commune.
    return Promise.all([q('lieu-dit habité'), q('commune')]).then(function (r) { PLACE[key] = r[0] || r[1] || ''; return PLACE[key]; });
  }
  function fillPlaces(d) {
    return Promise.all(d.wps.map(function (w) {
      if (w.place !== undefined) return Promise.resolve();
      return placeFor(w.lat, w.lon).then(function (n) { w.place = n; });
    })).then(function () { if (d === S.route) { renderWpList(); renderSteps(); renderRouteMarkers(); } persist(); });
  }

  // ---------- Itinéraire : fonctions par calque ----------
  var STEP_FR = {
    depart: 'Départ', arrive: 'Arrivée', turn: 'Tourner', 'new name': 'Continuer', continue: 'Continuer', merge: 'Rejoindre',
    'on ramp': 'Prendre la bretelle', 'off ramp': 'Quitter par la bretelle', fork: 'Bifurquer', 'end of road': 'Au bout de la route',
    roundabout: 'Rond-point', rotary: 'Rond-point', 'roundabout turn': 'Au rond-point', notification: 'Continuer', 'exit roundabout': 'Sortir du rond-point', 'use lane': 'Voie'
  };
  var MOD_FR = { 'sharp left': 'franchement à gauche', left: 'à gauche', 'slight left': 'légèrement à gauche', straight: 'tout droit', 'slight right': 'légèrement à droite', right: 'à droite', 'sharp right': 'franchement à droite', uturn: 'demi-tour' };
  function stepText(st) {
    var i = st.instruction || {}, t = STEP_FR[i.type] || 'Continuer', m = MOD_FR[i.modifier] || '';
    return t + (m && i.type !== 'depart' && i.type !== 'arrive' ? ' ' + m : '');
  }
  /* L'attribut « name » de la Géoplateforme est une chaîne JSON (parfois tronquée) : on en extrait les champs par motif. */
  function stepMeta(st) {
    var n = st.attributes && st.attributes.name, o = { name: '', num: '', cls: '' };
    if (!n) return o;
    if (typeof n === 'object') { o.name = n.cpx_toponyme || n.nom_1_droite || n.nom_1_gauche || ''; o.num = n.cpx_numero || ''; o.cls = n.cpx_classement_administratif || ''; return o; }
    var s = String(n);
    function g(k) { var m = new RegExp('"' + k + '"\\s*:\\s*"([^"]*)"').exec(s); return m ? m[1].trim() : ''; }
    o.name = g('cpx_toponyme') || g('nom_1_droite') || g('nom_1_gauche');
    o.num = g('cpx_numero'); o.cls = g('cpx_classement_administratif');
    if (!o.name && s.charAt(0) !== '{' && s.indexOf('"') < 0 && s.length < 60) o.name = s;
    return o;
  }
  function stepName(st) { var m = stepMeta(st); return m.name || m.num || ''; }
  function natOf(m) { return /^N\s?\d/i.test(m.num) ? m.num.replace(/\s/g, '').toUpperCase() : /nationale/i.test(m.cls) ? 'nationale' : ''; }

  // d = données d'un calque itinéraire ; les points sont numérotés dans l'ordre de passage.
  function loopOf(d) { return !!d.loop && d.wps.length >= 2; }
  function effOf(d) { return loopOf(d) ? d.wps.concat([d.wps[0]]) : d.wps; }
  function lblOf(d, i) { return i === 0 ? 'A' : (i === d.wps.length - 1 && !loopOf(d)) ? 'B' : String(i); }
  function clsOf(d, i) { return i === 0 ? 'start' : (i === d.wps.length - 1 && !loopOf(d)) ? 'end' : 'via'; }
  function titleOf(d, i) { return i === 0 ? 'Départ' : (i === d.wps.length - 1 && !loopOf(d)) ? 'Arrivée' : 'Étape ' + i; }
  function nameOf(d, i) { var w = d.wps[i]; return (w && (w.name || w.place)) || titleOf(d, i); }
  function effWps() { return effOf(S.route); }
  function overMax() { return !!(RT.route && S.route.maxOn && S.route.maxKm > 0 && RT.route.dist > S.route.maxKm * 1000); }

  var routeLine = null, routeCasing = null;
  function addWp(p, name, idx) {
    ensureVisible('route');
    var o = { lat: p[0], lon: p[1] }; if (name) o.name = name;
    var at = idx == null ? S.route.wps.length : idx;
    S.route.wps.splice(at, 0, o);
    renderRouteMarkers(); computeRoute(); persist(); select('route', at, true);
    fillPlaces(S.route);
  }
  // Quand le pointeur est à peu près de la taille d'un village (carte assez dézoomée), le point se place sur l'église.
  function snapToChurch(w) {
    if (!w || S.route.snapChurch === false) return;
    var mpp = 156543.03392 * Math.cos(w.lat * Math.PI / 180) / Math.pow(2, map.getZoom()), r = Math.min(1000, 24 * mpp);
    if (mpp < 5) return;
    var circle = JSON.stringify({ type: 'Circle', coordinates: [+w.lon.toFixed(6), +w.lat.toFixed(6)], radius: Math.round(r) });
    fetch(GP + '/geocodage/reverse?index=poi&limit=3&category=' + encodeURIComponent('culte chrétien') + '&lon=' + w.lon.toFixed(6) + '&lat=' + w.lat.toFixed(6) + '&searchgeom=' + encodeURIComponent(circle))
      .then(function (x) { return x.ok ? x.json() : { features: [] }; })
      .then(function (j) {
        var i = S.route.wps.indexOf(w); if (i < 0) return;
        var best = null, bd = Infinity;
        (j.features || []).forEach(function (f) {
          var c = f.geometry && f.geometry.coordinates; if (!c) return;
          var d = L.latLng(w.lat, w.lon).distanceTo(L.latLng(c[1], c[0])); if (d < bd && d <= r) { bd = d; best = c; }
        });
        if (!best || (w.lat === best[1] && w.lon === best[0])) return;
        w.lat = best[1]; w.lon = best[0]; w.place = undefined; w.church = true;
        renderRouteMarkers(); renderWpList(); computeRoute(); persist(); fillPlaces(S.route);
        toast('Point posé sur l’église du village.');
      }).catch(function () {});
  }
  function closeLoop() {
    if (S.route.wps.length < 2 || S.route.loop) return;
    S.route.loop = true; syncRouteUi(); renderRouteMarkers(); computeRoute(); persist();
    toast('Boucle fermée : le tracé revient au point de départ.');
  }
  function renderRouteMarkers() {
    routeMarkers.forEach(function (m) { gRoute.removeLayer(m); }); routeMarkers = [];
    var d = S.route, w = d.wps, closable = RT.tool === 'route' && w.length >= 2 && !d.loop;
    w.forEach(function (p, i) {
      var m = L.marker([p.lat, p.lon], { draggable: true, icon: pin(lblOf(d, i), clsOf(d, i), i === 0 && closable ? 'closable' : ''), zIndexOffset: 1000 }).addTo(gRoute);
      m.bindTooltip(i === 0 && closable ? 'Cliquer pour fermer la boucle' : esc(nameOf(d, i)), { direction: 'top', offset: [0, -14] });
      m.on('dragstart', function () { select('route', i, true); });
      m.on('dragend', function () {
        var q = m.getLatLng(); S.route.wps[i] = { lat: q.lat, lon: q.lng, name: S.route.wps[i].name };
        renderWpList(); computeRoute(); persist(); fillPlaces(S.route);
      });
      m.on('click', function () { if (i === 0 && closable) closeLoop(); select('route', i, true); });
      m.on('contextmenu', function (e) { L.DomEvent.stop(e); select('route', i, true); showCtx(e.originalEvent.clientX, e.originalEvent.clientY, routePtMenu(i)); });
      routeMarkers.push(m);
    });
    renderWpList(); applySel();
  }
  function renderWpList() {
    var d = S.route, w = d.wps, loop = loopOf(d);
    $('#wps-empty').hidden = w.length > 0;
    $('#wp-count').textContent = w.length ? '(' + w.length + ')' : '';
    $('#wps').innerHTML = w.map(function (p, i) {
      return '<li data-i="' + i + '"><span class="grip" draggable="true" title="Glisser pour changer l’ordre de passage">' + ic('grip') + '</span><span class="badge ' + clsOf(d, i) + '">' + lblOf(d, i) + '</span><div class="wp-main"><input class="wp-name" data-i="' + i + '" value="' + esc(p.name || p.place || '') + '" placeholder="' + esc(titleOf(d, i)) + '" aria-label="Nom du point (village ou hameau par défaut)">' +
        '<small>' + esc(titleOf(d, i)) + (p.place && p.name && p.name !== p.place ? ' · près de ' + esc(p.place) : '') + ' · ' + esc(fmtP([p.lat, p.lon])) + '</small></div><button class="ibtn danger" data-del="' + i + '" title="Retirer ce point (Suppr)" aria-label="Retirer">' + ic('x') + '</button></li>';
    }).join('') + (loop ? '<li class="ret"><span class="badge start">A</span><span>Arrivée : retour au départ</span></li>' : '');
    applySel();
  }
  (function wpListEvents() {
    var ul = $('#wps'), dragFrom = -1;
    ul.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) { removeWp(+del.dataset.del); return; }
      var li = e.target.closest('li[data-i]'); if (!li) return;
      var i = +li.dataset.i; select('route', i); var w = S.route.wps[i]; if (w) panToIfHidden(L.latLng(w.lat, w.lon));
    });
    ul.addEventListener('input', function (e) {
      var inp = e.target.closest('.wp-name'); if (!inp) return;
      var o = S.route.wps[+inp.dataset.i]; if (!o) return;
      if (inp.value.trim() && inp.value.trim() !== o.place) o.name = inp.value.trim(); else delete o.name;
      persist();
    });
    ul.addEventListener('focusin', function (e) { var li = e.target.closest('li[data-i]'); if (li && e.target.matches('.wp-name')) select('route', +li.dataset.i); });
    ul.addEventListener('dragstart', function (e) {
      var g = e.target.closest('.grip'); if (!g) { e.preventDefault(); return; }
      var li = g.closest('li'); dragFrom = +li.dataset.i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragFrom));
      if (e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(li, 12, 12);
      li.classList.add('dragging');
    });
    ul.addEventListener('dragover', function (e) {
      var li = e.target.closest('li[data-i]'); if (!li || dragFrom < 0) return;
      e.preventDefault(); $$('#wps li').forEach(function (x) { x.classList.toggle('drop', x === li); });
    });
    ul.addEventListener('drop', function (e) {
      var li = e.target.closest('li[data-i]'); if (!li || dragFrom < 0) return;
      e.preventDefault(); var to = +li.dataset.i, from = dragFrom; dragFrom = -1;
      if (from !== to) moveWp(from, to);
    });
    ul.addEventListener('dragend', function () { dragFrom = -1; $$('#wps li').forEach(function (x) { x.classList.remove('dragging', 'drop'); }); });
  })();
  function moveWp(from, to) {
    var w = S.route.wps, x = w.splice(from, 1)[0]; w.splice(to, 0, x);
    renderRouteMarkers(); computeRoute(); persist(); select('route', to, true);
    toast('Ordre de passage modifié : les points sont renumérotés.');
  }
  function removeWp(i) { S.route.wps.splice(i, 1); if (SEL && SEL.k === 'route') SEL = null; renderRouteMarkers(); computeRoute(); persist(); }
  function reverseRoute() {
    var w = S.route.wps; if (w.length < 2) { toast('Posez au moins deux points pour inverser le sens.'); return; }
    S.route.wps = loopOf(S.route) ? [w[0]].concat(w.slice(1).reverse()) : w.reverse();
    select(null); renderRouteMarkers(); computeRoute(); persist();
    toast('Sens du parcours inversé.');
  }
  $('#route-undo').addEventListener('click', function () { if (S.route.wps.length) removeWp(S.route.wps.length - 1); });
  $('#route-clear').addEventListener('click', function () { S.route.wps = []; select(null); renderRouteMarkers(); computeRoute(); persist(); });
  $('#route-reverse').addEventListener('click', reverseRoute);
  $$('#route-mode button').forEach(function (b) {
    b.addEventListener('click', function () { S.route.loop = b.dataset.v === 'loop'; syncRouteUi(); renderRouteMarkers(); computeRoute(); persist(); });
  });
  $('#route-opt').addEventListener('change', function () { S.route.opt = this.value; computeRoute(); persist(); });
  $('#speed').addEventListener('input', function () { S.speed = Math.max(1, +this.value || 5); renderRouteStats(); persist(); });
  $('#opt-motorway').addEventListener('change', function () { S.route.avoidMotorway = this.checked; computeRoute(); persist(); });
  $('#opt-church').addEventListener('change', function () { S.route.snapChurch = this.checked; persist(); });
  $('#opt-noback').addEventListener('change', function () { S.route.noBack = this.checked; computeRoute(); persist(); });
  $('#opt-national').addEventListener('change', function () { S.route.flagNat = this.checked; renderNatWarn(); persist(); });
  $('#max-on').addEventListener('change', function () { S.route.maxOn = this.checked; syncRouteUi(); onMaxChange(); persist(); });
  $('#max-km').addEventListener('input', function () { S.route.maxKm = Math.max(0, +this.value || 0); onMaxChange(); persist(); });
  $('#route-pdf').addEventListener('click', function () { openPdf('simple'); });
  $('#route-tiles').addEventListener('click', function () { openPdf('tiles'); });
  function onMaxChange() { restyleRoute(); renderRouteStats(); renderGauge(); refreshProfile(); }
  function syncRouteUi() {
    $$('#route-mode button').forEach(function (b) { b.classList.toggle('on', (b.dataset.v === 'loop') === !!S.route.loop); });
    $('#route-opt').value = S.route.opt; $('#speed').value = S.speed;
    $('#opt-motorway').checked = !!S.route.avoidMotorway; $('#opt-national').checked = !!S.route.flagNat; $('#opt-noback').checked = S.route.noBack !== false; $('#opt-church').checked = S.route.snapChurch !== false;
    $('#max-on').checked = !!S.route.maxOn; $('#max-km').value = S.route.maxKm; $('#max-km').disabled = !S.route.maxOn;
    syncNames();
  }
  function setRouteStatus(msg, err) { var el = $('#route-status'); el.textContent = msg || ''; el.className = 'status' + (err ? ' error' : ''); }
  function routeColor() { return overMax() ? '#c0262d' : S.route.color; }
  function restyleRoute() { if (routeLine) routeLine.setStyle({ color: routeColor() }); }
  function clearRouteLines() {
    if (routeLine) { gRoute.removeLayer(routeLine); routeLine = null; }
    if (routeCasing) { gRoute.removeLayer(routeCasing); routeCasing = null; }
    if (backLine) { gRoute.removeLayer(backLine); backLine = null; }
  }
  // Redessine le calque itinéraire en cours d'édition (après activation d'un calque, par exemple).
  function refreshRouteView() {
    clearTimeout(routeTimer); if (RT.routeCtl) RT.routeCtl.abort();
    clearRouteLines(); syncRouteUi(); renderRouteMarkers();
    if (RT.route && RT.route.line) { drawRoute(); renderSteps(); renderRouteStats(); renderGauge(); renderNatWarn(); setRouteStatus(''); refreshProfile(); }
    else computeRoute();
    fillPlaces(S.route);
  }

  var routeTimer, backLine = null, legCache = {}, legQueue = [], legBusy = 0;
  function computeRoute() {
    clearTimeout(routeTimer);
    clearRouteLines();
    RT.route = null; renderRouteStats(); renderGauge(); renderNatWarn(); $('#steps-box').hidden = true; renderLayerList(); renderStored();
    if (RT.routeCtl) RT.routeCtl.abort();
    var w = effWps();
    if (w.length < 2) {
      setRouteStatus(S.route.wps.length === 1 ? (S.route.loop ? 'Posez au moins un point de passage pour former la boucle.' : 'Posez l’arrivée sur la carte.') : '');
      refreshProfile(); return;
    }
    setRouteStatus('Calcul de l’itinéraire…');
    var tag = S.route.id, tok = RT.rtTok = (RT.rtTok || 0) + 1;
    routeTimer = setTimeout(function () {
      var jobs = []; for (var i = 0; i + 1 < w.length; i++) jobs.push(fetchLeg(w[i], w[i + 1], null));
      Promise.all(jobs).then(function (legs) {
        if (tag !== S.route.id || tok !== RT.rtTok) return;
        var first = !RT.route;
        showRoute(assemble(legs), first);
        if (S.route.noBack) improveBack(legs, w, tok, tag);
      }).catch(function (e) {
        if (tok !== RT.rtTok) return;
        setRouteStatus('Itinéraire impossible : ' + (e.message || 'service indisponible') + '. Rapprochez les points d’une route ou d’un chemin.', true);
        refreshProfile();
      });
    }, 250);
  }
  // ----- Calcul par tronçons (un appel par couple de repères) : aucun nombre maximal d'étapes, et un seul tronçon à recalculer quand on déplace un point.
  function pf(p) { return p.lon.toFixed(6) + ',' + p.lat.toFixed(6); }
  function runLeg(task) {
    legQueue.push(task); pumpLegs();
  }
  function pumpLegs() {
    while (legBusy < 4 && legQueue.length) {
      (function (task) {
        legBusy++;
        task().then(function () { legBusy--; pumpLegs(); }, function () { legBusy--; pumpLegs(); });
      })(legQueue.shift());
    }
  }
  function fetchLeg(a, b, via) {
    var key = [S.route.opt, S.route.avoidMotorway ? 1 : 0, pf(a), via ? pf(via) : '', pf(b)].join('|');
    if (legCache[key]) return legCache[key];
    var url = GP + '/navigation/itineraire?resource=bdtopo-valhalla&profile=pedestrian&optimization=' + S.route.opt +
      '&start=' + pf(a) + '&end=' + pf(b) + (via ? '&intermediates=' + encodeURIComponent(pf(via)) : '') +
      (S.route.avoidMotorway ? '&constraints=' + encodeURIComponent('{"constraintType":"banned","key":"wayType","operator":"=","value":"autoroute"}') : '') +
      '&geometryFormat=geojson&getSteps=true&getBbox=false&crs=EPSG:4326&timeUnit=second&distanceUnit=meter&waysAttributes=name';
    var pr = new Promise(function (resolve, reject) {
      runLeg(function () {
        var tries = 0;
        function go() {
          return fetch(url).then(function (r) {
            return r.json().then(function (j) { if (!r.ok || j.error) throw new Error((j.error && j.error.message) || j.message || 'Erreur ' + r.status); return j; });
          }).then(function (j) {
            var ps = j.portions || [], m = ps.length < 2 ? ps[0] : { start: ps[0].start, end: ps[ps.length - 1].end, distance: 0, duration: 0, steps: [] };
            if (ps.length >= 2) ps.forEach(function (q) { m.distance += q.distance || 0; m.duration += q.duration || 0; m.steps = m.steps.concat(q.steps || []); });
            if (!m) m = { start: pf(a), end: pf(b), distance: j.distance, duration: j.duration, steps: [] };
            resolve({ line: j.geometry.coordinates.map(function (q) { return [q[1], q[0]]; }), dist: j.distance, dur: j.duration, portion: m });
          }).catch(function (e) { if (++tries < 3 && !/Erreur 4|introuvable|impossible/i.test(e.message || '')) return new Promise(function (r) { setTimeout(r, 400 * tries); }).then(go); throw e; });
        }
        return go().catch(function (e) { delete legCache[key]; reject(e); });
      });
    });
    legCache[key] = pr; return pr;
  }
  function assemble(legs) {
    var line = [], bounds = [0], dist = 0, dur = 0, portions = [];
    legs.forEach(function (l, i) {
      var ln = l.line, st = 0;
      if (line.length && ln.length && line[line.length - 1][0] === ln[0][0] && line[line.length - 1][1] === ln[0][1]) st = 1;
      for (var k = st; k < ln.length; k++) line.push(ln[k]);
      bounds.push(line.length - 1); dist += l.dist; dur += l.dur; portions.push(l.portion);
    });
    return { line: line, dist: dist, dur: dur, portions: portions, bounds: bounds };
  }
  function showRoute(res, first) {
    var nat = {};
    res.portions.forEach(function (p) { (p.steps || []).forEach(function (s) { var k = natOf(stepMeta(s)); if (k) nat[k] = (nat[k] || 0) + (s.distance || 0); }); });
    var wasOver = overMax();
    res.nat = Object.keys(nat).map(function (k) { return { label: k, dist: nat[k] }; });
    res.back = S.route.noBack ? retrace(res.line) : { runs: [], total: 0 };
    clearRouteLines(); RT.route = res;
    drawRoute(); setRouteStatus('');
    renderSteps(); renderRouteStats(); renderGauge(); renderNatWarn(); renderBackWarn(); renderLayerList();
    if (first && overMax() && !wasOver) toast('Distance maximale dépassée (' + G.fmtDist(res.dist) + ' pour ' + G.fmtDist(S.route.maxKm * 1000) + ') : le tracé reste modifiable.');
    var bb = L.latLngBounds(res.line.map(ll));
    if (first && !map.getBounds().contains(bb)) fit(bb, { padding: [90, 90], maxZoom: 16 });
    S.profileSrc = 'route'; refreshProfile(); persist();
  }
  // Repère les passages repris (même chemin parcouru deux fois) : échantillons tous les ~10 m, voisins à moins de 15 m, séparés par au moins 120 m de parcours.
  function retrace(line) {
    var out = { runs: [], total: 0 };
    if (line.length < 3) return out;
    var kx = 111320 * Math.cos(line[0][0] * Math.PI / 180), ky = 110540, S10 = [], i, j;
    for (i = 0; i + 1 < line.length; i++) {
      var ax = line[i][1] * kx, ay = line[i][0] * ky, bx = line[i + 1][1] * kx, by = line[i + 1][0] * ky, L0 = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L0 / 10));
      for (j = 0; j < n; j++) S10.push({ x: ax + (bx - ax) * j / n, y: ay + (by - ay) * j / n, v: i, la: line[i][0] + (line[i + 1][0] - line[i][0]) * j / n, lo: line[i][1] + (line[i + 1][1] - line[i][1]) * j / n });
    }
    var grid = {}, hit = new Array(S10.length), c = 20;
    S10.forEach(function (s, k) {
      var cx = Math.floor(s.x / c), cy = Math.floor(s.y / c), h = false, dx, dy, arr, m;
      for (dx = -1; dx <= 1 && !h; dx++) for (dy = -1; dy <= 1 && !h; dy++) {
        arr = grid[(cx + dx) + ',' + (cy + dy)]; if (!arr) continue;
        for (m = 0; m < arr.length; m++) if (k - arr[m] > 12 && Math.hypot(S10[arr[m]].x - s.x, S10[arr[m]].y - s.y) <= 15) { h = true; break; }
      }
      hit[k] = h; (grid[cx + ',' + cy] = grid[cx + ',' + cy] || []).push(k);
    });
    var k = 0;
    while (k < S10.length) {
      if (!hit[k]) { k++; continue; }
      var e = k, gap = 0, last = k;
      while (e + 1 < S10.length && gap <= 3) { e++; if (hit[e]) { last = e; gap = 0; } else gap++; }
      if (last - k + 1 >= 15) {
        out.runs.push({ s: k, e: last, len: (last - k + 1) * 10, v0: S10[k].v, v1: S10[last].v, pts: S10.slice(k, last + 1).map(function (q) { return [q.la, q.lo]; }) });
        out.total += (last - k + 1) * 10;
      }
      k = last + 1;
    }
    return out;
  }
  function renderBackWarn() {
    var r = RT.route, el = $('#back-warn');
    if (backLine) { gRoute.removeLayer(backLine); backLine = null; }
    if (!r || !S.route.noBack || !r.back || !r.back.runs.length) { el.hidden = true; return; }
    backLine = L.layerGroup(r.back.runs.map(function (u) { return L.polyline(u.pts, { color: '#e07b00', weight: 7, opacity: 0.85, dashArray: '2 9', lineCap: 'round', interactive: false }); })).addTo(gRoute);
    el.hidden = false;
    el.innerHTML = ic('alert') + '<span>Le tracé repasse par le même chemin sur ≈ ' + G.fmtDist(r.back.total) + ' (pointillés orange)' + (r.backTried ? ', faute d’alternative proche.' : '.') + ' Déplacez un repère pour changer de chemin.</span>';
  }
  // Cherche, pour les tronçons qui reprennent un chemin déjà parcouru, un passage décalé qui évite l'aller-retour.
  function improveBack(legs0, w, tok, tag) {
    var res = RT.route; if (!res || !res.back.runs.length) return;
    var legs = legs0.slice(), runs = res.back.runs.slice().sort(function (a, b) { return b.len - a.len; }).slice(0, 4), improved = 0, extra = 0;
    var todo = runs.filter(function (u) { return u.len >= 150; });
    if (!todo.length) return;
    setRouteStatus('Recherche d’un chemin de retour différent…');
    var seen = {};
    function step(idx) {
      if (tok !== RT.rtTok || tag !== S.route.id) return;
      if (idx >= todo.length) { finish(); return; }
      var u = todo[idx], cur = assemble(legs), leg = 0;
      // les indices ont pu changer après un remplacement : on retrouve le tronçon par le milieu de la zone reprise.
      var mid = u.pts[Math.floor(u.pts.length / 2)], best = Infinity, bi = 0;
      cur.line.forEach(function (q, k) { var d = Math.pow(q[0] - mid[0], 2) + Math.pow((q[1] - mid[1]) * Math.cos(mid[0] * Math.PI / 180), 2); if (d < best) { best = d; bi = k; } });
      for (leg = 0; leg < legs.length - 1 && cur.bounds[leg + 1] < bi; leg++);
      var lk = leg + ':' + legs[leg].dist.toFixed(0); if (seen[lk]) { step(idx + 1); return; } seen[lk] = 1;
      var a = w[leg], b = w[leg + 1], p0 = u.pts[0], p1 = u.pts[u.pts.length - 1], kx = Math.cos(mid[0] * Math.PI / 180);
      var dx = (p1[1] - p0[1]) * kx * 111320, dy = (p1[0] - p0[0]) * 110540, nrm = Math.hypot(dx, dy) || 1, ux = -dy / nrm, uy = dx / nrm;
      var offs = [400, 900, 1800], cands = [];
      offs.forEach(function (o) { [1, -1].forEach(function (sd) {
        cands.push({ lat: mid[0] + uy * o * sd / 110540, lon: mid[1] + ux * o * sd / (111320 * kx) });
      }); });
      var oldTot = retrace(cur.line).total, oldDist = legs[leg].dist;
      Promise.all(cands.map(function (cd) { return fetchLeg(a, b, cd).then(function (r) { return r; }, function () { return null; }); })).then(function (rs) {
        if (tok !== RT.rtTok || tag !== S.route.id) return;
        var pick = null, score = oldTot - 0.5 * u.len;
        rs.forEach(function (r) {
          if (!r || r.dist > oldDist * 2 + 800) return;
          var test = legs.slice(); test[leg] = r;
          var tot = retrace(assemble(test).line).total, sc = tot + 0.5 * (r.dist - oldDist);
          if (tot <= oldTot - 0.5 * u.len && sc < (pick ? pick.sc : Infinity)) pick = { r: r, sc: sc };
        });
        if (pick) { extra += pick.r.dist - oldDist; legs[leg] = pick.r; improved++; }
        step(idx + 1);
      });
    }
    function finish() {
      if (tok !== RT.rtTok || tag !== S.route.id) return;
      if (improved) {
        var out = assemble(legs), before = res.dist;
        showRoute(out, false);
        toast('Tracé modifié pour éviter de repasser par le même chemin (' + (extra >= 0 ? '+' : '') + G.fmtDist(Math.abs(extra)) + ').');
      } else { setRouteStatus(''); RT.route.backTried = true; renderBackWarn(); }
      setRouteStatus('');
    }
    step(0);
  }
  function drawRoute() {
    var r = RT.route; if (!r) return;
    routeCasing = L.polyline(r.line, { color: '#fff', weight: 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(gRoute);
    routeLine = L.polyline(r.line, { color: routeColor(), weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', className: 'route-line' }).addTo(gRoute);
    routeLine.on('click', function (e) {
      if (RT.tool !== 'route') return;
      L.DomEvent.stopPropagation(e);
      insertOnRoute([e.latlng.lat, e.latlng.lng]);
    });
    routeLine.on('contextmenu', function (e) { L.DomEvent.stop(e); showCtx(e.originalEvent.clientX, e.originalEvent.clientY, routeLineMenu(e.latlng)); });
    routeLine.on('mouseover', function () { if (RT.tool === 'route') routeLine.setStyle({ color: '#c6a24e' }); });
    routeLine.on('mouseout', restyleRoute);
    routeLine.bringToFront();
    routeMarkers.forEach(function (m) { m.setZIndexOffset(1000); });
  }
  // Insère un point dans le tronçon du tracé le plus proche : la numérotation suit l'ordre de passage.
  function insertOnRoute(p) {
    var r = RT.route, idx = nearestIndex(r.line, p), leg = legOf(idx);
    addWp(p, null, Math.min(leg + 1, S.route.wps.length));
  }
  // Distance (en pixels écran) du point de clic au tracé calculé.
  function pixelDistToRoute(latlng) {
    var r = RT.route; if (!r || r.line.length < 2) return Infinity;
    var P = map.latLngToLayerPoint(latlng), best = Infinity, prev = map.latLngToLayerPoint(ll(r.line[0]));
    for (var i = 1; i < r.line.length; i++) {
      var q = map.latLngToLayerPoint(ll(r.line[i]));
      var d = L.LineUtil.pointToSegmentDistance(P, prev, q); if (d < best) best = d; prev = q;
    }
    return best;
  }
  function nearestIndex(line, p, from) {
    var best = from || 0, bd = Infinity;
    for (var i = from || 0; i < line.length; i++) {
      var d = (line[i][0] - p[0]) * (line[i][0] - p[0]) + (line[i][1] - p[1]) * (line[i][1] - p[1]) * Math.pow(Math.cos(p[0] * Math.PI / 180), 2);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // Indice du tronçon (entre deux repères) qui contient le sommet idx.
  function legOf(idx) {
    var r = RT.route, from = 0, leg = 0;
    if (r.bounds) { for (var q = 0; q < r.bounds.length - 2; q++) if (idx <= r.bounds[q + 1]) return q; return Math.max(0, r.bounds.length - 2); }
    for (var i = 0; i < r.portions.length - 1; i++) {
      var en = r.portions[i].end.split(',').map(Number), k = nearestIndex(r.line, [en[1], en[0]], from);
      if (idx <= k) return i; from = k; leg = i + 1;
    }
    return Math.min(leg, effWps().length - 2);
  }
  function renderSteps() {
    var r = RT.route; if (!r) return;
    var items = [], d = S.route, n = d.wps.length;
    r.portions.forEach(function (p, pi) {
      items.push('<li class="leg"><span>' + esc(nameOf(d, pi)) + ' → ' + esc(nameOf(d, (pi + 1) % n)) + '</span><span>' + G.fmtDist(p.distance) + '</span></li>');
      (p.steps || []).forEach(function (s) {
        var nm = stepName(s);
        items.push('<li><span>' + esc(stepText(s)) + (nm ? ' <i>' + esc(nm) + '</i>' : '') + '</span><b>' + (s.distance > 0 ? G.fmtDist(s.distance) : '') + '</b></li>');
      });
    });
    $('#steps').innerHTML = items.join(''); $('#steps-box').hidden = !items.length;
  }
  function renderRouteStats() {
    var el = $('#route-stats'), r = RT.route;
    if (!r) { el.hidden = true; return; }
    var p = (currentProfile && currentProfile.src === 'route') ? currentProfile : (RT.elevCache[lineKey(r.line)] || null);
    var html = '<div class="' + (overMax() ? 'over' : '') + '"><span>Distance</span><b>' + G.fmtDist(r.dist) + '</b></div><div><span>Durée IGN (à pied)</span><b>' + G.fmtDur(r.dur) + '</b></div>';
    if (p) html += '<div><span>Dénivelé</span><b>+' + Math.round(p.asc) + ' / −' + Math.round(p.desc) + ' m</b></div><div><span>Marche estimée</span><b>' + G.fmtDur((r.dist / 1000 / S.speed + p.asc / 400) * 3600) + '</b></div>';
    el.innerHTML = html; el.hidden = false;
  }
  function renderGauge() {
    var g = $('#gauge'), on = S.route.maxOn && S.route.maxKm > 0;
    g.hidden = !on; if (!on) return;
    var mx = S.route.maxKm * 1000, r = RT.route, d = r ? r.dist : 0, over = d > mx;
    g.classList.toggle('over', over);
    $('#gauge-fill').style.width = Math.min(100, d / mx * 100) + '%';
    $('#gauge-txt').innerHTML = r
      ? 'Distance réelle <b>' + G.fmtDist(d) + '</b> sur ' + G.fmtDist(mx) + ' maximum · ' + (over ? '<b>dépassement de ' + G.fmtDist(d - mx) + '</b>' : 'il reste ' + G.fmtDist(mx - d))
      : 'Distance maximale : ' + G.fmtDist(mx) + '. Tracez l’itinéraire pour voir la distance réelle.';
  }
  function renderNatWarn() {
    var el = $('#nat-warn'), r = RT.route;
    if (!r || !S.route.flagNat || !r.nat || !r.nat.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = ic('alert') + '<span>Le tracé semble emprunter ' + r.nat.map(function (n) { return (n.label === 'nationale' ? 'une route nationale' : 'la ' + n.label) + ' (≈ ' + G.fmtDist(n.dist) + ')'; }).join(', ') +
      '. Déplacez un repère pour l’éviter si besoin.</span>';
  }

  // ---------- Azimuts ----------
  var azLines = [], azLabels = [];
  function azParams(d) { d = d || S.az; return { unit: d.unit, ref: d.ref, decl: +d.decl || 0 }; }
  function azClosedOf(d) { var p = d.pts; return p.length > 2 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]; }
  function azClosed() { return azClosedOf(S.az); }
  function addAz(p, idx) {
    ensureVisible('az');
    var at;
    if (idx != null) at = idx; else if (azClosed()) at = S.az.pts.length - 1; else at = S.az.pts.length;
    S.az.pts.splice(at, 0, p);
    renderAz(); persist(); select('az', at, true);
  }
  function renderAz() {
    azMarkers.concat(azLines, azLabels).forEach(function (l) { gAz.removeLayer(l); }); azMarkers = []; azLines = []; azLabels = [];
    var pts = S.az.pts, a = azParams(), closed = azClosed(), closable = RT.tool === 'az' && pts.length > 2 && !closed, col = S.az.color;
    $('#az-unit').value = a.unit; $('#az-ref').value = a.ref; $('#az-decl').value = a.decl; syncNames();
    $('#decl-row').hidden = a.ref !== 'mag'; $('#decl-note').hidden = a.ref !== 'mag';
    var rows = '', cum = 0;
    pts.forEach(function (p, i) {
      var m = L.marker(p, { draggable: true, icon: pin(String(i + 1), 'az', i === 0 && closable ? 'closable' : ''), zIndexOffset: 900 }).addTo(gAz);
      if (i === 0 && closable) m.bindTooltip('Cliquer pour fermer le circuit', { direction: 'top', offset: [0, -14] });
      m.on('dragstart', function () { select('az', i, true); });
      m.on('dragend', function () {
        var q = m.getLatLng(), wasClosed = azClosed();
        S.az.pts[i] = [q.lat, q.lng];
        if (wasClosed && i === 0) S.az.pts[S.az.pts.length - 1] = [q.lat, q.lng];
        renderAz(); persist();
      });
      m.on('click', function () { if (i === 0 && closable) closeAz(); select('az', i, true); });
      m.on('contextmenu', function (e) { L.DomEvent.stop(e); select('az', i, true); showCtx(e.originalEvent.clientX, e.originalEvent.clientY, azPtMenu(i)); });
      azMarkers.push(m);
      if (i > 0) {
        var q = pts[i - 1], t = G.bearing(q, p), d = G.haversine(q, p); cum += d;
        var v = G.trueToUnit(t, a.unit, a.ref, a.decl), back = G.trueToUnit((t + 180) % 360, a.unit, a.ref, a.decl);
        azLines.push(L.polyline([q, p], { color: col, weight: 4, dashArray: '10 6', opacity: 0.95, interactive: false }).addTo(gAz));
        var mid = [(q[0] + p[0]) / 2, (q[1] + p[1]) / 2];
        azLabels.push(L.marker(mid, { interactive: false, icon: L.divIcon({ className: 'az-label', html: '<span>' + G.fmtAz(v, a.unit) + ' · ' + G.fmtDist(d) + '</span>', iconSize: [0, 0] }) }).addTo(gAz));
        rows += '<tr data-i="' + i + '"><td>' + i + '→' + (i + 1) + '</td><td><b>' + G.fmtAz(v, a.unit) + '</b></td><td>' + G.fmtAz(back, a.unit) + '</td><td>' + G.fmtDist(d) + '</td><td>' + G.fmtDist(cum) + '</td><td><button class="ibtn danger" data-del="' + i + '" title="Retirer le point ' + (i + 1) + '">' + ic('x') + '</button></td></tr>';
      }
    });
    $('#az-table tbody').innerHTML = rows || '<tr><td colspan="6" class="muted">Posez au moins deux points.</td></tr>';
    var st = $('#az-stats');
    if (pts.length > 1) {
      var gap = G.haversine(pts[0], pts[pts.length - 1]);
      st.innerHTML = '<div><span>Points</span><b>' + pts.length + '</b></div><div><span>Parcours</span><b>' + G.fmtDist(cum) + '</b></div><div><span>Écart départ–arrivée</span><b>' + (closed ? 'Circuit fermé' : G.fmtDist(gap)) + '</b></div>';
      st.hidden = false;
    } else st.hidden = true;
    $('#aim-az').placeholder = a.unit === 'deg' ? '0–360' : a.unit === 'grd' ? '0–400' : '0–6400';
    renderLayerList(); refreshProfile(); applySel();
  }
  $('#az-table').addEventListener('click', function (e) {
    var del = e.target.closest('[data-del]');
    if (del) { S.az.pts.splice(+del.dataset.del, 1); select(null); renderAz(); persist(); return; }
    var tr = e.target.closest('tr[data-i]'); if (!tr) return;
    var i = +tr.dataset.i; select('az', i); panToIfHidden(ll(S.az.pts[i]));
  });
  function closeAz() {
    if (S.az.pts.length > 2 && !azClosed()) { S.az.pts.push(S.az.pts[0].slice()); renderAz(); persist(); toast('Circuit fermé.'); } else if (S.az.pts.length <= 2) toast('Posez au moins trois points.');
  }
  ['az-unit', 'az-ref'].forEach(function (id) {
    $('#' + id).addEventListener('change', function () { S.az.unit = $('#az-unit').value; S.az.ref = $('#az-ref').value; renderAz(); persist(); });
  });
  $('#az-decl').addEventListener('input', function () { S.az.decl = +this.value || 0; renderAz(); persist(); });
  $('#az-undo').addEventListener('click', function () { S.az.pts.pop(); select(null); renderAz(); persist(); });
  $('#az-clear').addEventListener('click', function () { S.az.pts = []; select(null); renderAz(); persist(); });
  $('#az-close').addEventListener('click', closeAz);
  $('#aim-add').addEventListener('click', function () {
    var last = lastPoint(), v = parseFloat($('#aim-az').value), d = parseFloat($('#aim-d').value);
    if (!last) { toast('Posez d’abord un point de départ sur la carte.'); return; }
    if (isNaN(v) || isNaN(d) || d <= 0) { toast('Saisissez un azimut et une distance.'); return; }
    var a = azParams(), t = G.unitToTrue(v, a.unit, a.ref, a.decl);
    ensureVisible('az'); S.az.pts.push(G.destination(last, t, d)); renderAz(); persist();
    map.panTo(ll(lastPoint())); $('#aim-az').value = ''; $('#aim-d').value = '';
  });

  // ---------- Mesure ----------
  var measLayers = [];
  function renderMeas() {
    measLayers.forEach(function (l) { gMeas.removeLayer(l); }); measLayers = []; measMarkers = [];
    var pts = S.meas.pts, area = S.meas.mode === 'area', col = S.meas.color;
    $$('#meas-mode button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === S.meas.mode); });
    syncNames();
    if (pts.length > 1) {
      var shape = area && pts.length > 2
        ? L.polygon(pts, { color: col, weight: 3, fillColor: '#c6a24e', fillOpacity: 0.25, dashArray: '2 6', interactive: false })
        : L.polyline(pts, { color: col, weight: 3, dashArray: '2 6', interactive: false });
      measLayers.push(shape.addTo(gMeas));
    }
    pts.forEach(function (p, i) {
      var m = L.marker(p, { draggable: true, icon: L.divIcon({ className: 'pin-wrap', html: '<div class="dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(gMeas);
      m.on('dragstart', function () { select('meas', i); });
      m.on('drag', function () { var q = m.getLatLng(); S.meas.pts[i] = [q.lat, q.lng]; });
      m.on('dragend', function () { renderMeas(); persist(); });
      m.on('click', function () { select('meas', i); });
      m.on('contextmenu', function (e) { L.DomEvent.stop(e); select('meas', i); showCtx(e.originalEvent.clientX, e.originalEvent.clientY, measPtMenu(i)); });
      measLayers.push(m); measMarkers.push(m);
    });
    var len = G.pathLength(pts), el = $('#meas-stats');
    if (area) {
      var ring = pts.length > 2 ? pts.concat([pts[0]]) : pts;
      el.innerHTML = '<div><span>Surface</span><b>' + (pts.length > 2 ? G.fmtArea(G.areaM2(pts)) : '—') + '</b></div><div><span>Périmètre</span><b>' + G.fmtDist(G.pathLength(ring)) + '</b></div>';
    } else el.innerHTML = '<div><span>Distance</span><b>' + G.fmtDist(len) + '</b></div><div><span>Points</span><b>' + pts.length + '</b></div>';
    renderLayerList(); refreshProfile(); applySel();
  }
  $$('#meas-mode button').forEach(function (b) { b.addEventListener('click', function () { S.meas.mode = b.dataset.v; renderMeas(); persist(); }); });
  $('#meas-undo').addEventListener('click', function () { S.meas.pts.pop(); select(null); renderMeas(); persist(); });
  $('#meas-clear').addEventListener('click', function () { S.meas.pts = []; select(null); renderMeas(); persist(); });

  // ---------- Traces importées ----------
  var trackLayers = {};
  var palette = ['#b4232c', '#1a7f37', '#7a3db8', '#d97706', '#0e7490'];
  function renderTracks() {
    Object.keys(trackLayers).forEach(function (k) { trackLayers[k].forEach(function (l) { gTracks.removeLayer(l); }); }); trackLayers = {};
    S.tracks.forEach(function (t) {
      var ls = [];
      if (t.show !== false) {
        ls.push(L.polyline(t.coords, { color: '#fff', weight: 7, opacity: 0.85, interactive: false }).addTo(gTracks));
        ls.push(L.polyline(t.coords, { color: t.color, weight: 4, opacity: 0.95 }).addTo(gTracks).bindTooltip(esc(t.name), { sticky: true }));
        (t.wpts || []).forEach(function (w) {
          ls.push(L.circleMarker([w.lat, w.lon], { radius: 6, color: '#fff', weight: 2, fillColor: t.color, fillOpacity: 1 }).addTo(gTracks).bindTooltip(esc(w.name || 'Point')));
        });
      }
      trackLayers[t.id] = ls;
    });
    renderLayerList(); refreshProfile();
  }
  function findTrack(id) { return S.tracks.filter(function (t) { return String(t.id) === String(id); })[0]; }
  function importGpx(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var base = file.name.replace(/\.gpx$/i, ''), res = G.parseGpx(fr.result, base);
        if (!res.tracks.length && !res.wpts.length) { toast('Aucune trace ni point dans ce fichier.'); return; }
        var added = [];
        res.tracks.forEach(function (t, i) {
          var tr = { id: Date.now() + i, name: t.name, coords: t.coords, ele: t.ele, color: palette[(S.tracks.length + i) % palette.length], show: true, wpts: i === 0 ? res.wpts : [] };
          S.tracks.push(tr); added.push(tr);
        });
        if (!res.tracks.length) S.tracks.push({ id: Date.now(), name: base + ' (points)', coords: res.wpts.map(function (w) { return [w.lat, w.lon]; }), color: palette[0], show: true, wpts: res.wpts });
        renderTracks(); setRail('layers');
        var b = L.latLngBounds([]); (added.length ? added : S.tracks.slice(-1)).forEach(function (t) { t.coords.forEach(function (c) { b.extend(c); }); });
        if (b.isValid()) fit(b, { padding: [60, 60] });
        if (added[0]) { S.profileSrc = 't' + added[0].id; refreshProfile(); }
        toast(res.tracks.length + ' trace(s) importée(s).'); persist();
      } catch (e) { toast(e.message || 'Import impossible.'); }
    };
    fr.readAsText(file);
  }
  $('#file-gpx').addEventListener('change', function () { if (S.mode !== 'route') setMode('route'); Array.prototype.forEach.call(this.files, importGpx); this.value = ''; });
  $('#layers-import').addEventListener('click', function () { $('#file-gpx').click(); });
  (function dropGpx() {
    var dz = $('#layers-import');
    window.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); dz.classList.add('over'); } });
    window.addEventListener('dragleave', function (e) { if (!e.relatedTarget) dz.classList.remove('over'); });
    window.addEventListener('drop', function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault(); dz.classList.remove('over');
      Array.prototype.forEach.call(e.dataTransfer.files, function (f) { if (/\.gpx$/i.test(f.name) || /xml/.test(f.type)) importGpx(f); });
    });
  })();

  // ---------- Panneau des calques ----------
  function layerMeta(l) {
    if (l.empty) return 'Vide';
    var d = l.data;
    if (l.type === 'route') return (d.loop ? 'Boucle · ' : '') + (l.res ? G.fmtDist(l.res.dist) : d.wps.length + ' point(s)');
    if (l.type === 'az') return d.pts.length + ' points · ' + G.fmtDist(G.pathLength(d.pts));
    if (l.type === 'game') return d.shapes.length + (d.shapes.length > 1 ? ' éléments' : ' élément');
    return d.mode === 'area' ? G.fmtArea(G.areaM2(d.pts)) : G.fmtDist(G.pathLength(d.pts));
  }
  var TYPE_LABEL = { route: 'Itinéraire', az: 'Azimuts', meas: 'Mesure', game: 'Grand jeu' };
  function renderLayerList() {
    var el = $('#layer-list'); if (!el) return;
    var all = layersList(), rows = all.filter(function (l) {
      if (!l.active || !l.empty) return true;
      return !all.some(function (o) { return o.type === l.type && o !== l && !o.empty; });   // un calque vide en cours n'apparaît que s'il est seul de son type
    });
    var html = rows.map(function (l) {
      var v = l.vis, canInv = l.type === 'route' && !l.empty;
      return '<li class="lrow' + (v ? '' : ' off') + (l.empty ? ' vide' : '') + (l.active && !l.empty ? ' active' : '') + '" data-k="' + esc(l.key) + '">' +
        (l.empty ? '<span style="width:30px"></span>' : '<button class="ibtn" data-a="vis" title="' + (v ? 'Masquer' : 'Afficher') + '" aria-label="' + (v ? 'Masquer' : 'Afficher') + '">' + ic(v ? 'eye' : 'eye-off') + '</button>') +
        '<span class="lsw" style="background:' + l.color + '"></span><div class="lmeta"><b class="lname" data-a="rename" title="Double-clic pour renommer">' + esc(l.name) + '</b><small>' + TYPE_LABEL[l.type] + ' · ' + esc(layerMeta(l)) + (l.active && !l.empty ? ' · actif' : '') + '</small></div>' +
        (l.empty ? '' : (canInv ? '<button class="ibtn" data-a="inv" title="Inverser le sens" aria-label="Inverser le sens">' + ic('swap') + '</button>' : '') +
          (l.active ? '' : '<button class="ibtn" data-a="edit" title="Modifier ce calque" aria-label="Modifier">' + ic('edit') + '</button>') +
          '<button class="ibtn" data-a="zoom" title="Centrer la carte" aria-label="Centrer">' + ic('target') + '</button><button class="ibtn danger" data-a="del" title="Supprimer" aria-label="Supprimer">' + ic('trash') + '</button>') + '</li>';
    }).join('');
    html += (S.mode === 'route' ? S.tracks : []).map(function (t) {
      var v = t.show !== false;
      return '<li class="lrow' + (v ? '' : ' off') + '" data-k="t' + t.id + '"><button class="ibtn" data-a="vis" title="' + (v ? 'Masquer' : 'Afficher') + '" aria-label="Basculer">' + ic(v ? 'eye' : 'eye-off') + '</button><span class="lsw" style="background:' + t.color + '"></span>' +
        '<div class="lmeta"><b class="lname" data-a="rename" title="Double-clic pour renommer">' + esc(t.name) + '</b><small>Trace GPX · ' + G.fmtDist(G.pathLength(t.coords)) + '</small></div>' +
        '<button class="ibtn" data-a="zoom" title="Centrer la carte" aria-label="Centrer">' + ic('target') + '</button><button class="ibtn danger" data-a="del" title="Supprimer" aria-label="Supprimer">' + ic('trash') + '</button></li>';
    }).join('');
    el.innerHTML = html;
  }
  function layerBounds(key) {
    var pts = [];
    if (key === 'route' || key === 'game' || key[0] === 'L') {
      var L0 = layersList().filter(function (l) { return l.key === key; })[0];
      if (L0 && L0.type === 'route') pts = L0.res ? L0.res.line : L0.data.wps.map(function (w) { return [w.lat, w.lon]; });
      else if (L0 && L0.type === 'game') pts = window.SM && SM.game ? SM.game.points(L0.data) : [];
      else if (L0) pts = L0.data.pts;
    } else if (key === 'az') pts = S.az.pts; else if (key === 'meas') pts = S.meas.pts;
    else { var t = findTrack(key.slice(1)); pts = t ? t.coords : []; }
    return pts.length ? L.latLngBounds(pts.map(ll)) : null;
  }
  $('#layer-list').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-a]'); if (!b) return;
    var k = b.closest('li').dataset.k, a = b.dataset.a;
    var L0 = layersList().filter(function (l) { return l.key === k; })[0];
    if (a === 'vis') {
      if (L0 && L0.active) { S.vis[L0.type] = !L0.vis; applyVis(); }
      else if (L0) { L0.item.vis = !L0.vis; renderStored(); }
      else { var t = findTrack(k.slice(1)); t.show = t.show === false; renderTracks(); }
      renderLayerList(); refreshProfile(); persist();
    } else if (a === 'zoom') {
      var bd = layerBounds(k); if (bd) fit(bd, bd.getNorthEast().equals(bd.getSouthWest()) ? { maxZoom: 16 } : { padding: [60, 60], maxZoom: 17 });
      S.profileSrc = k; refreshProfile();
    } else if (a === 'edit') { activate(L0.id); }
    else if (a === 'inv') { if (!L0.active) activate(L0.id); reverseRoute(); }
    else if (a === 'del') {
      if (k[0] === 't') { S.tracks = S.tracks.filter(function (t) { return 't' + t.id !== k; }); renderTracks(); persist(); }
      else removeLayer(k);
    }
  });
  $('#layer-list').addEventListener('dblclick', function (e) {
    var n = e.target.closest('.lname'); if (!n) return;
    var li = n.closest('li'), k = li.dataset.k, old = n.textContent;
    var inp = document.createElement('input'); inp.className = 'lname-in'; inp.value = old; inp.maxLength = 60;
    n.replaceWith(inp); inp.focus(); inp.select();
    var done = false;
    function commit(save) {
      if (done) return; done = true;
      var v = inp.value.trim();
      if (save && v) {
        if (k[0] === 't' && k !== 'route') { var t = findTrack(k.slice(1)); if (t) { t.name = v; renderTracks(); persist(); } } else renderLayerList(), renameLayer(k, v);
      } else renderLayerList();
    }
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') commit(true); else if (ev.key === 'Escape') commit(false); });
    inp.addEventListener('blur', function () { commit(true); });
  });
  $('#open-basemaps').addEventListener('click', function () { togglePop('layer-pop', true); });
  $('#pop-tabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-tab]'); if (b) popTab(b.dataset.tab); });
  $('#ov-none').addEventListener('click', function () { OVERS.forEach(function (k) { S.ov[k] = false; }); applyLayers(); persist(); });
  function resetAll(ask) {
    if (ask && !confirm('Effacer tout le travail en cours (tous les calques, traces importées comprises) ?')) return;
    S.route = freshRoute(null, 1); S.az = freshAz(null, 1); S.meas = freshMeas(null, 1); S.game = freshGame(null, 1); S.layers = []; S.tracks = []; S.name = '';
    S.vis = { route: true, az: true, meas: true, game: true }; RT.route = null; select(null); applyVis();
    $('#proj-name').value = '';
    syncRouteUi(); refreshRouteView(); renderAz(); renderMeas(); renderTracks(); renderStored(); renderLayerList(); if (window.SM && SM.game) SM.game.render(); persist();
    if (ask) showHome(true);
  }
  $('#reset-all').addEventListener('click', function () { resetAll(true); });
  $('#proj-name').addEventListener('input', function () { S.name = this.value; persist(); });

  // ---------- Fonds, couches, netteté (fenêtres flottantes) ----------
  // Les vignettes des fonds ne sont chargées qu'à la première ouverture du panneau.
  function loadThumbs() { $$('#base-grid img[data-src]').forEach(function (i) { if (i.dataset.src) { i.src = i.dataset.src; i.dataset.src = ''; } }); }
  function togglePop(id, force) {
    if (id === 'layer-pop') loadThumbs();
    ['layer-pop', 'scale-pop'].forEach(function (p) { $('#' + p).hidden = p !== id ? true : (force ? false : !$('#' + p).hidden); });
  }
  function closePops() { $('#layer-pop').hidden = true; $('#scale-pop').hidden = true; }
  $('#layer-btn').addEventListener('click', function () { togglePop('layer-pop'); });
  $('#scale-btn').addEventListener('click', function () { togglePop('scale-pop'); });
  $$('[data-close]').forEach(function (b) { b.addEventListener('click', function () { $('#' + b.dataset.close).hidden = true; }); });
  document.addEventListener('mousedown', function (e) {
    if (!e.target.closest('.pop,.layerbtn,.scalebtn,#open-basemaps')) closePops();
  });
  $('#base-grid').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { S.base = b.dataset.base; applyLayers(); persist(); } });
  $('#ov-grid').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { S.ov[b.dataset.ov] = !S.ov[b.dataset.ov]; applyLayers(); persist(); } });
  $('#detail-seg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    S.detail = b.dataset.v === 'auto' ? 'auto' : +b.dataset.v; curOff = wantOff(); buildTiles(); persist();
  });
  $('#base-grid').innerHTML = BASES.map(function (k) { return '<button data-base="' + k + '" title="' + esc(LAYERS[k].label) + '"><img alt="" data-src="' + thumbUrl(k) + '"><span>' + esc(LAYERS[k].label) + '</span></button>'; }).join('');
  $('#ov-grid').innerHTML = OVERS.map(function (k) { return '<button data-ov="' + k + '" title="' + esc(LAYERS[k].label) + '"><span class="ov-ic">' + ic(LAYERS[k].icon) + '</span><span>' + esc(LAYERS[k].label) + '</span></button>'; }).join('');

  // ---------- Export GPX ----------
  function gpxParts() {
    var parts = [];
    layersList().forEach(function (l) {
      if (l.empty || l.type === 'game') return;
      if (l.type === 'route') parts.push({ id: l.key, label: l.name + ' (' + l.data.wps.length + ' repères' + (l.res ? ', ' + G.fmtDist(l.res.dist) : '') + ')' });
      else if (l.type === 'az') parts.push({ id: l.key, label: l.name + ' (' + l.data.pts.length + ' points)' });
      else if (l.data.pts.length > 1) parts.push({ id: l.key, label: l.name });
    });
    if (S.mode === 'route') S.tracks.forEach(function (t) { parts.push({ id: 't' + t.id, label: 'Trace : ' + t.name }); });
    return parts;
  }
  function buildGpx(ids) {
    var body = '';
    layersList().forEach(function (l) {
      if (ids.indexOf(l.key) < 0 || l.empty) return;
      var d = l.data;
      if (l.type === 'route') {
        d.wps.forEach(function (p, i) { body += G.wptXml([p.lat, p.lon], nameOf(d, i)); });
        if (l.res) {
          var pr = RT.elevCache[lineKey(l.res.line)], ele = null;
          if (pr) { var cum = G.cumDist(l.res.line); ele = l.res.line.map(function (_, i) { var j = 0; while (j < pr.pts.length - 1 && pr.pts[j].d < cum[i]) j++; return pr.pts[j].z; }); }
          body += G.trkXml(d.name, l.res.line, ele, G.fmtDist(l.res.dist) + ' – à pied' + (d.loop ? ' – boucle' : ''));
        }
      } else if (l.type === 'az') {
        var a = azParams(d);
        d.pts.forEach(function (p, i, pts) {
          var t = '';
          if (i > 0) t = 'Azimut ' + G.fmtAz(G.trueToUnit(G.bearing(pts[i - 1], p), a.unit, a.ref, a.decl), a.unit) + ' (' + (a.ref === 'mag' ? 'magnétique' : 'géographique') + '), ' + G.fmtDist(G.haversine(pts[i - 1], p));
          body += G.wptXml(p, 'Balise ' + (i + 1), t);
        });
        if (d.pts.length > 1) body += G.trkXml(d.name, d.pts, null);
      } else if (d.pts.length > 1) body += G.trkXml(d.name, d.pts, null);
    });
    S.tracks.forEach(function (t) { if (ids.indexOf('t' + t.id) >= 0) { body += G.trkXml(t.name, t.coords, t.ele); (t.wpts || []).forEach(function (w) { body += G.wptXml([w.lat, w.lon], w.name || 'Point'); }); } });
    return G.gpxDoc(body, S.name || 'ScoutMap ' + new Date().toLocaleDateString('fr-FR'));
  }
  function fileName() {
    var base = (S.name || 'scoutmap').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scoutmap';
    return base + '-' + new Date().toISOString().slice(0, 10) + '.gpx';
  }
  function download(name, text, mime) {
    var a = document.createElement('a'), u = URL.createObjectURL(new Blob([text], { type: mime }));
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  }
  function openExport() {
    var parts = gpxParts();
    if (!parts.length) { toast(S.mode === 'game' ? 'Le GPX concerne les itinéraires, azimuts et mesures. Pour un grand jeu, utilisez l’export PDF.' : 'Rien à exporter dans ce type de travail : tracez d’abord quelque chose.'); return; }
    $('#export-opts').innerHTML = parts.map(function (p) { return '<label><input type="checkbox" value="' + esc(p.id) + '" checked> ' + esc(p.label) + '</label>'; }).join('');
    openDlg('dlg-export');
  }
  $('#export-cancel').addEventListener('click', function () { $('#dlg-export').close(); });
  $('#export-ok').addEventListener('click', function () {
    var ids = $$('#export-opts input:checked').map(function (i) { return i.value; });
    if (!ids.length) { toast('Cochez au moins un élément.'); return; }
    var gpx = buildGpx(ids); $('#dlg-export').close();
    download(fileName(), gpx, 'application/gpx+xml');
  });
  window.ScoutMap = { exportGpx: function () { return buildGpx(gpxParts().map(function (p) { return p.id; })); }, state: S, fileName: fileName };
  function openPdf(type) { if (window.SM && SM.openPdf) SM.openPdf(type); }
  $('#btn-pdf').addEventListener('click', function () { openPdf(); });

  // ---------- Coordonnées au curseur ----------
  var lastLL = null;
  map.on('mousemove', function (e) { lastLL = e.latlng; showCoords(); });
  function showCoords() { var p = lastLL || map.getCenter(); $('#coords').textContent = G.formatCoord('wgs', p.lat, p.lng); }
  $('#coords').addEventListener('click', function () {
    var t = this.textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Coordonnées copiées.'); }, function () { toast(t); });
  });

  // ---------- Clic carte & menu du point ----------
  map.on('click', function (e) {
    var p = [e.latlng.lat, e.latlng.lng];
    closePops();
    if (RT.tool === 'route') {
      // Un clic tout près du tracé insère le point dans le tronçon concerné (ordre de passage respecté).
      if (RT.route && pixelDistToRoute(e.latlng) <= 14) insertOnRoute(p); else { addWp(p); snapToChurch(S.route.wps[S.route.wps.length - 1]); }
    }
    else if (RT.tool === 'az') addAz(p);
    else if (RT.tool === 'meas') { ensureVisible('meas'); S.meas.pts.push(p); renderMeas(); persist(); select('meas', S.meas.pts.length - 1); }
    else if (RT.tool === 'game') { /* géré par game.js */ }
    else select(null);
  });
  function actionPopup(latlng, title, name) {
    var html = '<div class="pp"><b>' + esc(title) + '</b><small>' + esc(G.formatCoord('wgs', latlng.lat, latlng.lng)) + '</small><div class="pp-btns">' +
      (S.mode === 'az' ? '<button data-a="az">Point d’azimut</button>' : S.mode === 'meas' ? '<button data-a="meas">Point de mesure</button>' : S.mode === 'game' ? '<button data-a="gtext">Texte ici</button><button data-a="gcross">Croix ici</button>' : '<button data-a="start">Départ</button><button data-a="via">Étape</button><button data-a="end">Arrivée</button>') + '<button data-a="copy">Copier</button></div></div>';
    L.popup({ closeButton: true, offset: [0, -4] }).setLatLng(latlng).setContent(html).openOn(map);
    var el = document.querySelector('.leaflet-popup-content .pp');
    if (!el) return;
    el.addEventListener('click', function (ev) {
      var a = ev.target.dataset && ev.target.dataset.a; if (!a) return;
      var p = [latlng.lat, latlng.lng];
      map.closePopup();
      if (a === 'copy') copyCoords(p); else if (a === 'gtext' || a === 'gcross') { if (window.SM && SM.game) SM.game.addAt(a === 'gtext' ? 'text' : 'cross', p); } else placeAs(a, p, name);
    });
  }
  function copyCoords(p) { var t = G.formatCoord('wgs', p[0], p[1]); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Coordonnées copiées : ' + t); }, function () { toast(t); }); }
  // Pose un point à partir d'un menu : départ, étape, arrivée, azimut, mesure.
  function placeAs(a, p, name) {
    if (a === 'az') { addAz(p); setRail('az'); setTool('pan'); return; }
    if (a === 'meas') { ensureVisible('meas'); S.meas.pts.push(p); renderMeas(); persist(); setRail('meas'); setTool('pan'); return; }
    var w = S.route.wps, o = { lat: p[0], lon: p[1] }; if (name) o.name = name;
    ensureVisible('route');
    if (a === 'start') w.unshift(o); else if (a === 'end') w.push(o);
    else if (w.length < 2) w.push(o); else w.splice(w.length - 1, 0, o);
    setRail('route'); setTool('pan'); renderRouteMarkers(); computeRoute(); persist(); fillPlaces(S.route);
  }

  // ---------- Menus contextuels (clic droit) ----------
  var ctxEl = document.createElement('div'); ctxEl.className = 'dropdown ctx'; ctxEl.id = 'ctxmenu'; ctxEl.hidden = true; ctxEl.setAttribute('role', 'menu'); document.body.appendChild(ctxEl);
  function hideCtx() { ctxEl.hidden = true; }
  function showCtx(x, y, items) {
    hideMenu();
    ctxEl.innerHTML = items.map(function (it, i) {
      if (it === '-') return '<div class="mi-sep"></div>';
      return '<button class="mi' + (it.danger ? ' danger' : '') + '" role="menuitem" data-i="' + i + '"' + (it.dis && it.dis() ? ' disabled' : '') + '>' + ic(it.i || 'chev-right') + '<span>' + esc(it.t) + '</span>' + (it.k ? '<kbd>' + esc(it.k) + '</kbd>' : '') + '</button>';
    }).join('');
    ctxEl._items = items; ctxEl.hidden = false;
    var r = ctxEl.getBoundingClientRect();
    ctxEl.style.left = Math.max(6, Math.min(x, window.innerWidth - r.width - 6)) + 'px'; ctxEl.style.top = Math.max(6, Math.min(y, window.innerHeight - r.height - 6)) + 'px';
  }
  ctxEl.addEventListener('click', function (e) { var b = e.target.closest('.mi'); if (!b || b.disabled) return; var it = ctxEl._items[+b.dataset.i]; hideCtx(); it.a(); });
  ctxEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('mousedown', function (e) { if (!e.target.closest('#ctxmenu')) hideCtx(); });
  window.addEventListener('blur', hideCtx); window.addEventListener('resize', hideCtx); window.addEventListener('wheel', hideCtx, { passive: true });
  map.on('movestart zoomstart', hideCtx);
  var CSEP = '-';
  function commonPt(p) { return [CSEP, { t: 'Copier les coordonnées', i: 'copy', a: function () { copyCoords(p); } }, { t: 'Centrer la carte ici', i: 'target', a: function () { map.panTo(L.latLng(p[0], p[1])); } }]; }
  function renameWp(i) {
    setRail('route'); setTool('pan'); select('route', i);
    var inp = $('#wps .wp-name[data-i="' + i + '"]'); if (inp) { inp.focus(); inp.select(); }
  }
  function routePtMenu(i) {
    var d = S.route, n = d.wps.length, p = [d.wps[i].lat, d.wps[i].lon], loop = loopOf(d);
    var m = [
      { t: 'Renommer…', i: 'edit', a: function () { renameWp(i); } },
      { t: 'Supprimer ce point', i: 'trash', k: 'Suppr', danger: true, a: function () { removeWp(i); } }
    ];
    if (i === 0 && n >= 2 && !d.loop) m.push({ t: 'Fermer la boucle', i: 'loop', a: closeLoop });
    if (i > 0) m.push({ t: 'En faire le départ', i: 'pin', a: function () { moveWp(i, 0); } });
    if (i < n - 1 && !loop) m.push({ t: 'En faire l’arrivée', i: 'pin', a: function () { moveWp(i, n - 1); } });
    m.push({ t: 'Inverser le sens', i: 'swap', dis: function () { return n < 2; }, a: reverseRoute });
    return m.concat(commonPt(p));
  }
  function azPtMenu(i) {
    var p = S.az.pts[i], n = S.az.pts.length;
    var m = [{ t: 'Supprimer ce point', i: 'trash', k: 'Suppr', danger: true, a: function () { select('az', i); deleteSelected(); } }];
    if (i === 0 && n > 2 && !azClosed()) m.push({ t: 'Fermer le circuit', i: 'loop', a: closeAz });
    return m.concat(commonPt(p));
  }
  function measPtMenu(i) {
    var p = S.meas.pts[i];
    return [{ t: 'Supprimer ce point', i: 'trash', k: 'Suppr', danger: true, a: function () { select('meas', i); deleteSelected(); } }].concat(commonPt(p));
  }
  function routeLineMenu(latlng) {
    var p = [latlng.lat, latlng.lng];
    return [
      { t: 'Ajouter une étape ici', i: 'pin', a: function () { insertOnRoute(p); } },
      { t: 'Inverser le sens', i: 'swap', a: reverseRoute },
      { t: 'Simulation du parcours…', i: 'play', a: simOpen },
      { t: 'Feuille de route en PDF…', i: 'printer', a: function () { openPdf('simple'); } }
    ].concat(commonPt(p));
  }
  function storedMenu(id) {
    var key = 'L' + id;
    return [
      { t: 'Modifier ce calque', i: 'edit', a: function () { activate(id); } },
      { t: 'Masquer', i: 'eye-off', a: function () { var l = S.layers.filter(function (x) { return x.data.id === id; })[0]; if (l) { l.vis = false; renderStored(); renderLayerList(); refreshProfile(); persist(); } } },
      { t: 'Centrer la carte dessus', i: 'target', a: function () { var b = layerBounds(key); if (b) fit(b, { padding: [60, 60], maxZoom: 17 }); } },
      { t: 'Supprimer ce calque', i: 'trash', danger: true, a: function () { removeLayer(key); } }
    ];
  }
  function mapMenu(latlng) {
    var p = [latlng.lat, latlng.lng], m = [];
    if (S.mode === 'route') m = [
      { t: 'Départ ici', i: 'pin', a: function () { placeAs('start', p); } },
      { t: 'Étape ici', i: 'pin', a: function () { placeAs('via', p); } },
      { t: 'Arrivée ici', i: 'pin', a: function () { placeAs('end', p); } }];
    else if (S.mode === 'az') m = [{ t: 'Point d’azimut ici', i: 'compass', a: function () { placeAs('az', p); } }];
    else if (S.mode === 'meas') m = [{ t: 'Point de mesure ici', i: 'ruler', a: function () { placeAs('meas', p); } }];
    else if (S.mode === 'game' && window.SM && SM.game) m = [
      { t: 'Texte ici', i: 'g-text', a: function () { SM.game.addAt('text', p); } },
      { t: 'Croix ici', i: 'g-cross', a: function () { SM.game.addAt('cross', p); } }];
    return m.concat(m.length ? [CSEP] : []).concat(commonPt(p).slice(1)).concat([CSEP,
      { t: 'Annuler', i: 'undo', k: 'Ctrl+Z', dis: function () { return !H.undo.length; }, a: undoAction },
      { t: 'Rétablir', i: 'redo', k: 'Ctrl+Y', dis: function () { return !H.redo.length; }, a: redoAction }
    ]);
  }
  // Diagramme d'altitude : clic droit
  (function profileCtx() {
    var svg = $('#profile');
    svg.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      var g = svg._geom; if (!g || !currentProfile) return;
      var rect = svg.getBoundingClientRect(), d = Math.max(0, Math.min(g.total, (e.clientX - rect.left - g.m.l) / g.iw * g.total)), pts = currentProfile.pts, i = 0;
      while (i < pts.length - 1 && pts[i + 1].d < d) i++;
      var a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)], q = b.d > a.d ? (d - a.d) / (b.d - a.d) : 0;
      var lat = a.lat + (b.lat - a.lat) * q, lon = a.lon + (b.lon - a.lon) * q, z = a.z + (b.z - a.z) * q, p = [lat, lon], label = G.fmtDist(d) + ' · ' + Math.round(z) + ' m';
      var m = [
        { t: 'Centrer la carte sur ce point (' + label + ')', i: 'target', a: function () { map.panTo(L.latLng(lat, lon)); L.circleMarker([lat, lon], { radius: 10, color: '#fff', weight: 3, fillColor: '#c6a24e', fillOpacity: 1, interactive: false }).addTo(gCursor); setTimeout(function () { gCursor.clearLayers(); if (SIM.open) { SIM.marker = null; SIM.trail = null; simRender(false); } }, 1800); } }
      ];
      if (currentProfile.src === 'route' && RT.route) m.push({ t: 'Ajouter une étape ici', i: 'pin', a: function () { insertOnRoute(p); } });
      m.push({ t: 'Lancer la simulation depuis ici', i: 'play', a: function () { simOpen(); if (SIM.open) { var j = 0; while (j < pts.length - 2 && pts[j + 1].d < d) j++; SIM.pos = SIM.t[j] + (SIM.t[j + 1] - SIM.t[j]) * q; simRender(true); simPlay(); } } });
      m.push(CSEP, { t: 'Copier : ' + label, i: 'copy', a: function () { var t = label + ' · ' + G.formatCoord('wgs', lat, lon); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Copié : ' + t); }, function () { toast(t); }); } });
      m.push({ t: S.dockOpen ? 'Réduire le profil' : 'Afficher le profil', i: 'mountain', a: toggleDock });
      showCtx(e.clientX, e.clientY, m);
    });
    $('#dock-head').addEventListener('contextmenu', function (e) { e.preventDefault(); showCtx(e.clientX, e.clientY, [{ t: S.dockOpen ? 'Réduire le profil' : 'Afficher le profil', i: 'mountain', a: toggleDock }, { t: 'Simulation du parcours…', i: 'play', a: simOpen }]); });
  })();
  // Liste des calques : clic droit sur une ligne
  $('#layer-list').addEventListener('contextmenu', function (e) {
    var li = e.target.closest('.lrow'); if (!li) return;
    e.preventDefault();
    var k = li.dataset.k;
    function act(a) { return function () { var b = li.querySelector('[data-a="' + a + '"]'); if (b) b.click(); }; }
    var items = [];
    if (li.querySelector('[data-a=edit]')) items.push({ t: 'Modifier ce calque', i: 'edit', a: act('edit') });
    if (li.querySelector('[data-a=vis]')) items.push({ t: 'Afficher / masquer', i: 'eye', a: act('vis') });
    items.push({ t: 'Renommer…', i: 'edit', a: function () { var n = li.querySelector('.lname'); if (n) n.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); } });
    if (li.querySelector('[data-a=inv]')) items.push({ t: 'Inverser le sens', i: 'swap', a: act('inv') });
    if (li.querySelector('[data-a=zoom]')) items.push({ t: 'Centrer la carte dessus', i: 'target', a: act('zoom') });
    if (li.querySelector('[data-a=del]')) items.push(CSEP, { t: 'Supprimer', i: 'trash', danger: true, a: act('del') });
    if (items.length) showCtx(e.clientX, e.clientY, items);
  });
  map.on('contextmenu', function (e) { showCtx(e.originalEvent.clientX, e.originalEvent.clientY, mapMenu(e.latlng)); });

  // ---------- Recherche ----------
  var qTimer, qCtl, qItems = [], qAct = -1;
  function itemOf(f) {
    var p = f.properties || {}, poi = p._type === 'poi';
    if (poi) {
      var city = arr(p.city)[0] || '', pc = arr(p.postcode)[0] || '', cat = arr(p.category)[0] || '';
      return { t: arr(p.toponym || p.name)[0] || 'Lieu', s: [cat, (pc + ' ' + city).trim()].filter(Boolean).join(' · '), k: 'pin', poi: true, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], cat: arr(p.category).join(' ') };
    }
    return { t: p.name || p.label || 'Adresse', s: ((p.postcode || '') + ' ' + (p.city || '')).trim(), k: 'home', poi: false, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], cat: '' };
  }
  function parseCoord(v) {
    var m = /^\s*(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/.exec(v);
    if (!m) return null;
    var a = parseFloat(m[1].replace(',', '.')), b = parseFloat(m[2].replace(',', '.'));
    if (Math.abs(a) > 90 && Math.abs(b) <= 90) { var t = a; a = b; b = t; }
    return Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lon: b } : null;
  }
  function closeSuggest() { $('#suggest').hidden = true; qAct = -1; }
  function renderSuggest() {
    var ul = $('#suggest');
    ul.innerHTML = qItems.length ? qItems.map(function (it, i) {
      return '<li role="option" data-i="' + i + '"' + (i === qAct ? ' class="act"' : '') + '><span class="sg-ic">' + ic(it.k) + '</span><span class="sg-body"><span class="sg-t">' + esc(it.t) + '</span>' + (it.s ? '<span class="sg-s">' + esc(it.s) + '</span>' : '') + '</span></li>';
    }).join('') : '<li class="none">Aucun résultat</li>';
    ul.hidden = false;
  }
  $('#q').addEventListener('input', function () {
    var v = this.value.trim(); clearTimeout(qTimer);
    $('#q-clear').hidden = !this.value;
    if (v.length < 2) { closeSuggest(); return; }
    var c = parseCoord(v);
    if (c) { qItems = [{ t: 'Aller aux coordonnées', s: c.lat.toFixed(5) + ', ' + c.lon.toFixed(5), k: 'target', coord: true, lat: c.lat, lon: c.lon }]; qAct = 0; renderSuggest(); return; }
    if (v.length < 3) { closeSuggest(); return; }
    qTimer = setTimeout(function () {
      if (qCtl) qCtl.abort(); qCtl = new AbortController();
      fetch(GP + '/geocodage/search?q=' + encodeURIComponent(v) + '&index=poi,address&limit=7', { signal: qCtl.signal })
        .then(function (r) { return r.json(); }).then(function (j) {
          qItems = (j.features || []).map(itemOf); qAct = qItems.length ? 0 : -1; renderSuggest();
        }).catch(function (e) { if (e.name !== 'AbortError') { qItems = []; $('#suggest').innerHTML = '<li class="none">Recherche indisponible</li>'; $('#suggest').hidden = false; } });
    }, 220);
  });
  function pick(i) {
    var it = qItems[i]; if (!it) return;
    closeSuggest(); $('#q').value = it.t; $('#q-clear').hidden = false; $('#q').blur();
    setScale(it.coord ? 25000 : it.poi ? (/sommet|montagne|col/i.test(it.cat) ? 50000 : 25000) : 10000, [it.lat, it.lon]);
    gSearch.clearLayers();
    L.marker([it.lat, it.lon], { icon: pin('⌖', 'search') }).addTo(gSearch);
    actionPopup(L.latLng(it.lat, it.lon), it.t, it.coord ? undefined : it.t);
  }
  $('#suggest').addEventListener('mousedown', function (e) { var li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pick(+li.dataset.i); } });
  $('#q').addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!qItems.length) return; e.preventDefault();
      qAct = (qAct + (e.key === 'ArrowDown' ? 1 : -1) + qItems.length) % qItems.length; renderSuggest();
    } else if (e.key === 'Enter') { e.preventDefault(); if (qItems.length) pick(Math.max(0, qAct)); }
    else if (e.key === 'Escape') { if (!$('#suggest').hidden) closeSuggest(); else this.blur(); }
  });
  $('#q').addEventListener('focus', function () { if (qItems.length && this.value.trim().length >= 2) renderSuggest(); });
  $('#q-clear').addEventListener('click', function () { $('#q').value = ''; this.hidden = true; closeSuggest(); qItems = []; gSearch.clearLayers(); map.closePopup(); $('#q').focus(); });
  document.addEventListener('mousedown', function (e) { if (!e.target.closest('.searchcard')) closeSuggest(); });


  // ---------- Simulation du parcours : un curseur parcourt le tracé en suivant le relief ----------
  var SIM = { open: false, prof: null, t: [], tot: 1, pos: 0, playing: false, dur: 6, follow: true, raf: 0, last: 0, marker: null, trail: null, rec: false, label: 'Parcours' };
  function simPrepare(p) {
    var z = p.pts.map(function (q) { return q.z; }), s = z.map(function (v, i) { return (z[Math.max(0, i - 1)] + v + z[Math.min(z.length - 1, i + 1)]) / 3; });
    var asc = 0, t = [0];
    for (var i = 1; i < p.pts.length; i++) { var dz = s[i] - s[i - 1]; if (dz > 0) asc += dz; t.push(p.pts[i].d / 1000 / S.speed * 3600 + asc / 400 * 3600); }
    SIM.prof = p; SIM.t = t; SIM.tot = t[t.length - 1] || 1;
  }
  function simAt(tt) {
    var p = SIM.prof.pts, t = SIM.t, i = 0; tt = Math.max(0, Math.min(SIM.tot, tt));
    while (i < p.length - 2 && t[i + 1] < tt) i++;
    var a = p[i], b = p[i + 1] || a, f = t[i + 1] > t[i] ? (tt - t[i]) / (t[i + 1] - t[i]) : 0;
    return { i: i, d: a.d + (b.d - a.d) * f, lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, z: a.z + (b.z - a.z) * f,
      slope: b.d > a.d ? (b.z - a.z) / (b.d - a.d) * 100 : 0 };
  }
  // follow : recentre la carte sur le curseur (lecture, ou déplacement de la barre de position)
  function simRender(follow) {
    var r = simAt(SIM.pos), ll0 = L.latLng(r.lat, r.lon), p = SIM.prof.pts;
    if (!SIM.marker) SIM.marker = L.marker(ll0, { interactive: false, zIndexOffset: 3000, icon: L.divIcon({ className: 'sim-wrap', html: '<div class="sim-dot"></div>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(gCursor);
    SIM.marker.setLatLng(ll0);
    var trail = p.slice(0, r.i + 1).map(function (q) { return [q.lat, q.lon]; }).concat([[r.lat, r.lon]]);
    if (!SIM.trail) SIM.trail = L.polyline(trail, { color: '#c6a24e', weight: 6, opacity: 0.95, interactive: false, lineCap: 'round' }).addTo(gCursor); else SIM.trail.setLatLngs(trail);
    var svg = $('#profile'), g = svg._geom;
    if (g && S.dockOpen) {
      var c = svg.querySelector('.cur');
      if (c) { c.setAttribute('visibility', 'visible'); c.querySelector('line').setAttribute('x1', g.X(r.d)); c.querySelector('line').setAttribute('x2', g.X(r.d)); c.querySelector('circle').setAttribute('cx', g.X(r.d)); c.querySelector('circle').setAttribute('cy', g.Y(r.z)); }
    }
    $('#sim-slider').value = Math.round(SIM.pos / SIM.tot * 1000);
    $('#ss-d').textContent = G.fmtDist(r.d); $('#ss-z').textContent = Math.round(r.z) + ' m';
    $('#ss-s').textContent = (r.slope >= 0 ? '+' : '') + r.slope.toFixed(0) + ' %'; $('#ss-t').textContent = G.fmtDur(SIM.pos);
    if (follow && SIM.follow && !SIM.rec) map.panTo(ll0, { animate: false });
  }
  function simFrame(ts) {
    if (!SIM.playing) return;
    var dt = Math.min(0.1, (ts - SIM.last) / 1000); SIM.last = ts;
    SIM.pos = Math.min(SIM.tot, SIM.pos + dt * SIM.tot / SIM.dur); simRender(true);
    if (SIM.pos >= SIM.tot) { SIM.playing = false; simBtn(); return; }
    SIM.raf = requestAnimationFrame(simFrame);
  }
  function simBtn() { $('#sim-play').innerHTML = ic(SIM.playing ? 'pause' : 'play'); $('#sim-play').title = SIM.playing ? 'Pause' : 'Lecture'; }
  function simPlay() {
    if (SIM.playing) { SIM.playing = false; cancelAnimationFrame(SIM.raf); simBtn(); return; }
    if (SIM.pos >= SIM.tot) SIM.pos = 0;
    SIM.playing = true; SIM.last = performance.now(); simBtn(); SIM.raf = requestAnimationFrame(simFrame);
  }
  function simOpen() {
    if (!currentProfile) { toast('Tracez d’abord un itinéraire (ou des azimuts) pour lancer la simulation.'); return; }
    setRail('sim');
    SIM.open = true; simPrepare(currentProfile); SIM.pos = 0; SIM.playing = false; cancelAnimationFrame(SIM.raf); simBtn();
    var o = $('#profile-src').selectedOptions[0]; SIM.label = o ? o.textContent : 'Parcours'; $('#sim-src').textContent = SIM.label;
    var b = L.latLngBounds(currentProfile.pts.map(function (q) { return [q.lat, q.lon]; })); if (!map.getBounds().contains(b)) fit(b, { padding: [90, 90], maxZoom: 16 });
    simRender(false);
  }
  function simClose(keepRail) {
    SIM.open = false; SIM.playing = false; cancelAnimationFrame(SIM.raf);
    if (SIM.marker) { gCursor.removeLayer(SIM.marker); SIM.marker = null; } if (SIM.trail) { gCursor.removeLayer(SIM.trail); SIM.trail = null; }
    var c = $('#profile').querySelector('.cur'); if (c) c.setAttribute('visibility', 'hidden');
    if (!keepRail) setRail(S.mode || 'route');
  }
  // Le tracé affiché dans le profil a changé : on repart du début (ou on ferme s'il n'y a plus de tracé).
  function simSync() {
    if (!SIM.open || SIM.rec) return;
    if (!currentProfile) { simClose(); return; }
    if (currentProfile !== SIM.prof) { SIM.playing = false; cancelAnimationFrame(SIM.raf); simPrepare(currentProfile); SIM.pos = 0; simBtn(); simRender(false); }
  }
  $('#sim-play').addEventListener('click', simPlay);
  $('#sim-restart').addEventListener('click', function () { SIM.pos = 0; simRender(true); });
  $('#sim-close').addEventListener('click', function () { simClose(); });
  $('#sim-slider').addEventListener('input', function () { SIM.pos = this.value / 1000 * SIM.tot; simRender(true); });
  $('#sim-dur').addEventListener('input', function () { SIM.dur = +this.value; $('#sim-dur-v').textContent = SIM.dur + ' s'; });
  $('#sim-follow').addEventListener('change', function () { SIM.follow = this.checked; });

  // ---------- Export vidéo de la simulation ----------
  var REC = { cancel: false, url: null, name: '' };
  function waitTiles(ms) {
    return new Promise(function (res) {
      var t0 = Date.now();
      (function chk() {
        var pending = map.getContainer().querySelectorAll('img.leaflet-tile:not(.leaflet-tile-loaded)').length;
        if (!pending || Date.now() - t0 > ms) setTimeout(res, 250); else setTimeout(chk, 150);
      })();
    });
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  var FONT = '"Inter","Segoe UI",system-ui,sans-serif';
  // Compose une image de la carte (tuiles déjà chargées par Leaflet + tracés) dans un canvas.
  function drawSimFrame(ctx, W, H, pos, strip) {
    var mapEl = map.getContainer(), mr = mapEl.getBoundingClientRect();
    ctx.fillStyle = '#e6e3d9'; ctx.fillRect(0, 0, W, H);
    var lays = [].slice.call(map.getPane('tilePane').querySelectorAll('.leaflet-layer'));
    lays.sort(function (a, b) { return (parseInt(a.style.zIndex, 10) || 0) - (parseInt(b.style.zIndex, 10) || 0); });
    lays.forEach(function (lay) {
      var op = parseFloat(getComputedStyle(lay).opacity); ctx.globalAlpha = isNaN(op) ? 1 : op;
      [].forEach.call(lay.querySelectorAll('img.leaflet-tile'), function (img) {
        if (!img.complete || !img.naturalWidth) return;
        var r = img.getBoundingClientRect();
        ctx.drawImage(img, Math.floor(r.left - mr.left), Math.floor(r.top - mr.top), Math.ceil(r.width) + 1, Math.ceil(r.height) + 1);
      });
    });
    ctx.globalAlpha = 1;
    function P(la, lo) { return map.latLngToContainerPoint([la, lo]); }
    function path(pts) { ctx.beginPath(); pts.forEach(function (c, i) { var q = P(c[0], c[1]); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var items = layersList().filter(function (l) { return l.vis && !l.empty; });
    S.tracks.forEach(function (t) { if (t.show !== false) { path(t.coords); ctx.strokeStyle = '#fff'; ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = t.color; ctx.lineWidth = 4; ctx.stroke(); } });
    items.forEach(function (l) {
      if (l.type === 'route' && l.res) { path(l.res.line); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = l.color; ctx.lineWidth = 5; ctx.stroke(); }
      else if (l.type === 'az' && l.data.pts.length > 1) { path(l.data.pts); ctx.setLineDash([10, 6]); ctx.strokeStyle = l.color; ctx.lineWidth = 4; ctx.stroke(); ctx.setLineDash([]); }
      else if (l.type === 'meas' && l.data.pts.length > 1) { path(l.data.pts); ctx.setLineDash([2, 6]); ctx.strokeStyle = l.color; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]); }
    });
    // trace parcourue
    var r = simAt(pos), pts = SIM.prof.pts;
    path(pts.slice(0, r.i + 1).map(function (q) { return [q.lat, q.lon]; }).concat([[r.lat, r.lon]]));
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 11; ctx.stroke(); ctx.strokeStyle = '#c6a24e'; ctx.lineWidth = 7; ctx.stroke();
    function dot(q, rad, fill, label, txt) {
      ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, 6.2832); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      if (label) { ctx.fillStyle = txt || '#fff'; ctx.font = '700 ' + Math.round(rad) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, q.x, q.y + 1); }
    }
    items.forEach(function (l) {
      if (l.type === 'route') l.data.wps.forEach(function (w, i) { dot(P(w.lat, w.lon), 12, { start: '#1a7f37', end: '#b4232c', via: '#000761' }[clsOf(l.data, i)], lblOf(l.data, i)); });
      else if (l.type === 'az') l.data.pts.forEach(function (w, i) { dot(P(w[0], w[1]), 11, '#c6a24e', String(i + 1), '#000761'); });
    });
    // curseur
    var q = P(r.lat, r.lon);
    ctx.beginPath(); ctx.arc(q.x, q.y, 15, 0, 6.2832); ctx.fillStyle = '#000761'; ctx.fill();
    ctx.beginPath(); ctx.arc(q.x, q.y, 12.5, 0, 6.2832); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, 6.2832); ctx.fillStyle = '#c6a24e'; ctx.fill();
    // carte d'information
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    var title = SIM.label, info = G.fmtDist(r.d) + '  ·  alt. ' + Math.round(r.z) + ' m  ·  pente ' + (r.slope >= 0 ? '+' : '') + r.slope.toFixed(0) + ' %  ·  ' + G.fmtDur(pos);
    ctx.font = '700 18px ' + FONT; var w1 = ctx.measureText(title).width; ctx.font = '500 14px ' + FONT; var w2 = ctx.measureText(info).width;
    var cw = Math.max(w1, w2) + 28;
    ctx.fillStyle = 'rgba(255,255,255,.94)'; rr(ctx, 14, 14, cw, 62, 12); ctx.fill();
    ctx.fillStyle = '#000761'; ctx.font = '700 18px ' + FONT; ctx.fillText(title, 28, 40);
    ctx.fillStyle = '#4d5069'; ctx.font = '500 14px ' + FONT; ctx.fillText(info, 28, 63);
    // profil d'altitude
    if (strip) {
      var sh = Math.round(H * 0.2), sx = 14, sy = H - sh - 14, sw = W - 28, pad = 12;
      ctx.fillStyle = 'rgba(255,255,255,.94)'; rr(ctx, sx, sy, sw, sh, 12); ctx.fill();
      var tot = pts[pts.length - 1].d || 1, zs = pts.map(function (a) { return a.z; }), lo = Math.min.apply(null, zs), hi = Math.max.apply(null, zs), span = Math.max(10, hi - lo);
      var X = function (d) { return sx + pad + d / tot * (sw - 2 * pad); }, Y = function (z) { return sy + sh - pad - 8 - (z - lo) / span * (sh - 2 * pad - 14); };
      ctx.beginPath(); pts.forEach(function (a, i) { if (i) ctx.lineTo(X(a.d), Y(a.z)); else ctx.moveTo(X(a.d), Y(a.z)); });
      ctx.lineTo(X(tot), sy + sh - pad - 8); ctx.lineTo(X(0), sy + sh - pad - 8); ctx.closePath(); ctx.fillStyle = 'rgba(198,162,78,.45)'; ctx.fill();
      ctx.beginPath(); pts.forEach(function (a, i) { if (i) ctx.lineTo(X(a.d), Y(a.z)); else ctx.moveTo(X(a.d), Y(a.z)); }); ctx.strokeStyle = '#000761'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(r.d), sy + 6); ctx.lineTo(X(r.d), sy + sh - 6); ctx.strokeStyle = '#c6a24e'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(X(r.d), Y(r.z), 6, 0, 6.2832); ctx.fillStyle = '#c6a24e'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000761'; ctx.stroke();
      ctx.fillStyle = '#6b6f85'; ctx.font = '500 12px ' + FONT; ctx.textAlign = 'left'; ctx.fillText(Math.round(lo) + ' – ' + Math.round(hi) + ' m', sx + pad, sy + 16);
    }
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '500 11px ' + FONT; ctx.textAlign = 'right';
    var at = '© IGN – Géoplateforme · ScoutMap FSGGB', aw = ctx.measureText(at).width + 12;
    ctx.fillRect(W - aw - 4, strip ? H - 12 - Math.round(H * 0.2) - 30 : H - 24, aw, 18); ctx.fillStyle = '#4d5069'; ctx.fillText(at, W - 10, strip ? H - 12 - Math.round(H * 0.2) - 17 : H - 11);
  }
  function recBar(msg) { var b = $('#recbar'); b.hidden = !msg; if (msg) $('#rec-txt').textContent = msg; }
  // Recadre la carte sur le parcours, attend les tuiles, puis enregistre la simulation.
  function exportVideo(strip) {
    if (!SIM.open || !SIM.prof) { toast('Ouvrez d’abord la simulation d’un parcours.'); return; }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { toast('Ce navigateur ne sait pas enregistrer de vidéo : essayez Chrome, Edge ou Firefox récent.'); return; }
    var mapEl = map.getContainer(), W = mapEl.clientWidth - (mapEl.clientWidth % 2), H = mapEl.clientHeight - (mapEl.clientHeight % 2);
    var saveC = map.getCenter(), saveZ = map.getZoom();
    REC.cancel = false; SIM.rec = true; SIM.playing = false; cancelAnimationFrame(SIM.raf); simBtn(); closePops(); map.closePopup();
    recBar('Recadrage de la carte…');
    var b = L.latLngBounds(SIM.prof.pts.map(function (q) { return [q.lat, q.lon]; }));
    map.fitBounds(b, { paddingTopLeft: [70, 100], paddingBottomRight: [70, strip ? Math.round(H * 0.2) + 50 : 60], animate: false, maxZoom: 17 });
    function restore() { SIM.rec = false; map.setView(saveC, saveZ, { animate: false }); SIM.pos = 0; simRender(false); recBar(''); }
    waitTiles(10000).then(function () {
      if (REC.cancel) { restore(); return; }
      var canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext('2d'), mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0] || '';
      var rec, chunks = [];
      try { rec = new MediaRecorder(canvas.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 6000000 } : {}); }
      catch (e) { restore(); toast('Enregistrement impossible : ' + (e.message || e)); return; }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        restore();
        if (REC.cancel) { toast('Enregistrement annulé.'); return; }
        showVideo(new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' }), rec.mimeType || mime);
      };
      var HOLD0 = 700, RUN = SIM.dur * 1000, HOLD1 = 1000, t0 = null;
      drawSimFrame(ctx, W, H, 0, strip); rec.start(200);
      (function loop(ts) {
        if (REC.cancel) { rec.stop(); return; }
        if (t0 === null) t0 = ts;
        var e = ts - t0, f = Math.max(0, Math.min(1, (e - HOLD0) / RUN));
        drawSimFrame(ctx, W, H, f * SIM.tot, strip);
        recBar('Enregistrement… ' + Math.min(100, Math.round(Math.max(0, e) / (HOLD0 + RUN + HOLD1) * 100)) + ' %');
        if (e >= HOLD0 + RUN + HOLD1) { rec.stop(); return; }
        requestAnimationFrame(loop);
      })(performance.now());
    });
  }
  function showVideo(blob, mime) {
    if (REC.url) URL.revokeObjectURL(REC.url);
    REC.url = URL.createObjectURL(blob);
    var ext = /mp4/.test(mime) ? 'mp4' : 'webm', base = (S.name || SIM.label || 'scoutmap').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scoutmap';
    REC.name = base + '-simulation-' + new Date().toISOString().slice(0, 10) + '.' + ext;
    $('#vid-preview').src = REC.url;
    $('#vid-info').textContent = REC.name + ' · ' + (blob.size / 1048576).toFixed(1).replace('.', ',') + ' Mo · format ' + ext.toUpperCase() + (ext === 'webm' ? ' (lisible dans les navigateurs, VLC…)' : '');
    openDlg('dlg-video-done');
    var v = $('#vid-preview'); v.play && v.play().catch(function () { /* lecture automatique refusée */ });
  }
  function closeVideo() { var d = $('#dlg-video-done'); if (d.open) d.close(); $('#vid-preview').removeAttribute('src'); if (REC.url) { URL.revokeObjectURL(REC.url); REC.url = null; } }
  $('#sim-video').addEventListener('click', function () { $('#vid-dur').textContent = SIM.dur + ' s'; openDlg('dlg-video'); });
  $('#vid-cancel').addEventListener('click', function () { $('#dlg-video').close(); });
  $('#vid-go').addEventListener('click', function () { $('#dlg-video').close(); exportVideo($('#vid-profile').checked); });
  $('#rec-cancel').addEventListener('click', function () { REC.cancel = true; });
  $('#vid-save').addEventListener('click', function () {
    var a = document.createElement('a'); a.href = REC.url; a.download = REC.name; document.body.appendChild(a); a.click(); a.remove();
    toast('Vidéo enregistrée : ' + REC.name);
    $('#dlg-video-done').close(); setTimeout(closeVideo, 3000);
  });
  $('#vid-discard').addEventListener('click', function () { closeVideo(); toast('Vidéo non enregistrée.'); });
  $('#dlg-video-done').addEventListener('close', function () { $('#vid-preview').pause && $('#vid-preview').pause(); });

  // ---------- Annuler / rétablir ----------
  function hRestore(json) {
    var o = JSON.parse(json);
    S.route = o.route; S.az = o.az; S.meas = o.meas; S.game = o.game || freshGame(null, 1); S.layers = o.layers; S.vis = o.vis; S.tracks = o.tracks; RT.route = o.res || null;
    select(null); applyVis(); syncRouteUi(); refreshRouteView(); renderAz(); renderMeas(); renderTracks(); renderStored(); renderLayerList(); if (window.SM && SM.game) SM.game.render();
    H.lastKey = hKey(); H.lastSnap = json; H.lastT = Date.now() - 1000; persist(); hButtons();
  }
  function undoAction() {
    if (!H.undo.length) { toast('Rien à annuler.'); return; }
    H.redo.push(hSnap()); hRestore(H.undo.pop()); hButtons(); toast('Annulé.');
  }
  function redoAction() {
    if (!H.redo.length) { toast('Rien à rétablir.'); return; }
    H.undo.push(hSnap()); hRestore(H.redo.pop()); hButtons(); toast('Rétabli.');
  }
  $('#btn-undo').addEventListener('click', undoAction);
  $('#btn-redo').addEventListener('click', redoAction);

  // ---------- Menus ----------
  function canUndo() { return S.rail === 'game' ? false : S.rail === 'route' ? S.route.wps.length > 0 : S.rail === 'az' ? S.az.pts.length > 0 : S.rail === 'meas' ? S.meas.pts.length > 0 : false; }
  function removeLast() {
    if (S.rail === 'route') $('#route-undo').click(); else if (S.rail === 'az') $('#az-undo').click(); else if (S.rail === 'meas') $('#meas-undo').click();
  }
  var MENUS = {
    file: [
      { t: 'Accueil : choisir un type de travail', i: 'home', k: 'H', a: function () { showHome(true); } },
      '-',
      { t: 'Nouveau projet', i: 'file', a: function () { resetAll(true); } },
      { t: 'Importer un fichier GPX…', i: 'upload', k: 'Ctrl+O', a: function () { $('#file-gpx').click(); } },
      { t: 'Exporter en GPX…', i: 'download', k: 'Ctrl+S', a: openExport },
      '-',
      { t: 'Exporter en PDF / imprimer…', i: 'printer', k: 'Ctrl+P', a: function () { openPdf(); } },
      { t: 'Imprimer la carte du parcours (A4 / A3, plusieurs feuilles)…', i: 'map', a: function () { openPdf('tiles'); } }
    ],
    edit: [
      { t: 'Annuler', i: 'undo', k: 'Ctrl+Z', a: undoAction, dis: function () { return !H.undo.length; } },
      { t: 'Rétablir', i: 'redo', k: 'Ctrl+Y', a: redoAction, dis: function () { return !H.redo.length; } },
      '-',
      { t: 'Supprimer le point sélectionné', i: 'trash', k: 'Suppr', a: deleteSelected, dis: function () { return !SEL; } },
      { t: 'Retirer le dernier point posé', i: 'undo', a: removeLast, dis: function () { return !canUndo(); } },
      '-',
      { t: 'Inverser le sens de l’itinéraire', i: 'swap', a: reverseRoute, dis: function () { return S.route.wps.length < 2; } },
      { t: 'Effacer l’itinéraire en cours', i: 'trash', a: function () { $('#route-clear').click(); }, dis: function () { return !S.route.wps.length; } },
      { t: 'Effacer les azimuts en cours', i: 'trash', a: function () { $('#az-clear').click(); }, dis: function () { return !S.az.pts.length; } },
      { t: 'Effacer la mesure en cours', i: 'trash', a: function () { $('#meas-clear').click(); }, dis: function () { return !S.meas.pts.length; } },
      { t: 'Effacer le grand jeu en cours', i: 'trash', a: function () { removeLayer('game'); }, dis: function () { return !S.game.shapes.length; } },
      '-',
      { t: 'Tout effacer…', i: 'trash', a: function () { resetAll(true); } }
    ],
    create: [
      { t: 'Nouvel itinéraire à pied', i: 'route', k: 'I', a: function () { newLayer('route', { loop: false }); } },
      { t: 'Nouvel itinéraire en boucle', i: 'loop', a: function () { newLayer('route', { loop: true }); } },
      { t: 'Nouveaux azimuts', i: 'compass', k: 'A', a: function () { newLayer('az'); } },
      { t: 'Nouvelle mesure de distance', i: 'ruler', k: 'M', a: function () { newLayer('meas'); S.meas.mode = 'dist'; renderMeas(); } },
      { t: 'Nouvelle mesure de surface', i: 'ruler', a: function () { newLayer('meas'); S.meas.mode = 'area'; renderMeas(); } },
      { t: 'Nouveau grand jeu (zones, flèches, textes)', i: 'flag', k: 'G', a: function () { newLayer('game'); } },
      '-',
      { t: 'Simulation du parcours…', i: 'play', a: simOpen, dis: function () { return !currentProfile; } }
    ],
    view: [
      { t: 'Panneau latéral', chk: function () { return S.panelOpen; }, a: togglePanel },
      { t: 'Profil d’altitude', chk: function () { return S.dockOpen; }, a: toggleDock },
      { t: 'Calques', i: 'layers', k: 'L', a: function () { setRail('layers'); } },
      { t: 'Fond de carte…', i: 'map', a: function () { togglePop('layer-pop', true); popTab('base'); } },
      { t: 'Informations affichées (relief, sentiers, cadastre…)', i: 'layers', a: function () { togglePop('layer-pop', true); popTab('info'); } },
      '-',
      { t: 'Échelle 1 : 25 000', a: function () { setScale(25000); } },
      { t: 'Échelle 1 : 50 000', a: function () { setScale(50000); } },
      { t: 'Voir toute la France', a: function () { map.setView([46.6, 2.5], 5.6); } }
    ],
    help: [
      { t: 'Raccourcis clavier', i: 'help', a: function () { openDlg('dlg-help'); } },
      { t: 'Cartes IGN – Géoplateforme', i: 'map', a: function () { window.open('https://geoservices.ign.fr/', '_blank', 'noopener'); } }
    ]
  };
  var openMenu = null;
  function showMenu(btn) {
    var items = MENUS[btn.dataset.menu], dd = $('#dropdown');
    $$('.menu-btn').forEach(function (b) { b.classList.toggle('on', b === btn); });
    dd.innerHTML = items.map(function (it, i) {
      if (it === '-') return '<div class="mi-sep"></div>';
      var dis = it.dis && it.dis();
      return '<button class="mi" role="menuitem" data-i="' + i + '"' + (dis ? ' disabled' : '') + '>' + (it.chk ? '<span class="mi-chk">' + (it.chk() ? ic('check') : '') + '</span>' : ic(it.i || 'chev-right')) + '<span>' + esc(it.t) + '</span>' + (it.k ? '<kbd>' + esc(it.k) + '</kbd>' : '') + '</button>';
    }).join('');
    var r = btn.getBoundingClientRect(); dd.style.left = Math.max(6, r.left) + 'px'; dd.style.top = (r.bottom + 4) + 'px'; dd.hidden = false;
    openMenu = btn; dd._items = items;
  }
  function hideMenu() { $('#dropdown').hidden = true; openMenu = null; $$('.menu-btn').forEach(function (b) { b.classList.remove('on'); }); }
  $$('.menu-btn').forEach(function (b) {
    b.addEventListener('click', function (e) { e.stopPropagation(); if (openMenu === b) hideMenu(); else showMenu(b); });
    b.addEventListener('mouseenter', function () { if (openMenu && openMenu !== b) showMenu(b); });
  });
  $('#dropdown').addEventListener('click', function (e) {
    var b = e.target.closest('.mi'); if (!b || b.disabled) return;
    var it = this._items[+b.dataset.i]; hideMenu(); it.a();
  });
  document.addEventListener('click', function (e) { if (openMenu && !e.target.closest('.dropdown')) hideMenu(); });

  // ---------- Clavier ----------
  document.addEventListener('keydown', function (e) {
    var tag = document.activeElement && document.activeElement.tagName, typing = /input|select|textarea/i.test(tag) || (document.activeElement && document.activeElement.isContentEditable);
    var mod = e.ctrlKey || e.metaKey;
    if (document.body.classList.contains('doc-open') || document.querySelector('dialog[open]')) return;
    if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); openPdf(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); openExport(); return; }
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#file-gpx').click(); return; }
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redoAction(); else undoAction(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redoAction(); return; }
    if (typing || mod || e.altKey) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && window.SM && SM.game && S.mode === 'game' && SM.game.hasSel()) { e.preventDefault(); SM.game.deleteSel(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && SEL) { e.preventDefault(); deleteSelected(); return; }
    var k = e.key.toLowerCase();
    if (k === 'escape') { hideMenu(); hideCtx(); closePops(); if (window.SM && SM.game && S.mode === 'game' && SM.game.escape()) return; if (SEL) select(null); else if (RT.tool !== 'pan') setTool('pan'); map.closePopup(); }
    else if (k === 'i') startType('route'); else if (k === 'a') startType('az'); else if (k === 'm') startType('meas'); else if (k === 'g') startType('game'); else if (k === 'l') setRail('layers'); else if (k === 'h') showHome(true);
  });
  window.addEventListener('beforeunload', function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignoré */ } });

  // ---------- Démarrage ----------
  curOff = wantOff(); buildTiles(); applyVis(); syncRouteUi(); $('#proj-name').value = S.name || ''; applyDock();
  renderRouteMarkers(); renderAz(); renderMeas(); renderTracks(); renderStored(); showCoords(); updateScaleUI();
  $$('.pane').forEach(function (p) { p.hidden = p.dataset.pane !== S.rail; });
  $$('.rail-btn[data-rail]').forEach(function (b) { b.classList.toggle('on', b.dataset.rail === S.rail || (b.dataset.rail === 'mode' && TYPES.indexOf(S.rail) >= 0)); });
  $('#app').classList.toggle('nopanel', !S.panelOpen);
  updateRailMode(); applyDock();
  setTool('pan');
  showHome(!S.mode);
  if (S.route.wps.length > 1) computeRoute(); else refreshProfile();
  fillPlaces(S.route);
  H.ready = true; H.lastKey = hKey(); H.lastSnap = hSnap(); hButtons();

  // ---------- Ma position (utile sur téléphone) ----------
  (function locate() {
    var gLoc = L.layerGroup().addTo(map);
    $('#locate').addEventListener('click', function () {
      if (!navigator.geolocation) { toast('La localisation n’est pas disponible sur cet appareil.'); return; }
      toast('Recherche de votre position…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        var c = [pos.coords.latitude, pos.coords.longitude];
        gLoc.clearLayers();
        L.circle(c, { radius: pos.coords.accuracy, color: '#2563eb', weight: 1, fillColor: '#2563eb', fillOpacity: 0.1, interactive: false }).addTo(gLoc);
        L.marker(c, { interactive: false, icon: L.divIcon({ className: 'pin-wrap', html: '<div class="loc-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(gLoc);
        map.setView(c, Math.max(map.getZoom(), zoomFor(25000, c[0])), { animate: true });
        toast('Position trouvée (précision ≈ ' + Math.round(pos.coords.accuracy) + ' m).');
      }, function () { toast('Position refusée ou indisponible : autorisez la localisation dans votre navigateur.'); }, { enableHighAccuracy: true, timeout: 15000 });
    });
  })();

  // API interne pour doc.js
  window.SM = {
    S: S, RT: RT, G: G, map: map, esc: esc, ic: ic, sp: sp, toast: toast, ll: ll, pin: pin, tile: tile, LAYERS: LAYERS, SCALES: SCALES,
    profileFor: profileFor, lineKey: lineKey, renderProfileSvg: renderProfileSvg, stepText: stepText, stepMeta: stepMeta, stepName: stepName,
    loopOf: loopOf, effOf: effOf, lblOf: lblOf, clsOf: clsOf, titleOf: titleOf, nameOf: nameOf, azParams: azParams, azClosedOf: azClosedOf,
    layersList: layersList, fillPlaces: fillPlaces, scaleAt: scaleAt, zoomFor: zoomFor, curScale: curScale, niceScale: niceScale, fileName: fileName,
    wantOff: wantOff, openPdf: null,
    persist: persist, gGame: gGame, select: select, renderStored: renderStored, renderLayerList: renderLayerList, showCtx: showCtx, hideCtx: hideCtx,
    copyCoords: copyCoords, openDlg: openDlg, fit: fit, undoAction: undoAction, redoAction: redoAction, nid: nid, setMode: setMode, setRail: setRail, activate: activate,
    removeLayer: removeLayer, layerBounds: layerBounds, showHome: showHome, ensureVisible: ensureVisible, applyVis: applyVis, BASES: BASES
  };
  if (SM.game && SM.game.render) SM.game.render();
})();

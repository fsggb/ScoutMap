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
      maxOn: false, maxKm: prev ? prev.maxKm : 10, avoidMotorway: prev ? prev.avoidMotorway : true, flagNat: prev ? prev.flagNat : true, wps: [] };
  }
  function freshAz(prev, n) {
    return { id: nid(), name: 'Azimuts ' + n, color: AZ_PAL[(n - 1) % AZ_PAL.length], pts: [], unit: prev ? prev.unit : 'deg', ref: prev ? prev.ref : 'true', decl: prev ? prev.decl : 0 };
  }
  function freshMeas(prev, n) {
    return { id: nid(), name: 'Mesure ' + n, color: MEAS_PAL[(n - 1) % MEAS_PAL.length], mode: prev ? prev.mode : 'dist', pts: [] };
  }
  var FRESH = { route: freshRoute, az: freshAz, meas: freshMeas };
  var S = {
    name: '', rail: 'explore', panelOpen: true,
    base: 'plan', ov: { contour: false, shade: false, slope: false, cadastre: false },
    detail: 'auto', speed: 5, profileSrc: 'route', dockOpen: true, dockH: 230,
    vis: { route: true, az: true, meas: true },
    route: freshRoute(null, 1), az: freshAz(null, 1), meas: freshMeas(null, 1), layers: [],
    tracks: [], view: { c: [46.6, 2.5], z: 5.6 }
  };
  try {
    var raw = localStorage.getItem(KEY), old = false;
    if (!raw) { raw = localStorage.getItem('scoutmap.v2') || localStorage.getItem('scoutmap.v1'); old = true; }
    var saved = JSON.parse(raw || 'null');
    if (saved) {
      if (old) { delete saved.detail; delete saved.snap; if (saved.speed === 4) delete saved.speed; }
      ['route', 'az', 'meas', 'vis', 'ov'].forEach(function (k) { if (saved[k]) Object.assign(S[k], saved[k]); });
      ['name', 'rail', 'panelOpen', 'base', 'detail', 'speed', 'profileSrc', 'dockOpen', 'dockH', 'tracks', 'view'].forEach(function (k) { if (saved[k] !== undefined) S[k] = saved[k]; });
      if (Array.isArray(saved.layers)) S.layers = saved.layers.filter(function (l) { return l && l.data && l.type && FRESH[l.type]; });
      if (['explore', 'route', 'az', 'meas', 'layers'].indexOf(S.rail) < 0) S.rail = 'explore';
      if (!S.view || !S.view.c) S.view = { c: [46.6, 2.5], z: 5.6 };
      delete S.route.profile;
    }
  } catch (e) { /* stockage indisponible */ }
  ['route', 'az', 'meas'].forEach(function (k) { if (!S[k].id) S[k].id = nid(); });
  S.layers.forEach(function (l) { if (!l.data.id) l.data.id = nid(); });
  var saveTimer;
  function persist() {
    updateHint();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* quota */ }
    }, 250);
  }

  var RT = { route: null, elevCache: {}, routeCtl: null, tool: 'pan' };

  // ---------- Fonds et couches ----------
  var ATTR = '© <a href="https://geoservices.ign.fr/" target="_blank" rel="noopener">IGN</a> – Géoplateforme';
  var LAYERS = {
    plan: { l: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', f: 'png', n: 19 },
    ortho: { l: 'ORTHOIMAGERY.ORTHOPHOTOS', f: 'jpeg', n: 19 },
    contour: { l: 'ELEVATION.CONTOUR.LINE', f: 'png', n: 18, o: { minZoom: 12, opacity: 0.9 } },
    shade: { l: 'ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW', f: 'png', n: 15, o: { opacity: 0.55 } },
    slope: { l: 'ELEVATION.SLOPES', f: 'jpeg', n: 14, o: { minZoom: 6, opacity: 0.5 } },
    cadastre: { l: 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS', f: 'png', n: 19, o: { minZoom: 12, opacity: 0.85 } }
  };
  function wmtsUrl(key, z, x, y) {
    var d = LAYERS[key];
    return GP + '/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' + d.l + '&STYLE=normal&FORMAT=image/' + d.f +
      '&TILEMATRIXSET=PM&TILEMATRIX=' + z + '&TILEROW=' + y + '&TILECOL=' + x;
  }
  /* « Netteté » : on demande des tuiles du niveau (z + off), affichées 2^off fois plus petites.
     Le fond affiché à une échelle donnée est donc celui du niveau juste au-dessus, au lieu d'un niveau dézoomé. */
  function tile(key, off, extra) {
    var d = LAYERS[key];
    return L.tileLayer(wmtsUrl(key, '{z}', '{x}', '{y}'), Object.assign({
      maxZoom: 19, maxNativeZoom: d.n - off, tileSize: 256 / Math.pow(2, off), zoomOffset: off, attribution: ATTR, keepBuffer: 2
    }, d.o || {}, extra || {}));
  }
  var tiles = {}, curOff = 1;

  // ---------- Carte ----------
  var map = L.map('map', { zoomControl: false, zoomSnap: 0, zoomDelta: 1, wheelPxPerZoomLevel: 90, maxZoom: 19, minZoom: 4,
    doubleClickZoom: false, attributionControl: false }).setView(S.view.c, S.view.z);
  L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);
  var gStored = L.layerGroup().addTo(map), gSearch = L.layerGroup().addTo(map), gTracks = L.layerGroup().addTo(map), gMeas = L.layerGroup().addTo(map),
    gAz = L.layerGroup().addTo(map), gRoute = L.layerGroup().addTo(map), gCursor = L.layerGroup().addTo(map);
  var GROUPS = { route: gRoute, az: gAz, meas: gMeas };

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
      var on = (k === 'plan' || k === 'ortho') ? k === S.base : !!S.ov[k];
      if (on) { if (!map.hasLayer(tiles[k])) tiles[k].addTo(map); } else if (map.hasLayer(tiles[k])) map.removeLayer(tiles[k]);
    });
    tiles[S.base].bringToBack();
    $$('#base-grid button').forEach(function (b) { b.classList.toggle('on', b.dataset.base === S.base); });
    $$('#ov-grid button').forEach(function (b) { b.classList.toggle('on', !!S.ov[b.dataset.ov]); });
    $$('#detail-seg button').forEach(function (b) { b.classList.toggle('on', String(b.dataset.v) === String(S.detail)); });
    $('#layer-thumb').src = thumbUrl(S.base);
  }
  function thumbUrl(key) {
    var z = 10, n = 1 << z, lon = 5.72, lat = 45.19, r = lat * Math.PI / 180;
    return wmtsUrl(key, z, Math.floor((lon + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n));
  }
  function applyVis() {
    Object.keys(GROUPS).forEach(function (k) {
      var on = S.vis[k] !== false, g = GROUPS[k];
      if (on && !map.hasLayer(g)) g.addTo(map); else if (!on && map.hasLayer(g)) map.removeLayer(g);
    });
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
    c.classList.toggle('tool-draw', t !== 'pan'); c.classList.toggle('tool-pan', t === 'pan');
    renderRouteMarkers(); renderAz(); updateHint();
  }
  function setRail(r) {
    S.rail = r; S.panelOpen = true;
    $$('.pane').forEach(function (p) { p.hidden = p.dataset.pane !== r; });
    $$('.rail-btn[data-rail]').forEach(function (b) { b.classList.toggle('on', b.dataset.rail === r); });
    applyPanel();
    setTool(r === 'route' || r === 'az' || r === 'meas' ? r : 'pan');
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
      if (S.rail === r && S.panelOpen && r !== 'explore') { if (RT.tool === 'pan' && /route|az|meas/.test(r)) setTool(r); else togglePanel(); }
      else setRail(r);
    });
  });
  $('#rail-toggle').addEventListener('click', togglePanel);
  $$('[data-go]').forEach(function (b) { b.addEventListener('click', function () { setRail(b.dataset.go); }); });
  $$('.card[data-act]').forEach(function (b) {
    b.addEventListener('click', function () { if (b.dataset.act === 'import') $('#file-gpx').click(); else openPdf(); });
  });

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
    if (r !== 'route' && r !== 'az' && r !== 'meas') { el.hidden = true; return; }
    el.hidden = false;
    $('#hint-ic').innerHTML = '<use href="#i-' + { route: 'route', az: 'compass', meas: 'ruler' }[r] + '"/>';
    if (RT.tool === 'pan') { $('#hint-txt').textContent = 'Mode déplacement : la carte se déplace sans poser de point.'; $('#hint-btn').textContent = 'Reprendre le tracé'; }
    else { $('#hint-txt').textContent = hintText(); $('#hint-btn').textContent = 'Terminer'; }
  }
  $('#hint-btn').addEventListener('click', function () { setTool(RT.tool === 'pan' ? S.rail : 'pan'); });

  // ---------- Calques : modèle ----------
  function isEmpty(t, d) { return t === 'route' ? !d.wps.length : !d.pts.length; }
  // Liste unifiée des calques de tracé (en cours d'édition + stockés), regroupés par type.
  function layersList() {
    var out = [];
    ['route', 'az', 'meas'].forEach(function (t) {
      var d = S[t];
      out.push({ type: t, id: d.id, key: t, active: true, name: d.name, color: d.color, vis: S.vis[t] !== false, data: d, res: t === 'route' ? RT.route : null, empty: isEmpty(t, d) });
    });
    S.layers.forEach(function (l) {
      out.push({ type: l.type, id: l.data.id, key: 'L' + l.data.id, active: false, name: l.data.name, color: l.data.color, vis: l.vis !== false, data: l.data, res: l.res || null, empty: false, item: l });
    });
    var order = { route: 0, az: 1, meas: 2 };
    out.sort(function (a, b) { return order[a.type] - order[b.type] || a.id - b.id; });
    return out;
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
    if (t === 'route') refreshRouteView(); else if (t === 'az') renderAz(); else renderMeas();
    renderStored(); renderLayerList(); refreshProfile();
  }
  function removeLayer(key) {
    if (key === 'route') { S.route.wps = []; S.route.loop = false; RT.route = null; select(null); refreshRouteView(); }
    else if (key === 'az') { S.az.pts = []; select(null); renderAz(); }
    else if (key === 'meas') { S.meas.pts = []; select(null); renderMeas(); }
    else if (key[0] === 'L') { S.layers = S.layers.filter(function (l) { return 'L' + l.data.id !== key; }); renderStored(); renderLayerList(); refreshProfile(); }
    persist();
  }
  function renameLayer(key, name) {
    name = (name || '').trim(); if (!name) return;
    var L0 = layersList().filter(function (l) { return l.key === key; })[0];
    if (L0) { L0.data.name = name; syncNames(); renderLayerList(); refreshProfile(); renderStored(); persist(); }
  }
  function syncNames() {
    $('#route-name').value = S.route.name; $('#az-name').value = S.az.name; $('#meas-name').value = S.meas.name;
  }
  [['route-name', 'route'], ['az-name', 'az'], ['meas-name', 'meas']].forEach(function (p) {
    $('#' + p[0]).addEventListener('input', function () { S[p[1]].name = this.value || ''; renderLayerList(); persist(); });
    $('#' + p[0]).addEventListener('change', function () { if (!this.value.trim()) { this.value = S[p[1]].name = 'Sans nom'; renderLayerList(); } });
  });
  $('#route-new').addEventListener('click', function () { newLayer('route'); });
  $('#az-new').addEventListener('click', function () { newLayer('az'); });
  $('#meas-new').addEventListener('click', function () { newLayer('meas'); });
  $$('[data-newlayer]').forEach(function (b) { b.addEventListener('click', function () { newLayer(b.dataset.newlayer); }); });

  // Calques stockés : dessin statique, clic = reprendre l'édition
  function renderStored() {
    gStored.clearLayers();
    S.layers.forEach(function (l) {
      if (l.vis === false) return;
      var d = l.data, col = d.color, id = d.id;
      function click(e) { if (RT.tool === 'pan') { L.DomEvent.stopPropagation(e); activate(id); } }
      function tip(layer) { layer.bindTooltip(esc(d.name) + ' – cliquer pour modifier', { sticky: true }); return layer; }
      if (l.type === 'route' && l.res) {
        L.polyline(l.res.line, { color: '#fff', weight: 8, opacity: 0.85, interactive: false, lineCap: 'round' }).addTo(gStored);
        tip(L.polyline(l.res.line, { color: col, weight: 4.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', className: 'stored-line' }).on('click', click)).addTo(gStored);
      }
      if (l.type === 'route') {
        d.wps.forEach(function (p, i) { L.marker([p.lat, p.lon], { icon: pin(lblOf(d, i), clsOf(d, i)), zIndexOffset: 500 }).on('click', click).addTo(gStored); });
      } else if (l.type === 'az') {
        if (d.pts.length > 1) tip(L.polyline(d.pts, { color: col, weight: 4, dashArray: '10 6', opacity: 0.95, className: 'stored-line' }).on('click', click)).addTo(gStored);
        d.pts.forEach(function (p, i) { L.marker(p, { icon: pin(String(i + 1), 'az'), zIndexOffset: 400 }).on('click', click).addTo(gStored); });
      } else if (l.type === 'meas') {
        if (d.pts.length > 1) tip((d.mode === 'area' && d.pts.length > 2 ? L.polygon(d.pts, { color: col, weight: 3, fillColor: col, fillOpacity: 0.2, dashArray: '2 6', className: 'stored-line' }) : L.polyline(d.pts, { color: col, weight: 3, dashArray: '2 6', className: 'stored-line' })).on('click', click)).addTo(gStored);
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
    S.tracks.forEach(function (t) { if (t.show !== false) out.push({ id: 't' + t.id, label: t.name, line: t.coords, ele: t.ele }); });
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
    if (!cur) { currentProfile = null; $('#pstats').innerHTML = ''; return; }
    sel.value = cur.id;
    var tok = ++profToken;
    $('#pstats').innerHTML = chip('', 'Calcul du profil…');
    profileFor(cur.line, cur.ele).then(function (p) {
      if (tok !== profToken) return;
      currentProfile = p; currentProfile.src = cur.id;
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
      m.on('contextmenu', function () { removeWp(i); });
      routeMarkers.push(m);
    });
    renderWpList(); applySel();
  }
  function renderWpList() {
    var d = S.route, w = d.wps, loop = loopOf(d);
    $('#wps-empty').hidden = w.length > 0;
    $('#wp-count').textContent = w.length ? '(' + w.length + ')' : '';
    $('#wps').innerHTML = w.map(function (p, i) {
      return '<li data-i="' + i + '"><span class="grip" draggable="true" title="Glisser pour changer l’ordre de passage">' + ic('grip') + '</span><span class="badge ' + clsOf(d, i) + '">' + lblOf(d, i) + '</span><div class="wp-main"><input class="wp-name" data-i="' + i + '" value="' + esc(p.name || '') + '" placeholder="' + esc(p.place || titleOf(d, i)) + '" aria-label="Nom du point">' +
        '<small>' + esc(titleOf(d, i)) + (p.place && p.name ? ' · près de ' + esc(p.place) : '') + ' · ' + esc(fmtP([p.lat, p.lon])) + '</small></div><button class="ibtn danger" data-del="' + i + '" title="Retirer ce point (Suppr)" aria-label="Retirer">' + ic('x') + '</button></li>';
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
      if (inp.value.trim()) o.name = inp.value.trim(); else delete o.name;
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
  $('#opt-national').addEventListener('change', function () { S.route.flagNat = this.checked; renderNatWarn(); persist(); });
  $('#max-on').addEventListener('change', function () { S.route.maxOn = this.checked; syncRouteUi(); onMaxChange(); persist(); });
  $('#max-km').addEventListener('input', function () { S.route.maxKm = Math.max(0, +this.value || 0); onMaxChange(); persist(); });
  $('#route-pdf').addEventListener('click', function () { openPdf('detail'); });
  function onMaxChange() { restyleRoute(); renderRouteStats(); renderGauge(); refreshProfile(); }
  function syncRouteUi() {
    $$('#route-mode button').forEach(function (b) { b.classList.toggle('on', (b.dataset.v === 'loop') === !!S.route.loop); });
    $('#route-opt').value = S.route.opt; $('#speed').value = S.speed;
    $('#opt-motorway').checked = !!S.route.avoidMotorway; $('#opt-national').checked = !!S.route.flagNat;
    $('#max-on').checked = !!S.route.maxOn; $('#max-km').value = S.route.maxKm; $('#max-km').disabled = !S.route.maxOn;
    syncNames();
  }
  function setRouteStatus(msg, err) { var el = $('#route-status'); el.textContent = msg || ''; el.className = 'status' + (err ? ' error' : ''); }
  function routeColor() { return overMax() ? '#c0262d' : S.route.color; }
  function restyleRoute() { if (routeLine) routeLine.setStyle({ color: routeColor() }); }
  function clearRouteLines() {
    if (routeLine) { gRoute.removeLayer(routeLine); routeLine = null; }
    if (routeCasing) { gRoute.removeLayer(routeCasing); routeCasing = null; }
  }
  // Redessine le calque itinéraire en cours d'édition (après activation d'un calque, par exemple).
  function refreshRouteView() {
    clearTimeout(routeTimer); if (RT.routeCtl) RT.routeCtl.abort();
    clearRouteLines(); syncRouteUi(); renderRouteMarkers();
    if (RT.route && RT.route.line) { drawRoute(); renderSteps(); renderRouteStats(); renderGauge(); renderNatWarn(); setRouteStatus(''); refreshProfile(); }
    else computeRoute();
    fillPlaces(S.route);
  }

  var routeTimer;
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
    if (w.length > 17) { setRouteStatus('Maximum : 15 étapes intermédiaires.', true); return; }
    setRouteStatus('Calcul de l’itinéraire…');
    var tag = S.route.id;
    routeTimer = setTimeout(function () {
      var c = RT.routeCtl = new AbortController();
      var f = function (p) { return p.lon.toFixed(6) + ',' + p.lat.toFixed(6); };
      var url = GP + '/navigation/itineraire?resource=bdtopo-valhalla&profile=pedestrian&optimization=' + S.route.opt +
        '&start=' + f(w[0]) + '&end=' + f(w[w.length - 1]) +
        (w.length > 2 ? '&intermediates=' + encodeURIComponent(w.slice(1, -1).map(f).join('|')) : '') +
        (S.route.avoidMotorway ? '&constraints=' + encodeURIComponent('{"constraintType":"banned","key":"wayType","operator":"=","value":"autoroute"}') : '') +
        '&geometryFormat=geojson&getSteps=true&getBbox=false&crs=EPSG:4326&timeUnit=second&distanceUnit=meter&waysAttributes=name';
      fetch(url, { signal: c.signal }).then(function (r) {
        return r.json().then(function (j) { if (!r.ok || j.error) throw new Error((j.error && j.error.message) || (j.message) || 'Erreur ' + r.status); return j; });
      }).then(function (j) {
        if (tag !== S.route.id) return;
        var line = j.geometry.coordinates.map(function (q) { return [q[1], q[0]]; });
        var nat = {};
        (j.portions || []).forEach(function (p) { (p.steps || []).forEach(function (s) { var k = natOf(stepMeta(s)); if (k) nat[k] = (nat[k] || 0) + (s.distance || 0); }); });
        var wasOver = overMax();
        RT.route = { line: line, dist: j.distance, dur: j.duration, portions: j.portions || [],
          nat: Object.keys(nat).map(function (k) { return { label: k, dist: nat[k] }; }) };
        drawRoute(); setRouteStatus('');
        renderSteps(); renderRouteStats(); renderGauge(); renderNatWarn(); renderLayerList();
        if (overMax() && !wasOver) toast('Distance maximale dépassée (' + G.fmtDist(RT.route.dist) + ' pour ' + G.fmtDist(S.route.maxKm * 1000) + ') : le tracé reste modifiable.');
        var b = L.latLngBounds(line.map(ll));
        if (!map.getBounds().contains(b)) fit(b, { padding: [90, 90], maxZoom: 16 });
        S.profileSrc = 'route'; refreshProfile(); persist();
      }).catch(function (e) {
        if (e.name === 'AbortError') return;
        setRouteStatus('Itinéraire impossible : ' + (e.message || 'service indisponible') + '. Rapprochez les points d’une route ou d’un chemin.', true);
        refreshProfile();
      });
    }, 250);
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
      m.on('contextmenu', function () { S.az.pts.splice(i, 1); renderAz(); persist(); });
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
      m.on('contextmenu', function () { S.meas.pts.splice(i, 1); renderMeas(); persist(); });
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
  $('#file-gpx').addEventListener('change', function () { Array.prototype.forEach.call(this.files, importGpx); this.value = ''; });
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
    return d.mode === 'area' ? G.fmtArea(G.areaM2(d.pts)) : G.fmtDist(G.pathLength(d.pts));
  }
  var TYPE_LABEL = { route: 'Itinéraire', az: 'Azimuts', meas: 'Mesure' };
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
    html += S.tracks.map(function (t) {
      var v = t.show !== false;
      return '<li class="lrow' + (v ? '' : ' off') + '" data-k="t' + t.id + '"><button class="ibtn" data-a="vis" title="' + (v ? 'Masquer' : 'Afficher') + '" aria-label="Basculer">' + ic(v ? 'eye' : 'eye-off') + '</button><span class="lsw" style="background:' + t.color + '"></span>' +
        '<div class="lmeta"><b class="lname" data-a="rename" title="Double-clic pour renommer">' + esc(t.name) + '</b><small>Trace GPX · ' + G.fmtDist(G.pathLength(t.coords)) + '</small></div>' +
        '<button class="ibtn" data-a="zoom" title="Centrer la carte" aria-label="Centrer">' + ic('target') + '</button><button class="ibtn danger" data-a="del" title="Supprimer" aria-label="Supprimer">' + ic('trash') + '</button></li>';
    }).join('');
    el.innerHTML = html;
  }
  function layerBounds(key) {
    var pts = [];
    if (key === 'route' || key[0] === 'L') {
      var L0 = layersList().filter(function (l) { return l.key === key; })[0];
      if (L0 && L0.type === 'route') pts = L0.res ? L0.res.line : L0.data.wps.map(function (w) { return [w.lat, w.lon]; });
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
  function resetAll(ask) {
    if (ask && !confirm('Effacer tout le travail en cours (tous les calques, traces importées comprises) ?')) return;
    S.route = freshRoute(null, 1); S.az = freshAz(null, 1); S.meas = freshMeas(null, 1); S.layers = []; S.tracks = []; S.name = '';
    S.vis = { route: true, az: true, meas: true }; RT.route = null; select(null); applyVis();
    $('#proj-name').value = '';
    syncRouteUi(); refreshRouteView(); renderAz(); renderMeas(); renderTracks(); renderStored(); renderLayerList(); persist();
  }
  $('#reset-all').addEventListener('click', function () { resetAll(true); });
  $('#proj-name').addEventListener('input', function () { S.name = this.value; persist(); });

  // ---------- Fonds, couches, netteté (fenêtres flottantes) ----------
  function togglePop(id, force) {
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
  $('#th-plan').src = thumbUrl('plan'); $('#th-ortho').src = thumbUrl('ortho');

  // ---------- Export GPX ----------
  function gpxParts() {
    var parts = [];
    layersList().forEach(function (l) {
      if (l.empty) return;
      if (l.type === 'route') parts.push({ id: l.key, label: l.name + ' (' + l.data.wps.length + ' repères' + (l.res ? ', ' + G.fmtDist(l.res.dist) : '') + ')' });
      else if (l.type === 'az') parts.push({ id: l.key, label: l.name + ' (' + l.data.pts.length + ' points)' });
      else if (l.data.pts.length > 1) parts.push({ id: l.key, label: l.name });
    });
    S.tracks.forEach(function (t) { parts.push({ id: 't' + t.id, label: 'Trace : ' + t.name }); });
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
    if (!parts.length) { toast('Rien à exporter : tracez un itinéraire, des azimuts ou importez une trace.'); return; }
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
      if (RT.route && pixelDistToRoute(e.latlng) <= 14) insertOnRoute(p); else addWp(p);
    }
    else if (RT.tool === 'az') addAz(p);
    else if (RT.tool === 'meas') { ensureVisible('meas'); S.meas.pts.push(p); renderMeas(); persist(); select('meas', S.meas.pts.length - 1); }
    else select(null);
  });
  function actionPopup(latlng, title, name) {
    var html = '<div class="pp"><b>' + esc(title) + '</b><small>' + esc(G.formatCoord('wgs', latlng.lat, latlng.lng)) + '</small><div class="pp-btns">' +
      '<button data-a="start">Départ</button><button data-a="via">Étape</button><button data-a="end">Arrivée</button><button data-a="az">Point d’azimut</button><button data-a="copy">Copier</button></div></div>';
    L.popup({ closeButton: true, offset: [0, -4] }).setLatLng(latlng).setContent(html).openOn(map);
    var el = document.querySelector('.leaflet-popup-content .pp');
    if (!el) return;
    el.addEventListener('click', function (ev) {
      var a = ev.target.dataset && ev.target.dataset.a; if (!a) return;
      var p = [latlng.lat, latlng.lng], w = S.route.wps;
      if (a === 'az') { addAz(p); map.closePopup(); setRail('az'); setTool('pan'); return; }
      if (a === 'copy') { var t = G.formatCoord('wgs', p[0], p[1]); navigator.clipboard && navigator.clipboard.writeText(t); toast('Coordonnées copiées.'); map.closePopup(); return; }
      ensureVisible('route');
      var o = { lat: p[0], lon: p[1] }; if (name) o.name = name;
      if (a === 'start') w.unshift(o);
      else if (a === 'end') w.push(o);
      else if (w.length < 2) w.push(o); else w.splice(w.length - 1, 0, o);
      map.closePopup(); setRail('route'); setTool('pan'); renderRouteMarkers(); computeRoute(); persist(); fillPlaces(S.route);
    });
  }
  map.on('contextmenu', function (e) { actionPopup(e.latlng, 'Ce point'); });

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

  // ---------- Menus ----------
  function canUndo() { return S.rail === 'route' ? S.route.wps.length > 0 : S.rail === 'az' ? S.az.pts.length > 0 : S.rail === 'meas' ? S.meas.pts.length > 0 : false; }
  function undo() {
    if (S.rail === 'route') $('#route-undo').click(); else if (S.rail === 'az') $('#az-undo').click(); else if (S.rail === 'meas') $('#meas-undo').click();
  }
  var MENUS = {
    file: [
      { t: 'Nouveau projet', i: 'file', a: function () { resetAll(true); } },
      { t: 'Importer un fichier GPX…', i: 'upload', k: 'Ctrl+O', a: function () { $('#file-gpx').click(); } },
      { t: 'Exporter en GPX…', i: 'download', k: 'Ctrl+S', a: openExport },
      '-',
      { t: 'Exporter en PDF / imprimer…', i: 'printer', k: 'Ctrl+P', a: function () { openPdf(); } }
    ],
    edit: [
      { t: 'Supprimer le point sélectionné', i: 'trash', k: 'Suppr', a: deleteSelected, dis: function () { return !SEL; } },
      { t: 'Retirer le dernier point', i: 'undo', k: 'Ctrl+Z', a: undo, dis: function () { return !canUndo(); } },
      '-',
      { t: 'Inverser le sens de l’itinéraire', i: 'swap', a: reverseRoute, dis: function () { return S.route.wps.length < 2; } },
      { t: 'Effacer l’itinéraire en cours', i: 'trash', a: function () { $('#route-clear').click(); }, dis: function () { return !S.route.wps.length; } },
      { t: 'Effacer les azimuts en cours', i: 'trash', a: function () { $('#az-clear').click(); }, dis: function () { return !S.az.pts.length; } },
      { t: 'Effacer la mesure en cours', i: 'trash', a: function () { $('#meas-clear').click(); }, dis: function () { return !S.meas.pts.length; } },
      '-',
      { t: 'Tout effacer…', i: 'trash', a: function () { resetAll(true); } }
    ],
    create: [
      { t: 'Nouvel itinéraire à pied', i: 'route', k: 'I', a: function () { newLayer('route', { loop: false }); } },
      { t: 'Nouvel itinéraire en boucle', i: 'loop', a: function () { newLayer('route', { loop: true }); } },
      { t: 'Nouveaux azimuts', i: 'compass', k: 'A', a: function () { newLayer('az'); } },
      { t: 'Nouvelle mesure de distance', i: 'ruler', k: 'M', a: function () { newLayer('meas'); S.meas.mode = 'dist'; renderMeas(); } },
      { t: 'Nouvelle mesure de surface', i: 'ruler', a: function () { newLayer('meas'); S.meas.mode = 'area'; renderMeas(); } }
    ],
    view: [
      { t: 'Panneau latéral', chk: function () { return S.panelOpen; }, a: togglePanel },
      { t: 'Profil d’altitude', chk: function () { return S.dockOpen; }, a: toggleDock },
      { t: 'Calques', i: 'layers', k: 'L', a: function () { setRail('layers'); } },
      { t: 'Fonds de carte et couches…', i: 'map', a: function () { togglePop('layer-pop', true); } },
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
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
    if (typing || mod || e.altKey) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && SEL) { e.preventDefault(); deleteSelected(); return; }
    var k = e.key.toLowerCase();
    if (k === 'escape') { hideMenu(); closePops(); if (SEL) select(null); else if (RT.tool !== 'pan') setTool('pan'); map.closePopup(); }
    else if (k === 'i') setRail('route'); else if (k === 'a') setRail('az'); else if (k === 'm') setRail('meas'); else if (k === 'l') setRail('layers');
  });
  window.addEventListener('beforeunload', function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignoré */ } });

  // ---------- Démarrage ----------
  curOff = wantOff(); buildTiles(); applyVis(); syncRouteUi(); $('#proj-name').value = S.name || ''; applyDock();
  renderRouteMarkers(); renderAz(); renderMeas(); renderTracks(); renderStored(); showCoords(); updateScaleUI();
  $$('.pane').forEach(function (p) { p.hidden = p.dataset.pane !== S.rail; });
  $$('.rail-btn[data-rail]').forEach(function (b) { b.classList.toggle('on', b.dataset.rail === S.rail); });
  $('#app').classList.toggle('nopanel', !S.panelOpen);
  setTool('pan');
  if (S.route.wps.length > 1) computeRoute(); else refreshProfile();
  fillPlaces(S.route);

  // API interne pour doc.js
  window.SM = {
    S: S, RT: RT, G: G, map: map, esc: esc, ic: ic, sp: sp, toast: toast, ll: ll, pin: pin, tile: tile, LAYERS: LAYERS, SCALES: SCALES,
    profileFor: profileFor, lineKey: lineKey, renderProfileSvg: renderProfileSvg, stepText: stepText, stepMeta: stepMeta, stepName: stepName,
    loopOf: loopOf, effOf: effOf, lblOf: lblOf, clsOf: clsOf, titleOf: titleOf, nameOf: nameOf, azParams: azParams, azClosedOf: azClosedOf,
    layersList: layersList, fillPlaces: fillPlaces, scaleAt: scaleAt, zoomFor: zoomFor, curScale: curScale, niceScale: niceScale, fileName: fileName,
    wantOff: wantOff, openPdf: null
  };
})();

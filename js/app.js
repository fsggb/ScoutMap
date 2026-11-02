/* ScoutMap : application cartographique FSGGB (Géoplateforme IGN). */
(function () {
  'use strict';
  var G = Geo;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = G.esc;
  var GP = 'https://data.geopf.fr';
  var KEY = 'scoutmap.v1';

  // ---------- État ----------
  var S = {
    tab: 'route', base: 'plan', ov: { contour: false, shade: false, slope: false, cadastre: false },
    coordFmt: 'wgs', speed: 4, profileSrc: 'route', dockOpen: true,
    route: { profile: 'pedestrian', opt: 'fastest', wps: [] },
    az: { pts: [], unit: 'deg', ref: 'true', decl: 0 },
    meas: { mode: 'dist', pts: [] },
    tracks: [], view: { c: [46.6, 2.5], z: 6 }
  };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) {
      ['route', 'az', 'meas'].forEach(function (k) { if (saved[k]) Object.assign(S[k], saved[k]); });
      ['tab', 'base', 'coordFmt', 'speed', 'profileSrc', 'dockOpen', 'tracks', 'view'].forEach(function (k) { if (saved[k] !== undefined) S[k] = saved[k]; });
      if (saved.ov) Object.assign(S.ov, saved.ov);
    }
  } catch (e) { /* stockage indisponible */ }
  var saveTimer;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* quota */ }
    }, 250);
  }

  var RT = { route: null, elevCache: {}, routeCtl: null };

  // ---------- Carte ----------
  function wmts(layer, fmt, opts) {
    return L.tileLayer(GP + '/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=' + layer +
      '&STYLE=normal&FORMAT=image/' + fmt + '&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
      Object.assign({ maxZoom: 19, attribution: '© <a href="https://geoservices.ign.fr/" target="_blank" rel="noopener">IGN</a> – Géoplateforme' }, opts || {}));
  }
  var bases = {
    plan: wmts('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'png'),
    ortho: wmts('ORTHOIMAGERY.ORTHOPHOTOS', 'jpeg')
  };
  var overlays = {
    contour: wmts('ELEVATION.CONTOUR.LINE', 'png', { minZoom: 12, maxNativeZoom: 18, opacity: 0.9 }),
    shade: wmts('ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW', 'png', { maxNativeZoom: 15, opacity: 0.55 }),
    slope: wmts('ELEVATION.SLOPES', 'jpeg', { minZoom: 6, maxNativeZoom: 14, opacity: 0.5 }),
    cadastre: wmts('CADASTRALPARCELS.PARCELLAIRE_EXPRESS', 'png', { minZoom: 12, opacity: 0.85 })
  };
  var map = L.map('map', { zoomControl: false, maxZoom: 19, doubleClickZoom: false, attributionControl: true })
    .setView(S.view.c, S.view.z);
  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);
  var gSearch = L.layerGroup().addTo(map), gTracks = L.layerGroup().addTo(map), gMeas = L.layerGroup().addTo(map),
    gAz = L.layerGroup().addTo(map), gRoute = L.layerGroup().addTo(map), gCursor = L.layerGroup().addTo(map);

  function applyLayers() {
    Object.keys(bases).forEach(function (k) { if (k === S.base) { if (!map.hasLayer(bases[k])) bases[k].addTo(map); } else map.removeLayer(bases[k]); });
    Object.keys(overlays).forEach(function (k) {
      if (S.ov[k]) { if (!map.hasLayer(overlays[k])) overlays[k].addTo(map); } else map.removeLayer(overlays[k]);
    });
    bases[S.base].bringToBack();
    $$('#base-seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === S.base); });
    $$('#overlays input').forEach(function (i) { i.checked = !!S.ov[i.dataset.ov]; });
  }

  map.on('moveend', function () { var c = map.getCenter(); S.view = { c: [c.lat, c.lng], z: map.getZoom() }; persist(); });

  // ---------- Utilitaires UI ----------
  var toastT;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function pin(label, cls) {
    return L.divIcon({ className: 'pin-wrap', html: '<div class="pin ' + (cls || '') + '">' + esc(label) + '</div>', iconSize: [28, 28], iconAnchor: [14, 14] });
  }
  function ll(p) { return L.latLng(p[0], p[1]); }
  function fmtP(p) { return G.formatCoord('wgs', p[0], p[1]); }
  function lastPoint() { var a = S.az.pts; return a.length ? a[a.length - 1] : null; }

  // ---------- Onglets ----------
  function setTab(t) {
    S.tab = t;
    $$('.tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t); });
    $$('.pane').forEach(function (p) { p.hidden = p.dataset.pane !== t; });
    $('#map').classList.toggle('tool', t !== 'data');
    persist();
  }
  $$('.tab').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });

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
    // Lissage (moyenne glissante 3 points) puis cumul avec seuil de 2 m
    var s = z.map(function (v, i) { var a = z[Math.max(0, i - 1)], b = z[Math.min(z.length - 1, i + 1)]; return (a + v + b) / 3; });
    var asc = 0, desc = 0, ref = s[0];
    for (var i = 1; i < s.length; i++) {
      var d = s[i] - ref;
      if (d >= 2) { asc += d; ref = s[i]; } else if (d <= -2) { desc -= d; ref = s[i]; }
    }
    return { asc: asc, desc: desc, min: Math.min.apply(null, z), max: Math.max.apply(null, z) };
  }
  // Retourne {pts:[{lat,lon,d,z}], asc, desc, min, max}
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
    if (RT.route && RT.route.line.length > 1) out.push({ id: 'route', label: 'Itinéraire', line: RT.route.line });
    if (S.az.pts.length > 1) out.push({ id: 'az', label: 'Azimuts', line: S.az.pts });
    if (S.meas.pts.length > 1 && S.meas.mode === 'dist') out.push({ id: 'meas', label: 'Mesure', line: S.meas.pts });
    S.tracks.forEach(function (t) { if (t.show !== false) out.push({ id: 't' + t.id, label: t.name, line: t.coords, ele: t.ele }); });
    return out;
  }
  var profToken = 0;
  function refreshProfile() {
    var src = sources(), sel = $('#profile-src');
    sel.innerHTML = src.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.label) + '</option>'; }).join('');
    var cur = src.filter(function (s) { return s.id === S.profileSrc; })[0] || src[0];
    $('#pempty').hidden = !!cur; $('#profile').style.display = cur ? '' : 'none';
    if (!cur) { currentProfile = null; $('#pstats').textContent = ''; return; }
    sel.value = cur.id;
    var tok = ++profToken;
    $('#pstats').textContent = 'Calcul du profil…';
    profileFor(cur.line, cur.ele).then(function (p) {
      if (tok !== profToken) return;
      currentProfile = p; currentProfile.label = cur.label;
      $('#pstats').innerHTML = G.fmtDist(p.pts[p.pts.length - 1].d) + ' · D+ <b>' + Math.round(p.asc) + ' m</b> · D− <b>' +
        Math.round(p.desc) + ' m</b> · alt. ' + Math.round(p.min) + '–' + Math.round(p.max) + ' m';
      drawProfile();
      if (cur.id === 'route') renderRouteStats();
    }).catch(function (e) {
      if (tok !== profToken) return;
      currentProfile = null; $('#pstats').textContent = e.message || 'Profil indisponible.';
      $('#profile').innerHTML = '';
    });
  }
  $('#profile-src').addEventListener('change', function () { S.profileSrc = this.value; persist(); refreshProfile(); });
  $('#profile-toggle').addEventListener('click', function () {
    S.dockOpen = !S.dockOpen; applyDock(); persist();
  });
  function applyDock() {
    $('#profile-dock').classList.toggle('closed', !S.dockOpen);
    $('#profile-toggle').textContent = S.dockOpen ? 'Réduire' : 'Afficher';
    $('#profile-toggle').setAttribute('aria-expanded', S.dockOpen);
    setTimeout(function () { map.invalidateSize(); drawProfile(); }, 50);
  }

  function niceStep(range, n) {
    var raw = range / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
  }
  // Dessine un profil dans un <svg> (largeur lue sur son conteneur ou forcée).
  function renderProfileSvg(svg, p, w, h) {
    var m = { l: 46, r: 12, t: 10, b: 24 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
    var total = p.pts[p.pts.length - 1].d || 1;
    var lo = p.min, hi = p.max, pad = Math.max(5, (hi - lo) * 0.1);
    lo = Math.floor((lo - pad) / 10) * 10; hi = Math.ceil((hi + pad) / 10) * 10;
    var X = function (d) { return m.l + d / total * iw; }, Y = function (z) { return m.t + ih - (z - lo) / (hi - lo) * ih; };
    var ys = niceStep(hi - lo, Math.max(2, Math.floor(ih / 34))), xs = niceStep(total, Math.max(2, Math.floor(iw / 90)));
    var s = '<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c6a24e" stop-opacity=".55"/><stop offset="1" stop-color="#c6a24e" stop-opacity=".08"/></linearGradient></defs>';
    for (var z = Math.ceil(lo / ys) * ys; z <= hi; z += ys)
      s += '<line class="grid" x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + Y(z) + '" y2="' + Y(z) + '"/><text class="ax" x="' + (m.l - 6) + '" y="' + (Y(z) + 4) + '" text-anchor="end">' + Math.round(z) + '</text>';
    for (var d = 0; d <= total + 1; d += xs)
      s += '<line class="grid v" x1="' + X(d) + '" x2="' + X(d) + '" y1="' + m.t + '" y2="' + (h - m.b) + '"/><text class="ax" x="' + X(d) + '" y="' + (h - 7) + '" text-anchor="middle">' + (total >= 2000 ? (d / 1000).toFixed(xs < 1000 ? 1 : 0) + ' km' : Math.round(d) + ' m') + '</text>';
    var line = p.pts.map(function (q, i) { return (i ? 'L' : 'M') + X(q.d).toFixed(1) + ' ' + Y(q.z).toFixed(1); }).join('');
    s += '<path d="' + line + 'L' + X(total).toFixed(1) + ' ' + (m.t + ih) + 'L' + m.l + ' ' + (m.t + ih) + 'Z" fill="url(#pg)"/>';
    s += '<path d="' + line + '" fill="none" stroke="#000761" stroke-width="2" stroke-linejoin="round"/>';
    s += '<g class="cur" visibility="hidden"><line y1="' + m.t + '" y2="' + (h - m.b) + '"/><circle r="4.5"/></g>';
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.innerHTML = s;
    svg._geom = { m: m, iw: iw, total: total, X: X, Y: Y };
  }
  function drawProfile() {
    if (!currentProfile) return;
    var body = $('#profile-body'), w = Math.max(280, body.clientWidth), h = Math.max(110, body.clientHeight);
    var svg = $('#profile'); svg.setAttribute('width', w); svg.setAttribute('height', h);
    renderProfileSvg(svg, currentProfile, w, h);
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
      tip.style.left = Math.min(rect.width - 190, Math.max(0, cx + 10)) + 'px';
      gCursor.clearLayers();
      L.circleMarker([a.lat + (b.lat - a.lat) * q, a.lon + (b.lon - a.lon) * q], { radius: 7, color: '#fff', weight: 2, fillColor: '#c6a24e', fillOpacity: 1, interactive: false }).addTo(gCursor);
    }
    svg.addEventListener('mousemove', move); svg.addEventListener('touchmove', move, { passive: true });
    svg.addEventListener('mouseleave', leave); svg.addEventListener('touchend', leave);
  })();

  // ---------- Itinéraire ----------
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
  function stepName(st) {
    var n = st.attributes && st.attributes.name;
    if (!n) return '';
    if (typeof n === 'string') return n;
    return n.cpx_toponyme || n.nom_1_droite || n.nom_1_gauche || '';
  }

  var routeMarkers = [], routeLine = null;
  function wpLabel(i, n) { return i === 0 ? 'A' : i === n - 1 ? 'B' : String(i); }
  function wpClass(i, n) { return i === 0 ? 'start' : i === n - 1 ? 'end' : 'via'; }
  function addWp(p, name, idx) {
    var o = { lat: p[0], lon: p[1] }; if (name) o.name = name;
    if (idx == null) S.route.wps.push(o); else S.route.wps.splice(idx, 0, o);
    renderRouteMarkers(); computeRoute(); persist();
  }
  function renderRouteMarkers() {
    routeMarkers.forEach(function (m) { gRoute.removeLayer(m); }); routeMarkers = [];
    var w = S.route.wps, n = w.length;
    w.forEach(function (p, i) {
      var m = L.marker([p.lat, p.lon], { draggable: true, icon: pin(wpLabel(i, n), wpClass(i, n)), zIndexOffset: 1000, title: i === 0 ? 'Départ' : i === n - 1 ? 'Arrivée' : 'Étape ' + i }).addTo(gRoute);
      m.on('dragend', function () { var q = m.getLatLng(); S.route.wps[i] = { lat: q.lat, lon: q.lng }; renderWpList(); computeRoute(); persist(); });
      m.on('contextmenu', function () { removeWp(i); });
      routeMarkers.push(m);
    });
    renderWpList();
  }
  function renderWpList() {
    var w = S.route.wps, n = w.length;
    $('#wps').innerHTML = w.map(function (p, i) {
      return '<li><span class="badge ' + wpClass(i, n) + '">' + wpLabel(i, n) + '</span><span class="wp-txt"><b>' +
        (i === 0 ? 'Départ' : i === n - 1 ? 'Arrivée' : 'Étape ' + i) + '</b> ' + esc(p.name || fmtP([p.lat, p.lon])) +
        '</span><button class="x" data-i="' + i + '" title="Retirer" aria-label="Retirer">✕</button></li>';
    }).join('');
    $$('#wps .x').forEach(function (b) { b.addEventListener('click', function () { removeWp(+b.dataset.i); }); });
  }
  function removeWp(i) { S.route.wps.splice(i, 1); renderRouteMarkers(); computeRoute(); persist(); }
  $('#route-undo').addEventListener('click', function () { if (S.route.wps.length) removeWp(S.route.wps.length - 1); });
  $('#route-clear').addEventListener('click', function () { S.route.wps = []; renderRouteMarkers(); computeRoute(); persist(); });
  $('#route-reverse').addEventListener('click', function () { S.route.wps.reverse(); renderRouteMarkers(); computeRoute(); persist(); });
  $$('#route-profile button').forEach(function (b) {
    b.addEventListener('click', function () { S.route.profile = b.dataset.v; syncRouteUi(); computeRoute(); persist(); });
  });
  $('#route-opt').addEventListener('change', function () { S.route.opt = this.value; computeRoute(); persist(); });
  $('#speed').addEventListener('input', function () { S.speed = Math.max(1, +this.value || 4); renderRouteStats(); persist(); });
  function syncRouteUi() {
    $$('#route-profile button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === S.route.profile); });
    $('#route-opt').value = S.route.opt; $('#speed').value = S.speed;
  }
  function setRouteStatus(msg, err) { var el = $('#route-status'); el.textContent = msg || ''; el.className = 'status' + (err ? ' error' : ''); }

  var routeTimer;
  function computeRoute() {
    clearTimeout(routeTimer);
    if (routeLine) { gRoute.removeLayer(routeLine); routeLine = null; }
    routeLines.forEach(function (l) { gRoute.removeLayer(l); }); routeLines = [];
    RT.route = null; renderRouteStats(); $('#steps-box').hidden = true;
    if (RT.routeCtl) RT.routeCtl.abort();
    var w = S.route.wps;
    if (w.length < 2) { setRouteStatus(w.length === 1 ? 'Posez l’arrivée sur la carte.' : ''); refreshProfile(); return; }
    if (w.length > 17) { setRouteStatus('Maximum : 15 étapes intermédiaires.', true); return; }
    setRouteStatus('Calcul de l’itinéraire…');
    routeTimer = setTimeout(function () {
      var c = RT.routeCtl = new AbortController();
      var f = function (p) { return p.lon.toFixed(6) + ',' + p.lat.toFixed(6); };
      var url = GP + '/navigation/itineraire?resource=bdtopo-valhalla&profile=' + S.route.profile + '&optimization=' + S.route.opt +
        '&start=' + f(w[0]) + '&end=' + f(w[w.length - 1]) +
        (w.length > 2 ? '&intermediates=' + encodeURIComponent(w.slice(1, -1).map(f).join('|')) : '') +
        '&geometryFormat=geojson&getSteps=true&getBbox=false&crs=EPSG:4326&timeUnit=second&distanceUnit=meter&waysAttributes=name';
      fetch(url, { signal: c.signal }).then(function (r) {
        return r.json().then(function (j) { if (!r.ok || j.error) throw new Error((j.error && j.error.message) || (j.message) || 'Erreur ' + r.status); return j; });
      }).then(function (j) {
        var line = j.geometry.coordinates.map(function (q) { return [q[1], q[0]]; });
        RT.route = { line: line, dist: j.distance, dur: j.duration, portions: j.portions || [] };
        drawRoute(); setRouteStatus('');
        renderSteps(); renderRouteStats();
        if (S.tab === 'route') map.fitBounds(L.latLngBounds(line.map(ll)), { padding: [60, 60], maxZoom: 16 });
        S.profileSrc = 'route'; refreshProfile();
      }).catch(function (e) {
        if (e.name === 'AbortError') return;
        setRouteStatus('Itinéraire impossible : ' + (e.message || 'service indisponible') + '. Rapprochez les points d’une route ou d’un chemin.', true);
        refreshProfile();
      });
    }, 250);
  }
  var routeLines = [];
  function drawRoute() {
    var r = RT.route; if (!r) return;
    var casing = L.polyline(r.line, { color: '#fff', weight: 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(gRoute);
    routeLine = L.polyline(r.line, { color: '#000761', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(gRoute);
    routeLines.push(casing);
    routeLine.on('click', function (e) {
      L.DomEvent.stopPropagation(e);
      var idx = nearestIndex(r.line, [e.latlng.lat, e.latlng.lng]), leg = legOf(idx);
      addWp([e.latlng.lat, e.latlng.lng], null, leg + 1);
    });
    routeLine.on('mouseover', function () { routeLine.setStyle({ color: '#c6a24e' }); });
    routeLine.on('mouseout', function () { routeLine.setStyle({ color: '#000761' }); });
    routeLine.bringToFront();
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
    return Math.min(leg, S.route.wps.length - 2);
  }
  function renderSteps() {
    var r = RT.route; if (!r) return;
    var items = [];
    r.portions.forEach(function (p, pi) {
      items.push('<li class="leg">Étape ' + (pi + 1) + ' → ' + (pi === r.portions.length - 1 ? 'arrivée' : 'repère ' + (pi + 1)) + ' · ' + G.fmtDist(p.distance) + '</li>');
      (p.steps || []).forEach(function (s) {
        var n = stepName(s);
        items.push('<li><span>' + esc(stepText(s)) + (n ? ' <i>' + esc(n) + '</i>' : '') + '</span><b>' + G.fmtDist(s.distance) + '</b></li>');
      });
    });
    $('#steps').innerHTML = items.join(''); $('#steps-box').hidden = !items.length;
  }
  function renderRouteStats() {
    var el = $('#route-stats'), r = RT.route;
    if (!r) { el.hidden = true; return; }
    var p = (currentProfile && currentProfile.label === 'Itinéraire') ? currentProfile : (RT.elevCache[lineKey(r.line)] || null);
    var html = '<div><span>Distance</span><b>' + G.fmtDist(r.dist) + '</b></div><div><span>Durée IGN (' + (S.route.profile === 'car' ? 'voiture' : 'à pied') + ')</span><b>' + G.fmtDur(r.dur) + '</b></div>';
    if (p) {
      html += '<div><span>Dénivelé</span><b>+' + Math.round(p.asc) + ' / −' + Math.round(p.desc) + ' m</b></div>';
      if (S.route.profile === 'pedestrian')
        html += '<div><span>Marche estimée</span><b>' + G.fmtDur((r.dist / 1000 / S.speed + p.asc / 400) * 3600) + '</b></div>';
    }
    el.innerHTML = html; el.hidden = false;
  }

  // ---------- Azimuts ----------
  var azMarkers = [], azLines = [], azLabels = [];
  function azParams() { return { unit: S.az.unit, ref: S.az.ref, decl: +S.az.decl || 0 }; }
  function addAz(p, idx) {
    if (idx == null) S.az.pts.push(p); else S.az.pts.splice(idx, 0, p);
    renderAz(); persist();
  }
  function renderAz() {
    azMarkers.concat(azLines, azLabels).forEach(function (l) { gAz.removeLayer(l); }); azMarkers = []; azLines = []; azLabels = [];
    var pts = S.az.pts, a = azParams();
    $('#az-unit').value = a.unit; $('#az-ref').value = a.ref; $('#az-decl').value = a.decl;
    $('#decl-row').hidden = a.ref !== 'mag'; $('#decl-note').hidden = a.ref !== 'mag';
    var rows = '', cum = 0;
    pts.forEach(function (p, i) {
      var m = L.marker(p, { draggable: true, icon: pin(String(i + 1), 'az'), zIndexOffset: 900 }).addTo(gAz);
      m.on('dragend', function () { var q = m.getLatLng(); S.az.pts[i] = [q.lat, q.lng]; renderAz(); persist(); });
      m.on('contextmenu', function () { S.az.pts.splice(i, 1); renderAz(); persist(); });
      azMarkers.push(m);
      if (i > 0) {
        var q = pts[i - 1], t = G.bearing(q, p), d = G.haversine(q, p); cum += d;
        var v = G.trueToUnit(t, a.unit, a.ref, a.decl), back = G.trueToUnit((t + 180) % 360, a.unit, a.ref, a.decl);
        azLines.push(L.polyline([q, p], { color: '#c6a24e', weight: 4, dashArray: '10 6', opacity: 0.95, interactive: false }).addTo(gAz));
        var mid = [(q[0] + p[0]) / 2, (q[1] + p[1]) / 2];
        azLabels.push(L.marker(mid, { interactive: false, icon: L.divIcon({ className: 'az-label', html: '<span>' + G.fmtAz(v, a.unit) + ' · ' + G.fmtDist(d) + '</span>', iconSize: [0, 0] }) }).addTo(gAz));
        rows += '<tr><td>' + i + '→' + (i + 1) + '</td><td><b>' + G.fmtAz(v, a.unit) + '</b></td><td>' + G.fmtAz(back, a.unit) + '</td><td>' + G.fmtDist(d) + '</td><td>' + G.fmtDist(cum) + '</td><td><button class="x" data-i="' + i + '" title="Retirer le point ' + (i + 1) + '">✕</button></td></tr>';
      }
    });
    $('#az-table tbody').innerHTML = rows || '<tr><td colspan="6" class="muted">Posez au moins deux points.</td></tr>';
    $$('#az-table .x').forEach(function (b) { b.addEventListener('click', function () { S.az.pts.splice(+b.dataset.i, 1); renderAz(); persist(); }); });
    var st = $('#az-stats');
    if (pts.length > 1) {
      var closed = G.haversine(pts[0], pts[pts.length - 1]);
      st.innerHTML = '<div><span>Points</span><b>' + pts.length + '</b></div><div><span>Parcours</span><b>' + G.fmtDist(cum) + '</b></div><div><span>Écart départ–arrivée</span><b>' + G.fmtDist(closed) + '</b></div>';
      st.hidden = false;
    } else st.hidden = true;
    $('#aim-az').placeholder = a.unit === 'deg' ? '0–360' : a.unit === 'grd' ? '0–400' : '0–6400';
    refreshProfile();
  }
  ['az-unit', 'az-ref'].forEach(function (id) {
    $('#' + id).addEventListener('change', function () { S.az.unit = $('#az-unit').value; S.az.ref = $('#az-ref').value; renderAz(); persist(); });
  });
  $('#az-decl').addEventListener('input', function () { S.az.decl = +this.value || 0; renderAz(); persist(); });
  $('#az-undo').addEventListener('click', function () { S.az.pts.pop(); renderAz(); persist(); });
  $('#az-clear').addEventListener('click', function () { S.az.pts = []; renderAz(); persist(); });
  $('#az-close').addEventListener('click', function () {
    if (S.az.pts.length > 2) { S.az.pts.push(S.az.pts[0].slice()); renderAz(); persist(); } else toast('Posez au moins trois points.');
  });
  $('#aim-add').addEventListener('click', function () {
    var last = lastPoint(), v = parseFloat($('#aim-az').value), d = parseFloat($('#aim-d').value);
    if (!last) { toast('Posez d’abord un point de départ sur la carte.'); return; }
    if (isNaN(v) || isNaN(d) || d <= 0) { toast('Saisissez un azimut et une distance.'); return; }
    var a = azParams(), t = G.unitToTrue(v, a.unit, a.ref, a.decl);
    S.az.pts.push(G.destination(last, t, d)); renderAz(); persist();
    map.panTo(ll(lastPoint())); $('#aim-az').value = ''; $('#aim-d').value = '';
  });

  // ---------- Mesure ----------
  var measLayers = [];
  function renderMeas() {
    measLayers.forEach(function (l) { gMeas.removeLayer(l); }); measLayers = [];
    var pts = S.meas.pts, area = S.meas.mode === 'area';
    $$('#meas-mode button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === S.meas.mode); });
    if (pts.length > 1) {
      var shape = area && pts.length > 2
        ? L.polygon(pts, { color: '#000761', weight: 3, fillColor: '#c6a24e', fillOpacity: 0.25, dashArray: '2 6', interactive: false })
        : L.polyline(pts, { color: '#000761', weight: 3, dashArray: '2 6', interactive: false });
      measLayers.push(shape.addTo(gMeas));
    }
    pts.forEach(function (p, i) {
      var m = L.marker(p, { draggable: true, icon: L.divIcon({ className: 'pin-wrap', html: '<div class="dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(gMeas);
      m.on('drag', function () { var q = m.getLatLng(); S.meas.pts[i] = [q.lat, q.lng]; });
      m.on('dragend', function () { renderMeas(); persist(); });
      m.on('contextmenu', function () { S.meas.pts.splice(i, 1); renderMeas(); persist(); });
      measLayers.push(m);
    });
    var len = G.pathLength(pts), el = $('#meas-stats');
    if (area) {
      var ring = pts.length > 2 ? pts.concat([pts[0]]) : pts;
      el.innerHTML = '<div><span>Surface</span><b>' + (pts.length > 2 ? G.fmtArea(G.areaM2(pts)) : '—') + '</b></div><div><span>Périmètre</span><b>' + G.fmtDist(G.pathLength(ring)) + '</b></div>';
    } else el.innerHTML = '<div><span>Distance</span><b>' + G.fmtDist(len) + '</b></div><div><span>Points</span><b>' + pts.length + '</b></div>';
    refreshProfile();
  }
  $$('#meas-mode button').forEach(function (b) { b.addEventListener('click', function () { S.meas.mode = b.dataset.v; renderMeas(); persist(); }); });
  $('#meas-undo').addEventListener('click', function () { S.meas.pts.pop(); renderMeas(); persist(); });
  $('#meas-clear').addEventListener('click', function () { S.meas.pts = []; renderMeas(); persist(); });

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
    $('#tracks').innerHTML = S.tracks.map(function (t) {
      return '<li><label class="tk"><input type="checkbox" data-show="' + t.id + '"' + (t.show !== false ? ' checked' : '') + '><span class="sw" style="background:' + t.color + '"></span><span class="tkn">' + esc(t.name) + '</span></label><small>' + G.fmtDist(G.pathLength(t.coords)) + '</small>' +
        '<button class="text-btn" data-zoom="' + t.id + '">Voir</button><button class="x" data-del="' + t.id + '" title="Supprimer">✕</button></li>';
    }).join('');
    $('#tracks-empty').hidden = S.tracks.length > 0;
    $$('#tracks [data-show]').forEach(function (i) { i.addEventListener('change', function () { var t = findTrack(i.dataset.show); t.show = i.checked; renderTracks(); persist(); }); });
    $$('#tracks [data-zoom]').forEach(function (b) { b.addEventListener('click', function () { var t = findTrack(b.dataset.zoom); map.fitBounds(L.latLngBounds(t.coords.map(ll)), { padding: [50, 50] }); S.profileSrc = 't' + t.id; refreshProfile(); }); });
    $$('#tracks [data-del]').forEach(function (b) { b.addEventListener('click', function () { S.tracks = S.tracks.filter(function (t) { return String(t.id) !== b.dataset.del; }); renderTracks(); persist(); }); });
    refreshProfile();
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
        renderTracks(); setTab('data');
        var b = L.latLngBounds([]); (added.length ? added : S.tracks.slice(-1)).forEach(function (t) { t.coords.forEach(function (c) { b.extend(c); }); });
        if (b.isValid()) map.fitBounds(b, { padding: [50, 50] });
        if (added[0]) { S.profileSrc = 't' + added[0].id; refreshProfile(); }
        toast(res.tracks.length + ' trace(s) importée(s).'); persist();
      } catch (e) { toast(e.message || 'Import impossible.'); }
    };
    fr.readAsText(file);
  }
  $('#btn-import').addEventListener('click', function () { $('#file-gpx').click(); });
  $('#file-gpx').addEventListener('change', function () { if (this.files[0]) importGpx(this.files[0]); this.value = ''; });
  $('#reset-all').addEventListener('click', function () {
    if (!confirm('Effacer tout le travail en cours (itinéraire, azimuts, mesures, traces) ?')) return;
    S.route.wps = []; S.az.pts = []; S.meas.pts = []; S.tracks = [];
    renderRouteMarkers(); computeRoute(); renderAz(); renderMeas(); renderTracks(); persist();
  });
  $('#base-seg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { S.base = b.dataset.v; applyLayers(); persist(); } });
  $('#overlays').addEventListener('change', function (e) { S.ov[e.target.dataset.ov] = e.target.checked; applyLayers(); persist(); });

  // ---------- Export GPX ----------
  function gpxParts() {
    var parts = [];
    if (S.route.wps.length) parts.push({ id: 'route', label: 'Itinéraire (' + S.route.wps.length + ' repères' + (RT.route ? ', ' + G.fmtDist(RT.route.dist) : '') + ')' });
    if (S.az.pts.length) parts.push({ id: 'az', label: 'Azimuts (' + S.az.pts.length + ' points)' });
    if (S.meas.pts.length > 1) parts.push({ id: 'meas', label: 'Mesure' });
    S.tracks.forEach(function (t) { parts.push({ id: 't' + t.id, label: 'Trace : ' + t.name }); });
    return parts;
  }
  function buildGpx(ids) {
    var body = '', a = azParams();
    if (ids.indexOf('route') >= 0 && S.route.wps.length) {
      S.route.wps.forEach(function (p, i, w) { body += G.wptXml([p.lat, p.lon], p.name || (i === 0 ? 'Départ' : i === w.length - 1 ? 'Arrivée' : 'Étape ' + i)); });
      if (RT.route) {
        var pr = RT.elevCache[lineKey(RT.route.line)];
        var ele = null;
        if (pr) { var cum = G.cumDist(RT.route.line); ele = RT.route.line.map(function (_, i) { var j = 0; while (j < pr.pts.length - 1 && pr.pts[j].d < cum[i]) j++; return pr.pts[j].z; }); }
        body += G.trkXml('Itinéraire ScoutMap', RT.route.line, ele, G.fmtDist(RT.route.dist) + ' – ' + (S.route.profile === 'car' ? 'voiture' : 'à pied'));
      }
    }
    if (ids.indexOf('az') >= 0 && S.az.pts.length) {
      S.az.pts.forEach(function (p, i, pts) {
        var d = '';
        if (i > 0) d = 'Azimut ' + G.fmtAz(G.trueToUnit(G.bearing(pts[i - 1], p), a.unit, a.ref, a.decl), a.unit) + ' (' + (a.ref === 'mag' ? 'magnétique' : 'géographique') + '), ' + G.fmtDist(G.haversine(pts[i - 1], p));
        body += G.wptXml(p, 'Balise ' + (i + 1), d);
      });
      if (S.az.pts.length > 1) body += G.trkXml('Azimuts ScoutMap', S.az.pts, null);
    }
    if (ids.indexOf('meas') >= 0 && S.meas.pts.length > 1) body += G.trkXml('Mesure ScoutMap', S.meas.pts, null);
    S.tracks.forEach(function (t) { if (ids.indexOf('t' + t.id) >= 0) { body += G.trkXml(t.name, t.coords, t.ele); (t.wpts || []).forEach(function (w) { body += G.wptXml([w.lat, w.lon], w.name || 'Point'); }); } });
    return G.gpxDoc(body, 'ScoutMap ' + new Date().toLocaleDateString('fr-FR'));
  }
  function fileName() { return 'scoutmap-' + new Date().toISOString().slice(0, 10) + '.gpx'; }
  function download(name, text, mime) {
    var a = document.createElement('a'), u = URL.createObjectURL(new Blob([text], { type: mime }));
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  }
  var exportTarget = 'download';
  function openExport(target) {
    var parts = gpxParts();
    if (!parts.length) { toast('Rien à exporter : tracez un itinéraire, des azimuts ou importez une trace.'); return; }
    exportTarget = target;
    $('#export-opts').innerHTML = parts.map(function (p) { return '<label><input type="checkbox" value="' + esc(p.id) + '" checked> ' + esc(p.label) + '</label>'; }).join('');
    $('#export-ok').textContent = target === 'hub' ? 'Enregistrer' : 'Télécharger';
    $('#dlg-export').showModal();
  }
  $('#btn-export').addEventListener('click', function () { openExport('download'); });
  $('#export-cancel').addEventListener('click', function () { $('#dlg-export').close(); });
  $('#export-ok').addEventListener('click', function () {
    var ids = $$('#export-opts input:checked').map(function (i) { return i.value; });
    if (!ids.length) { toast('Cochez au moins un élément.'); return; }
    var gpx = buildGpx(ids); $('#dlg-export').close();
    if (exportTarget === 'hub' && typeof window.ScoutHubSave === 'function') {
      Promise.resolve(window.ScoutHubSave({ name: fileName(), mime: 'application/gpx+xml', content: gpx }))
        .then(function () { toast('Enregistré dans ScoutHub.'); }).catch(function (e) { toast('ScoutHub : ' + ((e && e.message) || 'échec de l’enregistrement')); });
    } else {
      download(fileName(), gpx, 'application/gpx+xml');
      try { if (window.ScoutHub && window.ScoutHub.offer) window.ScoutHub.offer(fileName(), new TextEncoder().encode(gpx)); } catch (e) { /* client ScoutHub absent */ }
    }
  });
  // Point d'extension ScoutHub : définir window.ScoutHubSave({name, mime, content}) pour activer le bouton.
  function syncHub() { $('#btn-hub').hidden = typeof window.ScoutHubSave !== 'function'; }
  $('#btn-hub').addEventListener('click', function () { openExport('hub'); });
  window.addEventListener('scouthub:ready', syncHub);
  window.ScoutMap = { exportGpx: function () { return buildGpx(gpxParts().map(function (p) { return p.id; })); }, state: S, fileName: fileName, refreshHub: syncHub };

  // ---------- Impression ----------
  function fillPrint() {
    var sheet = $('#print-sheet'), a = azParams(), h = '';
    h += '<div class="ps-head"><img src="assets/fsggb.png" alt="" width="44" height="44"><div><h1>ScoutMap</h1><p>' + new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' }) + ' · Fonds IGN – Géoplateforme</p></div></div>';
    h += '<div class="ps-cols">';
    if (RT.route) {
      var p = RT.elevCache[lineKey(RT.route.line)];
      h += '<div><h2>Itinéraire (' + (S.route.profile === 'car' ? 'voiture' : 'à pied') + ')</h2><p>' + G.fmtDist(RT.route.dist) + ' · ' + G.fmtDur(RT.route.dur) + (p ? ' · D+ ' + Math.round(p.asc) + ' m · D− ' + Math.round(p.desc) + ' m' : '') + '</p><ol class="ps-steps">' +
        RT.route.portions.map(function (po) { return (po.steps || []).map(function (s) { var n = stepName(s); return '<li>' + esc(stepText(s)) + (n ? ' <i>' + esc(n) + '</i>' : '') + ' <b>' + G.fmtDist(s.distance) + '</b></li>'; }).join(''); }).join('') + '</ol></div>';
    }
    if (S.az.pts.length > 1) {
      var cum = 0;
      h += '<div><h2>Azimuts (' + (a.ref === 'mag' ? 'Nord magnétique, déclinaison ' + a.decl + '°' : 'Nord géographique') + ')</h2><table><thead><tr><th>Segment</th><th>Azimut</th><th>Contre-az.</th><th>Distance</th><th>Cumul</th></tr></thead><tbody>' +
        S.az.pts.slice(1).map(function (q, i) {
          var pp = S.az.pts[i], t = G.bearing(pp, q), d = G.haversine(pp, q); cum += d;
          return '<tr><td>' + (i + 1) + ' → ' + (i + 2) + '</td><td>' + G.fmtAz(G.trueToUnit(t, a.unit, a.ref, a.decl), a.unit) + '</td><td>' + G.fmtAz(G.trueToUnit((t + 180) % 360, a.unit, a.ref, a.decl), a.unit) + '</td><td>' + G.fmtDist(d) + '</td><td>' + G.fmtDist(cum) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    h += '</div>';
    sheet.innerHTML = h;
  }
  function prepPrint() { fillPrint(); document.body.classList.add('printing'); map.invalidateSize(); drawProfile(); }
  function endPrint() { document.body.classList.remove('printing'); setTimeout(function () { map.invalidateSize(); drawProfile(); }, 50); }
  window.addEventListener('beforeprint', prepPrint); window.addEventListener('afterprint', endPrint);
  $('#btn-print').addEventListener('click', function () { prepPrint(); setTimeout(function () { window.print(); }, 400); });

  // ---------- Coordonnées au curseur ----------
  var lastLL = null;
  map.on('mousemove', function (e) { lastLL = e.latlng; showCoords(); });
  map.on('mouseout', function () { /* conserve la dernière valeur */ });
  function showCoords() { var p = lastLL || map.getCenter(); $('#coords').textContent = G.formatCoord(S.coordFmt, p.lat, p.lng); }
  $('#coord-fmt').addEventListener('change', function () { S.coordFmt = this.value; showCoords(); persist(); });
  $('#coords').addEventListener('click', function () {
    var t = this.textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Coordonnées copiées.'); }, function () { toast(t); });
  });

  // ---------- Clic carte & menu contextuel ----------
  var tool = null;
  map.on('click', function (e) {
    var p = [e.latlng.lat, e.latlng.lng];
    if (S.tab === 'route') addWp(p);
    else if (S.tab === 'az') addAz(p);
    else if (S.tab === 'meas') { S.meas.pts.push(p); renderMeas(); persist(); }
  });
  var popupMarker = null;
  function actionPopup(latlng, title, name) {
    var html = '<div class="pp"><b>' + esc(title) + '</b><small>' + esc(G.formatCoord('wgs', latlng.lat, latlng.lng)) + '</small><div class="pp-btns">' +
      '<button data-a="start">Départ</button><button data-a="via">Étape</button><button data-a="end">Arrivée</button><button data-a="az">Point d’azimut</button><button data-a="copy">Copier</button></div></div>';
    L.popup({ closeButton: true, offset: [0, -4] }).setLatLng(latlng).setContent(html).openOn(map);
    var el = document.querySelector('.leaflet-popup-content .pp');
    if (!el) return;
    el.addEventListener('click', function (ev) {
      var a = ev.target.dataset && ev.target.dataset.a; if (!a) return;
      var p = [latlng.lat, latlng.lng], w = S.route.wps;
      if (a === 'start') { w.unshift({ lat: p[0], lon: p[1], name: name }); }
      else if (a === 'end') { w.push({ lat: p[0], lon: p[1], name: name }); }
      else if (a === 'via') { if (w.length < 2) w.push({ lat: p[0], lon: p[1], name: name }); else w.splice(w.length - 1, 0, { lat: p[0], lon: p[1], name: name }); }
      else if (a === 'az') { addAz(p); map.closePopup(); setTab('az'); return; }
      else if (a === 'copy') { $('#coords').textContent = G.formatCoord(S.coordFmt, p[0], p[1]); navigator.clipboard && navigator.clipboard.writeText($('#coords').textContent); toast('Coordonnées copiées.'); map.closePopup(); return; }
      map.closePopup(); setTab('route'); renderRouteMarkers(); computeRoute(); persist();
    });
  }
  map.on('contextmenu', function (e) { actionPopup(e.latlng, 'Ce point'); });

  // ---------- Recherche ----------
  var qTimer, qCtl, results = [];
  function arr(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }
  function labelOf(f) {
    var p = f.properties || {};
    if (p.label) return { t: p.label, k: p._type === 'poi' ? 'Lieu' : 'Adresse' };
    var name = arr(p.toponym || p.name)[0] || 'Lieu', city = arr(p.city)[0] || '', pc = arr(p.postcode)[0] || '';
    return { t: name + (city ? ', ' + pc + ' ' + city : ''), k: arr(p.category)[0] || 'Lieu' };
  }
  function closeSuggest() { $('#suggest').hidden = true; }
  $('#q').addEventListener('input', function () {
    var v = this.value.trim(); clearTimeout(qTimer);
    if (v.length < 3) { closeSuggest(); return; }
    qTimer = setTimeout(function () {
      if (qCtl) qCtl.abort(); qCtl = new AbortController();
      fetch(GP + '/geocodage/search?q=' + encodeURIComponent(v) + '&index=poi,address&limit=7', { signal: qCtl.signal })
        .then(function (r) { return r.json(); }).then(function (j) {
          results = j.features || [];
          var ul = $('#suggest');
          ul.innerHTML = results.length ? results.map(function (f, i) { var l = labelOf(f); return '<li role="option" data-i="' + i + '"><span>' + esc(l.t) + '</span><small>' + esc(l.k) + '</small></li>'; }).join('') : '<li class="none">Aucun résultat</li>';
          ul.hidden = false;
        }).catch(function (e) { if (e.name !== 'AbortError') { $('#suggest').innerHTML = '<li class="none">Recherche indisponible</li>'; $('#suggest').hidden = false; } });
    }, 250);
  });
  function pick(i) {
    var f = results[i]; if (!f) return;
    var c = f.geometry.coordinates, l = labelOf(f), p = f.properties || {};
    closeSuggest(); $('#q').value = l.t;
    var zoom = (p._type === 'poi' && arr(p.category).join(' ').match(/sommet|montagne/)) ? 14 : p._type === 'poi' ? 15 : 17;
    map.setView([c[1], c[0]], zoom);
    gSearch.clearLayers();
    L.marker([c[1], c[0]], { icon: pin('⌖', 'search') }).addTo(gSearch);
    actionPopup(L.latLng(c[1], c[0]), l.t, l.t);
  }
  $('#suggest').addEventListener('click', function (e) { var li = e.target.closest('li[data-i]'); if (li) pick(+li.dataset.i); });
  $('#q').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); if (results.length) pick(0); }
    if (e.key === 'Escape') closeSuggest();
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.search')) closeSuggest(); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !/input|select|textarea/i.test(document.activeElement.tagName)) {
      e.preventDefault(); ({ route: '#route-undo', az: '#az-undo', meas: '#meas-undo' }[S.tab] && $({ route: '#route-undo', az: '#az-undo', meas: '#meas-undo' }[S.tab]).click());
    }
  });

  // ---------- Démarrage ----------
  applyLayers(); syncRouteUi(); $('#coord-fmt').value = S.coordFmt; applyDock();
  renderRouteMarkers(); renderAz(); renderMeas(); renderTracks(); setTab(S.tab); showCoords();
  if (S.route.wps.length > 1) computeRoute(); else refreshProfile();
  syncHub(); setTimeout(syncHub, 1500);
})();

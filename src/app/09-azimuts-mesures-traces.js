  /* ==== src/app/09-azimuts-mesures-traces.js : nature du parcours, azimuts, mesures, traces importées ==== */
  // ---------- Nature du parcours : part de route, de chemin et de sentier (BD TOPO de l'IGN, interrogée par tronçons de carte) ----------
  var NATGRP = [['Route', '#5b6b8c'], ['Route empierrée', '#b08d57'], ['Chemin', '#c6a24e'], ['Sentier', '#2f7d32'], ['Escalier', '#8a5a2b'], ['Autre voie', '#9a9db4'], ['Ligne droite (hors voie)', '#c0262d']];
  function natGroup(n) {
    n = String(n || '');
    if (/^Route à|Rond-point|Bretelle|autoroutier|Piste cyclable/i.test(n)) return 'Route';
    if (/empierrée/i.test(n)) return 'Route empierrée';
    if (/^Chemin/i.test(n)) return 'Chemin';
    if (/Sentier/i.test(n)) return 'Sentier';
    if (/Escalier/i.test(n)) return 'Escalier';
    return 'Autre voie';
  }
  RT.natCache = RT.natCache || {};
  function loadNature() {
    var box = $('#nature-box'), r = RT.route; if (!box) return;
    if (!r || !r.line || r.line.length < 2) { box.hidden = true; return; }
    var key = lineKey(r.line);
    if (RT.natCache[key]) { drawNature(RT.natCache[key]); return; }
    box.hidden = false; box.innerHTML = '<h4>Nature du parcours</h4><small>Analyse des types de voies…</small>';
    var pts = G.resample(r.line, Math.max(20, Math.min(1600, Math.round(G.pathLength(r.line) / 30)))), kx = Math.cos(pts[0].lat * Math.PI / 180) || 1;
    var CELL = 0.03, cells = {};
    pts.forEach(function (q, i) { var k = Math.floor(q.lat / CELL) + '|' + Math.floor(q.lon / CELL); (cells[k] = cells[k] || []).push(i); });
    var keys = Object.keys(cells); if (keys.length > 14) { box.hidden = true; return; }     // parcours trop long : pas d'analyse (limite le nombre de requêtes)
    var cat = new Array(pts.length), dirs = (r.directs || []).map(function (u) { return r.line.slice(u.from, u.to + 1); });
    function mdist(px, py, ax, ay, bx, by) { var dx = bx - ax, dy = by - ay, t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0; return Math.hypot(ax + t * dx - px, ay + t * dy - py); }
    Promise.all(keys.map(function (k) {
      var a = k.split('|').map(Number), la0 = a[0] * CELL - 0.0006, lo0 = a[1] * CELL - 0.0006, la1 = (a[0] + 1) * CELL + 0.0006, lo1 = (a[1] + 1) * CELL + 0.0006;
      var url = GP + '/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=BDTOPO_V3:troncon_de_route&OUTPUTFORMAT=application/json&COUNT=3000&PROPERTYNAME=nature,geometrie&BBOX=' + [lo0, la0, lo1, la1].join(',') + ',EPSG:4326';
      return fetch(url).then(function (x) { if (!x.ok) throw new Error('WFS'); return x.json(); }).then(function (j) {
        var segs = [];
        (j.features || []).forEach(function (f) {
          var g = f.geometry; if (!g) return; var grp = natGroup(f.properties && f.properties.nature), lines = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
          lines.forEach(function (ln) { for (var i = 0; i + 1 < ln.length; i++) segs.push([ln[i][0] * 111320 * kx, ln[i][1] * 110540, ln[i + 1][0] * 111320 * kx, ln[i + 1][1] * 110540, grp]); });
        });
        cells[k].forEach(function (pi) {
          var q = pts[pi], px = q.lon * 111320 * kx, py = q.lat * 110540, best = 28, g2 = 'Autre voie';
          var inDirect = dirs.some(function (d) { for (var m = 0; m + 1 < d.length; m++) if (mdist(px, py, d[m][1] * 111320 * kx, d[m][0] * 110540, d[m + 1][1] * 111320 * kx, d[m + 1][0] * 110540) < 4) return true; return false; });
          if (inDirect) { cat[pi] = 'Ligne droite (hors voie)'; return; }
          segs.forEach(function (sg) { var d = mdist(px, py, sg[0], sg[1], sg[2], sg[3]); if (d < best) { best = d; g2 = sg[4]; } });
          cat[pi] = g2;
        });
      });
    })).then(function () {
      var tot = {}, len = 0;
      for (var i = 1; i < pts.length; i++) { var dd = pts[i].d - pts[i - 1].d, c = cat[i] || cat[i - 1] || 'Autre voie'; tot[c] = (tot[c] || 0) + dd; len += dd; }
      RT.natCache[key] = { tot: tot, len: len }; if (RT.route && lineKey(RT.route.line) === key) drawNature(RT.natCache[key]);
    }).catch(function () { var b = $('#nature-box'); if (b) b.hidden = true; });
  }
  function drawNature(n) {
    var box = $('#nature-box'); if (!box) return;
    var items = NATGRP.filter(function (g) { return n.tot[g[0]] > 0; });
    if (!items.length || !n.len) { box.hidden = true; return; }
    box.innerHTML = '<h4>Nature du parcours</h4><div class="natbar" role="img" aria-label="Répartition des types de voies">' + items.map(function (g) { return '<i style="width:' + (n.tot[g[0]] / n.len * 100).toFixed(1) + '%;background:' + g[1] + '" title="' + esc(g[0]) + '"></i>'; }).join('') + '</div><ul class="natleg">' +
      items.map(function (g) { return '<li><i style="background:' + g[1] + '"></i>' + esc(g[0]) + '<b>' + G.fmtDist(n.tot[g[0]]) + ' · ' + Math.round(n.tot[g[0]] / n.len * 100) + ' %</b></li>'; }).join('') + '</ul><small>Source : BD TOPO de l’IGN, au plus près du tracé (indicatif).</small>';
    box.hidden = false;
  }
  function renderGauge() {
    var g = $('#gauge'), on = S.route.maxOn && S.route.maxKm > 0;
    g.hidden = !on; if (!on) { setNote('max', ''); return; }
    var mx = S.route.maxKm * 1000, r = RT.route, d = r ? r.dist : 0, over = d > mx;
    g.classList.toggle('over', over);
    setNote('max', over ? 'Distance maximale dépassée de ' + G.fmtDist(d - mx) + ' (' + G.fmtDist(d) + ' pour ' + G.fmtDist(mx) + ') : le tracé reste modifiable.' : '', 'bad');
    $('#gauge-fill').style.width = Math.min(100, d / mx * 100) + '%';
    $('#gauge-txt').innerHTML = r
      ? 'Distance réelle <b>' + G.fmtDist(d) + '</b> sur ' + G.fmtDist(mx) + ' maximum · ' + (over ? '<b>dépassement de ' + G.fmtDist(d - mx) + '</b>' : 'il reste ' + G.fmtDist(mx - d))
      : 'Distance maximale : ' + G.fmtDist(mx) + '. Tracez l’itinéraire pour voir la distance réelle.';
  }
  function renderNatWarn() {
    var r = RT.route;
    setNote('nat', r && S.route.flagNat && r.nat && r.nat.length ? 'Le tracé semble emprunter ' + r.nat.map(function (n) { return (n.label === 'nationale' ? 'une route nationale' : 'la ' + n.label) + ' (≈ ' + G.fmtDist(n.dist) + ')'; }).join(', ') + '. Déplacez un repère pour l’éviter si besoin.' : '', 'warn');
    setNote('off', r && r.off ? 'Dont ' + G.fmtDist(r.off) + ' à vol d’oiseau (en pointillés) entre des points hors sentier et le chemin le plus proche.' : '', 'warn');
    setNote('tunnel', r && r.tunnel ? 'Un passage en tunnel est inévitable sur ce tracé (aucun autre chemin trouvé) : à vérifier sur place.' : '', 'warn');
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
      var m = L.marker(p, { draggable: !EDITLOCK, icon: pin(String(i + 1), 'az', i === 0 && closable ? 'closable' : ''), zIndexOffset: 900 }).addTo(gAz);
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
    return;   // la fonction Mesures a été retirée de l'interface
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
        var base = file.name.replace(/\.(gpx|kml|geojson|json)$/i, ''), res = /\.(geojson|json)$/i.test(file.name) ? G.parseGeoJson(fr.result, base) : /\.kml$/i.test(file.name) ? G.parseKml(fr.result, base) : G.parseGpx(fr.result, base);
        if (!res.tracks.length && !res.wpts.length) { toast('Aucune trace ni point dans ce fichier.'); return; }
        var added = [];
        res.tracks.forEach(function (t, i) {
          var tr = { id: Date.now() + i, name: t.name, coords: t.coords, ele: t.ele, color: palette[(S.tracks.length + i) % palette.length], show: true, wpts: i === 0 ? res.wpts : [] };
          S.tracks.push(tr); added.push(tr);
        });
        if (!res.tracks.length) S.tracks.push({ id: Date.now(), name: base + ' (points)', coords: res.wpts.map(function (w) { return [w.lat, w.lon]; }), color: palette[0], show: true, wpts: res.wpts });
        renderTracks();
        var b = L.latLngBounds([]); (added.length ? added : S.tracks.slice(-1)).forEach(function (t) { t.coords.forEach(function (c) { b.extend(c); }); });
        if (b.isValid()) fit(b, { padding: [60, 60] });
        if (added[0]) { S.profileSrc = 't' + added[0].id; refreshProfile(); }
        toast((res.tracks.length || 1) + ' trace(s) importée(s) (affichée(s) sur l’onglet Itinéraire).'); persist();
      } catch (e) { toast(e.message || 'Import impossible.'); }
    };
    fr.readAsText(file);
  }
  $('#file-gpx').addEventListener('change', function () { openFiles(this.files); this.value = ''; });
  (function dropGpx() {
    var dz = document.body;
    window.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); dz.classList.add('over'); } });
    window.addEventListener('dragleave', function (e) { if (!e.relatedTarget) dz.classList.remove('over'); });
    window.addEventListener('drop', function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault(); dz.classList.remove('over');
      openFiles(e.dataTransfer.files);
    });
  })();


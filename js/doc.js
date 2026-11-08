/* ScoutMap : feuilles de route (simplifiée / détaillée) et cartes à l'échelle, éditables avant impression ou PDF. */
(function () {
  'use strict';
  var SM = window.SM, S = SM.S, RT = SM.RT, G = SM.G, esc = SM.esc, ic = SM.ic;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var MM = 96 / 25.4;                       // pixels CSS par millimètre
  var PAPER = { A4: [210, 297], A3: [297, 420] };
  var docMaps = [], origTitle = document.title;

  function today() { return new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' }); }
  function hasRoute() { return !!RT.route; }
  function hasAz() { return S.az.pts.length > 1; }
  function anyLayer() { return hasRoute() || hasAz() || S.meas.pts.length > 1 || S.tracks.some(function (t) { return t.show !== false; }); }

  // ---------- Boîte de dialogue ----------
  function curType() { var r = $('input[name=dtype]:checked'); return r ? r.value : 'detail'; }
  function syncDialog() {
    var t = curType(), map = t === 'map';
    $('#pdf-scale-row').hidden = !map;
    $('#pdf-overview-row').hidden = map; $('#pdf-profile-row').hidden = map;
    $('#pdf-az-row').hidden = map || !hasAz(); $('#pdf-notes-row').hidden = map;
    $('#pdf-profile-row').hidden = map || !hasRoute();
    $('#pdf-overview-row').hidden = map || !(hasRoute() || hasAz());
    if (!$('#pdf-title').dataset.touched) $('#pdf-title').value = S.name || (map ? 'Carte' : 'Feuille de route');
    if (map) $('#pdf-orient').value = $('#pdf-orient').dataset.user ? $('#pdf-orient').value : 'landscape';
  }
  function fillScales() {
    var cur = SM.niceScale(SM.curScale());
    var o = '<option value="view">Vue actuelle (1 : ' + SM.sp(cur) + ')</option>';
    if (anyLayer()) o += '<option value="fit">Ajuster à l’itinéraire et aux calques</option>';
    SM.SCALES.slice(0, 9).forEach(function (s) { o += '<option value="' + s + '">1 : ' + SM.sp(s) + '</option>'; });
    $('#pdf-scale').innerHTML = o;
  }
  function openPdf(type) {
    var sheetOk = hasRoute() || hasAz();
    var radios = $$('input[name=dtype]');
    radios.forEach(function (r) { r.closest('.doc-type').classList.toggle('dis', r.value !== 'map' && !sheetOk); });
    var t = type || (hasRoute() ? 'detail' : sheetOk ? 'simple' : 'map');
    if (t !== 'map' && !sheetOk) t = 'map';
    radios.forEach(function (r) { r.checked = r.value === t; });
    $('#pdf-title').dataset.touched = ''; $('#pdf-orient').dataset.user = '';
    fillScales(); syncDialog();
    var d = $('#dlg-pdf'); if (!d.open) d.showModal();
  }
  $$('input[name=dtype]').forEach(function (r) { r.addEventListener('change', syncDialog); });
  $('#pdf-title').addEventListener('input', function () { this.dataset.touched = '1'; });
  $('#pdf-orient').addEventListener('change', function () { this.dataset.user = '1'; });
  $('#pdf-cancel').addEventListener('click', function () { $('#dlg-pdf').close(); });
  $('#pdf-ok').addEventListener('click', function () {
    var c = {
      type: curType(), title: $('#pdf-title').value.trim() || 'Itinéraire', paper: $('#pdf-paper').value, orient: $('#pdf-orient').value,
      scale: $('#pdf-scale').value, overview: $('#pdf-overview').checked && !$('#pdf-overview-row').hidden,
      profile: $('#pdf-profile').checked && !$('#pdf-profile-row').hidden, az: $('#pdf-az').checked && !$('#pdf-az-row').hidden,
      notes: $('#pdf-notes').checked
    };
    $('#dlg-pdf').close();
    buildDoc(c);
  });

  // ---------- Cartes statiques (aperçu et impression) ----------
  function closeMaps() { docMaps.forEach(function (m) { try { m.remove(); } catch (e) { /* déjà retirée */ } }); docMaps = []; }
  function makeMap(el, wpx, hpx, off) {
    el.style.width = wpx + 'px'; el.style.height = hpx + 'px';
    var m = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
      keyboard: false, touchZoom: false, tap: false, zoomSnap: 0, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, maxZoom: 19, minZoom: 3 });
    m._ready = new Promise(function (res) {
      var base = SM.tile(S.base, off, { keepBuffer: 4 }).addTo(m), done = false;
      function fin() { if (!done) { done = true; res(); } }
      base.once('load', fin); setTimeout(fin, 12000);
      ['contour', 'shade', 'slope', 'cadastre'].forEach(function (k) { if (S.ov[k]) SM.tile(k, off).addTo(m); });
    });
    docMaps.push(m); return m;
  }
  function drawLayers(m) {
    var over = SM.overMax(), pts = [], w = S.route.wps, n = w.length;
    if (S.vis.meas !== false && S.meas.pts.length > 1) {
      (S.meas.mode === 'area' && S.meas.pts.length > 2 ? L.polygon(S.meas.pts, { color: '#000761', weight: 3, fillColor: '#c6a24e', fillOpacity: .25, dashArray: '2 6' }) : L.polyline(S.meas.pts, { color: '#000761', weight: 3, dashArray: '2 6' })).addTo(m);
      S.meas.pts.forEach(function (p) { pts.push(p); });
    }
    S.tracks.forEach(function (t) { if (t.show === false) return; L.polyline(t.coords, { color: '#fff', weight: 7, opacity: .85 }).addTo(m); L.polyline(t.coords, { color: t.color, weight: 4 }).addTo(m); t.coords.forEach(function (c) { pts.push(c); }); });
    if (S.vis.az !== false && hasAz()) {
      L.polyline(S.az.pts, { color: '#c6a24e', weight: 4, dashArray: '10 6' }).addTo(m);
      S.az.pts.forEach(function (p, i) { L.marker(p, { icon: SM.pin(String(i + 1), 'az'), interactive: false }).addTo(m); pts.push(p); });
    }
    if (S.vis.route !== false && RT.route) {
      L.polyline(RT.route.line, { color: '#fff', weight: 9, opacity: .9, lineCap: 'round', lineJoin: 'round' }).addTo(m);
      L.polyline(RT.route.line, { color: over ? '#c0262d' : '#000761', weight: 5, lineCap: 'round', lineJoin: 'round' }).addTo(m);
      RT.route.line.forEach(function (p) { pts.push(p); });
      w.forEach(function (p, i) { L.marker([p.lat, p.lon], { icon: SM.pin(SM.wpLabel(i, n), SM.wpClass(i, n)), interactive: false, zIndexOffset: 1000 }).addTo(m); });
    }
    return pts;
  }
  function boundsOf(pts) { return pts.length ? L.latLngBounds(pts.map(SM.ll)) : null; }

  // ---------- Données de l'itinéraire ----------
  function altAt(prof, d) {
    var p = prof.pts, i = 0; d = Math.max(0, Math.min(p[p.length - 1].d, d));
    while (i < p.length - 1 && p[i + 1].d < d) i++;
    var a = p[i], b = p[Math.min(i + 1, p.length - 1)], q = b.d > a.d ? (d - a.d) / (b.d - a.d) : 0;
    return a.z + (b.z - a.z) * q;
  }
  function stepsTable(prof) {
    var r = RT.route, n = S.route.wps.length, loop = SM.isLoop(), cum = 0, rows = [];
    var ratio = prof ? prof.pts[prof.pts.length - 1].d / (r.dist || 1) : 1;
    function row(idx, leg) {
      var w = S.route.wps[idx >= n ? 0 : idx], isEnd = idx >= n || (idx === n - 1 && !loop);
      var lab = idx >= n ? 'A' : SM.wpLabel(idx, n);
      rows.push({ lab: lab, cls: idx === 0 ? 'start' : isEnd ? 'end' : 'via', name: SM.wpName(idx >= n ? 0 : idx) + (idx >= n ? ' (retour)' : ''), coord: G.formatCoord('wgs', w.lat, w.lon), leg: leg, cum: cum,
        alt: prof ? altAt(prof, cum * ratio) : null, d: cum * ratio });
    }
    row(0, 0);
    r.portions.forEach(function (p, pi) { cum += p.distance; row(pi + 1, p.distance); });
    return rows;
  }
  function azTable() {
    var a = SM.azParams(), cum = 0;
    return S.az.pts.slice(1).map(function (q, i) {
      var p = S.az.pts[i], t = G.bearing(p, q), d = G.haversine(p, q); cum += d;
      return '<tr><td>' + (i + 1) + ' → ' + (i + 2) + '</td><td class="r"><b>' + G.fmtAz(G.trueToUnit(t, a.unit, a.ref, a.decl), a.unit) + '</b></td><td class="r">' +
        G.fmtAz(G.trueToUnit((t + 180) % 360, a.unit, a.ref, a.decl), a.unit) + '</td><td class="r">' + G.fmtDist(d) + '</td><td class="r">' + G.fmtDist(cum) + '</td></tr>';
    }).join('');
  }

  // ---------- Construction du document ----------
  function kpi(l, v, cls) { return '<div' + (cls ? ' class="' + cls + '"' : '') + '><span>' + l + '</span><b>' + v + '</b></div>'; }
  function head(c, sub) {
    return '<header class="d-head"><img src="assets/fsggb.png" alt=""><div><h1>' + esc(c.title) + '</h1><p class="d-sub">' + sub + '</p></div>' +
      '<div class="d-tag">ScoutMap<br>FSGGB</div></header>';
  }
  function foot() { return '<footer class="d-foot"><span>Document établi avec ScoutMap – FSGGB le ' + today() + '</span><span>Fonds © IGN – Géoplateforme</span></footer>'; }

  function buildDoc(c) {
    closeMaps();
    var P = PAPER[c.paper], pw = c.orient === 'landscape' ? P[1] : P[0], ph = c.orient === 'landscape' ? P[0] : P[1], pm = 10;
    var cw = pw - 2 * pm, chh = ph - 2 * pm;
    $('#page-style').textContent = '@page{size:' + c.paper + ' ' + c.orient + ';margin:' + pm + 'mm}';
    var pages = $('#doc-pages');
    pages.innerHTML = '<article class="sheet" id="sheet" contenteditable="true" spellcheck="false" style="--pw:' + pw + 'mm;--ph:' + ph + 'mm;--pm:' + pm + 'mm"></article>';
    var sheet = $('#sheet');
    $('#doc').hidden = false; document.body.classList.add('doc-open'); $('.doc-scroll').scrollTop = 0;
    origTitle = origTitle || document.title;
    setBusy(true);
    var jobs = [];
    if (c.type === 'map') jobs.push(buildMapDoc(c, sheet, cw, chh)); else jobs.push(buildSheetDoc(c, sheet, cw));
    Promise.all(jobs).then(function () {
      return Promise.all(docMaps.map(function (m) { return m._ready; }));
    }).then(function () { setBusy(false); }).catch(function (e) { setBusy(false); SM.toast(e && e.message || 'Document incomplet.'); });
  }
  function setBusy(b) {
    var btn = $('#doc-print'); btn.disabled = b;
    btn.innerHTML = b ? 'Chargement des cartes…' : ic('printer') + 'Imprimer / Enregistrer en PDF';
  }

  function buildMapDoc(c, sheet, cw, chh) {
    var off = Math.max(2, S.detail);
    var mapH = Math.floor(chh - 34), id = 'dmap';
    sheet.innerHTML = '<div class="d-head-wrap"></div><div class="d-mapfull"><div class="d-mapbox" id="' + id + '" contenteditable="false"></div></div>' + '<div class="d-foot-wrap"></div>';
    var el = $('#' + id), m = makeMap(el, Math.floor(cw * MM), Math.floor(mapH * MM), off);
    var pts = drawLayers(m), bounds = boundsOf(pts), center, scale;
    if (c.scale === 'fit' && bounds) {
      var cc = bounds.getCenter(); m.setView(cc, 10, { animate: false });
      var bz = m.getBoundsZoom(bounds, false, L.point(24, 24)); scale = null;
      for (var i = 0; i < SM.SCALES.length; i++) if (SM.zoomFor(SM.SCALES[i], cc.lat) <= bz + 1e-6) { scale = SM.SCALES[i]; break; }
      center = cc;
      if (!scale) { m.fitBounds(bounds, { animate: false, padding: [24, 24] }); scale = SM.niceScale(SM.scaleAt(m.getZoom(), cc.lat)); }
    } else if (c.scale === 'view' || !c.scale) { center = SM.map.getCenter(); scale = SM.niceScale(SM.curScale()); }
    else { center = SM.map.getCenter(); scale = +c.scale; }
    if (c.scale === 'view' && bounds === null) center = SM.map.getCenter();
    m.setView(center, SM.zoomFor(scale, center.lat), { animate: false });
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(m);
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(m);
    var lab = document.createElement('div'); lab.className = 'd-scale'; lab.textContent = 'Échelle 1 : ' + SM.sp(scale); el.appendChild(lab);
    sheet.querySelector('.d-head-wrap').outerHTML = head(c, 'Carte à l’échelle 1 : ' + SM.sp(scale) + ' · ' + today() + ' · imprimer à 100 % (sans « ajuster à la page »)');
    sheet.querySelector('.d-foot-wrap').outerHTML = foot();
    return Promise.resolve();
  }

  function buildSheetDoc(c, sheet, cw) {
    var detail = c.type === 'detail', r = RT.route, loop = SM.isLoop(), h = '';
    var prof = r ? SM.profileFor(r.line) : Promise.resolve(null);
    return prof.then(function (p) {
      var sub = [];
      if (r) { sub.push('À pied'); sub.push(loop ? 'Boucle' : 'Aller simple'); } else sub.push('Azimuts');
      sub.push(today());
      h += head(c, esc(sub.join(' · ')));
      var over = SM.overMax(), rows = r ? stepsTable(p) : [];
      if (r) {
        h += '<section class="d-kpis">' + kpi('Distance', G.fmtDist(r.dist), over ? 'over' : '') + (p ? kpi('Dénivelé positif', '+ ' + Math.round(p.asc) + ' m') : '');
        if (detail) {
          if (p) h += kpi('Dénivelé négatif', '− ' + Math.round(p.desc) + ' m') + kpi('Altitude', Math.round(p.min) + ' – ' + Math.round(p.max) + ' m');
          h += kpi('Durée de marche', G.fmtDur(((r.dist / 1000) / S.speed + (p ? p.asc / 400 : 0)) * 3600)) + kpi('Étapes', String(rows.length));
        } else h += kpi('Étapes', String(rows.length));
        h += '</section>';
        if (over) h += '<p class="d-alert">Distance maximale dépassée : ' + G.fmtDist(r.dist) + ' pour ' + G.fmtDist(S.route.maxKm * 1000) + ' prévus (+ ' + G.fmtDist(r.dist - S.route.maxKm * 1000) + ').</p>';
        else if (S.route.maxOn && S.route.maxKm > 0) h += '<p class="d-note">Distance maximale prévue : ' + G.fmtDist(S.route.maxKm * 1000) + '.</p>';
        if (detail && S.route.flagNat && r.nat && r.nat.length) h += '<p class="d-warn">Attention : le tracé semble emprunter ' + r.nat.map(function (n) { return n.label === 'nationale' ? 'une route nationale' : 'la ' + esc(n.label); }).join(', ') + '.</p>';
      } else if (hasAz()) {
        h += '<section class="d-kpis">' + kpi('Parcours', G.fmtDist(G.pathLength(S.az.pts))) + kpi('Points', String(S.az.pts.length)) + '</section>';
      }
      if (c.overview && (r || hasAz())) h += '<section class="d-sec"><h2>Vue d’ensemble</h2><div class="d-mapbox" id="dov" contenteditable="false"></div></section>';
      if (c.profile && p) h += '<section class="d-sec"><h2>Profil d’altitude</h2><div class="d-svgbox" id="dprof" contenteditable="false"><svg id="dsvg"></svg></div><p class="d-note">Distance en abscisse, altitude en ordonnée (source : altimétrie IGN, tracé lissé).</p></section>';
      if (r) {
        h += '<section class="d-sec"><h2>Étapes</h2><table class="d-tbl"><thead><tr><th>Point</th><th>Lieu</th>' + (detail ? '<th class="r">Alt.</th>' : '') + '<th class="r">Depuis le précédent</th><th class="r">Cumul</th></tr></thead><tbody>' +
          rows.map(function (x) {
            return '<tr><td><b>' + esc(x.lab) + '</b></td><td>' + esc(x.name) + '<br><span class="d-note" style="margin:0">' + esc(x.coord) + '</span></td>' + (detail ? '<td class="r">' + (x.alt == null ? '–' : Math.round(x.alt) + ' m') + '</td>' : '') +
              '<td class="r">' + (x.leg ? G.fmtDist(x.leg) : '–') + '</td><td class="r">' + (x.cum ? G.fmtDist(x.cum) : '–') + '</td></tr>';
          }).join('') + '</tbody></table></section>';
        if (detail) {
          h += '<section class="d-sec"><h2>Consignes de guidage</h2>';
          r.portions.forEach(function (po, pi) {
            var a = rows[pi], b = rows[pi + 1];
            h += '<p class="d-leg">' + esc(a.lab) + ' ' + esc(a.name) + ' → ' + esc(b.lab) + ' ' + esc(b.name) + ' · ' + G.fmtDist(po.distance) + '</p><ul class="d-steps">';
            (po.steps || []).forEach(function (s) { var nm = SM.stepName(s); h += '<li><span>' + esc(SM.stepText(s)) + (nm ? ' <i>' + esc(nm) + '</i>' : '') + '</span><b>' + (s.distance > 0 ? G.fmtDist(s.distance) : '') + '</b></li>'; });
            h += '</ul>';
          });
          h += '</section>';
        }
      }
      if (c.az && hasAz()) {
        var a = SM.azParams();
        h += '<section class="d-sec"><h2>Azimuts</h2><p class="d-note" style="margin:0 0 4px">' + (a.ref === 'mag' ? 'Nord magnétique, déclinaison ' + a.decl + '°' : 'Nord géographique') + ' · unité : ' + { deg: 'degrés', grd: 'grades', mil: 'millièmes' }[a.unit] + '</p>' +
          '<table class="d-tbl"><thead><tr><th>Segment</th><th class="r">Azimut</th><th class="r">Contre-azimut</th><th class="r">Distance</th><th class="r">Cumul</th></tr></thead><tbody>' + azTable() + '</tbody></table></section>';
      }
      if (c.notes) h += '<section class="d-sec d-notes"><h2>Notes</h2><div class="lines"><br><br><br><br></div></section>';
      h += foot();
      sheet.innerHTML = h;

      var ov = $('#dov');
      if (ov) {
        var cwpx = Math.floor(cw * MM), m = makeMap(ov, cwpx, Math.round(Math.min(cwpx * 0.42, (detail ? 80 : 68) * MM)), Math.max(1, S.detail));
        var pts = drawLayers(m), b = boundsOf(pts);
        if (b) m.fitBounds(b, { animate: false, padding: [30, 30], maxZoom: 16 }); else m.setView(SM.map.getCenter(), SM.map.getZoom(), { animate: false });
        L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(m);
      }
      var sv = $('#dsvg');
      if (sv && p) {
        var wpx = Math.floor(cw * MM), hpx = Math.round((detail ? 46 : 38) * MM), marks = rows.length <= 14 ? rows.map(function (x) { return { d: x.d, z: x.alt == null ? 0 : x.alt, t: x.lab, c: x.cls === 'start' ? '#1a7f37' : x.cls === 'end' ? '#b4232c' : '#000761' }; }) : [];
        sv.setAttribute('width', wpx); sv.setAttribute('height', hpx);
        SM.renderProfileSvg(sv, p, wpx, hpx, 'dpg', marks);
      }
    });
  }

  // ---------- Barre d'aperçu ----------
  function closeDoc() {
    closeMaps(); $('#doc').hidden = true; document.body.classList.remove('doc-open'); document.title = origTitle;
    setTimeout(function () { SM.map.invalidateSize(); }, 50);
  }
  $('#doc-back').addEventListener('click', closeDoc);
  $('#doc-print').addEventListener('click', function () {
    var h1 = $('#sheet h1'); origTitle = origTitle || document.title;
    document.title = (h1 && h1.textContent.trim()) || 'ScoutMap';
    setTimeout(function () { window.print(); }, 60);
  });
  window.addEventListener('afterprint', function () { document.title = 'ScoutMap'; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('doc-open') && !e.target.isContentEditable) closeDoc(); });

  SM.openPdf = openPdf;
})();

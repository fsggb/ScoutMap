/* ScoutMap : feuilles de route (simplifiée / détaillée) et cartes à l'échelle, éditables avant impression ou PDF. */
(function () {
  'use strict';
  var SM = window.SM, S = SM.S, G = SM.G, esc = SM.esc, ic = SM.ic;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var MM = 96 / 25.4;                       // pixels CSS par millimètre
  var PAPER = { A4: [210, 297], A3: [297, 420] };
  var FIT_SCALES = [2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000];
  var docMaps = [], origTitle = document.title;

  function today() { return new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' }); }

  // ---------- Calques imprimables ----------
  var TYPE_LABEL = { route: 'Itinéraire', az: 'Azimuts', meas: 'Mesure', game: 'Grand jeu', track: 'Trace GPX' };
  function pickables() {
    var out = SM.layersList().filter(function (l) { return !l.empty; }).map(function (l) {
      return { key: l.key, type: l.type, name: l.name, color: l.color, vis: l.vis, active: l.active, data: l.data, res: l.res };
    });
    if (S.mode === 'route') S.tracks.forEach(function (t) { out.push({ key: 't' + t.id, type: 'track', name: t.name, color: t.color, vis: t.show !== false, active: false, data: t, res: null }); });
    return out;
  }
  function sheetCapable(p) { return p.type === 'route' || p.type === 'az'; }
  function curType() { var r = $('input[name=dtype]:checked'); return r ? r.value : 'detail'; }
  function renderPick() {
    var t = curType(), list = pickables(), sheets = t === 'simple' || t === 'detail';
    var hasActiveRoute = list.some(function (p) { return p.type === 'route' && p.active; });
    $('#pdf-layers').innerHTML = list.length ? list.map(function (p) {
      var ok = !sheets || sheetCapable(p);
      var on = ok && (sheets ? (p.active && (p.type === 'route' || p.type === 'az')) || (!hasActiveRoute && p.type === 'route' && p === list.filter(function (x) { return x.type === 'route'; })[0]) : p.vis);
      return '<label class="' + (ok ? '' : 'dis') + '"><input type="checkbox" value="' + esc(p.key) + '"' + (on ? ' checked' : '') + (ok ? '' : ' disabled') + '><span class="lsw" style="background:' + p.color + '"></span><span>' + esc(p.name) + ' <small>' + TYPE_LABEL[p.type] + '</small></span></label>';
    }).join('') : '<span class="muted">Aucun calque : tracez d’abord un itinéraire, des azimuts…</span>';
  }
  function chosen() {
    var keys = $$('#pdf-layers input:checked').map(function (i) { return i.value; });
    return pickables().filter(function (p) { return keys.indexOf(p.key) >= 0; });
  }
  function syncDialog() {
    var t = curType(), map = t === 'map', tiles = t === 'tiles', sheet = !map && !tiles, list = pickables();
    $('#pdf-scale-row').hidden = !map; $('#pdf-tiles-opts').hidden = !tiles;
    $('#pdf-az-row').hidden = true;
    $('#pdf-overview-row').hidden = !sheet; $('#pdf-profile-row').hidden = !sheet; $('#pdf-notes-row').hidden = !sheet;
    renderPick();
    if (!$('#pdf-title').dataset.touched) $('#pdf-title').value = '';
    var or = $('#pdf-orient');
    $$('option', or).forEach(function (o) { if (o.value === 'auto') o.disabled = !tiles; });
    if (!or.dataset.user) or.value = tiles ? 'auto' : (map ? 'landscape' : 'portrait'); else if (!tiles && or.value === 'auto') or.value = 'portrait';
    $('#pdf-ok').disabled = !list.length;
    updateTilesSummary();
  }
  function fillScales() {
    var cur = SM.niceScale(SM.curScale());
    var o = '<option value="view">Vue actuelle (1 : ' + SM.sp(cur) + ')</option><option value="fit">Ajuster aux calques choisis</option>';
    SM.SCALES.forEach(function (s) { o += '<option value="' + s + '">1 : ' + SM.sp(s) + '</option>'; });
    $('#pdf-scale').innerHTML = o;
  }
  function openPdf(type) {
    var list = pickables(), sheetOk = list.some(sheetCapable);
    var radios = $$('input[name=dtype]');
    radios.forEach(function (r) { r.closest('.doc-type').classList.toggle('dis', (r.value === 'simple' || r.value === 'detail') && !sheetOk); });
    var t = type || (sheetOk ? 'simple' : 'map');
    if ((t === 'simple' || t === 'detail') && !sheetOk) t = 'map';
    radios.forEach(function (r) { r.checked = r.value === t; });
    $('#pdf-title').dataset.touched = ''; $('#pdf-orient').dataset.user = '';
    fillScales(); if (S.mode === 'game' && $('#pdf-scale option[value=fit]')) $('#pdf-scale').value = 'fit';
    syncDialog();
    var d = $('#dlg-pdf'); if (!d.open) d.showModal();
  }
  $$('input[name=dtype]').forEach(function (r) { r.addEventListener('change', syncDialog); });
  $('#pdf-title').addEventListener('input', function () { this.dataset.touched = '1'; });
  $('#pdf-orient').addEventListener('change', function () { this.dataset.user = '1'; });
  $('#pdf-cancel').addEventListener('click', function () { $('#dlg-pdf').close(); });
  $('#pdf-all').addEventListener('click', function () { $$('#pdf-layers input:not(:disabled)').forEach(function (i) { i.checked = true; }); });
  $('#pdf-none').addEventListener('click', function () { $$('#pdf-layers input').forEach(function (i) { i.checked = false; }); });
  $('#pdf-ok').addEventListener('click', function () {
    var items = chosen();
    if (!items.length) { SM.toast('Cochez au moins un calque à imprimer.'); return; }
    var c = {
      tiles: tilesParams(), type: curType(), title: $('#pdf-title').value.trim(), paper: $('#pdf-paper').value, orient: $('#pdf-orient').value,
      scale: $('#pdf-scale').value, overview: $('#pdf-overview').checked, profile: $('#pdf-profile').checked, notes: $('#pdf-notes').checked, items: items
    };
    $('#dlg-pdf').close();
    buildDoc(c);
  });

  // ---------- Carte du parcours sur plusieurs feuilles ----------
  // Lignes à couvrir : le tracé de chaque calque (et, pour un grand jeu, toute l'emprise du dessin).
  function geomLines(items) {
    var out = [];
    items.forEach(function (it) {
      var d = it.data;
      if (it.type === 'route') out.push(it.res ? it.res.line : d.wps.map(function (w) { return [w.lat, w.lon]; }));
      else if (it.type === 'track') out.push(d.coords);
      else if (it.type === 'az' || it.type === 'meas') out.push(d.pts);
      else if (it.type === 'game' && SM.game) {
        var pts = SM.game.points(d); if (!pts.length) return;
        var la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
        pts.forEach(function (p) { la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]); });
        for (var la = la0; la <= la1 + 0.0009; la += 0.0018) out.push([[la, lo0], [la, lo1]]);   // balayage : tout le dessin est couvert
      }
    });
    return out.filter(function (l) { return l && l.length; });
  }
  function tilesParams() {
    function num(id, d) { var v = parseFloat($(id).value); return isFinite(v) ? v : d; }
    return { scale: +$('#pdf-tscale').value || 25000, corridor: num('#pdf-corridor', 6), margin: num('#pdf-margin', 8), overlap: num('#pdf-overlap', 10),
      sharp: $('#pdf-sharp').value, index: $('#pdf-index').checked, paper: $('#pdf-paper').value, orient: $('#pdf-orient').value === 'auto' ? 'auto' : $('#pdf-orient').value };
  }
  function tilesPlan(items, prm) {
    if (!window.Paginate) return null;
    return Paginate.plan({ lines: geomLines(items), scale: prm.scale, paper: PAPER[prm.paper], orient: prm.orient, margin: prm.margin, overlap: prm.overlap, corridor: prm.corridor });
  }
  function updateTilesSummary() {
    if (curType() !== 'tiles') return;
    var box = $('#pdf-tiles-sum'), note = $('#pdf-tiles-note'), items = chosen(), prm = tilesParams();
    if (!items.length) { box.textContent = 'Cochez un calque contenant un tracé.'; box.className = 'alert warn'; note.textContent = ''; return; }
    var pl = tilesPlan(items, prm);
    if (!pl) { box.textContent = 'Aucun tracé dans les calques choisis.'; box.className = 'alert warn'; note.textContent = ''; return; }
    var n = pl.pages.length, other = pl.orient === 'landscape' ? 'portrait' : 'paysage', alt = pl.counts[pl.orient === 'landscape' ? 'portrait' : 'landscape'];
    box.className = 'alert ' + (n > 40 ? 'bad' : 'ok');
    box.innerHTML = '<b>' + n + ' feuille' + (n > 1 ? 's' : '') + ' ' + prm.paper + ' en ' + (pl.orient === 'landscape' ? 'paysage' : 'portrait') + '</b>' +
      (prm.orient === 'auto' && alt != null ? ' <span>(' + other + ' : ' + alt + ')</span>' : '') + (prm.index ? ' + 1 feuille d’assemblage' : '') +
      (n > 40 ? '<br>Beaucoup de feuilles : choisissez une échelle plus petite.' : '');
    var km = function (mmv) { return (mmv * prm.scale / 1e6).toFixed(1).replace('.', ','); };
    note.textContent = 'Une feuille couvre ' + km(pl.widthMm) + ' × ' + km(pl.heightMm) + ' km à cette échelle. Le centre d’une boucle n’est pas imprimé.' +
      (SM.LAYERS[S.base].ign ? '' : ' Le fond « ' + SM.LAYERS[S.base].label + ' » est remplacé par le Plan IGN pour cette impression (les serveurs OpenStreetMap interdisent le téléchargement en masse).');
  }
  ['#pdf-tscale', '#pdf-corridor', '#pdf-margin', '#pdf-overlap', '#pdf-paper', '#pdf-orient', '#pdf-index', '#pdf-sharp'].forEach(function (id) {
    $(id).addEventListener('input', updateTilesSummary); $(id).addEventListener('change', updateTilesSummary);
  });
  $('#pdf-layers').addEventListener('change', updateTilesSummary);

  // ---------- Cartes statiques (aperçu et impression) ----------
  function closeMaps() { docMaps.forEach(function (m) { try { m.remove(); } catch (e) { /* déjà retirée */ } }); docMaps = []; }
  function makeMap(el, wpx, hpx, off, o) {
    o = o || {};
    el.style.width = wpx + 'px'; el.style.height = hpx + 'px';
    var m = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
      keyboard: false, touchZoom: false, tap: false, zoomSnap: 0, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, maxZoom: 19, minZoom: 3 });
    m._ready = new Promise(function (res) {
      var base = SM.tile(o.base || S.base, off, { keepBuffer: 4 }).addTo(m), done = false;
      function fin() { if (!done) { done = true; res(); } }
      // Prête quand toutes les tuiles sont chargées (les tuiles en erreur sont relancées par SM.tile), au plus 25 s.
      var t0 = Date.now();
      base.once('load', function () {
        (function chk() {
          var pending = el.querySelectorAll('img.leaflet-tile:not(.leaflet-tile-loaded)').length;
          if (!pending || Date.now() - t0 > 25000) setTimeout(fin, 300); else setTimeout(chk, 200);
        })();
      });
      setTimeout(fin, 30000);
      Object.keys(SM.LAYERS).forEach(function (k) { var d = SM.LAYERS[k]; if (!d.base && S.ov[k] && (!o.ignOnly || d.ign)) SM.tile(k, off).addTo(m); });
    });
    docMaps.push(m); return m;
  }
  function drawItems(m, items, o) {
    o = o || {}; var pts = [];
    items.forEach(function (it) {
      var d = it.data, col = it.color;
      if (it.type === 'game' && SM.game) { SM.game.build(d, m, {}); SM.game.points(d).forEach(function (p) { pts.push(p); }); }
      else if (it.type === 'meas' && d.pts.length > 1) {
        (d.mode === 'area' && d.pts.length > 2 ? L.polygon(d.pts, { color: col, weight: 3, fillColor: col, fillOpacity: .22, dashArray: '2 6' }) : L.polyline(d.pts, { color: col, weight: 3, dashArray: '2 6' })).addTo(m);
        d.pts.forEach(function (p) { pts.push(p); });
      } else if (it.type === 'track') {
        L.polyline(d.coords, { color: '#fff', weight: 7, opacity: .85 }).addTo(m); L.polyline(d.coords, { color: col, weight: 4 }).addTo(m);
        d.coords.forEach(function (c) { pts.push(c); });
      } else if (it.type === 'az' && d.pts.length) {
        if (d.pts.length > 1) L.polyline(d.pts, { color: col, weight: 4, dashArray: '10 6' }).addTo(m);
        d.pts.forEach(function (p, i) { if (!o.noMarkers) L.marker(p, { icon: SM.pin(String(i + 1), 'az'), interactive: false }).addTo(m); pts.push(p); });
      } else if (it.type === 'route') {
        if (it.res) {
          L.polyline(it.res.line, { color: '#fff', weight: 9, opacity: .9, lineCap: 'round', lineJoin: 'round' }).addTo(m);
          L.polyline(it.res.line, { color: col, weight: 5, lineCap: 'round', lineJoin: 'round' }).addTo(m);
          it.res.line.forEach(function (p) { pts.push(p); });
        }
        d.wps.forEach(function (p, i) { if (!o.noMarkers) L.marker([p.lat, p.lon], { icon: SM.pin(SM.lblOf(d, i), SM.clsOf(d, i)), interactive: false, zIndexOffset: 1000 }).addTo(m); if (!it.res) pts.push([p.lat, p.lon]); });
      }
    });
    return pts;
  }
  function boundsOf(pts) { return pts.length ? L.latLngBounds(pts.map(SM.ll)) : null; }

  // ---------- Données d'un itinéraire ----------
  function altAt(prof, d) {
    var p = prof.pts, i = 0; d = Math.max(0, Math.min(p[p.length - 1].d, d));
    while (i < p.length - 1 && p[i + 1].d < d) i++;
    var a = p[i], b = p[Math.min(i + 1, p.length - 1)], q = b.d > a.d ? (d - a.d) / (b.d - a.d) : 0;
    return a.z + (b.z - a.z) * q;
  }
  function stepsTable(d, r, prof) {
    var n = d.wps.length, loop = SM.loopOf(d), cum = 0, rows = [];
    var ratio = prof ? prof.pts[prof.pts.length - 1].d / (r.dist || 1) : 1;
    function row(idx, leg) {
      var back = idx >= n, i = back ? 0 : idx, w = d.wps[i];
      var place = w.place && w.name && w.name !== w.place ? 'près de ' + w.place + ' · ' : '';
      rows.push({ lab: back ? 'A' : SM.lblOf(d, idx), cls: idx === 0 ? 'start' : (back || (idx === n - 1 && !loop)) ? 'end' : 'via',
        name: SM.nameOf(d, i) + (back ? ' (retour)' : ''), sub: place + G.formatCoord('wgs', w.lat, w.lon), leg: leg, cum: cum,
        alt: prof ? altAt(prof, cum * ratio) : null, d: cum * ratio });
    }
    row(0, 0);
    r.portions.forEach(function (p, pi) { cum += p.distance; row(pi + 1, p.distance); });
    return rows;
  }
  function azRows(d) {
    var a = SM.azParams(d), cum = 0;
    return d.pts.slice(1).map(function (q, i) {
      var p = d.pts[i], t = G.bearing(p, q), dd = G.haversine(p, q); cum += dd;
      return '<tr><td>' + (i + 1) + ' → ' + (i + 2) + '</td><td class="r"><b>' + G.fmtAz(G.trueToUnit(t, a.unit, a.ref, a.decl), a.unit) + '</b></td><td class="r">' +
        G.fmtAz(G.trueToUnit((t + 180) % 360, a.unit, a.ref, a.decl), a.unit) + '</td><td class="r">' + G.fmtDist(dd) + '</td><td class="r">' + G.fmtDist(cum) + '</td></tr>';
    }).join('');
  }

  // ---------- Construction du document ----------
  function kpi(l, v) { return '<div><span>' + l + '</span><b>' + v + '</b></div>'; }
  function head(title, sub) {
    return '<header class="d-head"><img src="assets/fsggb.png" alt=""><div><h1>' + esc(title) + '</h1><p class="d-sub">' + sub + '</p></div>' +
      '<div class="d-tag">ScoutMap<br>FSGGB</div></header>';
  }
  function foot() { return '<footer class="d-foot"><span>Document établi avec ScoutMap – FSGGB le ' + today() + '</span><span>Fonds © IGN – Géoplateforme</span></footer>'; }
  function newSheet(c, pw, ph, pm) {
    var el = document.createElement('article');
    el.className = 'sheet'; el.contentEditable = 'true'; el.spellcheck = false;
    el.style.cssText = '--pw:' + pw + 'mm;--ph:' + ph + 'mm;--pm:' + pm + 'mm';
    $('#doc-pages').appendChild(el); return el;
  }

  function buildDoc(c) {
    if (c.type === 'tiles') { buildTilesDoc(c); return; }
    closeMaps();
    var P = PAPER[c.paper], pw = c.orient === 'landscape' ? P[1] : P[0], ph = c.orient === 'landscape' ? P[0] : P[1], pm = 10;
    var cw = pw - 2 * pm, chh = ph - 2 * pm;
    $('#page-style').textContent = '@page{size:' + c.paper + ' ' + c.orient + ';margin:' + pm + 'mm}';
    $('#doc-pages').innerHTML = '';
    $('#doc').hidden = false; document.body.classList.add('doc-open'); $('.doc-scroll').scrollTop = 0;
    origTitle = origTitle || document.title;
    setBusy(true);
    var job;
    if (c.type === 'map') job = Promise.resolve(buildMapDoc(c, newSheet(c, pw, ph, pm), cw, chh));
    else {
      var items = c.items.filter(function (p) { return p.type === 'route' || p.type === 'az'; });
      // Les noms de village / hameau des étapes sont recherchés avant d'écrire le document.
      job = Promise.all(items.filter(function (p) { return p.type === 'route'; }).map(function (p) { return SM.fillPlaces(p.data); })).then(function () {
        return items.reduce(function (chain, it) {
          return chain.then(function () { return it.type === 'route' ? routeSheet(c, it, newSheet(c, pw, ph, pm), cw, items.length) : azSheet(c, it, newSheet(c, pw, ph, pm), cw, items.length); });
        }, Promise.resolve());
      });
    }
    job.then(function () {
      return Promise.all(docMaps.map(function (m) { return m._ready; }));
    }).then(function () { setBusy(false); }).catch(function (e) { setBusy(false); SM.toast(e && e.message || 'Document incomplet.'); });
  }
  function setBusy(b, msg) {
    var btn = $('#doc-print'); btn.disabled = b;
    btn.innerHTML = b ? (msg || 'Chargement des cartes…') : ic('printer') + 'Imprimer / Enregistrer en PDF';
  }
  function titleFor(c, it, n) { return c.title ? (n > 1 ? c.title + ' – ' + it.name : c.title) : it.name; }

  var ARROW = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };
  function newTileSheet(pw, ph, pm, idx) {
    var el = document.createElement('article');
    el.className = 'sheet tile' + (idx ? ' idx' : ''); el.spellcheck = false;
    el.style.cssText = '--pw:' + pw + 'mm;--ph:' + ph + 'mm;--pm:' + pm + 'mm';
    $('#doc-pages').appendChild(el); return el;
  }
  function pageSheet(pl, pg, items, o) {
    var sh = newTileSheet(o.pw, o.ph, o.pm, false);
    var box = document.createElement('div'); box.className = 'd-mapbox tile-box'; box.contentEditable = 'false'; sh.appendChild(box);
    var m = makeMap(box, o.wpx, o.hpx, o.off, { base: o.base, ignOnly: true });
    drawItems(m, items);
    m.setView(L.latLng(pg.center[0], pg.center[1]), o.z0, { animate: false });
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(m);
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(m);
    var head = document.createElement('div'); head.className = 'pg-head';
    head.innerHTML = '<b>Feuille ' + pg.n + ' / ' + o.total + '</b><span>' + esc(o.title) + ' · 1 : ' + SM.sp(o.scale) + '</span>'; box.appendChild(head);
    Object.keys(pg.nb).forEach(function (d) { var e = document.createElement('div'); e.className = 'pg-edge pg-' + d; e.textContent = ARROW[d] + ' ' + pg.nb[d]; box.appendChild(e); });
    return m._ready;
  }
  function indexSheet(pl, items, o) {
    var sh = newTileSheet(o.pw, o.ph, o.pm, true); sh.contentEditable = 'true';
    var land = pl.orient === 'landscape', n = pl.pages.length;
    sh.innerHTML = head(o.title, 'Planche d’assemblage · ' + n + ' feuille' + (n > 1 ? 's' : '') + ' ' + o.paper + ' ' + (land ? 'paysage' : 'portrait') + ' · 1 : ' + SM.sp(o.scale) + ' · ' + today()) +
      '<div class="d-mapbox" id="didx" contenteditable="false"></div>' +
      '<section class="d-sec"><h2>Feuilles</h2><div class="idx-chips">' + pl.pages.map(function (pg) {
        return '<span class="idx-chip"><b>' + pg.n + '</b>' + esc(G.formatCoord('wgs', pg.center[0], pg.center[1])) + '</span>'; }).join('') + '</div></section>' +
      '<p class="d-note">Imprimez à 100 % (sans « ajuster à la page »). Chaque feuille porte les renvois vers ses voisines (↑ → ↓ ←). Chevauchement entre feuilles : ' + pl.overlapMm + ' mm. Seules les feuilles traversées par le tracé sont imprimées.</p>' + foot();
    var el = sh.querySelector('#didx'), cwmm = o.pw - 2 * o.pm, hmm = Math.round((o.ph - 2 * o.pm) * (land ? 0.55 : 0.58));
    var m = makeMap(el, Math.floor(cwmm * MM), Math.floor(hmm * MM), 1, { base: o.base, ignOnly: true });
    drawItems(m, items, { noMarkers: true });
    var all = L.latLngBounds([]);
    pl.pages.forEach(function (pg) {
      var r = L.rectangle([pg.sw, pg.ne], { color: '#000761', weight: 2, fillColor: '#c6a24e', fillOpacity: 0.12, interactive: false }).addTo(m); all.extend(r.getBounds());
      L.marker(pg.center, { interactive: false, icon: L.divIcon({ className: 'pg-num', html: '<span>' + pg.n + '</span>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(m);
    });
    m.fitBounds(all, { animate: false, padding: [16, 16] });
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(m);
    return m._ready;
  }
  function buildTilesDoc(c) {
    var items = c.items, prm = c.tiles, pl = tilesPlan(items, prm);
    if (!pl) { SM.toast('Aucun tracé à imprimer : choisissez un calque qui contient un tracé.'); return; }
    if (pl.pages.length > 60) { SM.toast('Trop de feuilles (' + pl.pages.length + ') : choisissez une échelle plus petite.'); return; }
    closeMaps();
    var P = PAPER[prm.paper], land = pl.orient === 'landscape', pw = land ? P[1] : P[0], ph = land ? P[0] : P[1];
    $('#page-style').textContent = '@page{size:' + prm.paper + ' ' + pl.orient + ';margin:0}';
    $('#doc-pages').innerHTML = '';
    $('#doc').hidden = false; document.body.classList.add('doc-open'); $('.doc-scroll').scrollTop = 0;
    origTitle = origTitle || document.title;
    var o = { pw: pw, ph: ph, pm: prm.margin, paper: prm.paper, scale: prm.scale, total: pl.pages.length,
      base: SM.LAYERS[S.base].ign ? S.base : 'plan', off: prm.sharp === 'auto' ? (prm.paper === 'A4' ? 2 : 1) : +prm.sharp,
      z0: SM.zoomFor(prm.scale, pl.lat0), wpx: Math.round(pl.widthMm * MM), hpx: Math.round(pl.heightMm * MM),
      title: c.title || (items.length === 1 ? items[0].name : (S.name || 'Parcours')) };
    setBusy(true, 'Préparation des feuilles…');
    var chain = Promise.resolve();
    if (prm.index) chain = chain.then(function () { return indexSheet(pl, items, o); });
    pl.pages.forEach(function (pg) { chain = chain.then(function () { setBusy(true, 'Chargement de la feuille ' + pg.n + ' / ' + o.total + '…'); return pageSheet(pl, pg, items, o); }); });
    chain.then(function () { setBusy(false); }).catch(function (e) { setBusy(false); SM.toast(e && e.message || 'Document incomplet.'); });
  }

  function buildMapDoc(c, sheet, cw, chh) {
    var off = Math.max(2, SM.wantOff()), mapH = Math.floor(chh - 34), id = 'dmap';
    var names = c.items.map(function (p) { return p.name; });
    var title = c.title || (names.length === 1 ? names[0] : S.name || 'Carte');
    sheet.innerHTML = '<div class="d-head-wrap"></div><div class="d-mapfull"><div class="d-mapbox" id="' + id + '" contenteditable="false"></div></div><div class="d-foot-wrap"></div>';
    var el = $('#' + id), m = makeMap(el, Math.floor(cw * MM), Math.floor(mapH * MM), off);
    var pts = drawItems(m, c.items), bounds = boundsOf(pts), center, scale;
    if (c.scale === 'fit' && bounds) {
      var cc = bounds.getCenter(); m.setView(cc, 10, { animate: false });
      var bz = m.getBoundsZoom(bounds, false, L.point(24, 24)); scale = null;
      for (var i = 0; i < FIT_SCALES.length; i++) if (SM.zoomFor(FIT_SCALES[i], cc.lat) <= bz + 1e-6) { scale = FIT_SCALES[i]; break; }
      center = cc;
      if (!scale) { m.fitBounds(bounds, { animate: false, padding: [24, 24] }); scale = SM.niceScale(SM.scaleAt(m.getZoom(), cc.lat)); }
    } else if (c.scale === 'view' || !c.scale || c.scale === 'fit') { center = SM.map.getCenter(); scale = SM.niceScale(SM.curScale()); }
    else { center = SM.map.getCenter(); scale = +c.scale; }
    m.setView(center, SM.zoomFor(scale, center.lat), { animate: false });
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(m);
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(m);
    var lab = document.createElement('div'); lab.className = 'd-scale'; lab.textContent = 'Échelle 1 : ' + SM.sp(scale); el.appendChild(lab);
    sheet.querySelector('.d-head-wrap').outerHTML = head(title, 'Carte à l’échelle 1 : ' + SM.sp(scale) + ' · ' + today() + ' · imprimer à 100 % (sans « ajuster à la page »)');
    sheet.querySelector('.d-foot-wrap').outerHTML = foot();
  }

  function routeSheet(c, it, sheet, cw, count) {
    var d = it.data, r = it.res, detail = c.type === 'detail', loop = SM.loopOf(d), h = '', uid = String(it.data.id);
    if (!r) { sheet.innerHTML = head(titleFor(c, it, count), 'Itinéraire non calculé') + '<p class="d-warn">Cet itinéraire n’a pas encore de tracé calculé : ouvrez-le dans ScoutMap puis relancez l’export.</p>' + foot(); return Promise.resolve(); }
    return SM.profileFor(r.line).then(function (p) {
      var rows = stepsTable(d, r, p), sub = ['À pied', loop ? 'Boucle' : 'Aller simple', today()];
      h += head(titleFor(c, it, count), esc(sub.join(' · ')));
      h += '<section class="d-kpis">' + kpi('Distance', G.fmtDist(r.dist)) + (p ? kpi('Dénivelé positif', '+ ' + Math.round(p.asc) + ' m') : '');
      var walk = ((r.dist / 1000) / S.speed + (p ? p.asc / 400 : 0)) * 3600;
      if (detail) {
        if (p) h += kpi('Dénivelé négatif', '− ' + Math.round(p.desc) + ' m') + kpi('Altitude', Math.round(p.min) + ' – ' + Math.round(p.max) + ' m');
        h += kpi('Durée de marche', G.fmtDur(walk)) + kpi('Étapes', String(rows.length));
      } else h += kpi('Étapes', String(rows.length));
      h += '</section>';
      if (detail && d.flagNat && r.nat && r.nat.length) h += '<p class="d-warn">Attention : le tracé semble emprunter ' + r.nat.map(function (n) { return n.label === 'nationale' ? 'une route nationale' : 'la ' + esc(n.label); }).join(', ') + '.</p>';
      if (c.overview) h += '<section class="d-sec"><h2>Vue d’ensemble</h2><div class="d-mapbox" id="dov' + uid + '" contenteditable="false"></div></section>';
      if (c.profile && p) h += '<section class="d-sec"><h2>Profil d’altitude</h2><div class="d-svgbox" contenteditable="false"><svg id="dsvg' + uid + '"></svg></div><p class="d-note">Distance en abscisse, altitude en ordonnée (source : altimétrie IGN, tracé lissé).</p></section>';
      h += '<section class="d-sec"><h2>Étapes</h2><table class="d-tbl"><thead><tr><th>Point</th><th>Lieu</th>' + (detail ? '<th class="r">Alt.</th>' : '') + '<th class="r">Depuis le précédent</th><th class="r">Cumul</th><th class="fill">Date et heure d’arrivée</th></tr></thead><tbody>' +
        rows.map(function (x) {
          return '<tr><td><b>' + esc(x.lab) + '</b></td><td>' + esc(x.name) + '<br><span class="d-note" style="margin:0">' + esc(x.sub) + '</span></td>' + (detail ? '<td class="r">' + (x.alt == null ? '–' : Math.round(x.alt) + ' m') + '</td>' : '') +
            '<td class="r">' + (x.leg ? G.fmtDist(x.leg) : '–') + '</td><td class="r">' + (x.cum ? G.fmtDist(x.cum) : '–') + '</td><td class="fill"></td></tr>';
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
      if (c.notes) h += '<section class="d-sec d-notes"><h2>Notes</h2><div class="lines"><br><br><br><br></div></section>';
      h += foot();
      sheet.innerHTML = h;
      var ov = $('#dov' + uid, sheet);
      if (ov) {
        var cwpx = Math.floor(cw * MM), m = makeMap(ov, cwpx, Math.round(Math.min(cwpx * 0.42, (detail ? 80 : 68) * MM)), Math.max(1, SM.wantOff()));
        var pts = drawItems(m, [it]), b = boundsOf(pts);
        if (b) m.fitBounds(b, { animate: false, padding: [30, 30], maxZoom: 16 }); else m.setView(SM.map.getCenter(), SM.map.getZoom(), { animate: false });
        L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(m);
      }
      var sv = $('#dsvg' + uid, sheet);
      if (sv && p) {
        var wpx = Math.floor(cw * MM), hpx = Math.round((detail ? 46 : 38) * MM);
        var marks = rows.length <= 14 ? rows.map(function (x) { return { d: x.d, z: x.alt == null ? 0 : x.alt, t: x.lab, c: x.cls === 'start' ? '#1a7f37' : x.cls === 'end' ? '#b4232c' : '#000761' }; }) : [];
        sv.setAttribute('width', wpx); sv.setAttribute('height', hpx);
        SM.renderProfileSvg(sv, p, wpx, hpx, 'dpg' + uid, marks);
      }
    });
  }

  function azSheet(c, it, sheet, cw, count) {
    var d = it.data, a = SM.azParams(d), h = '', uid = String(d.id);
    var prof = c.profile && d.pts.length > 1 ? SM.profileFor(d.pts) : Promise.resolve(null);
    return prof.then(function (p) {
      h += head(titleFor(c, it, count), 'Azimuts · ' + today());
      h += '<section class="d-kpis">' + kpi('Parcours', G.fmtDist(G.pathLength(d.pts))) + kpi('Points', String(d.pts.length)) + (p ? kpi('Dénivelé positif', '+ ' + Math.round(p.asc) + ' m') : '') + '</section>';
      if (c.overview) h += '<section class="d-sec"><h2>Vue d’ensemble</h2><div class="d-mapbox" id="dov' + uid + '" contenteditable="false"></div></section>';
      if (p) h += '<section class="d-sec"><h2>Profil d’altitude</h2><div class="d-svgbox" contenteditable="false"><svg id="dsvg' + uid + '"></svg></div></section>';
      h += '<section class="d-sec"><h2>Azimuts</h2><p class="d-note" style="margin:0 0 4px">' + (a.ref === 'mag' ? 'Nord magnétique, déclinaison ' + a.decl + '°' : 'Nord géographique') + ' · unité : ' + { deg: 'degrés', grd: 'grades', mil: 'millièmes' }[a.unit] + '</p>' +
        '<table class="d-tbl"><thead><tr><th>Segment</th><th class="r">Azimut</th><th class="r">Contre-azimut</th><th class="r">Distance</th><th class="r">Cumul</th></tr></thead><tbody>' + azRows(d) + '</tbody></table></section>';
      if (c.notes) h += '<section class="d-sec d-notes"><h2>Notes</h2><div class="lines"><br><br><br><br></div></section>';
      sheet.innerHTML = h + foot();
      var ov = $('#dov' + uid, sheet);
      if (ov) {
        var cwpx = Math.floor(cw * MM), m = makeMap(ov, cwpx, Math.round(Math.min(cwpx * 0.42, 80 * MM)), Math.max(1, SM.wantOff()));
        var b = boundsOf(drawItems(m, [it]));
        if (b) m.fitBounds(b, { animate: false, padding: [30, 30], maxZoom: 16 });
        L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(m);
      }
      var sv = $('#dsvg' + uid, sheet);
      if (sv && p) { var wpx = Math.floor(cw * MM), hpx = Math.round(40 * MM); sv.setAttribute('width', wpx); sv.setAttribute('height', hpx); SM.renderProfileSvg(sv, p, wpx, hpx, 'dpa' + uid); }
    });
  }

  // ---------- Barre d'aperçu ----------
  function closeDoc() {
    closeMaps(); $('#doc').hidden = true; document.body.classList.remove('doc-open'); document.title = origTitle;
    setTimeout(function () { SM.map.invalidateSize(); }, 50);
  }
  $('#doc-back').addEventListener('click', closeDoc);
  $('#doc-print').addEventListener('click', function () {
    var h1 = $('.sheet h1'); origTitle = origTitle || document.title;
    document.title = (h1 && h1.textContent.trim()) || 'ScoutMap';
    setTimeout(function () { window.print(); }, 60);
  });
  window.addEventListener('afterprint', function () { document.title = 'ScoutMap'; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('doc-open') && !e.target.isContentEditable) closeDoc(); });

  SM.openPdf = openPdf;
})();

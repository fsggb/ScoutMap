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

  // ---------- Ce qu'on imprime : tout ce qui est dessiné dans l'onglet en cours ----------
  var TYPE_LABEL = { route: 'Itinéraire', az: 'Azimuts', game: 'Grand jeu', track: 'Trace importée' };
  function pickables() {
    var out = SM.layersList().filter(function (l) { return !l.empty; }).map(function (l) {
      return { key: l.key, type: l.type, name: l.name, color: l.color, vis: l.vis, active: l.active, data: l.data, res: l.res };
    });
    if (S.mode === 'route') S.tracks.forEach(function (t) { if (t.show !== false) out.push({ key: 't' + t.id, type: 'track', name: t.name, color: t.color, vis: true, active: false, data: t, res: null }); });
    return out;
  }
  function sheetCapable(p) { return p.type === 'route' || p.type === 'az'; }

  // Réglages choisis dans la première fenêtre (l'aperçu n'a plus de barre d'outils)
  var PRM = { paper: 'A4', tscale: 25000, line: true, roadmap: true, maps: true, onesheet: false };
  var BT = 0, ABORT = { abort: true };
  var FRAMES = { A4: [210, 297], A3: [297, 420] };
  function config() {
    return { type: 'combo', title: '', paper: PRM.paper, items: pickables(), showLine: PRM.line, roadmap: PRM.roadmap, maps: PRM.maps, onesheet: PRM.onesheet,
      overview: true, profile: true, notes: true,
      tiles: { scale: PRM.tscale, corridor: 6, margin: 8, overlap: 10, sharp: 'auto', index: true, paper: PRM.paper, orient: 'auto', mix: true } };
  }
  // ----- Vignettes de la première fenêtre (dessinées à partir des vraies données)
  function lonlat(items) { return geomLines(items).filter(function (l) { return l && l.length; }); }
  function projector(lines, extra, W, H, pad) {
    var la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
    function add(p) { la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]); }
    lines.forEach(function (l) { l.forEach(add); }); (extra || []).forEach(add);
    if (!isFinite(la0)) return null;
    var k = Math.cos((la0 + la1) / 2 * Math.PI / 180), w = Math.max(1e-6, (lo1 - lo0) * k), h = Math.max(1e-6, la1 - la0);
    var s = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h), ox = (W - w * s) / 2, oy = (H - h * s) / 2;
    return function (p) { return [ox + (p[1] - lo0) * k * s, H - oy - (p[0] - la0) * s]; };
  }
  function poly(lines, tf, col, wd) {
    return lines.map(function (l) {
      var step = Math.max(1, Math.floor(l.length / 120));
      return '<polyline points="' + l.filter(function (_, i) { return i % step === 0; }).map(function (q) { var t = tf(q); return t[0].toFixed(1) + ',' + t[1].toFixed(1); }).join(' ') + '" fill="none" stroke="' + col + '" stroke-width="' + wd + '" stroke-linejoin="round" stroke-linecap="round"/>';
    }).join('');
  }
  function fitScaleFor(items, paper) {
    var pts = []; lonlat(items).forEach(function (l) { l.forEach(function (q) { pts.push(q); }); });
    if (!pts.length) return null;
    var la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
    pts.forEach(function (p) { la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]); });
    var wm = (lo1 - lo0) * 111320 * Math.cos((la0 + la1) / 2 * Math.PI / 180), hm = (la1 - la0) * 110540, P = FRAMES[paper], land = wm >= hm;
    var aw = (land ? P[1] : P[0]) - 20, ah = (land ? P[0] : P[1]) - 20 - 34;
    var need = Math.max(wm / (aw / 1000), hm / (ah / 1000));
    for (var i = 0; i < FIT_SCALES.length; i++) if (FIT_SCALES[i] >= need) return { scale: FIT_SCALES[i], land: land };
    return { scale: FIT_SCALES[FIT_SCALES.length - 1], land: land };
  }
  function thumbRoadmap(items) {
    var r = items.filter(function (p) { return p.type === 'route'; })[0], lines = r ? lonlat([r]) : lonlat(items.filter(sheetCapable)), tf = projector(lines, null, 100, 52, 5);
    var km = r && r.res ? G.fmtDist(r.res.dist) : '';
    return '<div class="th-page"><i class="th-bar"></i><div class="th-kp"><b>' + (km || 'Distance') + '</b><b>' + (r ? r.data.wps.length + ' points' : '') + '</b></div>' +
      '<svg viewBox="0 0 100 52">' + '<rect width="100" height="52" fill="#e9efe3"/>' + (tf ? poly(lines, tf, '#000761', 2) : '') + '</svg>' +
      '<div class="th-rows"><i></i><i></i><i></i><i></i></div><div class="th-two"><span><em>Notes</em><i></i><i></i></span><span><em>☎ Urgences</em><i></i><i></i></span></div></div>';
  }
  function thumbMaps(items, pl) {
    var lines = lonlat(items), pts = [];
    if (pl) pl.pages.forEach(function (pg) { pts.push(pg.sw, pg.ne); });
    var tf = projector(lines, pts, 170, 112, 8); if (!tf) return '';
    var s = '<svg viewBox="0 0 170 112" class="th-svg"><rect width="170" height="112" fill="#f1efe6"/>';
    var lab = pl && pl.pages.length <= 24;
    if (pl) pl.pages.forEach(function (pg) {
      var a = tf(pg.sw), b = tf(pg.ne), x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]), w = Math.abs(a[0] - b[0]), h = Math.abs(a[1] - b[1]);
      s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="#c6a24e" fill-opacity=".28" stroke="' + (pg.orient === 'portrait' ? '#7a3db8' : '#000761') + '" stroke-width="1.2"/>';
    });
    s += poly(lines, tf, '#b4232c', 1.8);
    if (lab) pl.pages.forEach(function (pg) {
      var a = tf(pg.sw), b = tf(pg.ne);
      s += '<text x="' + ((a[0] + b[0]) / 2).toFixed(1) + '" y="' + ((a[1] + b[1]) / 2 + 3).toFixed(1) + '" font-size="8" font-weight="700" text-anchor="middle" fill="#000761" stroke="#fff" stroke-width="2.2" paint-order="stroke">F' + pg.n + '</text>';
    });
    return s + '</svg>';
  }
  function thumbOne(items) {
    var lines = lonlat(items), tf = projector(lines, null, 170, 112, 14); if (!tf) return '';
    return '<svg viewBox="0 0 170 112" class="th-svg"><rect width="170" height="112" fill="#e9efe3"/><rect x="6" y="6" width="158" height="100" fill="none" stroke="#161830" stroke-width="1.2"/>' + poly(lines, tf, '#000761', 2) + '</svg>';
  }
  function seg(id, opts, cur) {
    return '<div class="seg" data-k="' + id + '">' + opts.map(function (o) { return '<button data-v="' + o[0] + '" class="' + (String(cur) === String(o[0]) ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function renderChoices() {
    var items = pickables(), sheetOk = items.some(sheetCapable), tilesOk = lonlat(items).length > 0, c = config();
    if (!sheetOk) PRM.roadmap = false; if (!tilesOk) { PRM.maps = false; PRM.onesheet = false; }
    var pl = tilesOk ? tilesPlan(items, c.tiles) : null, fit = tilesOk ? fitScaleFor(items, PRM.paper) : null;
    var n = pl ? pl.pages.length : 0;
    var cards = [
      { k: 'roadmap', on: PRM.roadmap, ok: sheetOk, t: 'Feuille de route', th: sheetOk ? thumbRoadmap(items) : '', cap: 'Une page A4 : distance, dénivelé, étapes, notes et numéros d’urgence. Modifiable avant impression.' },
      { k: 'maps', on: PRM.maps, ok: tilesOk, t: 'Cartes de l’itinéraire', th: thumbMaps(items, pl), cap: tilesOk ? (n + ' feuille' + (n > 1 ? 's' : '') + ' ' + PRM.paper + ' à l’échelle 1 : ' + SM.sp(PRM.tscale) + ', le moins possible : seules les feuilles traversées par le tracé') : '' },
      { k: 'onesheet', on: PRM.onesheet, ok: tilesOk, t: 'Carte générale', th: thumbOne(items), cap: tilesOk && fit ? 'Toute la zone sur une seule feuille, à une échelle plus petite (environ 1 : ' + SM.sp(fit.scale) + ') : pratique comme vue d’ensemble, moins détaillée.' : '' }
    ];
    $('#doc-types').innerHTML = cards.map(function (x) {
      return '<label class="dcard' + (x.ok ? '' : ' dis') + (x.on ? ' on' : '') + '"><input type="checkbox" data-k="' + x.k + '"' + (x.on ? ' checked' : '') + (x.ok ? '' : ' disabled') + '>' +
        '<span class="dc-tick">' + ic('check') + '</span><div class="dc-th">' + x.th + '</div><b>' + x.t + '</b><small>' + esc(x.cap) + '</small></label>';
    }).join('');
    $('#pdf-set').innerHTML =
      '<label>Papier ' + seg('paper', [['A4', 'A4'], ['A3', 'A3']], PRM.paper) + '</label>' +
      '<label class="' + (PRM.maps ? '' : 'off') + '">Échelle ' + seg('tscale', [[10000, '1 : 10 000'], [25000, '1 : 25 000'], [50000, '1 : 50 000']], PRM.tscale) + '</label>' +
      '<label class="' + (PRM.maps || PRM.onesheet ? '' : 'off') + '">Tracé sur les cartes ' + seg('line', [['1', 'Affiché'], ['0', 'Points seulement']], PRM.line ? '1' : '0') + '</label>';
    var any = (PRM.roadmap && sheetOk) || (PRM.maps && tilesOk) || (PRM.onesheet && tilesOk);
    $('#pdf-ok').disabled = !any; $('#pdf-empty').hidden = items.length > 0;
  }
  $('#doc-types').addEventListener('change', function (e) { var k = e.target.dataset.k; if (k) { PRM[k] = e.target.checked; renderChoices(); } });
  $('#pdf-set').addEventListener('click', function (e) {
    var b = e.target.closest('.seg button'); if (!b) return;
    var k = b.parentNode.dataset.k, v = b.dataset.v;
    if (k === 'paper') PRM.paper = v; else if (k === 'tscale') PRM.tscale = +v; else if (k === 'line') PRM.line = v === '1';
    renderChoices();
  });
  function openPdf() {
    var items = pickables(), sheetOk = items.some(sheetCapable), tilesOk = lonlat(items).length > 0;
    if (!PRM._init) { PRM.roadmap = sheetOk; PRM.maps = tilesOk; PRM.onesheet = false; PRM._init = true; }
    renderChoices();
    var dl = $('#dlg-pdf'); if (!dl.open) dl.showModal();
  }
  $('#pdf-cancel').addEventListener('click', function () { $('#dlg-pdf').close(); });
  $('#pdf-ok').addEventListener('click', function () { $('#dlg-pdf').close(); buildDoc(config()); });

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
  function tilesPlan(items, prm) {
    if (!window.Paginate) return null;
    return Paginate.plan({ lines: geomLines(items), scale: prm.scale, paper: PAPER[prm.paper], orient: prm.orient, mix: prm.mix, margin: prm.margin, overlap: prm.overlap, corridor: prm.corridor });
  }
  // ---------- Cartes statiques (aperçu et impression) ----------
  function closeMaps() { docMaps.forEach(function (m) { try { m.remove(); } catch (e) { /* déjà retirée */ } }); docMaps = []; }
  function makeMap(el, wpx, hpx, off, o) {
    o = o || {};
    el.style.width = wpx + 'px'; el.style.height = hpx + 'px';
    var m = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false,
      keyboard: false, touchZoom: false, tap: false, zoomSnap: 0, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, maxZoom: 19, minZoom: 3 });
    m._ready = new Promise(function (res) {
      var base = SM.tile(o.base || S.base, off, { keepBuffer: 4 }).addTo(m), done = false;
      function fin() { if (!done) { done = true; (SM.hikeDraw ? SM.hikeDraw(m) : Promise.resolve()).then(res, res); } }
      // Prête quand toutes les tuiles sont chargées (les tuiles en erreur sont relancées par SM.tile), au plus 25 s.
      var t0 = Date.now();
      base.once('load', function () {
        (function chk() {
          var pending = el.querySelectorAll('img.leaflet-tile:not(.leaflet-tile-loaded)').length;
          if (!pending || Date.now() - t0 > 25000) setTimeout(fin, 300); else setTimeout(chk, 200);
        })();
      });
      setTimeout(fin, 30000);
      Object.keys(SM.LAYERS).forEach(function (k) { var d = SM.LAYERS[k]; if (!d.base && S.ov[k] && (!o.ignOnly || d.ign) && (k !== 'hiking' || SM.hikeFailed())) SM.tile(k, off).addTo(m); });
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
        if (!o.noLine) { L.polyline(d.coords, { color: '#fff', weight: 7, opacity: .85 }).addTo(m); L.polyline(d.coords, { color: col, weight: 4 }).addTo(m); }
        d.coords.forEach(function (c) { pts.push(c); });
      } else if (it.type === 'az' && d.pts.length) {
        if (d.pts.length > 1 && !o.noLine) L.polyline(d.pts, { color: col, weight: 4, dashArray: '10 6' }).addTo(m);
        d.pts.forEach(function (p, i) { if (!o.noMarkers) L.marker(p, { icon: SM.pin(String(i + 1), 'az'), interactive: false }).addTo(m); pts.push(p); });
      } else if (it.type === 'route') {
        if (it.res) {
          if (!o.noLine) L.polyline(it.res.line, { color: '#fff', weight: 9, opacity: .9, lineCap: 'round', lineJoin: 'round' }).addTo(m);
          if (!o.noLine) L.polyline(it.res.line, { color: col, weight: 5, lineCap: 'round', lineJoin: 'round' }).addTo(m);
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
  function head(title, sub, pg) {
    return '<header class="d-head"><img src="assets/fsggb.png" alt=""><div><h1>' + esc(title) + '</h1><p class="d-sub">' + sub + '</p></div>' +
      '<div class="d-tag">ScoutMap<br>FSGGB' + (pg ? '<br><b>Page ' + pg + '</b>' : '') + '</div></header>';
  }
  function foot() { return '<footer class="d-foot"><span>Document établi avec ScoutMap – FSGGB le ' + today() + '</span><span>' + creditText() + footDate() + '</span></footer>'; }
  function creditText() { return 'Fond : ' + SM.LAYERS[S.base].label; }
  function footDate() { var i = SM.layerDate && SM.layerDate(SM.S.base); return i && i.iso ? ' (données IGN mises à jour le ' + new Date(i.iso + 'T12:00:00').toLocaleDateString('fr-FR') + ')' : ''; }
  function newSheet(c, pw, ph, pm) {
    var el = document.createElement('article');
    el.className = 'sheet'; el.contentEditable = 'true'; el.spellcheck = false;
    el.style.cssText = '--pw:' + pw + 'mm;--ph:' + ph + 'mm;--pm:' + pm + 'mm';
    addPage(el); return el;
  }
  function addPage(el) { var l = $('#doc-loading'); if (l) $('#doc-pages').insertBefore(el, l); else $('#doc-pages').appendChild(el); }

  function buildDoc(c) {
    var tok = ++BT;
    if (c.type === 'combo') { buildCombo(c, tok); return; }
    if (c.type === 'tiles') { buildTilesDoc(c, tok); return; }
    closeMaps();
    var P = PAPER[c.paper], pw = c.orient === 'landscape' ? P[1] : P[0], ph = c.orient === 'landscape' ? P[0] : P[1], pm = 10;
    var cw = pw - 2 * pm, chh = ph - 2 * pm;
    $('#page-style').textContent = '@page{size:' + c.paper + ' ' + c.orient + ';margin:' + pm + 'mm}';
    $('#doc-pages').innerHTML = '';
    $('#doc').hidden = false; document.body.classList.add('doc-open');
    origTitle = origTitle || document.title;
    setBusy(true);
    var job;
    if (c.type === 'map') job = Promise.resolve().then(function () { buildMapDoc(c, newSheet(c, pw, ph, pm), cw, chh); });
    else {
      var items = c.items.filter(function (p) { return p.type === 'route' || p.type === 'az'; });
      // Les noms de village / hameau des étapes sont recherchés avant d'écrire le document.
      job = Promise.all(items.filter(function (p) { return p.type === 'route'; }).map(function (p) { return SM.fillPlaces(p.data); })).then(function () {
        return items.reduce(function (chain, it) {
          return chain.then(function () { if (tok !== BT) throw ABORT; return it.type === 'route' ? routeSheet(c, it, newSheet(c, pw, ph, pm), cw, items.length) : azSheet(c, it, newSheet(c, pw, ph, pm), cw, items.length); });
        }, Promise.resolve());
      });
    }
    job.then(function () {
      return Promise.all(docMaps.map(function (m) { return m._ready; }));
    }).then(function () { if (tok === BT) setBusy(false); }).catch(function (e) { if (e === ABORT) return; setBusy(false); SM.toast(e && e.message || 'Document incomplet.'); });
  }
  // ----- Document complet : feuille de route, carte générale, puis les cartes de l'itinéraire (index + feuilles F1, F2…)
  function setProgress(done, total, msg) {
    var f = total ? done / total : 0;
    $('#doc-prog-i').style.width = Math.round(f * 100) + '%'; $('#doc-prog').hidden = done >= total; $('#doc-spin').hidden = done >= total;
    $('#doc-status').textContent = msg || '';
  }
  function buildCombo(c, tok) {
    var items = c.items, rf = c.roadmap ? items.filter(sheetCapable) : [], prm = c.tiles, P = PAPER[c.paper], pm = 10;
    var pl = c.maps ? tilesPlan(items, prm) : null;
    if (c.maps && !pl) { SM.toast('Aucun tracé à imprimer sur plusieurs feuilles.'); return; }
    if (pl && pl.pages.length > 60) { SM.toast('Trop de feuilles (' + pl.pages.length + ') : choisissez une échelle plus petite.'); return; }
    closeMaps();
    $('#page-style').textContent = '@page pp{size:' + c.paper + ' portrait;margin:0}@page pl{size:' + c.paper + ' landscape;margin:0}@page{size:' + c.paper + ' portrait;margin:0}';
    var firstName = (rf[0] && rf[0].name) || (items[0] && items[0].name) || S.name || 'Itinéraire'; $('#doc-title').value = firstName;
    $('#doc-pages').innerHTML = '<div class="doc-loading" id="doc-loading"><i class="spin"></i><span>Chargement des feuilles…</span></div>'; $('#doc-side').innerHTML = '';
    $('#doc').hidden = false; document.body.classList.add('doc-open'); $('.doc-scroll').scrollTop = 0;
    origTitle = origTitle || document.title;
    var total = rf.length + (c.onesheet ? 1 : 0) + (pl ? pl.pages.length + 1 : 0), done = 0;
    setBusy(true); setProgress(0, total, 'Préparation du document…');
    var chain = Promise.resolve();
    function step(msg, fn) { chain = chain.then(function () { if (tok !== BT) throw ABORT; setProgress(done, total, msg); return fn(); }).then(function () { done++; if (tok === BT) addThumbs(tok, false); }); }
    if (rf.length) {
      chain = chain.then(function () { return Promise.all(rf.filter(function (x) { return x.type === 'route'; }).map(function (x) { return SM.fillPlaces(x.data); })); });
      rf.forEach(function (it) {
        step('Feuille de route…', function () {
          if (it.type === 'route') return roadmapPages(c, it, P, pm);
          var sh = newSheet(null, P[0], P[1], pm); sh.className += ' rf pp';
          return azSheet({ type: 'simple', title: '', overview: true, profile: true, notes: true, paper: c.paper }, it, sh, P[0] - 2 * pm, rf.length);
        });
      });
    }
    if (c.onesheet) {
      step('Carte générale…', function () {
        var fit = fitScaleFor(items, c.paper), land = fit ? fit.land : true, pw = land ? P[1] : P[0], ph = land ? P[0] : P[1];
        var sh = newSheet(null, pw, ph, pm); sh.className += ' rf ' + (land ? 'pl' : 'pp');
        buildMapDoc({ title: '', scale: 'fit', items: items, showLine: c.showLine }, sh, pw - 2 * pm, ph - 2 * pm);
      });
    }
    if (pl) {
      var o = { P: P, pm: prm.margin, paper: prm.paper, scale: prm.scale, total: pl.pages.length, base: S.base, noLine: !c.showLine,
        off: prm.sharp === 'auto' ? (prm.paper === 'A4' && pl.pages.length <= 6 ? 2 : 1) : +prm.sharp, z0: SM.zoomFor(prm.scale, pl.lat0),
        title: items.length === 1 ? items[0].name : (S.name || 'Parcours') };
      step('Planche d’assemblage…', function () { return indexSheet(pl, items, o); });
      pl.pages.forEach(function (pg) { step('Carte F' + pg.n + ' sur ' + o.total + '…', function () { return pageSheet(pl, pg, items, o); }); });
    }
    var sizes = '';
    $('#page-style').textContent += sizes;
    chain.then(function () { return Promise.all(docMaps.map(function (m) { return m._ready; })); })
      .then(function () { if (tok !== BT) return; setProgress(total, total, ''); var l = $('#doc-loading'); if (l) l.remove(); setBusy(false); addThumbs(tok, true); })
      .catch(function (e) { if (e === ABORT) return; setBusy(false); setProgress(total, total, ''); SM.toast(e && e.message || 'Document incomplet.'); });
  }
  // Miniatures latérales (copie réduite de chaque feuille), cliquables ; ajoutées au fur et à mesure du chargement
  function addThumbs(tok, all) {
    var side = $('#doc-side'); if (all) side.innerHTML = '';
    $$('#doc-pages .sheet').forEach(function (sh, i) {
      if (tok !== BT) return;
      if (!all && (sh._thumb || !sh.querySelector('.leaflet-tile-loaded, .d-svgbox, .idx-chips') && sh.querySelector('.leaflet-container'))) return;
      sh._thumb = true;
      var W = 128, w = sh.offsetWidth, h = sh.offsetHeight, s = W / w;
      var b = document.createElement('button'); b.className = 'dthumb'; b.type = 'button'; b.title = 'Aller à la page ' + (i + 1); b.dataset.i = i;
      b.style.width = W + 'px'; b.style.height = Math.round(h * s) + 'px';
      var cl = sh.cloneNode(true); cl.removeAttribute('id'); cl.removeAttribute('contenteditable');
      $$('[id]', cl).forEach(function (x) { x.removeAttribute('id'); });
      cl.style.cssText += ';transform:scale(' + s + ');transform-origin:0 0;position:absolute;left:0;top:0;margin:0;box-shadow:none;pointer-events:none;width:' + w + 'px;height:' + h + 'px;min-height:0';
      b.appendChild(cl);
      var n = document.createElement('i'); n.textContent = String(i + 1); b.appendChild(n);
      b.addEventListener('click', function () { sh.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      var old = $('.dthumb[data-i="' + i + '"]', side); if (old) side.replaceChild(b, old); else side.appendChild(b);
    });
  }
  // Un même nom d'itinéraire (et mêmes sous-titre et pied de page) partout : une modification dans un en-tête ou dans le champ du haut se répercute sur toutes les pages.
  var thumbTimer;
  function syncOthers(src, sel, text) {
    $$('#doc-pages ' + sel).forEach(function (el) { if (el !== src && el.textContent !== text) el.textContent = text; });
    clearTimeout(thumbTimer); thumbTimer = setTimeout(function () { if ($('#doc-loading')) return; addThumbs(BT, true); }, 700);
  }
  $('#doc-title').addEventListener('input', function () { syncOthers(null, '.d-head h1', this.value); });
  $('#doc-pages').addEventListener('input', function (e) {
    var h1 = e.target.closest && e.target.closest('.d-head h1'), sub = e.target.closest && e.target.closest('.d-head .d-sub'), ft = e.target.closest && e.target.closest('.d-foot span');
    if (h1) { $('#doc-title').value = h1.textContent; syncOthers(h1, '.d-head h1', h1.textContent); }
    else if (sub) syncOthers(sub, '.d-head .d-sub', sub.textContent);
    else if (ft) { var i = Array.prototype.indexOf.call(ft.parentNode.children, ft); $$('#doc-pages .d-foot').forEach(function (f) { var s = f.children[i]; if (s && s !== ft && s.textContent !== ft.textContent) s.textContent = ft.textContent; }); }
  });

  function setBusy(b, msg) {
    $('#doc-print').disabled = b; $('#doc-pdf').disabled = b;
  }
  function titleFor(c, it, n) { return c.title ? (n > 1 ? c.title + ' – ' + it.name : c.title) : it.name; }

  var ARROW = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };
  // Les feuilles sont numérotées « F1, F2… » (carrés dorés) : les étapes du parcours restent des pastilles rondes 1, 2, 3…
  function newTileSheet(pw, ph, pm, idx, orient) {
    var el = document.createElement('article');
    el.className = 'sheet tile ' + (orient === 'landscape' ? 'pl' : 'pp') + (idx ? ' idx' : ''); el.spellcheck = false;
    el.style.cssText = '--pw:' + pw + 'mm;--ph:' + ph + 'mm;--pm:' + pm + 'mm';
    addPage(el); return el;
  }
  function pageSheet(pl, pg, items, o) {
    var land = pg.orient === 'landscape', pw = land ? o.P[1] : o.P[0], ph = land ? o.P[0] : o.P[1];
    var sh = newTileSheet(pw, ph, o.pm, false, pg.orient);
    var box = document.createElement('div'); box.className = 'd-mapbox tile-box'; box.contentEditable = 'false'; sh.appendChild(box);
    var m = makeMap(box, Math.round(pg.wMm * MM), Math.round(pg.hMm * MM), o.off, { base: o.base });
    drawItems(m, items, { noLine: o.noLine });
    m.setView(L.latLng(pg.center[0], pg.center[1]), o.z0, { animate: false });
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(m);
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(m);
    var head = document.createElement('div'); head.className = 'pg-head';
    head.innerHTML = '<b>Feuille F' + pg.n + ' / ' + o.total + '</b><span>' + esc(o.title) + ' · 1 : ' + SM.sp(o.scale) + '</span>'; box.appendChild(head);
    Object.keys(pg.nb).forEach(function (d) { var e = document.createElement('div'); e.className = 'pg-edge pg-' + d; e.textContent = ARROW[d] + ' ' + pg.nb[d].map(function (n) { return 'F' + n; }).join(' · '); box.appendChild(e); });
    return m._ready;
  }
  function indexSheet(pl, items, o) {
    var landIdx = pl.nLandscape >= pl.nPortrait, pw = landIdx ? o.P[1] : o.P[0], ph = landIdx ? o.P[0] : o.P[1];
    var sh = newTileSheet(pw, ph, o.pm, true, landIdx ? 'landscape' : 'portrait'); sh.contentEditable = 'true';
    var n = pl.pages.length, compo = pl.mixed ? pl.nLandscape + ' paysage + ' + pl.nPortrait + ' portrait' : (pl.orient === 'portrait' ? 'portrait' : 'paysage');
    sh.innerHTML = head(o.title, 'Planche d’assemblage · ' + n + ' feuille' + (n > 1 ? 's' : '') + ' ' + o.paper + ' (' + compo + ') · 1 : ' + SM.sp(o.scale) + ' · ' + today()) +
      '<div class="d-mapbox" id="didx" contenteditable="false"></div>' +
      '<section class="d-sec"><h2>Feuilles</h2><div class="idx-chips">' + pl.pages.map(function (pg) {
        return '<span class="idx-chip"><b>F' + pg.n + '</b>' + (pg.orient === 'portrait' ? 'portrait' : 'paysage') + ' · ' + esc(G.formatCoord('wgs', pg.center[0], pg.center[1])) + '</span>'; }).join('') + '</div></section>' +
      '<p class="d-note">Les feuilles sont numérotées <b>F1, F2…</b> dans l’ordre du parcours (carrés dorés) ; les <b>étapes</b> du parcours sont les pastilles rondes 1, 2, 3… Imprimez à 100 % (sans « ajuster à la page »). Chaque feuille porte les renvois vers ses voisines (↑ → ↓ ←). Chevauchement : ' + pl.overlapMm + ' mm minimum. Seules les feuilles traversées par le tracé sont imprimées.</p>' + foot();
    var el = sh.querySelector('#didx'), cwmm = pw - 2 * o.pm, hmm = Math.round((ph - 2 * o.pm) * (landIdx ? 0.55 : 0.58));
    var m = makeMap(el, Math.floor(cwmm * MM), Math.floor(hmm * MM), 1, { base: o.base });
    drawItems(m, items, { noMarkers: true });
    var all = L.latLngBounds([]);
    pl.pages.forEach(function (pg) {
      var r = L.rectangle([pg.sw, pg.ne], { color: pg.orient === 'portrait' ? '#7a3db8' : '#000761', weight: 2, fillColor: '#c6a24e', fillOpacity: 0.1, interactive: false }).addTo(m); all.extend(r.getBounds());
      L.marker(pg.center, { interactive: false, icon: L.divIcon({ className: 'pg-num', html: '<span>F' + pg.n + '</span>', iconSize: [34, 26], iconAnchor: [17, 13] }) }).addTo(m);
    });
    m.fitBounds(all, { animate: false, padding: [16, 16] });
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(m);
    return m._ready;
  }
  function buildTilesDoc(c, tok) {
    var items = c.items, prm = c.tiles, pl = tilesPlan(items, prm);
    if (!pl) { SM.toast('Aucun tracé à imprimer : choisissez un calque qui contient un tracé.'); return; }
    if (pl.pages.length > 60) { SM.toast('Trop de feuilles (' + pl.pages.length + ') : choisissez une échelle plus petite.'); return; }
    closeMaps();
    var P = PAPER[prm.paper];
    $('#page-style').textContent = '@page pp{size:' + prm.paper + ' portrait;margin:0}@page pl{size:' + prm.paper + ' landscape;margin:0}@page{size:' + prm.paper + ' ' + (pl.nLandscape >= pl.nPortrait ? 'landscape' : 'portrait') + ';margin:0}';
    $('#doc-pages').innerHTML = '';
    $('#doc').hidden = false; document.body.classList.add('doc-open'); $('.doc-scroll').scrollTop = 0;
    origTitle = origTitle || document.title;
    var o = { P: P, pm: prm.margin, paper: prm.paper, scale: prm.scale, total: pl.pages.length,
      base: S.base, noLine: !c.showLine, off: prm.sharp === 'auto' ? (prm.paper === 'A4' && pl.pages.length <= 6 ? 2 : 1) : +prm.sharp,
      z0: SM.zoomFor(prm.scale, pl.lat0), title: c.title || (items.length === 1 ? items[0].name : (S.name || 'Parcours')) };
    setBusy(true, 'Préparation des feuilles…');
    var chain = Promise.resolve();
    var rf = prm.roadmap ? items.filter(sheetCapable) : [];
    if (rf.length) {
      chain = chain.then(function () { setBusy(true, 'Feuille de route…'); return Promise.all(rf.filter(function (x) { return x.type === 'route'; }).map(function (x) { return SM.fillPlaces(x.data); })); });
      rf.forEach(function (it) {
        chain = chain.then(function () {
          if (tok !== BT) throw ABORT;
          var pm = 10, sh = newSheet(null, P[0], P[1], pm); sh.className += ' rf pp';
          var cc = { type: 'simple', title: '', overview: true, profile: true, notes: true };
          return it.type === 'route' ? routeSheet(cc, it, sh, P[0] - 2 * pm, rf.length) : azSheet(cc, it, sh, P[0] - 2 * pm, rf.length);
        });
      });
    }
    if (prm.index) chain = chain.then(function () { if (tok !== BT) throw ABORT; return indexSheet(pl, items, o); });
    pl.pages.forEach(function (pg) { chain = chain.then(function () { if (tok !== BT) throw ABORT; setBusy(true, 'Chargement de la feuille F' + pg.n + ' / ' + o.total + '…'); return pageSheet(pl, pg, items, o); }); });
    chain.then(function () { if (tok === BT) setBusy(false); }).catch(function (e) { if (e === ABORT) return; setBusy(false); SM.toast(e && e.message || 'Document incomplet.'); });
  }

  function buildMapDoc(c, sheet, cw, chh) {
    var off = Math.max(2, SM.wantOff()), mapH = Math.floor(chh - 34), id = 'dmap';
    var names = c.items.map(function (p) { return p.name; });
    var title = c.title || (names.length === 1 ? names[0] : S.name || 'Carte');
    sheet.innerHTML = '<div class="d-head-wrap"></div><div class="d-mapfull"><div class="d-mapbox" id="' + id + '" contenteditable="false"></div></div><div class="d-foot-wrap"></div>';
    var el = $('#' + id), m = makeMap(el, Math.floor(cw * MM), Math.floor(mapH * MM), off);
    var pts = drawItems(m, c.items, { noLine: !c.showLine }), bounds = boundsOf(pts), center, scale;
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

  // Bas de page : notes (colonne large) et numéros d'urgence (colonne étroite)
  function noteLines(n) { var s = ''; for (var i = 0; i < n; i++) s += '<div class="nl">&nbsp;</div>'; return '<div class="nlines">' + s + '</div>'; }
  var PH = '<svg class="ph" viewBox="0 0 24 24" width="13" height="13"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" fill="currentColor"/></svg>';
  function bottomBlock() {
    var rows = [['Urgences européennes', '112'], ['SAMU', '15'], ['Responsable du raid', ''], ['Camp de base / direction', '']];
    return '<section class="d-sec d-bottom"><div class="d-notes"><h2>Notes</h2>' + noteLines(4) + '</div>' +
      '<div class="d-urg"><h2>' + PH + ' Numéros d’urgence</h2>' + rows.map(function (r) {
        return '<div class="u-row"><span>' + PH + '<span class="u-n">' + esc(r[0]) + '</span></span><b>' + esc(r[1] || '…………………') + '</b></div>'; }).join('') + '</div></section>';
  }

  // ----- Feuille de route en deux pages : 1) chiffres, carte, profil, urgences et responsables ; 2) étapes, notes et message de bon raid
  function ascBetween(p, d0, d1) {
    var a = 0, prev = null;
    for (var i = 0; i < p.pts.length; i++) { var q = p.pts[i]; if (q.d < d0) continue; if (q.d > d1) break; if (prev !== null && q.z > prev) a += q.z - prev; prev = q.z; }
    return a;
  }
  var ICO_TEL = '<svg class="ph" viewBox="0 0 24 24" width="13" height="13"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" fill="currentColor"/></svg>';
  var ICO_MAIL = '<svg class="ph" viewBox="0 0 24 24" width="13" height="13"><path d="M3 6h18v12H3z M3 7l9 6 9-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  var ICO_PIN = '<svg class="ph" viewBox="0 0 24 24" width="13" height="13"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="9.5" r="2.4" fill="currentColor"/></svg>';
  function fld(ico, label, long) { return '<div class="fld">' + ico + '<span>' + label + '</span><i class="fl' + (long ? ' lg' : '') + '">&nbsp;</i></div>'; }
  function contactsBlock() {
    var urg = [['112', 'Urgences (Europe)'], ['15', 'SAMU'], ['18', 'Pompiers'], ['17', 'Police · Gendarmerie']];
    var resp = '<div class="rp-head"><span>Nom, prénom</span><span>Téléphone</span></div>';
    for (var i = 0; i < 3; i++) resp += '<div class="rp-row"><i class="fl">&nbsp;</i><i class="fl">&nbsp;</i></div>';
    return '<section class="d-sec d-bottom"><div class="d-urg"><h2>' + ICO_TEL + ' Urgences</h2>' +
      urg.map(function (r) { return '<div class="u-row"><span class="u-n">' + r[1] + '</span><b>' + r[0] + '</b></div>'; }).join('') + '</div>' +
      '<div class="d-resp"><h2>' + ICO_TEL + ' Responsables du raid</h2>' + resp +
      fld(ICO_MAIL, 'Courriel', true) + fld(ICO_PIN, 'Lieu du camp', true) + '</div></section>';
  }
  function roadmapPages(c, it, P, pm) {
    var d = it.data, r = it.res, uid = String(d.id), cw = P[0] - 2 * pm, loop = SM.loopOf(d);
    var s1 = newSheet(null, P[0], P[1], pm), s2 = newSheet(null, P[0], P[1], pm);
    s1.className += ' rf pp'; s2.className += ' rf pp';
    var title = it.name || 'Itinéraire';
    if (!r) { s1.innerHTML = head(title, 'Itinéraire non calculé', '1 / 2') + '<p class="d-warn">Cet itinéraire n’a pas encore de tracé calculé.</p>' + foot(); s2.remove(); return Promise.resolve(); }
    return SM.profileFor(r.line).then(function (p) {
      var rows = stepsTable(d, r, p), sub = esc(['À pied', loop ? 'Boucle' : 'Aller simple', today()].join(' · '));
      var walk = ((r.dist / 1000) / S.speed + (p ? p.asc / 400 : 0)) * 3600;
      // ---------- page 1
      var h = head(title, sub, '1 / 2') + '<section class="d-kpis">' + kpi('Distance', G.fmtDist(r.dist)) + (p ? kpi('Dénivelé +', '+ ' + Math.round(p.asc) + ' m') + kpi('Dénivelé −', '− ' + Math.round(p.desc) + ' m') : '') +
        kpi('Durée de marche', G.fmtDur(walk)) + kpi('Étapes', String(rows.length)) + '</section>';
      h += '<section class="d-sec"><h2>Vue d’ensemble</h2><div class="d-mapbox" id="rov' + uid + '" contenteditable="false"></div></section>';
      if (p) h += '<section class="d-sec"><h2>Profil d’altitude</h2><div class="d-svgbox" contenteditable="false"><svg id="rsv' + uid + '"></svg></div></section>';
      h += contactsBlock() + foot();
      s1.innerHTML = h;
      // ---------- page 2
      var sum = p ? 'Altitude de ' + Math.round(p.min) + ' à ' + Math.round(p.max) + ' m' : '';
      var tb = '<table class="rt"><thead><tr><th class="c">N°</th><th>Étape</th><th class="r">Distance<br>de l’étape</th><th class="r">Total<br>parcouru</th><th class="r">Altitude</th><th class="r">D+ de<br>l’étape</th><th class="arr">Date et heure d’arrivée</th></tr></thead><tbody>' +
        rows.map(function (x, i) {
          var up = p && i > 0 ? ascBetween(p, rows[i - 1].d, x.d) : null;
          return '<tr><td class="c"><span class="rb ' + x.cls + '">' + esc(x.lab) + '</span></td><td><b>' + esc(x.name) + '</b><br><span class="d-note" style="margin:0">' + esc(x.sub) + '</span></td>' +
            '<td class="r">' + (x.leg ? G.fmtDist(x.leg) : '–') + '</td><td class="r">' + (x.cum ? G.fmtDist(x.cum) : '–') + '</td><td class="r">' + (x.alt == null ? '–' : Math.round(x.alt) + ' m') + '</td>' +
            '<td class="r">' + (up == null ? '–' : '+ ' + Math.round(up) + ' m') + '</td><td class="arr"><span>le <i class="fl sm">&nbsp;</i> / <i class="fl sm">&nbsp;</i></span><span>à <i class="fl sm">&nbsp;</i> h <i class="fl sm">&nbsp;</i></span></td></tr>';
        }).join('') + '</tbody></table>';
      s2.innerHTML = head(title, sub, '2 / 2') + (sum ? '<p class="d-note rt-sum">' + esc(sum) + ' · allure : ' + S.speed + ' km/h</p>' : '') +
        '<section class="d-sec"><h2>Les étapes</h2>' + tb + '</section>' +
        '<section class="d-sec d-notes"><h2>Notes</h2>' + noteLines(6) + '</section>' +
        '<div class="goodraid"><b>Bon raid !</b><span>Restez groupés, soyez prudents et profitez du paysage.</span></div>' + foot();
      // la page 2 doit aussi tenir sur une feuille : on retire des lignes de notes (jusqu'à 3), puis on resserre le tableau
      (function fit2() {
        var pg = P[1] * MM, lines = s2.querySelectorAll('.nlines .nl'), k = lines.length, tb = s2.querySelector('.rt');
        while (s2.scrollHeight - pg > 1 && k > 3) { lines[--k].remove(); }
        if (s2.scrollHeight - pg > 1 && tb) tb.classList.add('dense');
      })();
      // hauteurs de la carte et du profil ajustées pour que la page 1 tienne sur une feuille, avant de créer la carte
      var ov = $('#rov' + uid, s1), sv = $('#rsv' + uid, s1), pagePx = P[1] * MM, cw0 = Math.floor(cw * MM);
      var mh = Math.round(Math.min(cw0 * 0.75, 100 * MM)), ph = p ? Math.round(34 * MM) : 0;
      function apply() { ov.style.height = mh + 'px'; if (sv) { sv.setAttribute('height', ph); sv.style.height = ph + 'px'; } }
      function over() { apply(); return s1.scrollHeight - pagePx; }
      if (over() > 1 && sv) ph = Math.max(80, ph - over());
      if (over() > 1) mh = Math.max(200, mh - over());
      if (over() > 1 && sv) ph = Math.max(60, ph - over());
      if (over() > 1) mh = Math.max(150, mh - over());
      apply();
      var m = makeMap(ov, cw0, mh, Math.max(1, SM.wantOff())), b = boundsOf(drawItems(m, [it]));
      if (b) m.fitBounds(b, { animate: false, padding: [30, 30], maxZoom: 16 }); else m.setView(SM.map.getCenter(), SM.map.getZoom(), { animate: false });
      L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(m);
      if (sv && p) {
        var marks = rows.length <= 14 ? rows.map(function (x) { return { d: x.d, z: x.alt == null ? 0 : x.alt, t: x.lab, c: x.cls === 'start' ? '#1a7f37' : x.cls === 'end' ? '#b4232c' : '#000761' }; }) : [];
        SM.renderProfileSvg(sv, p, cw0, ph, 'rpg' + uid, marks);
      }
    });
  }

  function routeSheet(c, it, sheet, cw, count) {
    var d = it.data, r = it.res, detail = c.type === 'detail', loop = SM.loopOf(d), h = '', uid = String(it.data.id);
    if (!r) { sheet.innerHTML = head(titleFor(c, it, count), 'Itinéraire non calculé') + '<p class="d-warn">Cet itinéraire n’a pas encore de tracé calculé : ouvrez-le dans ScoutMap puis relancez l’export.</p>' + foot(); return Promise.resolve(); }
    var mp = null, bnd = null;
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
      var dense = rows.length > 16 ? ' vdense' : rows.length > 9 ? ' dense' : '';
      var budget = { ov: detail ? 90 : 80, pr: detail ? 46 : 32 };
      h += '<section class="d-sec"><h2>Étapes</h2><table class="d-tbl' + dense + '"><thead><tr><th>Point</th><th>Lieu</th>' + (detail ? '<th class="r">Alt.</th>' : '') + '<th class="r">Depuis le précédent</th><th class="r">Cumul</th><th class="fill">Date et heure d’arrivée</th></tr></thead><tbody>' +
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
      if (c.notes) h += bottomBlock();
      h += foot();
      sheet.innerHTML = h;
      var ov = $('#dov' + uid, sheet), sv0 = $('#dsvg' + uid, sheet), sq = { mh: 0, ph: 0 };
      // Tout doit tenir sur une page : on ajuste les hauteurs de la carte et du profil AVANT de créer les cartes (tableau compacté d'abord).
      (function squeeze() {
        var pagePx = (PAPER[c.paper] || PAPER.A4)[1] * MM, tbl = sheet.querySelector('.d-tbl'), cw0 = Math.floor(cw * MM);
        var mh = ov ? Math.round(Math.min(cw0 * 0.62, budget.ov * MM)) : 0, ph = sv0 && p ? Math.round(budget.pr * MM) : 0;
        function apply() { if (ov) ov.style.height = mh + 'px'; if (sv0 && p) { sv0.setAttribute('height', ph); sv0.style.height = ph + 'px'; } }
        function over() { apply(); return sheet.scrollHeight - pagePx; }
        function shrinkProf(min) { if (sv0 && p && over() > 1) ph = Math.max(min, ph - over()); }
        function shrinkMap(min) { if (ov && over() > 1) mh = Math.max(min, mh - over()); }
        // priorité à la carte d'ensemble : on réduit d'abord le profil, puis le tableau, puis la carte
        if (over() > 1) shrinkProf(80);
        if (over() > 1 && tbl) tbl.classList.add('dense');
        if (over() > 1) { shrinkMap(210); shrinkProf(60); }
        if (over() > 1 && tbl) { tbl.classList.remove('dense'); tbl.classList.add('vdense'); }
        if (over() > 1) { shrinkMap(140); shrinkProf(60); }
        apply(); sq = { mh: mh, ph: ph };
      })();
      if (ov) {
        var cwpx = Math.floor(cw * MM), m = makeMap(ov, cwpx, sq.mh, Math.max(1, SM.wantOff()));
        var pts = drawItems(m, [it]), b = boundsOf(pts); mp = m; bnd = b;
        if (b) m.fitBounds(b, { animate: false, padding: [30, 30], maxZoom: 16 }); else m.setView(SM.map.getCenter(), SM.map.getZoom(), { animate: false });
        L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(m);
      }
      var sv = $('#dsvg' + uid, sheet);
      if (sv && p) {
        var wpx = Math.floor(cw * MM), hpx = sq.ph || Math.round(budget.pr * MM);
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
      if (c.notes) h += bottomBlock();
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
    closeMaps(); $('#doc-side').innerHTML = ''; $('#doc').hidden = true; document.body.classList.remove('doc-open'); document.title = origTitle;
    setTimeout(function () { SM.map.invalidateSize(); }, 50);
  }
  $('#doc-back').addEventListener('click', function () { BT++; closeDoc(); openPdf(); });
  function doPrint(pdf) {
    var h1 = $('.sheet h1'); origTitle = origTitle || document.title;
    document.title = (h1 && h1.textContent.trim()) || 'ScoutMap';
    if (pdf) SM.toast('Dans la fenêtre d’impression, choisissez « Enregistrer au format PDF » comme imprimante.');
    setTimeout(function () { window.print(); }, pdf ? 1400 : 60);
  }
  $('#doc-print').addEventListener('click', function () { doPrint(false); });
  $('#doc-pdf').addEventListener('click', function () { doPrint(true); });
  window.addEventListener('afterprint', function () { document.title = 'ScoutMap'; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('doc-open') && !e.target.isContentEditable) { BT++; closeDoc(); openPdf(); } });

  SM.openPdf = openPdf;
})();

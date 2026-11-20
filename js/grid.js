/* Grilles de coordonnées : kilométrique Lambert-93, UTM, latitude / longitude, quadrillage de jeu (A1, B2…).
   Affichées à l'écran et sur les cartes imprimées ; l'espacement suit l'échelle (case d'environ 2,5 cm sur le papier). */
(function () {
  'use strict';
  var SM = window.SM, S = SM.S, map = SM.map, proj = window.proj4;
  var TYPES = [
    { k: 'none', t: 'Aucune grille', d: '' },
    { k: 'l93', t: 'Kilométrique (Lambert-93)', d: 'Lignes tous les 100 m, 500 m, 1 km… selon l’échelle ; les kilomètres sont écrits sur les bords. C’est la grille des cartes IGN en France.' },
    { k: 'km', t: 'Carroyage kilométrique bleu (cartes IGN)', d: 'Fines lignes bleues tous les kilomètres, comme sur les cartes papier IGN au 1 : 25 000 (carreaux de 4 cm) : on estime une distance d’un coup d’œil.' },
    { k: 'utm', t: 'UTM (WGS 84)', d: 'Même principe, en coordonnées UTM : pour les GPS et les cartes internationales.' },
    { k: 'll', t: 'Latitude / longitude', d: 'Graduation en degrés décimaux.' },
    { k: 'game', t: 'Quadrillage de jeu (A1, B2…)', d: 'Colonnes en lettres, lignes en chiffres : « rendez-vous en C4 ». La taille des cases est fixée par l’échelle du jeu.' }
  ];
  var NICE = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000, 100000];
  var NICEDEG = [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001, 0.0005, 0.0002];
  function pick(list, target) { var b = list[0], bd = Infinity; list.forEach(function (v) { var d = Math.abs(Math.log(v / target)); if (d < bd) { bd = d; b = v; } }); return b; }
  var utmCache = {};
  function utmDef(z) { return utmCache[z] || (utmCache[z] = '+proj=utm +zone=' + z + ' +datum=WGS84 +units=m +no_defs'); }
  function letters(n) { var s = ''; n++; while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
  function dec(v, step) { var d = step >= 1000 ? 0 : step >= 100 ? 1 : 2; return (v / 1000).toFixed(d).replace('.', ','); }

  // Projection de la grille choisie : { fwd(lat, lon) -> [x, y], inv(x, y) -> [lat, lon] }
  function projFor(type, lat, lon) {
    if (type === 'km') type = 'utm';   // le carroyage bleu des cartes IGN est celui de l'UTM
    if (type === 'l93' || type === 'game') return { fwd: function (a, o) { return proj('EPSG:4326', 'EPSG:2154', [o, a]); }, inv: function (x, y) { var q = proj('EPSG:2154', 'EPSG:4326', [x, y]); return [q[1], q[0]]; } };
    if (type === 'utm') { var z = Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1)), d = utmDef(z); return { zone: z, fwd: function (a, o) { return proj('EPSG:4326', d, [o, a]); }, inv: function (x, y) { var q = proj(d, 'EPSG:4326', [x, y]); return [q[1], q[0]]; } }; }
    return { fwd: function (a, o) { return [o, a]; }, inv: function (x, y) { return [y, x]; } };
  }
  function gameOrigin(P, step) {
    var xs = [], ys = [];
    (S.game.shapes || []).forEach(function (s) { (s.pts || []).forEach(function (p) { var q = P.fwd(p[0], p[1]); xs.push(q[0]); ys.push(q[1]); }); });
    if (!xs.length) { var b = map.getBounds(), q1 = P.fwd(b.getNorth(), b.getWest()); xs = [q1[0]]; ys = [q1[1]]; }
    return { x0: Math.floor(Math.min.apply(null, xs) / step) * step - step, y0: Math.ceil(Math.max.apply(null, ys) / step) * step + step };
  }

  var GridLayer = L.Layer.extend({
    initialize: function (o) { this._o = o || {}; },
    onAdd: function (m) {
      var p = m.getPane('grille') || m.createPane('grille'); p.style.zIndex = 430; p.style.pointerEvents = 'none';
      this._cv = L.DomUtil.create('canvas', 'ggrid-cv', p); this._cv.style.position = 'absolute';
      m.on('moveend zoomend resize', this.redraw, this); m.on('zoomstart', this._hide, this); this.redraw();
    },
    onRemove: function (m) { m.off('moveend zoomend resize', this.redraw, this); m.off('zoomstart', this._hide, this); if (this._cv && this._cv.parentNode) this._cv.parentNode.removeChild(this._cv); this._cv = null; },
    _hide: function () { if (this._cv) this._cv.style.opacity = 0; },
    redraw: function () {
      var m = this._map, cv = this._cv; if (!m || !cv) return;
      var type = this._o.type || S.grid.type; if (!type || type === 'none') { cv.width = cv.height = 0; return; }
      var sz = m.getSize(), pad = this._o.print ? 0.02 : 0.2, w = Math.round(sz.x * (1 + 2 * pad)), h = Math.round(sz.y * (1 + 2 * pad)), dpr = this._o.print ? 2 : Math.min(2, window.devicePixelRatio || 1);
      L.DomUtil.setPosition(cv, m.containerPointToLayerPoint([-sz.x * pad, -sz.y * pad]));
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.style.opacity = 1;
      var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      var ox = sz.x * pad, oy = sz.y * pad, c = m.getCenter(), scale = SM.scaleAt(m.getZoom(), c.lat), P = projFor(type, c.lat, c.lng);
      function cp(lat, lon) { var q = m.latLngToContainerPoint(L.latLng(lat, lon)); return [q.x + ox, q.y + oy]; }
      // emprise de la vue (avec marge) en coordonnées de la grille
      var b = m.getBounds().pad(pad + 0.05), xs = [], ys = [], i, j;
      for (i = 0; i <= 4; i++) for (j = 0; j <= 4; j++) { var q = P.fwd(b.getSouth() + (b.getNorth() - b.getSouth()) * i / 4, b.getWest() + (b.getEast() - b.getWest()) * j / 4); xs.push(q[0]); ys.push(q[1]); }
      var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
      var step, org = null, isGame = type === 'game', isLL = type === 'll';
      if (isLL) { var degPerM = 1 / 111320; step = pick(NICEDEG, 25 * scale / 1000 * degPerM); }
      else if (isGame) { step = pick(NICE, 25 * (S.game.scale || scale) / 1000); org = gameOrigin(P, step); }
      else if (type === 'km') step = 1000;
      else step = pick(NICE, 25 * scale / 1000);
      var minpx = isLL ? 6 : 8, pxStep = (function () { var a = cp.apply(null, P.inv(minx, miny)), bb = cp.apply(null, P.inv(minx + step, miny)); return Math.hypot(a[0] - bb[0], a[1] - bb[1]); })();
      var skip = 1; while (pxStep * skip < 14 && skip < 64) skip *= 2;
      var lw = type === 'km' ? (this._o.print ? 0.6 : 1.2) : this._o.print ? 0.7 : 0.9, col = type === 'km' ? 'rgba(0,120,215,.8)' : 'rgba(25,35,110,.62)', t0 = isGame ? Math.floor((minx - org.x0) / step) : Math.floor(minx / step), t1 = isGame ? Math.ceil((maxx - org.x0) / step) : Math.ceil(maxx / step);
      ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.fillStyle = '#12142b'; ctx.font = '700 ' + (this._o.print ? 9 : 10.5) + 'px system-ui,sans-serif'; ctx.textBaseline = 'middle';
      function line(a, b2, fixed, vertical) {   // polyligne échantillonnée (la grille est légèrement penchée à l'écran)
        var pts = [], N = 10; for (var k = 0; k <= N; k++) { var v = a + (b2 - a) * k / N, ll = vertical ? P.inv(fixed, v) : P.inv(v, fixed); pts.push(cp(ll[0], ll[1])); }
        return pts;
      }
      function stroke(pts) { ctx.beginPath(); pts.forEach(function (q, k) { if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.stroke(); }
      function halo(txt, x, y, al) { ctx.textAlign = al || 'left'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.strokeText(txt, x, y); ctx.fillStyle = '#12142b'; ctx.fillText(txt, x, y); ctx.lineWidth = lw; ctx.strokeStyle = col; }
      function val(k, ax) { return isGame ? (ax === 'x' ? org.x0 + k * step : org.y0 - k * step) : k * step; }
      function lbl(k, ax) {
        var v = val(k, ax);
        if (isLL) return (Math.round(v * 1e5) / 1e5).toString().replace('.', ',') + '°';
        if (isGame) return null;
        return dec(v, step);
      }
      var kx, ky, pts, q, u;
      // lignes verticales (x constant) puis horizontales (y constant)
      var ky0 = isGame ? Math.floor((org.y0 - maxy) / step) : Math.floor(miny / step), ky1 = isGame ? Math.ceil((org.y0 - miny) / step) : Math.ceil(maxy / step);
      for (kx = t0; kx <= t1; kx++) {
        if (kx % skip) continue; var x = val(kx, 'x'); pts = line(miny, maxy, x, true); stroke(pts);
        var tx = lbl(kx, 'x'); if (tx) { u = pts.filter(function (z) { return z[1] > oy + 12 && z[0] > ox + 4 && z[0] < ox + sz.x - 10; })[0]; if (u) halo(tx, u[0] + 3, u[1] - 0, 'left'); }
      }
      for (ky = ky0; ky <= ky1; ky++) {
        if (ky % skip) continue; var y = val(ky, 'y'); pts = line(minx, maxx, y, false); stroke(pts);
        var ty = lbl(ky, 'y'); if (ty) { u = pts.filter(function (z) { return z[0] > ox + 4 && z[1] > oy + 14 && z[1] < oy + sz.y - 6; })[0]; if (u) halo(ty, u[0] + 3, u[1] - 7, 'left'); }
      }
      if (isGame) {   // lettres des colonnes en haut, chiffres des lignes à gauche, repère dans chaque case si elle est assez grande
        var north = P.fwd(m.getBounds().getNorth(), c.lng)[1], west = P.fwd(c.lat, m.getBounds().getWest())[0], ll, pt;
        for (kx = Math.max(0, t0); kx < t1; kx++) {
          if (kx % skip) continue; ll = P.inv(org.x0 + (kx + 0.5) * step, north - step * 0.1); pt = cp(ll[0], ll[1]);
          if (pt[0] > ox + 14 && pt[0] < ox + sz.x - 10) halo(letters(kx), pt[0], oy + 14, 'center');
        }
        for (ky = Math.max(0, ky0); ky < ky1; ky++) {
          if (ky % skip) continue; ll = P.inv(west + step * 0.1, org.y0 - (ky + 0.5) * step); pt = cp(ll[0], ll[1]);
          if (pt[1] > oy + 24 && pt[1] < oy + sz.y - 28) halo(String(ky + 1), ox + 10, pt[1], 'center');
        }
        if (pxStep >= 70) {
          ctx.font = '600 ' + (this._o.print ? 8.5 : 10) + 'px system-ui,sans-serif';
          for (kx = Math.max(0, t0); kx < t1; kx++) for (ky = Math.max(0, ky0); ky < ky1; ky++) {
            if (kx % skip || ky % skip) continue; var cl = P.inv(org.x0 + kx * step, org.y0 - ky * step), cc = cp(cl[0], cl[1]);
            if (cc[0] < ox - 40 || cc[0] > ox + sz.x + 40 || cc[1] < oy - 40 || cc[1] > oy + sz.y + 40) continue;
            ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(25,35,110,.55)'; ctx.fillText(letters(kx) + (ky + 1), cc[0] + 4, cc[1] + 9);
          }
        }
      }
      // petite mention : type de grille et taille des cases
      var tag = isLL ? 'Latitude / longitude · ' + (step < 0.01 ? step.toString().replace('.', ',') : step) + '°' : (type === 'utm' || type === 'km' ? 'UTM zone ' + P.zone : type === 'game' ? 'Quadrillage' : 'Lambert-93') + ' · ' + (step >= 1000 ? (step / 1000) + ' km' : step + ' m');
      ctx.font = '700 ' + (this._o.print ? 8.5 : 10) + 'px system-ui,sans-serif'; var tw = ctx.measureText(tag).width + 12;
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(ox + 8, oy + sz.y - 24, tw, 16); ctx.fillStyle = '#12142b'; ctx.textAlign = 'left'; ctx.fillText(tag, ox + 14, oy + sz.y - 16);
    }
  });

  var main = null;
  function apply() {
    var on = S.grid && S.grid.type && S.grid.type !== 'none';
    if (on && !main) { main = new GridLayer({}); main.addTo(map); }
    else if (!on && main) { map.removeLayer(main); main = null; }
    else if (main) main.redraw();
    var l = document.getElementById('grid-list'); if (l) Array.prototype.forEach.call(l.querySelectorAll('button'), function (b) { b.classList.toggle('on', b.dataset.grid === (S.grid.type || 'none')); });
  }
  function renderList() {
    var l = document.getElementById('grid-list'); if (!l) return;
    l.innerHTML = TYPES.map(function (t) { return '<button type="button" data-grid="' + t.k + '" class="gridopt"><span class="gridck" aria-hidden="true"></span><b>' + t.t + '</b>' + (t.d ? '<small>' + t.d + '</small>' : '') + '</button>'; }).join('');
    l.addEventListener('click', function (e) {
      var b = e.target.closest('[data-grid]'); if (!b) return;
      S.grid = { type: b.dataset.grid }; SM.persist(); apply();
    });
    apply();
  }
  SM.grid = { apply: apply, addTo: function (m, type) { if (!S.grid || S.grid.type === 'none') return null; return new GridLayer({ print: true, type: type }).addTo(m); }, TYPES: TYPES };
  renderList();
  map.on('moveend', function () { if (main) main.redraw(); });
})();

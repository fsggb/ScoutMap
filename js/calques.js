/* ScoutMap : calques réalistes du Grand jeu — reliefs, forêts, rivières et lacs, générés à partir des données réelles de l'IGN
   et dessinés « à la plume » (montagnes hachurées, arbres, cours d'eau). Un calque est géoréférencé : il se pose sur n'importe quel fond de carte,
   se règle en transparence, se masque, et peut s'imprimer sur sa propre feuille. */
(function () {
  'use strict';
  var SM = window.SM, S = SM.S, map = SM.map, esc = SM.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var GP = 'https://data.geopf.fr';
  var TYPES = [
    { k: 'relief', label: 'Reliefs', desc: 'Montagnes et collines hachurées, à la hauteur de l’altitude réelle', cap: 250 },
    { k: 'forest', label: 'Forêts', desc: 'Arbres semés dans les vraies forêts du terrain', cap: 64 },
    { k: 'water', label: 'Rivières et lacs', desc: 'Cours d’eau et plans d’eau réels, tracés à l’encre', cap: 250 }
  ];
  var BUSY = {}, layers = {};
  function D() { return S.game; }
  function themeInk() { var th = SM.game && SM.game.theme && SM.game.theme(); return { ink: (th && th.color) || '#3b2a14', paper: '#f5ead0' }; }

  // ---------- Petits outils ----------
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function areaOf(b) { var lat = (b.s + b.n) / 2, w = (b.e - b.w) * 111.32 * Math.cos(lat * Math.PI / 180), h = (b.n - b.s) * 110.54; return { w: w, h: h, a: w * h }; }
  function viewBounds() { var b = map.getBounds(); return { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() }; }
  function r5(x) { return Math.round(x * 1e5) / 1e5; }
  function inRing(x, y, ring) { var ins = false; for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) { var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins; } return ins; }
  function inPoly(x, y, poly) { if (!inRing(x, y, poly[0])) return false; for (var h = 1; h < poly.length; h++) if (inRing(x, y, poly[h])) return false; return true; }
  function polyArea(poly, lat) { var r = poly[0], a = 0, kx = 111320 * Math.cos(lat * Math.PI / 180), ky = 110540; for (var i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * kx) * (r[i][1] * ky) - (r[i][0] * kx) * (r[j][1] * ky); return Math.abs(a / 2); }
  function dp(pts, tol) {
    if (pts.length < 3) return pts;
    var keep = new Uint8Array(pts.length), st = [[0, pts.length - 1]]; keep[0] = keep[pts.length - 1] = 1;
    while (st.length) {
      var s = st.pop(), a = pts[s[0]], b = pts[s[1]], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, md = 0, mi = -1;
      for (var i = s[0] + 1; i < s[1]; i++) { var p = pts[i], t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0, ex = a[0] + t * dx - p[0], ey = a[1] + t * dy - p[1], d = ex * ex + ey * ey; if (d > md) { md = d; mi = i; } }
      if (md > tol * tol && mi > 0) { keep[mi] = 1; st.push([s[0], mi], [mi, s[1]]); }
    }
    return pts.filter(function (_, i) { return keep[i]; });
  }
  function getJson(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error('Service IGN indisponible (' + r.status + ').'); return r.json(); }); }
  function pool(tasks, n) {
    var out = new Array(tasks.length), i = 0;
    function next() { if (i >= tasks.length) return Promise.resolve(); var k = i++; return tasks[k]().then(function (v) { out[k] = v; return next(); }); }
    var ws = []; for (var w = 0; w < n; w++) ws.push(next()); return Promise.all(ws).then(function () { return out; });
  }

  // ---------- Génération à partir des données réelles ----------
  function genRelief(b, scale) {
    var A = areaOf(b), sp = 6 * scale / 1000, cols, rows;
    function dims() { cols = Math.max(10, Math.round(A.w * 1000 / sp)); rows = Math.max(10, Math.round(A.h * 1000 / sp)); }
    dims(); while (cols * rows > 3400) { sp *= 1.12; dims(); }
    var lats = [], lons = [];
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) { lats.push(r5(b.n - (r + 0.5) / rows * (b.n - b.s))); lons.push(r5(b.w + (c + 0.5) / cols * (b.e - b.w))); }
    var tasks = [];
    for (var i = 0; i < lats.length; i += 300) (function (i) {
      tasks.push(function () { return getJson(GP + '/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=' + lons.slice(i, i + 300).join('|') + '&lat=' + lats.slice(i, i + 300).join('|') + '&resource=ign_rge_alti_wld&zonly=true').then(function (j) { return j.elevations || []; }); });
    })(i);
    return pool(tasks, 4).then(function (chunks) {
      var z = [].concat.apply([], chunks);
      if (z.length !== lats.length) throw new Error('Altitudes incomplètes : réessayez.');
      var ok = z.filter(function (v) { return v > -1000; }).sort(function (a, b) { return a - b; });
      if (ok.length < z.length * 0.5) throw new Error('Pas de données d’altitude sur cette zone.');
      var mean = ok[Math.floor(ok.length / 2)];
      z = z.map(function (v) { return v > -1000 ? v : mean; });
      var p5 = ok[Math.floor(ok.length * 0.05)], p95 = ok[Math.floor(ok.length * 0.95)], range = p95 - p5;
      if (range < 30) throw new Error('Terrain presque plat (' + Math.round(range) + ' m de dénivelé) : pas de relief à dessiner ici.');
      function Z(r, c) { return z[Math.max(0, Math.min(rows - 1, r)) * cols + Math.max(0, Math.min(cols - 1, c))]; }
      var sl = new Array(z.length), sa = [];
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) { var gx = (Z(r, c + 1) - Z(r, c - 1)) / 2, gy = (Z(r + 1, c) - Z(r - 1, c)) / 2, s = Math.sqrt(gx * gx + gy * gy); sl[r * cols + c] = s; sa.push(s); }
      sa.sort(function (a, b) { return a - b; }); var s90 = sa[Math.floor(sa.length * 0.9)] || 1;
      var big = range >= 120, fa = Math.min(1, 0.35 + range / 300), rnd = rng(Math.round(b.s * 1e4) ^ Math.round(b.w * 1e4)), g = [];
      for (var r2 = 0; r2 < rows; r2++) for (var c2 = 0; c2 < cols; c2++) {
        var n = Math.max(0, Math.min(1, (z[r2 * cols + c2] - p5) / range)), sn = Math.min(1, sl[r2 * cols + c2] / s90), score = 0.62 * n + 0.38 * sn;
        var kind = 0, prob = 0;
        if (score > 0.6) { kind = big ? 1 : 0; prob = big ? 0.78 : 0.45; } else if (score > 0.4) { kind = 0; prob = Math.pow((score - 0.4) / 0.2, 1.2) * 0.55; }   // pas de « montagnes » sur un simple coteau
        if (!prob || rnd() > prob) continue;
        var jr = (rnd() - 0.5) * 0.8, jc = (rnd() - 0.5) * 0.8;
        g.push([r5(b.n - (r2 + 0.5 + jr) / rows * (b.n - b.s)), r5(b.w + (c2 + 0.5 + jc) / cols * (b.e - b.w)), Math.round(n * fa * 100) / 100, kind]);
      }
      if (!g.length) throw new Error('Pas assez de relief marqué sur cette zone.');
      g.sort(function (a, b) { return b[0] - a[0]; });
      return { g: g, zmin: Math.round(p5), zmax: Math.round(p95) };
    });
  }
  function wfs(type, cql, props, bbox, count) {
    var u = GP + '/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=BDTOPO_V3:' + type + '&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&COUNT=' + count + '&PROPERTYNAME=' + props;
    u += cql ? '&CQL_FILTER=' + encodeURIComponent(cql) : '&BBOX=' + bbox.w + ',' + bbox.s + ',' + bbox.e + ',' + bbox.n + ',EPSG:4326';
    return getJson(u).then(function (j) { return j.features || []; });
  }
  function polysOf(f) { var g = f.geometry; if (!g) return []; return g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; }
  function genForest(b, scale) {
    var nat = "nature IN ('Forêt fermée de feuillus','Forêt fermée de conifères','Forêt fermée mixte','Forêt ouverte','Bois')";
    var cql = nat + " AND BBOX(geometrie," + b.w + ',' + b.s + ',' + b.e + ',' + b.n + ",'EPSG:4326')";
    return wfs('zone_de_vegetation', cql, 'nature,geometrie', null, 4000).then(function (fs) {
      if (!fs.length) throw new Error('Aucune forêt dans cette zone.');
      var lat0 = (b.s + b.n) / 2, kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540, polys = [], tot = 0;
      fs.forEach(function (f) {
        var t = /conif/i.test(f.properties.nature) ? 1 : /mixte/i.test(f.properties.nature) ? 2 : 0;
        polysOf(f).forEach(function (p) { var a = polyArea(p, lat0); if (a > 400) { polys.push({ p: p, t: t, a: a }); tot += a; } });
      });
      if (!polys.length) throw new Error('Aucune forêt assez grande dans cette zone.');
      var sp = 4.4 * scale / 1000; sp = Math.max(sp, Math.sqrt(tot / 3200) * 1.02);
      var dLat = sp / ky, dLon = sp / kx, rnd = rng(Math.round(b.s * 1e4) ^ 7), g = [];
      polys.forEach(function (o) {
        var xs = o.p[0].map(function (q) { return q[0]; }), ys = o.p[0].map(function (q) { return q[1]; });
        var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
        for (var y = y0 + dLat / 2; y < y1; y += dLat) for (var x = x0 + dLon / 2; x < x1; x += dLon) {
          var px = x + (rnd() - 0.5) * dLon * 0.7, py = y + (rnd() - 0.5) * dLat * 0.7;
          if (px < b.w || px > b.e || py < b.s || py > b.n) continue;
          if (inPoly(px, py, o.p)) g.push([r5(py), r5(px), o.t === 2 ? (rnd() < 0.5 ? 0 : 1) : o.t, Math.round((0.8 + rnd() * 0.4) * 100) / 100]);
        }
      });
      if (!g.length) throw new Error('Aucune forêt assez grande dans cette zone.');
      g.sort(function (a, b2) { return b2[0] - a[0]; });
      return { g: g.slice(0, 4200) };
    });
  }
  function genWater(b, scale) {
    var tol = 0.5 * scale / 1000 / 110540;
    return Promise.all([wfs('troncon_hydrographique', null, 'nature,persistance,geometrie', b, 3000), wfs('plan_d_eau', null, 'nature,geometrie', b, 300), wfs('surface_hydrographique', null, 'nature,geometrie', b, 400)]).then(function (res) {
      var lines = [], areas = [], total = 0;
      res[0].forEach(function (f) {
        var g = f.geometry; if (!g) return; var parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
        var perm = /permanent/i.test(f.properties.persistance || '') ? 1 : 0;
        parts.forEach(function (pt) { var s = dp(pt, tol); if (s.length > 1 && total < 20000) { lines.push({ p: perm, c: s.map(function (q) { return [r5(q[1]), r5(q[0])]; }) }); total += s.length; } });
      });
      res[1].concat(res[2]).forEach(function (f) { polysOf(f).forEach(function (p) { var s = dp(p[0], tol); if (s.length > 3 && total < 20000) { areas.push(s.map(function (q) { return [r5(q[1]), r5(q[0])]; })); total += s.length; } }); });
      if (!lines.length && !areas.length) throw new Error('Aucun cours d’eau ni plan d’eau dans cette zone.');
      return { l: lines, a: areas };
    });
  }

  // ---------- Dessin « à la plume » ----------
  function mountain(ctx, x, y, w, h, o) {
    ctx.beginPath(); ctx.moveTo(x - 0.5 * w, y);
    ctx.lineTo(x - 0.36 * w, y - 0.42 * h); ctx.lineTo(x - 0.2 * w, y - h); ctx.lineTo(x - 0.07 * w, y - 0.62 * h); ctx.lineTo(x + 0.02 * w, y - 0.52 * h);
    ctx.lineTo(x + 0.2 * w, y - 0.8 * h); ctx.lineTo(x + 0.34 * w, y - 0.38 * h); ctx.lineTo(x + 0.5 * w, y); ctx.quadraticCurveTo(x, y + 0.08 * h, x - 0.5 * w, y); ctx.closePath();
    ctx.fillStyle = o.fill; ctx.fill(); ctx.strokeStyle = o.ink; ctx.lineWidth = o.lw; ctx.lineJoin = 'round'; ctx.stroke();
    // hachures sur le versant à l'ombre (à droite de chaque sommet)
    ctx.lineWidth = Math.max(0.5, o.lw * 0.65); ctx.beginPath();
    var n = Math.max(3, Math.min(8, Math.round(w / 5)));
    for (var i = 1; i <= n; i++) { var t = i / (n + 1); ctx.moveTo(x - 0.2 * w + t * 0.22 * w, y - h + t * 0.48 * h); ctx.lineTo(x - 0.2 * w + t * 0.22 * w + 0.07 * w, y - 0.42 * h * (1 - t * 0.3)); }
    for (var k = 1; k <= n; k++) { var u = k / (n + 1); ctx.moveTo(x + 0.2 * w + u * 0.3 * w, y - 0.8 * h + u * 0.8 * h); ctx.lineTo(x + 0.2 * w + u * 0.3 * w - 0.03 * w, y - 0.1 * h * (1 - u)); }
    ctx.stroke();
  }
  function hill(ctx, x, y, w, h, o) {
    ctx.beginPath(); ctx.moveTo(x - 0.5 * w, y); ctx.bezierCurveTo(x - 0.3 * w, y - 0.9 * h, x + 0.3 * w, y - 0.9 * h, x + 0.5 * w, y);
    ctx.fillStyle = o.fill; ctx.fill(); ctx.strokeStyle = o.ink; ctx.lineWidth = o.lw; ctx.lineCap = 'round'; ctx.stroke();
    ctx.lineWidth = Math.max(0.5, o.lw * 0.6); ctx.beginPath();
    for (var i = 1; i <= 3; i++) { var t = i / 4; ctx.moveTo(x + 0.08 * w + t * 0.3 * w, y - 0.5 * h * (1 - t)); ctx.lineTo(x + 0.08 * w + t * 0.3 * w, y - 0.08 * h); }
    ctx.stroke();
  }
  function tree(ctx, x, y, w, kind, o) {
    ctx.strokeStyle = o.ink; ctx.lineWidth = o.lw; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 0.34 * w); ctx.stroke();
    ctx.beginPath();
    if (kind === 1) { ctx.moveTo(x - 0.3 * w, y - 0.28 * w); ctx.lineTo(x, y - w); ctx.lineTo(x + 0.3 * w, y - 0.28 * w); ctx.closePath(); }
    else { var r = 0.27 * w; ctx.arc(x - 0.2 * w, y - 0.55 * w, r, Math.PI * 0.6, Math.PI * 1.7); ctx.arc(x, y - 0.78 * w, r, Math.PI * 1.1, Math.PI * 1.95); ctx.arc(x + 0.2 * w, y - 0.55 * w, r, Math.PI * 1.3, Math.PI * 0.4); ctx.closePath(); }
    ctx.fillStyle = o.fill; ctx.fill(); ctx.stroke();
  }
  var CalqueLayer = L.Layer.extend({
    initialize: function (c, opts) { this._c = c; this._scale = (opts && opts.scale) || 10000; this._dpr = (opts && opts.dpr) || 0; this._pad = (opts && opts.dpr) ? 0.02 : 0.5; },
    onAdd: function (m) {
      var p = m.getPane('calques') || m.createPane('calques'); p.style.zIndex = 340; p.style.pointerEvents = 'none';
      this._cv = L.DomUtil.create('canvas', 'gcal-cv', p); this._cv.style.position = 'absolute';
      m.on('moveend zoomend resize', this.redraw, this); m.on('zoomstart', this._hide, this); this.redraw();
    },
    onRemove: function (m) { m.off('moveend zoomend resize', this.redraw, this); m.off('zoomstart', this._hide, this); if (this._cv && this._cv.parentNode) this._cv.parentNode.removeChild(this._cv); this._cv = null; },
    setCalque: function (c) { this._c = c; this.redraw(); },
    _hide: function () { if (this._cv) this._cv.style.opacity = 0; },
    redraw: function () {
      var m = this._map, cv = this._cv, c = this._c; if (!m || !cv || !c) return;
      var sz = m.getSize(), pad = this._pad, w = Math.round(sz.x * (1 + 2 * pad)), h = Math.round(sz.y * (1 + 2 * pad)), dpr = this._dpr || Math.min(2, window.devicePixelRatio || 1);
      L.DomUtil.setPosition(cv, m.containerPointToLayerPoint([-sz.x * pad, -sz.y * pad]));
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.style.opacity = c.visible === false ? 0 : (c.opacity == null ? 0.88 : c.opacity);
      var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      if (c.visible === false) return;
      var ox = sz.x * pad, oy = sz.y * pad, lat0 = m.getCenter().lat, mpp = 156543.03392 * Math.cos(lat0 * Math.PI / 180) / Math.pow(2, m.getZoom()), sc = this._dpr ? SM.scaleAt(m.getZoom(), lat0) : this._scale, pxmm = (sc / 1000) / mpp;   // à l'impression : signes de taille constante sur le papier
      var ink = c.ink || '#3b2a14', fill = this._rgba(c.paper || '#f5ead0', 0.55);
      function P(ll) { var q = m.latLngToContainerPoint(L.latLng(ll[0], ll[1])); return [q.x + ox, q.y + oy]; }
      var lw = Math.max(0.6, Math.min(2.4, pxmm * 0.22));
      if (c.type === 'relief') {
        var o = { ink: ink, fill: fill, lw: lw };
        c.data.g.forEach(function (g) {
          var p = P(g); if (p[0] < -60 || p[1] < -60 || p[0] > w + 60 || p[1] > h + 60) return;
          if (g[3] === 1) { var wm = pxmm * 7.5 * (0.55 + 0.9 * g[2]); if (wm < 3) return; mountain(ctx, p[0], p[1], wm, wm * 0.62, o); }
          else { var wh = pxmm * 5 * (0.6 + 0.5 * g[2]); if (wh < 3) return; hill(ctx, p[0], p[1], wh, wh * 0.5, o); }
        });
      } else if (c.type === 'forest') {
        var of = { ink: ink, fill: fill, lw: Math.max(0.5, lw * 0.8) };
        c.data.g.forEach(function (g) { var p = P(g), wt = pxmm * 3.6 * g[3]; if (wt < 3 || p[0] < -30 || p[1] < -30 || p[0] > w + 30 || p[1] > h + 30) return; tree(ctx, p[0], p[1], wt, g[2], of); });
      } else if (c.type === 'water') {
        var blue = c.ink2 || '#2c5d8f';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        (c.data.a || []).forEach(function (a) {
          ctx.beginPath(); a.forEach(function (q, i) { var p = P(q); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
          ctx.fillStyle = 'rgba(120,170,220,.28)'; ctx.fill(); ctx.strokeStyle = blue; ctx.lineWidth = Math.max(0.8, pxmm * 0.35); ctx.stroke();
          ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(44,93,143,.45)'; ctx.lineWidth = 0.7; ctx.beginPath(); var step = Math.max(3, pxmm * 1.1);
          for (var yy = -h; yy < h * 2; yy += step) { ctx.moveTo(0, yy); ctx.lineTo(w, yy); } ctx.stroke(); ctx.restore();
        });
        (c.data.l || []).forEach(function (l) {
          ctx.beginPath(); l.c.forEach(function (q, i) { var p = P(q); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
          ctx.strokeStyle = blue; ctx.lineWidth = Math.max(0.7, pxmm * (l.p ? 0.5 : 0.3)); ctx.setLineDash(l.p ? [] : [pxmm * 1.4, pxmm * 1.1]); ctx.stroke(); ctx.setLineDash([]);
        });
      }
    },
    _rgba: function (hex, a) { var n = parseInt(String(hex).slice(1), 16) || 0; return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  });

  // ---------- Branchement sur la carte principale ----------
  function list() { return (D().calques || []); }
  function sync() {
    var want = S.mode === 'game' ? list() : [], ids = {};
    want.forEach(function (c) {
      ids[c.id] = 1;
      var ly = layers[c.id];
      if (!ly) { ly = layers[c.id] = new CalqueLayer(c, { scale: D().scale || 10000 }); ly.addTo(map); }
      else { ly._c = c; ly._scale = D().scale || 10000; ly.redraw(); }
    });
    Object.keys(layers).forEach(function (id) { if (!ids[id]) { map.removeLayer(layers[id]); delete layers[id]; } });
  }
  // Cartes imprimées : tous les calques à imprimer (ceux marqués « à part » sont en plus sur leur propre feuille)
  function addTo(m, d) { (d.calques || []).forEach(function (c) { if (c.print !== false && c.visible !== false) new CalqueLayer(c, { scale: d.scale || 10000, dpr: 2 }).addTo(m); }); }
  function addOnly(m, c, scale) { return new CalqueLayer(Object.assign({}, c, { visible: true }), { scale: scale || 10000, dpr: 2 }).addTo(m); }

  // ---------- Panneau « Calques » ----------
  function zoneInfo() {
    var b = viewBounds(), A = areaOf(b);
    return { b: b, A: A, txt: (A.w < 10 ? A.w.toFixed(1) : Math.round(A.w)).toString().replace('.', ',') + ' × ' + (A.h < 10 ? A.h.toFixed(1) : Math.round(A.h)).toString().replace('.', ',') + ' km' };
  }
  function renderPane() {
    var box = $('#gcal-list'); if (!box) return;
    var z = zoneInfo(), cs = list();
    $('#gcal-zone').innerHTML = 'Zone visible : <b>' + z.txt + '</b> <small>(les calques se génèrent sur ce que vous voyez)</small>';
    box.innerHTML = TYPES.map(function (t) {
      var c = cs.filter(function (x) { return x.type === t.k; })[0], tooBig = z.A.a > t.cap, busy = BUSY[t.k];
      var head = '<div class="gcal-h"><label class="gcal-tg"><input type="checkbox" data-act="tog"' + (c ? ' checked' : '') + (busy ? ' disabled' : '') + '><span class="gcal-box"></span><b>' + esc(t.label) + '</b></label><small>' + esc(t.desc) + (busy ? ' — génération en cours…' : '') + '</small></div>';
      if (!c) return '<div class="gcal" data-k="' + t.k + '">' + head + (tooBig ? '<p class="gcal-warn">Zone trop grande pour ce calque : zoomez un peu avant de le cocher.</p>' : '') + '</div>';
      var n = (c.data.g ? c.data.g.length : 0) + (c.data.l ? c.data.l.length : 0) + (c.data.a ? c.data.a.length : 0);
      return '<div class="gcal on" data-k="' + t.k + '">' + head +
        '<div class="gcal-row"><button type="button" class="ibtn' + (c.visible === false ? ' off' : '') + '" data-act="vis" title="' + (c.visible === false ? 'Afficher' : 'Masquer') + '">' + SM.ic('eye') + '</button>' +
        '<label class="gcal-op"><span>Transparence</span><input type="range" min="15" max="100" step="5" value="' + Math.round((c.opacity == null ? 0.88 : c.opacity) * 100) + '" data-act="op" aria-label="Opacité du calque"></label></div>' +
        '<label class="check"><input type="checkbox" data-act="print"' + (c.print !== false ? ' checked' : '') + '> Sur les cartes imprimées</label>' +
        '<label class="check"><input type="checkbox" data-act="sep"' + (c.sep ? ' checked' : '') + '> Aussi sur une feuille à part (sans fond de carte)</label>' +
        '<div class="gcal-row"><small class="gcal-n">' + n + ' éléments' + (c.data.zmax ? ' · altitudes ' + c.data.zmin + ' à ' + c.data.zmax + ' m' : '') + '</small><span style="flex:1"></span>' +
        '<button type="button" class="btn-ghost sm" data-act="gen"' + (busy || tooBig ? ' disabled' : '') + '>' + (busy ? 'Génération…' : 'Régénérer ici') + '</button><button type="button" class="btn-ghost sm danger" data-act="del">Supprimer</button></div></div>';
    }).join('');
  }
  function generate(k) {
    var t = TYPES.filter(function (x) { return x.k === k; })[0], z = zoneInfo(), scale = D().scale || 10000;
    if (BUSY[k]) return; if (z.A.a > t.cap) { SM.toast('Zone trop grande pour ce calque : zoomez un peu (maximum ≈ ' + Math.round(Math.sqrt(t.cap)) + ' km de côté).'); return; }
    BUSY[k] = true; renderPane();
    var f = k === 'relief' ? genRelief : k === 'forest' ? genForest : genWater;
    f(z.b, scale).then(function (data) {
      var ti = themeInk(), old = list().filter(function (x) { return x.type === k; })[0];
      var c = { id: old ? old.id : SM.nid(), type: k, name: t.label, visible: true, opacity: old ? old.opacity : 0.88, print: old ? old.print : true, sep: old ? !!old.sep : false, bounds: z.b, ink: ti.ink, paper: ti.paper, data: data };
      D().calques = list().filter(function (x) { return x.type !== k; }).concat([c]);
      SM.persist(); sync(); SM.toast(t.label + ' : calque généré (' + (data.g ? data.g.length : (data.l.length + data.a.length)) + ' éléments).');
    }).catch(function (e) { SM.toast(e && e.message ? e.message : 'Génération impossible.'); }).then(function () { BUSY[k] = false; renderPane(); });
  }
  function onClick(e) {
    var card = e.target.closest('.gcal'); if (!card) return; var k = card.dataset.k, c = list().filter(function (x) { return x.type === k; })[0], b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.dataset.act;
    if (act === 'gen') generate(k);
    else if (act === 'vis' && c) { c.visible = c.visible === false; SM.persist(); sync(); renderPane(); }
    else if (act === 'del' && c) { D().calques = list().filter(function (x) { return x !== c; }); SM.persist(); sync(); renderPane(); }
  }
  function onInput(e) {
    var card = e.target.closest('.gcal'); if (!card) return; var c = list().filter(function (x) { return x.type === card.dataset.k; })[0];
    var a = e.target.dataset.act;
    if (a === 'tog') { if (e.type !== 'change') return; if (e.target.checked) generate(card.dataset.k); else if (c) { D().calques = list().filter(function (x) { return x !== c; }); SM.persist(); sync(); renderPane(); } return; }
    if (!c) return;
    if (a === 'op') { c.opacity = e.target.value / 100; if (layers[c.id]) layers[c.id].redraw(); SM.persist(); }
    else if (a === 'print') { c.print = e.target.checked; SM.persist(); }
    else if (a === 'sep') { c.sep = e.target.checked; SM.persist(); }
  }
  (function wire() {
    var box = $('#gcal-list'); if (!box) return;
    box.addEventListener('click', onClick); box.addEventListener('input', onInput); box.addEventListener('change', onInput);
    map.on('moveend', function () { if ($('#gcal-list') && !$('#gcal-list').closest('[hidden]')) renderPane(); });
    var tab = $('#gtabs [data-gtab=layers]'); if (tab) tab.addEventListener('click', renderPane);
  })();

  SM.calques = { sync: sync, addTo: addTo, addOnly: addOnly, renderPane: renderPane, list: list };
  sync();
})();

/* ScoutMap : découpage d'un parcours en feuilles A4/A3 (le moins de feuilles possible).
   Calcul pur (sans DOM) : on teste plusieurs positions de grille et les deux orientations, on ne garde
   que les feuilles utiles au tracé (pas de feuilles « du centre » pour une boucle) et on supprime les feuilles redondantes. */
(function (g) {
  'use strict';
  var R = 6378137, RAD = Math.PI / 180;
  function merc(p) { var la = Math.max(-85, Math.min(85, p[0])); return [R * p[1] * RAD, R * Math.log(Math.tan(Math.PI / 4 + la * RAD / 2))]; }
  function unmerc(x, y) { return [(2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / RAD, x / R / RAD]; }

  // Points intermédiaires tous les `step` mètres (espace projeté) pour ne pas « sauter » une feuille.
  function densify(P, step) {
    var out = [];
    for (var i = 0; i < P.length; i++) {
      out.push(P[i]);
      if (i === P.length - 1) break;
      var dx = P[i + 1][0] - P[i][0], dy = P[i + 1][1] - P[i][1], d = Math.sqrt(dx * dx + dy * dy), n = Math.floor(d / step);
      for (var k = 1; k <= n; k++) out.push([P[i][0] + dx * k / (n + 1), P[i][1] + dy * k / (n + 1)]);
    }
    return out;
  }

  /* Une orientation, une position de grille. Retourne les cases retenues. */
  function select(P, x0, y0, W, H, Sx, Sy, t) {
    var cells = {}, i, j, p, k;
    function margin(p, ci, cj) {
      var cx = x0 + ci * Sx, cy = y0 + cj * Sy;
      return Math.min(p[0] - cx, cx + W - p[0], p[1] - cy, cy + H - p[1]);
    }
    function cand(p) {
      var i0 = Math.ceil((p[0] - x0 - W) / Sx), i1 = Math.floor((p[0] - x0) / Sx), j0 = Math.ceil((p[1] - y0 - H) / Sy), j1 = Math.floor((p[1] - y0) / Sy), out = [];
      for (var a = i0; a <= i1; a++) for (var b = j0; b <= j1; b++) out.push([a, b]);
      return out;
    }
    for (k = 0; k < P.length; k++) {
      p = P[k]; var best = null, bm = -Infinity, cs = cand(p);
      for (var c = 0; c < cs.length; c++) { var m = margin(p, cs[c][0], cs[c][1]); if (m > bm) { bm = m; best = cs[c]; } }
      if (!best) continue;
      var key = best[0] + ',' + best[1];
      if (!cells[key]) cells[key] = { i: best[0], j: best[1], pts: [], first: k };
      cells[key].pts.push(k);
    }
    // Suppression des feuilles redondantes : on les essaie de la moins utile à la plus utile.
    var list = Object.keys(cells).map(function (q) { return cells[q]; }).sort(function (a, b) { return a.pts.length - b.pts.length; });
    var alive = {}; list.forEach(function (c) { alive[c.i + ',' + c.j] = true; });
    list.forEach(function (c) {
      var self = c.i + ',' + c.j, ok = true;
      for (var q = 0; q < c.pts.length && ok; q++) {
        var pp = P[c.pts[q]], cs2 = cand(pp), found = false;
        for (var r = 0; r < cs2.length; r++) {
          var kk = cs2[r][0] + ',' + cs2[r][1];
          if (kk !== self && alive[kk] && margin(pp, cs2[r][0], cs2[r][1]) >= t) { found = true; break; }
        }
        if (!found) ok = false;
      }
      if (ok && Object.keys(alive).length > 1) delete alive[self];
    });
    var kept = list.filter(function (c) { return alive[c.i + ',' + c.j]; });
    // marge minimale réellement obtenue (qualité du résultat)
    var minM = Infinity;
    for (k = 0; k < P.length; k++) {
      var mm = -Infinity, cs3 = cand(P[k]);
      for (var u = 0; u < cs3.length; u++) if (alive[cs3[u][0] + ',' + cs3[u][1]]) mm = Math.max(mm, margin(P[k], cs3[u][0], cs3[u][1]));
      if (mm < minM) minM = mm;
    }
    return { cells: kept, minMargin: minM };
  }

  /* o : { points:[[lat,lon]…], scale, paper:[largeur,hauteur] mm (portrait), orient:'auto'|'portrait'|'landscape',
           margin (mm), overlap (mm), corridor (mm sur papier autour du tracé) } */
  function plan(o) {
    var lines = (o.lines || [o.points || []]).map(function (l) { return l.filter(function (p) { return p && isFinite(p[0]) && isFinite(p[1]); }); }).filter(function (l) { return l.length; });
    if (!lines.length) return null;
    var pts = [].concat.apply([], lines), L0 = lines.map(function (l) { return l.map(merc); });
    var P0 = [].concat.apply([], L0), minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, lat0 = 0;
    P0.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    pts.forEach(function (p) { lat0 += p[0]; }); lat0 /= pts.length;
    var k = 1 / Math.cos(lat0 * RAD), mm = o.scale / 1000 * k;             // mètres projetés par millimètre de papier
    var margin = o.margin == null ? 8 : o.margin, overlap = o.overlap == null ? 10 : o.overlap, corridor = o.corridor == null ? 6 : o.corridor;
    var N = o.offsets || 6, best = {}, orients = ['portrait', 'landscape'];
    orients.forEach(function (or) {
      var pw = (or === 'portrait' ? o.paper[0] : o.paper[1]) - 2 * margin, ph = (or === 'portrait' ? o.paper[1] : o.paper[0]) - 2 * margin;
      var W = pw * mm, H = ph * mm, O = overlap * mm, cm = corridor * mm, Sx = W - O, Sy = H - O;
      if (pw <= 10 || ph <= 10 || Sx <= 0 || Sy <= 0) return;
      var t = Math.min(cm, O / 2), st = Math.max(8, Math.min(t / 4, Math.min(W, H) / 80)), P = [].concat.apply([], L0.map(function (l) { return densify(l, st); }));
      for (var a = 0; a < N; a++) for (var b = 0; b < N; b++) {
        var x0 = minX - cm - a * Sx / N, y0 = minY - cm - b * Sy / N, r = select(P, x0, y0, W, H, Sx, Sy, t);
        if (!best[or] || r.cells.length < best[or].cells.length || (r.cells.length === best[or].cells.length && r.minMargin > best[or].minMargin))
          best[or] = { cells: r.cells, minMargin: r.minMargin, x0: x0, y0: y0, W: W, H: H, Sx: Sx, Sy: Sy, pw: pw, ph: ph, P: P, t: t };
      }
    });
    var counts = {}; orients.forEach(function (or) { if (best[or]) counts[or] = best[or].cells.length; });
    var pick = o.orient === 'portrait' || o.orient === 'landscape' ? o.orient : (counts.landscape < counts.portrait ? 'landscape' : 'portrait');
    var B = best[pick] || best[orients.filter(function (or) { return best[or]; })[0]];
    if (!B) return null;
    pick = best[pick] ? pick : orients.filter(function (or) { return best[or]; })[0];
    // numérotation dans l'ordre de passage le long du tracé
    var cells = B.cells.slice().sort(function (a, b) {
      var fa = Math.min.apply(null, a.pts), fb = Math.min.apply(null, b.pts); return fa - fb;
    });
    var byKey = {}; cells.forEach(function (c, n) { c.n = n + 1; byKey[c.i + ',' + c.j] = c; });
    var DIRS = { N: [0, 1], NE: [1, 1], E: [1, 0], SE: [1, -1], S: [0, -1], SW: [-1, -1], W: [-1, 0], NW: [-1, 1] };
    var pages = cells.map(function (c) {
      var cx = B.x0 + c.i * B.Sx, cy = B.y0 + c.j * B.Sy, sw = unmerc(cx, cy), ne = unmerc(cx + B.W, cy + B.H), ce = unmerc(cx + B.W / 2, cy + B.H / 2), nb = {};
      Object.keys(DIRS).forEach(function (d) { var q = byKey[(c.i + DIRS[d][0]) + ',' + (c.j + DIRS[d][1])]; if (q) nb[d] = q.n; });
      return { n: c.n, i: c.i, j: c.j, sw: sw, ne: ne, center: ce, nb: nb, mercCenter: [cx + B.W / 2, cy + B.H / 2], routePoints: c.pts.length };
    });
    // nombre de feuilles d'un découpage « naïf » (toute l'emprise rectangulaire du tracé), pour comparaison
    var naive = Math.ceil(Math.max(1, (maxX - minX + 2 * corridor * mm - B.Sx * 0) / B.Sx)) * Math.ceil(Math.max(1, (maxY - minY + 2 * corridor * mm) / B.Sy));
    return { orient: pick, scale: o.scale, widthMm: B.pw, heightMm: B.ph, lat0: lat0, k: k, mmToMerc: mm, pages: pages, counts: counts, naive: naive,
      minMarginMm: B.minMargin / mm, overlapMm: overlap, marginMm: margin, bboxMerc: [minX, minY, maxX, maxY], zoomLat: lat0 };
  }

  g.Paginate = { plan: plan, merc: merc, unmerc: unmerc, densify: densify };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.Paginate;
})(typeof window !== 'undefined' ? window : globalThis);

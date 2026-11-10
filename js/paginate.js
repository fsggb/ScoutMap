/* ScoutMap : découpage d'un parcours en feuilles A4/A3 (le moins de feuilles possible).
   Calcul pur (sans DOM). Deux familles de solutions sont comparées et la meilleure est gardée :
   - une grille régulière (portrait ou paysage), testée à plusieurs positions ;
   - un « chemin de feuilles » libre : on suit le tracé et on pose chaque feuille là où elle couvre le plus de tracé,
     avec le choix portrait ou paysage à chaque feuille (mélange).
   Seules les feuilles utiles au tracé sont gardées (pas de feuilles « du centre » d'une boucle) et les feuilles redondantes sont supprimées. */
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
  function inside(p, r, m) { return p[0] - r.x0 >= m && r.x0 + r.W - p[0] >= m && p[1] - r.y0 >= m && r.y0 + r.H - p[1] >= m; }
  function marginOf(p, r) { return Math.min(p[0] - r.x0, r.x0 + r.W - p[0], p[1] - r.y0, r.y0 + r.H - p[1]); }

  // ---------- A. Grille régulière ----------
  function gridSelect(P, x0, y0, W, H, Sx, Sy, t) {
    var cells = {}, k, p;
    function margin(p, ci, cj) { var cx = x0 + ci * Sx, cy = y0 + cj * Sy; return Math.min(p[0] - cx, cx + W - p[0], p[1] - cy, cy + H - p[1]); }
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
    return list.filter(function (c) { return alive[c.i + ',' + c.j]; }).map(function (c) {
      return { x0: x0 + c.i * Sx, y0: y0 + c.j * Sy, W: W, H: H, first: c.first };
    });
  }

  // ---------- B. Chemin de feuilles libre (mélange portrait / paysage possible) ----------
  function freeCover(P, dims, m, startIdx, dir) {
    var N = P.length, order = new Array(N), covered = new Array(N), pages = [], k, i, j;
    for (k = 0; k < N; k++) { order[k] = ((startIdx + dir * k) % N + N) % N; covered[k] = false; }
    var prevOr = null;
    for (k = 0; k < N; k++) {
      i = order[k]; if (covered[i]) continue;
      var bestC = null;
      dims.forEach(function (d) {
        var minx = P[i][0], maxx = minx, miny = P[i][1], maxy = miny, last = k;
        for (var kk = k + 1; kk < N; kk++) {
          var pj = P[order[kk]]; if (covered[order[kk]]) continue;
          var nx0 = Math.min(minx, pj[0]), nx1 = Math.max(maxx, pj[0]), ny0 = Math.min(miny, pj[1]), ny1 = Math.max(maxy, pj[1]);
          if (nx1 - nx0 > d.W - 2 * m || ny1 - ny0 > d.H - 2 * m) break;
          minx = nx0; maxx = nx1; miny = ny0; maxy = ny1; last = kk;
        }
        var c = { d: d, last: last, minx: minx, maxx: maxx, miny: miny, maxy: maxy };
        if (!bestC || c.last > bestC.last || (c.last === bestC.last && d.orient === prevOr)) bestC = c;
      });
      var d = bestC.d, sx = (d.W - 2 * m) - (bestC.maxx - bestC.minx), sy = (d.H - 2 * m) - (bestC.maxy - bestC.miny), bestR = null, bestRun = -1;
      for (var a = 0; a <= 4; a++) for (var b = 0; b <= 4; b++) {
        var r = { x0: bestC.minx - m - sx * a / 4, y0: bestC.miny - m - sy * b / 4, W: d.W, H: d.H, orient: d.orient };
        var run = 0;
        for (var kk2 = bestC.last + 1; kk2 < N && kk2 < bestC.last + 700; kk2++) {
          var q = order[kk2]; if (covered[q] || inside(P[q], r, m)) run++; else break;
        }
        if (run > bestRun) { bestRun = run; bestR = r; }
      }
      bestR.first = k; pages.push(bestR); prevOr = d.orient;
      for (j = 0; j < N; j++) if (!covered[j] && inside(P[j], bestR, m)) covered[j] = true;
    }
    // suppression des feuilles redondantes
    var cover = new Array(N);
    for (k = 0; k < N; k++) cover[k] = 0;
    var sets = pages.map(function (pg) { var s = []; for (var z = 0; z < N; z++) if (inside(P[z], pg, m)) { s.push(z); cover[z]++; } return s; });
    var idxs = pages.map(function (_, ii) { return ii; }).sort(function (a, b) { return sets[a].length - sets[b].length; }), dead = {};
    idxs.forEach(function (ii) {
      if (pages.length - Object.keys(dead).length <= 1) return;
      var only = false; sets[ii].forEach(function (z) { if (cover[z] === 1) only = true; });
      if (!only) { dead[ii] = true; sets[ii].forEach(function (z) { cover[z]--; }); }
    });
    return pages.filter(function (_, ii) { return !dead[ii]; });
  }

  /* o : { points | lines:[[lat,lon]…], scale, paper:[largeur,hauteur] mm (portrait), orient:'auto'|'portrait'|'landscape',
           mix:true|false (mélange portrait/paysage autorisé), margin (mm), overlap (mm), corridor (mm autour du tracé) } */
  function plan(o) {
    var lines = (o.lines || [o.points || []]).map(function (l) { return l.filter(function (p) { return p && isFinite(p[0]) && isFinite(p[1]); }); }).filter(function (l) { return l.length; });
    if (!lines.length) return null;
    var pts = [].concat.apply([], lines), L0 = lines.map(function (l) { return l.map(merc); });
    var P0 = [].concat.apply([], L0), minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, lat0 = 0;
    P0.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    pts.forEach(function (p) { lat0 += p[0]; }); lat0 /= pts.length;
    var k = 1 / Math.cos(lat0 * RAD), mm = o.scale / 1000 * k;
    var margin = o.margin == null ? 8 : o.margin, overlap = o.overlap == null ? 10 : o.overlap, corridor = o.corridor == null ? 6 : o.corridor;
    var N = o.offsets || 6, cm = corridor * mm, O = overlap * mm, mreq = Math.max(cm, O / 2);
    var dimsOf = {};
    ['portrait', 'landscape'].forEach(function (or) {
      var pw = (or === 'portrait' ? o.paper[0] : o.paper[1]) - 2 * margin, ph = (or === 'portrait' ? o.paper[1] : o.paper[0]) - 2 * margin;
      if (pw > 10 && ph > 10 && pw * mm - O > 0 && ph * mm - O > 0) dimsOf[or] = { orient: or, W: pw * mm, H: ph * mm, wMm: pw, hMm: ph };
    });
    var cands = [];
    // A. grilles régulières
    Object.keys(dimsOf).forEach(function (or) {
      var d = dimsOf[or], Sx = d.W - O, Sy = d.H - O, t = Math.min(cm, O / 2), st = Math.max(8, Math.min(t / 4, Math.min(d.W, d.H) / 80));
      var P = [].concat.apply([], L0.map(function (l) { return densify(l, st); })), bestG = null;
      for (var a = 0; a < N; a++) for (var b = 0; b < N; b++) {
        var x0 = minX - cm - a * Sx / N, y0 = minY - cm - b * Sy / N, rects = gridSelect(P, x0, y0, d.W, d.H, Sx, Sy, t);
        if (!bestG || rects.length < bestG.length) bestG = rects;
      }
      cands.push({ kind: 'grid', key: or, rects: bestG.map(function (r) { r.orient = or; return r; }) });
    });
    // B. chemins de feuilles libres
    var forced = o.orient === 'portrait' || o.orient === 'landscape', allowed = forced ? [o.orient] : Object.keys(dimsOf);
    function free(keyName, orients) {
      var dims = orients.filter(function (x) { return dimsOf[x]; }).map(function (x) { return dimsOf[x]; });
      if (!dims.length) return;
      var minDim = Math.min.apply(null, dims.map(function (d) { return Math.min(d.W, d.H); }));
      var st = Math.max(8, Math.min(mreq / 3, minDim / 90)), P = [].concat.apply([], L0.map(function (l) { return densify(l, st); })), best = null, K = o.starts || 40;
      for (var s = 0; s < K; s++) [1, -1].forEach(function (dir) {
        var pg = freeCover(P, dims, mreq, Math.floor(s * P.length / K), dir);
        if (!best || pg.length < best.length) best = pg;
      });
      cands.push({ kind: 'free', key: keyName, rects: best });
    }
    allowed.forEach(function (x) { free(x, [x]); });
    if (o.mix !== false && !forced) free('mixed', allowed);
    var counts = {};
    cands.forEach(function (c) { if (counts[c.key] == null || c.rects.length < counts[c.key]) counts[c.key] = c.rects.length; });
    // choix : le moins de feuilles ; à égalité, la grille (plus régulière), puis une seule orientation
    var pool = cands.filter(function (c) { return forced ? c.key === o.orient : true; });
    pool.sort(function (a, b) {
      if (a.rects.length !== b.rects.length) return a.rects.length - b.rects.length;
      var ra = (a.kind === 'grid' ? 0 : 1) + (a.key === 'mixed' ? 1 : 0), rb = (b.kind === 'grid' ? 0 : 1) + (b.key === 'mixed' ? 1 : 0);
      if (ra !== rb) return ra - rb;
      return (a.key === 'landscape' ? 0 : 1) - (b.key === 'landscape' ? 0 : 1);
    });
    var win = pool[0]; if (!win) return null;
    // numérotation dans l'ordre de passage le long du tracé
    var rects = win.rects.slice().sort(function (a, b) { return a.first - b.first; });
    var pages = rects.map(function (r, i) {
      var sw = unmerc(r.x0, r.y0), ne = unmerc(r.x0 + r.W, r.y0 + r.H), ce = unmerc(r.x0 + r.W / 2, r.y0 + r.H / 2), d = dimsOf[r.orient];
      return { n: i + 1, orient: r.orient, wMm: d.wMm, hMm: d.hMm, sw: sw, ne: ne, center: ce, nb: {}, rect: r };
    });
    // voisines : feuilles qui se recouvrent, rangées par direction (8 secteurs)
    var DIRS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
    pages.forEach(function (p) {
      pages.forEach(function (q) {
        if (p === q) return;
        var a = p.rect, b = q.rect, ox = Math.min(a.x0 + a.W, b.x0 + b.W) - Math.max(a.x0, b.x0), oy = Math.min(a.y0 + a.H, b.y0 + b.H) - Math.max(a.y0, b.y0);
        if (ox <= 0 || oy <= 0) return;
        var dx = (b.x0 + b.W / 2 - a.x0 - a.W / 2) / ((a.W + b.W) / 2), dy = (b.y0 + b.H / 2 - a.y0 - a.H / 2) / ((a.H + b.H) / 2);
        var ang = Math.atan2(dy, dx) * 180 / Math.PI; if (ang < 0) ang += 360;
        var dir = DIRS[Math.floor(((ang + 22.5) % 360) / 45)];
        (p.nb[dir] = p.nb[dir] || []).push(q.n);
      });
    });
    var nP = pages.filter(function (p) { return p.orient === 'portrait'; }).length, dd = dimsOf.landscape || dimsOf.portrait;
    var naive = Math.ceil(Math.max(1, (maxX - minX + 2 * cm) / (dd.W - O))) * Math.ceil(Math.max(1, (maxY - minY + 2 * cm) / (dd.H - O)));
    var minM = Infinity;
    densify(P0, Math.max(8, mreq / 3)).forEach(function (p) {
      var best = -Infinity; rects.forEach(function (r) { best = Math.max(best, marginOf(p, r)); }); if (best < minM) minM = best;
    });
    return { scale: o.scale, lat0: lat0, k: k, mmToMerc: mm, overlapMm: overlap, marginMm: margin, pages: pages, counts: counts, naive: naive,
      nPortrait: nP, nLandscape: pages.length - nP, mixed: nP > 0 && nP < pages.length, kind: win.kind,
      orient: nP === 0 ? 'landscape' : nP === pages.length ? 'portrait' : 'mixed', minMarginMm: minM / mm, requiredMarginMm: mreq / mm, bboxMerc: [minX, minY, maxX, maxY] };
  }

  g.Paginate = { plan: plan, merc: merc, unmerc: unmerc, densify: densify };
  if (typeof module !== 'undefined' && module.exports) module.exports = g.Paginate;
})(typeof window !== 'undefined' ? window : globalThis);

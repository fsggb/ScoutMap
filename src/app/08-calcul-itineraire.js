  /* ==== src/app/08-calcul-itineraire.js : calcul de l'itinéraire par tronçons (Géoplateforme), secours, alertes ==== */
  // ----- Calcul par tronçons (un appel par couple de repères) : aucun nombre maximal d'étapes, et un seul tronçon à recalculer quand on déplace un point.
  // ----- Secours : un point tombé au milieu d'un champ (ou loin de tout chemin) est ramené sur le village ou hameau à moins de 100 m, sinon sur le chemin le plus proche.
  function nearestRoadPoint(lat, lon, radius) {
    radius = radius || 400;
    var url = GP + '/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=BDTOPO_V3:troncon_de_route&OUTPUTFORMAT=application/json&COUNT=' + (radius > 600 ? 250 : 60) + '&CQL_FILTER=' +
      encodeURIComponent('DWITHIN(geometrie,POINT(' + lat.toFixed(6) + ' ' + lon.toFixed(6) + '),' + radius + ',meters)');
    return fetch(url).then(function (r) { return r.ok ? r.json() : { features: [] }; }).then(function (j) {
      var best = null, bd = Infinity, here = L.latLng(lat, lon);
      (j.features || []).forEach(function (f) {
        var g = f.geometry; if (!g) return;
        var lines = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
        lines.forEach(function (ln) { for (var i = 0; i < ln.length; i++) {
          var a = ln[i], b = ln[Math.min(i + 1, ln.length - 1)];
          for (var s = 0; s <= 4; s++) {   // points intermédiaires sur chaque segment
            var q = [a[0] + (b[0] - a[0]) * s / 4, a[1] + (b[1] - a[1]) * s / 4], d = here.distanceTo(L.latLng(q[1], q[0]));
            if (d < bd) { bd = d; best = q; }
          }
        } });
      });
      return best ? { lat: best[1], lon: best[0], d: bd } : null;
    }).catch(function () { return null; });
  }
  // Chemin le plus proche, en élargissant la recherche (150 m, 600 m, 2,5 km) : utile en montagne, pour un pic ou un col loin de tout sentier.
  function nearestRoadLadder(lat, lon) {
    return nearestRoadPoint(lat, lon, 150).then(function (r) { return r || nearestRoadPoint(lat, lon, 600); }).then(function (r) { return r || nearestRoadPoint(lat, lon, 2500); });
  }
  // Un point hors sentier (pic, col…) reste exactement où il est ; il est relié en pointillés au chemin le plus proche, qui sert au calcul de l'itinéraire.
  function ensureAnchor(w) {
    if (!w || w.noAnchor || w.direct) return Promise.resolve();
    return nearestRoadLadder(w.lat, w.lon).then(function (r) {
      var i = S.route.wps.indexOf(w); if (i < 0) return;
      if (!r) { setRouteStatus('Aucun chemin trouvé à moins de 2,5 km de « ' + nameOf(S.route, i) + ' » : impossible de le relier à l’itinéraire.', true); toast('Je n’arrive pas à trouver de chemin proche de ce point.'); return; }
      if (r.d <= 40) { if (w.anchor) { delete w.anchor; renderRouteMarkers(); computeRoute(); persist(); } return; }
      w.anchor = { lat: r.lat, lon: r.lon, d: Math.round(r.d) };
      renderRouteMarkers(); renderWpList(); computeRoute(); persist();
      toast('Point hors sentier : il est relié à vol d’oiseau (pointillés) au chemin le plus proche, à ' + G.fmtDist(r.d) + '.', { kind: 'warn', level: 'important' });
    });
  }
  function snapPoint(w) {
    return villageCenter(w.lat, w.lon, 100).then(function (v) {
      if (v) return { lat: v.p.lat, lon: v.p.lon, what: v.what === 'la mairie' ? 'la mairie du village' : 'l’église du village' };
      return poiAround('lieu-dit habité', w.lat, w.lon, 100).then(function (h) {
        h.sort(function (a, b) { return a.d - b.d; });
        if (h.length) return { lat: h[0].lat, lon: h[0].lon, what: 'le hameau' };
        return nearestRoadLadder(w.lat, w.lon).then(function (r) { return r ? (r.d <= 150 ? { lat: r.lat, lon: r.lon, what: 'le chemin le plus proche' } : { anchor: { lat: r.lat, lon: r.lon, d: Math.round(r.d) }, what: 'le chemin le plus proche (relié en pointillés)' }) : null; });
      });
    });
  }
  function rescueLeg(i, w, tok) {
    var cands = [w[i], w[i + 1]].filter(function (x, k, a) { return x && !x.rescued && a.indexOf(x) === k; });
    cands = cands.filter(function (x) { return !x.direct; });
    if (!cands.length) return false;
    cands.forEach(function (x) { x.rescued = true; });
    setRouteStatus('Aucun chemin trouvé : recherche du village ou du chemin le plus proche…'); toast('Je n’arrive pas à relier ce point : je cherche le chemin le plus proche.');
    Promise.all(cands.map(snapPoint)).then(function (rs) {
      if (tok !== RT.rtTok) return;
      var moved = [];
      rs.forEach(function (r, k) { if (r) { var x = cands[k]; if (r.anchor) { x.anchor = r.anchor; moved.push(r.what); } else { if (!x.orig) x.orig = { lat: x.lat, lon: x.lon }; x.lat = r.lat; x.lon = r.lon; x.place = undefined; x.moved = true; moved.push(r.what); } } });
      if (!moved.length) { var msg = 'Je n’arrive pas à trouver de chemin proche de ces points (à moins de 2,5 km) : rapprochez-les d’une route ou d’un chemin.'; setRouteStatus(msg, true); toast(msg); return; }
      toast('Aucun chemin trouvé depuis le point cliqué : il a été déplacé sur ' + moved[0] + '.', { kind: 'warn', level: 'important' });
      renderRouteMarkers(); renderWpList(); persist(); fillPlaces(S.route); computeRoute();
    });
    return true;
  }
  window.addEventListener('online', function () { if (RT.offlineRoute && S.route.wps.length > 1) { RT.offlineRoute = false; computeRoute(); } });
  function rp(x) { return x && x.anchor ? { lat: x.anchor.lat, lon: x.anchor.lon } : x; }   // point utilisé pour le calcul : le chemin le plus proche d'un point hors sentier
  function pf(p) { return p.lon.toFixed(6) + ',' + p.lat.toFixed(6); }
  function runLeg(task) {
    legQueue.push(task); pumpLegs();
  }
  function pumpLegs() {
    while (legBusy < 4 && legQueue.length) {
      (function (task) {
        legBusy++;
        task().then(function () { legBusy--; pumpLegs(); }, function () { legBusy--; pumpLegs(); });
      })(legQueue.shift());
    }
  }
  var CST_AUTO = '{"constraintType":"banned","key":"wayType","operator":"=","value":"autoroute"}', CST_TUN = '{"constraintType":"banned","key":"wayType","operator":"=","value":"tunnel"}';
  // Tronçon « à vol d'oiseau » : ligne droite entre deux repères, sans chercher de chemin (sentier absent de la carte, raccourci…).
  function isDir(w, k) { return !!(w[k] && w[k].direct && k > 0 && !(k === w.length - 1 && loopOf(S.route))); }
  // Tronçon normal ; si le départ est un point en ligne droite posé loin de tout chemin, on le relie en pointillés au chemin le plus proche.
  function legFrom(a, b) {
    return fetchLeg(rp(a), rp(b), null).catch(function (e) {
      if (!a.direct) throw e;
      return nearestRoadLadder(a.lat, a.lon).then(function (r) {
        if (!r) throw e;
        return fetchLeg({ lat: r.lat, lon: r.lon }, rp(b), null).then(function (l) {
          var dl = directLeg(a, { lat: r.lat, lon: r.lon });
          return { line: dl.line.concat(l.line), dist: dl.dist + l.dist, dur: dl.dur + l.dur, directIn: dl.line.length - 1, relaxed: l.relaxed,
            portion: { start: pf(a), end: l.portion.end, distance: dl.dist + (l.portion.distance || l.dist), duration: dl.dur + (l.portion.duration || l.dur), steps: l.portion.steps || [] } };
        });
      });
    });
  }
  function directLeg(a, b) {
    var A = [a.lat, a.lon], B = [b.lat, b.lon], d = G.haversine(A, B), n = Math.max(1, Math.min(80, Math.round(d / 40))), line = [];
    for (var k = 0; k <= n; k++) line.push([A[0] + (B[0] - A[0]) * k / n, A[1] + (B[1] - A[1]) * k / n]);
    var dur = d / (5 / 3.6);
    return { line: line, dist: d, dur: dur, direct: true, az: !!b.az, portion: { start: pf(a), end: pf(b), distance: d, duration: dur, steps: [] }, relaxed: false };
  }
  function fetchLeg(a, b, via, relaxed) {
    var key = [S.route.opt, S.route.avoidMotorway ? 1 : 0, relaxed ? 'r' : 't', pf(a), via ? pf(via) : '', pf(b)].join('|');
    if (legCache[key]) return legCache[key];
    var url = GP + '/navigation/itineraire?resource=bdtopo-valhalla&profile=pedestrian&optimization=' + S.route.opt +
      '&start=' + pf(a) + '&end=' + pf(b) + (via ? '&intermediates=' + encodeURIComponent(pf(via)) : '') +
      (function () { var c = []; if (S.route.avoidMotorway) c.push(CST_AUTO); if (!relaxed) c.push(CST_TUN); return c.length ? '&constraints=' + encodeURIComponent(c.join('|')) : ''; })() +
      '&geometryFormat=geojson&getSteps=true&getBbox=false&crs=EPSG:4326&timeUnit=second&distanceUnit=meter&waysAttributes=name';
    var pr = new Promise(function (resolve, reject) {
      runLeg(function () {
        var tries = 0;
        function go() {
          return fetch(url).then(function (r) {
            return r.json().then(function (j) { if (!r.ok || j.error) throw new Error((j.error && j.error.message) || j.message || 'Erreur ' + r.status); return j; });
          }).then(function (j) {
            var ps = j.portions || [], m = ps.length < 2 ? ps[0] : { start: ps[0].start, end: ps[ps.length - 1].end, distance: 0, duration: 0, steps: [] };
            if (ps.length >= 2) ps.forEach(function (q) { m.distance += q.distance || 0; m.duration += q.duration || 0; m.steps = m.steps.concat(q.steps || []); });
            if (!m) m = { start: pf(a), end: pf(b), distance: j.distance, duration: j.duration, steps: [] };
            resolve({ line: j.geometry.coordinates.map(function (q) { return [q[1], q[0]]; }), dist: j.distance, dur: j.duration, portion: m, relaxed: !!relaxed });
          }).catch(function (e) { if (++tries < 5 && !/Erreur 4|introuvable|impossible|no path/i.test(e.message || '')) return new Promise(function (r) { setTimeout(r, 700 * tries); }).then(go); throw e; });
        }
        return go().catch(function (e) {
          delete legCache[key];
          // aucun chemin sans tunnel (passage souterrain obligatoire) : on réessaie en les autorisant
          if (!relaxed && /no path|Erreur 4/i.test(e.message || '')) return fetchLeg(a, b, via, true).then(resolve, reject);
          reject(e);
        });
      });
    });
    legCache[key] = pr; return pr;
  }
  function assemble(legs) {
    var line = [], bounds = [0], dist = 0, dur = 0, portions = [], directs = [];
    legs.forEach(function (l, i) {
      var ln = l.line, st = 0;
      if (line.length && ln.length && line[line.length - 1][0] === ln[0][0] && line[line.length - 1][1] === ln[0][1]) st = 1;
      var i0 = line.length - st;
      if (l.directIn) directs.push({ from: i0, to: i0 + l.directIn });
      for (var k = st; k < ln.length; k++) line.push(ln[k]);
      bounds.push(line.length - 1); dist += l.dist; dur += l.dur; portions.push(l.portion);
      if (l.direct) directs.push({ from: bounds[bounds.length - 2], to: bounds[bounds.length - 1], az: !!l.az });
    });
    return { line: line, dist: dist, dur: dur, portions: portions, bounds: bounds, directs: directs, tunnel: legs.some(function (l) { return l.relaxed; }) };
  }
  function showRoute(res, first) {
    var nat = {};
    res.portions.forEach(function (p) { (p.steps || []).forEach(function (s) { var k = natOf(stepMeta(s)); if (k) nat[k] = (nat[k] || 0) + (s.distance || 0); }); });
    // distance hors sentier : aller simple pour le départ et l'arrivée, aller-retour pour les étapes intermédiaires
    var ew = effWps(), n = ew.length, off = 0, ps = res.portions.map(function (q) { return Object.assign({}, q); });
    function dl(x) { return x && x.anchor ? x.anchor.d : 0; }
    ps.forEach(function (q, i) {
      var extra = (i === 0 ? dl(ew[0]) : 0), k = i + 1, last = k === n - 1;
      extra += last ? dl(ew[k]) : 2 * dl(ew[k]);
      q.distance = (q.distance || 0) + extra; off += extra;
    });
    if (off) { res.portions = ps; res.dist += off; res.off = off; }
    var wasOver = overMax();
    res.nat = Object.keys(nat).map(function (k) { return { label: k, dist: nat[k] }; });
    res.back = S.route.noBack ? retrace(res.line) : { runs: [], total: 0 };
    clearRouteLines(); RT.route = res;
    drawRoute(); setRouteStatus('');
    renderSteps(); renderRouteStats(); renderGauge(); renderNatWarn(); renderBackWarn(); renderLayerList(); loadNature();
    if (first && overMax() && !wasOver) toast('Distance maximale dépassée (' + G.fmtDist(res.dist) + ' pour ' + G.fmtDist(S.route.maxKm * 1000) + ') : le tracé reste modifiable.', { kind: 'warn', level: 'important' });
    S.profileSrc = 'route'; refreshProfile(); persist();
  }
  // Repère les passages repris (même chemin parcouru deux fois) : échantillons tous les ~10 m, voisins à moins de 15 m, séparés par au moins 120 m de parcours.
  function retrace(line) {
    var out = { runs: [], total: 0 };
    if (line.length < 3) return out;
    var kx = 111320 * Math.cos(line[0][0] * Math.PI / 180), ky = 110540, S10 = [], i, j;
    for (i = 0; i + 1 < line.length; i++) {
      var ax = line[i][1] * kx, ay = line[i][0] * ky, bx = line[i + 1][1] * kx, by = line[i + 1][0] * ky, L0 = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L0 / 10));
      for (j = 0; j < n; j++) S10.push({ x: ax + (bx - ax) * j / n, y: ay + (by - ay) * j / n, v: i, la: line[i][0] + (line[i + 1][0] - line[i][0]) * j / n, lo: line[i][1] + (line[i + 1][1] - line[i][1]) * j / n });
    }
    var grid = {}, hit = new Array(S10.length), c = 20;
    S10.forEach(function (s, k) {
      var cx = Math.floor(s.x / c), cy = Math.floor(s.y / c), h = false, dx, dy, arr, m;
      for (dx = -1; dx <= 1 && !h; dx++) for (dy = -1; dy <= 1 && !h; dy++) {
        arr = grid[(cx + dx) + ',' + (cy + dy)]; if (!arr) continue;
        for (m = 0; m < arr.length; m++) if (k - arr[m] > 12 && Math.hypot(S10[arr[m]].x - s.x, S10[arr[m]].y - s.y) <= 15) { h = true; break; }
      }
      hit[k] = h; (grid[cx + ',' + cy] = grid[cx + ',' + cy] || []).push(k);
    });
    var k = 0;
    while (k < S10.length) {
      if (!hit[k]) { k++; continue; }
      var e = k, gap = 0, last = k;
      while (e + 1 < S10.length && gap <= 3) { e++; if (hit[e]) { last = e; gap = 0; } else gap++; }
      if (last - k + 1 >= 15) {
        out.runs.push({ s: k, e: last, len: (last - k + 1) * 10, v0: S10[k].v, v1: S10[last].v, pts: S10.slice(k, last + 1).map(function (q) { return [q.la, q.lo]; }) });
        out.total += (last - k + 1) * 10;
      }
      k = last + 1;
    }
    return out;
  }
  function renderBackWarn() {
    var r = RT.route;
    if (backLine) { gRoute.removeLayer(backLine); backLine = null; }
    if (!r || !S.route.noBack || !r.back || !r.back.runs.length) { setNote('back', ''); return; }
    backLine = L.layerGroup(r.back.runs.map(function (u) { return L.polyline(u.pts, { color: '#e07b00', weight: 7, opacity: 0.85, dashArray: '2 9', lineCap: 'round', interactive: false }); })).addTo(gRoute);
    setNote('back', 'Le tracé repasse par le même chemin sur ≈ ' + G.fmtDist(r.back.total) + ' (pointillés orange)' + (r.backTried ? ', faute d’alternative proche.' : '.') + ' Déplacez un repère pour changer de chemin.', 'warn');
  }
  // Cherche, pour les tronçons qui reprennent un chemin déjà parcouru, un passage décalé qui évite l'aller-retour.
  function improveBack(legs0, w, tok, tag) {
    var res = RT.route; if (!res || !res.back.runs.length) return;
    var legs = legs0.slice(), runs = res.back.runs.slice().sort(function (a, b) { return b.len - a.len; }).slice(0, 4), improved = 0, extra = 0;
    var todo = runs.filter(function (u) { return u.len >= 150; });
    if (!todo.length) return;
    setRouteStatus('Recherche d’un chemin de retour différent…');
    var seen = {};
    function step(idx) {
      if (tok !== RT.rtTok || tag !== S.route.id) return;
      if (idx >= todo.length) { finish(); return; }
      var u = todo[idx], cur = assemble(legs), leg = 0;
      // les indices ont pu changer après un remplacement : on retrouve le tronçon par le milieu de la zone reprise.
      var mid = u.pts[Math.floor(u.pts.length / 2)], best = Infinity, bi = 0;
      cur.line.forEach(function (q, k) { var d = Math.pow(q[0] - mid[0], 2) + Math.pow((q[1] - mid[1]) * Math.cos(mid[0] * Math.PI / 180), 2); if (d < best) { best = d; bi = k; } });
      for (leg = 0; leg < legs.length - 1 && cur.bounds[leg + 1] < bi; leg++);
      if (legs[leg].direct || legs[leg].directIn) { step(idx + 1); return; }   // le choix de l'utilisateur (ligne droite) n'est jamais remplacé
      var lk = leg + ':' + legs[leg].dist.toFixed(0); if (seen[lk]) { step(idx + 1); return; } seen[lk] = 1;
      var a = rp(w[leg]), b = rp(w[leg + 1]), p0 = u.pts[0], p1 = u.pts[u.pts.length - 1], kx = Math.cos(mid[0] * Math.PI / 180);
      var dx = (p1[1] - p0[1]) * kx * 111320, dy = (p1[0] - p0[0]) * 110540, nrm = Math.hypot(dx, dy) || 1, ux = -dy / nrm, uy = dx / nrm;
      var offs = [250, 500, 900], cands = [];
      offs.forEach(function (o) { [1, -1].forEach(function (sd) {
        cands.push({ lat: mid[0] + uy * o * sd / 110540, lon: mid[1] + ux * o * sd / (111320 * kx) });
      }); });
      var oldTot = retrace(cur.line).total, oldDist = legs[leg].dist;
      Promise.all(cands.map(function (cd) { return fetchLeg(a, b, cd).then(function (r) { return r; }, function () { return null; }); })).then(function (rs) {
        if (tok !== RT.rtTok || tag !== S.route.id) return;
        var pick = null, score = oldTot - 0.5 * u.len;
        rs.forEach(function (r) {
          if (!r || r.dist > oldDist + 200) return;
          var test = legs.slice(); test[leg] = r;
          var tot = retrace(assemble(test).line).total, sc = tot + 0.5 * (r.dist - oldDist);
          if (tot <= oldTot - 0.5 * u.len && sc < (pick ? pick.sc : Infinity)) pick = { r: r, sc: sc };
        });
        if (pick) { extra += pick.r.dist - oldDist; legs[leg] = pick.r; improved++; }
        step(idx + 1);
      });
    }
    function finish() {
      if (tok !== RT.rtTok || tag !== S.route.id) return;
      if (improved) {
        var out = assemble(legs), before = res.dist;
        showRoute(out, false);
        toast('Tracé modifié pour éviter de repasser par le même chemin (' + (extra >= 0 ? '+' : '') + G.fmtDist(Math.abs(extra)) + ').');
      } else { setRouteStatus(''); RT.route.backTried = true; renderBackWarn(); }
      setRouteStatus('');
    }
    step(0);
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
    routeLine.on('contextmenu', function (e) { L.DomEvent.stop(e); showCtx(e.originalEvent.clientX, e.originalEvent.clientY, routeLineMenu(e.latlng)); });
    directLayers = drawDirects(gRoute, r, routeColor());
    routeLine.on('mouseover', function () { if (RT.tool === 'route') routeLine.setStyle({ color: '#c6a24e' }); });
    routeLine.on('mouseout', restyleRoute);
    routeLine.bringToFront(); directLayers.forEach(function (l) { if (l.bringToFront) l.bringToFront(); });
    routeMarkers.forEach(function (m) { m.setZIndexOffset(1000); });
  }
  // Insère un point dans le tronçon du tracé le plus proche : la numérotation suit l'ordre de passage.
  function insertOnRoute(p) {
    var r = RT.route, s = nearestSegment(r.line, p), leg = legOfSeg(r, s);
    var dir = (r.directs || []).some(function (u) { return s >= u.from && s < u.to; });   // le point cliqué sur un tronçon en ligne droite est lui aussi en ligne droite
    var at = Math.min(leg + 1, S.route.wps.length), nx = S.route.wps[at];
    addWp(p, null, at, dir ? (nx && nx.az ? 'az' : 'direct') : (segOf() === 'route' ? null : segOf()));
  }
  // Segment du tracé le plus proche d'un point (distance au segment, pas au sommet : un clic près d'une jonction ne change pas de tronçon).
  function nearestSegment(line, p) {
    var kx = Math.cos(p[0] * Math.PI / 180), best = 0, bd = Infinity;
    for (var i = 0; i + 1 < line.length; i++) {
      var ax = line[i][1] * kx, ay = line[i][0], bx = line[i + 1][1] * kx, by = line[i + 1][0], px = p[1] * kx, py = p[0];
      var dx = bx - ax, dy = by - ay, t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
      var d = Math.pow(ax + t * dx - px, 2) + Math.pow(ay + t * dy - py, 2);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function legOfSeg(r, s) {
    if (r.bounds) { for (var q = 0; q < r.bounds.length - 1; q++) if (s >= r.bounds[q] && s < r.bounds[q + 1]) return q; return Math.max(0, r.bounds.length - 2); }
    return legOf(s);
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
    if (r.bounds) { for (var q = 0; q < r.bounds.length - 2; q++) if (idx <= r.bounds[q + 1]) return q; return Math.max(0, r.bounds.length - 2); }
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
    if (p) html += '<div><span>Dénivelé</span><b>+' + Math.round(p.asc) + ' / −' + Math.round(p.desc) + ' m</b></div><div title="Estimation indicative selon la pente (formule de Tobler) et votre allure de marche"><span>Marche (indicatif)</span><b>' + G.fmtDur(walkSecs(p, r.dist)) + '</b></div><div title="Pente maximale mesurée sur des tronçons d’environ 40 m"><span>Pente max</span><b>+' + Math.round(p.up || 0) + ' % / −' + Math.round(p.down || 0) + ' %</b></div>';
    el.innerHTML = html; el.hidden = false;
  }

  /* ==== src/app/07-itineraire.js : itinéraire : points, ordre de passage, liste des étapes ==== */
  // ---------- Itinéraire : fonctions par calque ----------
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
  /* L'attribut « name » de la Géoplateforme est une chaîne JSON (parfois tronquée) : on en extrait les champs par motif. */
  function stepMeta(st) {
    var n = st.attributes && st.attributes.name, o = { name: '', num: '', cls: '' };
    if (!n) return o;
    if (typeof n === 'object') { o.name = n.cpx_toponyme || n.nom_1_droite || n.nom_1_gauche || ''; o.num = n.cpx_numero || ''; o.cls = n.cpx_classement_administratif || ''; return o; }
    var s = String(n);
    function g(k) { var m = new RegExp('"' + k + '"\\s*:\\s*"([^"]*)"').exec(s); return m ? m[1].trim() : ''; }
    o.name = g('cpx_toponyme') || g('nom_1_droite') || g('nom_1_gauche');
    o.num = g('cpx_numero'); o.cls = g('cpx_classement_administratif');
    if (!o.name && s.charAt(0) !== '{' && s.indexOf('"') < 0 && s.length < 60) o.name = s;
    return o;
  }
  function stepName(st) { var m = stepMeta(st); return m.name || m.num || ''; }
  function natOf(m) { return /^N\s?\d/i.test(m.num) ? m.num.replace(/\s/g, '').toUpperCase() : /nationale/i.test(m.cls) ? 'nationale' : ''; }

  // d = données d'un calque itinéraire ; les points sont numérotés dans l'ordre de passage.
  function loopOf(d) { return !!d.loop && d.wps.length >= 3; }   // deux points ne font jamais une boucle (sinon le retour double la distance)
  function effOf(d) { return loopOf(d) ? d.wps.concat([d.wps[0]]) : d.wps; }
  function lblOf(d, i) { return i === 0 ? 'A' : (i === d.wps.length - 1 && !loopOf(d)) ? 'B' : String(i); }
  function clsOf(d, i) { return i === 0 ? 'start' : (i === d.wps.length - 1 && !loopOf(d)) ? 'end' : 'via'; }
  function titleOf(d, i) { return i === 0 ? 'Départ' : (i === d.wps.length - 1 && !loopOf(d)) ? 'Arrivée' : 'Étape ' + i; }
  function nameOf(d, i) { var w = d.wps[i]; return (w && (w.name || w.place)) || titleOf(d, i); }
  function effWps() { return effOf(S.route); }
  function overMax() { return !!(RT.route && S.route.maxOn && S.route.maxKm > 0 && RT.route.dist > S.route.maxKm * 1000); }

  var routeLine = null, routeCasing = null;
  // mode : true ou 'direct' (ligne droite), 'az' (ligne droite avec azimut), sinon par les chemins
  function addWp(p, name, idx, direct) {
    ensureVisible('route');
    var o = { lat: p[0], lon: p[1] }; if (name) o.name = name;
    var at = idx == null ? S.route.wps.length : idx;
    if (at > 0 && (direct === true || direct === 'direct' || direct === 'az')) { o.direct = true; if (direct === 'az') o.az = true; }
    S.route.wps.splice(at, 0, o);
    renderRouteMarkers(); computeRoute(); persist(); select('route', at, true);
    fillPlaces(S.route);
  }
  // Quand le pointeur est à peu près de la taille d'un village (carte assez dézoomée), le point se place au centre du village :
  // l'église la plus importante ; à défaut la mairie ; dans une ville (beaucoup d'églises), l'édifice le plus important, vers le centre.
  function poiAround(cat, lat, lon, R) {
    var centers = [[lat, lon, Math.min(500, R)]];
    if (R > 500) for (var k = 0; k < 6; k++) {
      var a = k * Math.PI / 3, dd = R - 500;
      centers.push([lat + Math.cos(a) * dd / 110540, lon + Math.sin(a) * dd / (111320 * Math.cos(lat * Math.PI / 180)), 500]);
    }
    return Promise.all(centers.map(function (c) {
      var circle = JSON.stringify({ type: 'Circle', coordinates: [+c[1].toFixed(6), +c[0].toFixed(6)], radius: Math.round(c[2]) });
      return fetch(GP + '/geocodage/reverse?index=poi&limit=15&category=' + encodeURIComponent(cat) + '&lon=' + c[1].toFixed(6) + '&lat=' + c[0].toFixed(6) + '&searchgeom=' + encodeURIComponent(circle))
        .then(function (x) { return x.ok ? x.json() : { features: [] }; }).then(function (j) { return j.features || []; }).catch(function () { return []; });
    })).then(function (all) {
      var seen = {}, out = [];
      all.forEach(function (fs) { fs.forEach(function (f) {
        var g = f.geometry && f.geometry.coordinates; if (!g) return;
        var key = g[0].toFixed(5) + ',' + g[1].toFixed(5); if (seen[key]) return; seen[key] = 1;
        var d = L.latLng(lat, lon).distanceTo(L.latLng(g[1], g[0])); if (d > R) return;
        out.push({ lat: g[1], lon: g[0], d: d, name: arr(f.properties.toponym || f.properties.name)[0] || '', imp: +f.properties.importance || 0 });
      }); });
      return out;
    });
  }
  function churchScore(c) {
    var n = c.name || '', s = c.imp;
    if (/cath[ée]drale|basilique|coll[ée]giale|abbatiale|abbaye|prieur/i.test(n)) s += 0.3;
    if (/chapelle|oratoire|calvaire|croix|temple|synagogue|mosqu|lourdes|grotte/i.test(n)) s -= 0.3;
    if (/[ée]glise/i.test(n)) s += 0.1;
    return s;
  }
  function villageCenter(lat, lon, R) {
    return poiAround('culte chrétien', lat, lon, R).then(function (ch) {
      ch = ch.filter(function (c) { return !/clocher/i.test(c.name); });
      if (ch.length) {
        var cx = ch.reduce(function (s, c) { return s + c.lat; }, 0) / ch.length, cy = ch.reduce(function (s, c) { return s + c.lon; }, 0) / ch.length;
        var town = ch.length >= 4;
        ch.forEach(function (c) { c.sc = churchScore(c); c.dc = L.latLng(cx, cy).distanceTo(L.latLng(c.lat, c.lon)); });
        // village : la plus importante, à égalité la plus proche du clic ; ville : la plus importante, à égalité la plus centrale.
        ch.sort(function (a, b) { return (b.sc - a.sc) || (town ? a.dc - b.dc : a.d - b.d); });
        return { p: ch[0], what: town ? 'l’édifice le plus important de la ville' : 'l’église du village' };
      }
      return poiAround('mairie', lat, lon, R).then(function (m) {
        m = m.filter(function (c) { return !/annexe/i.test(c.name); }).sort(function (a, b) { return a.d - b.d; });
        return m.length ? { p: m[0], what: 'la mairie' } : null;
      });
    });
  }
  // Placement d'un point : village / hameau / col / sommet proche, sinon chemin le plus proche ; très zoomé, le point reste où l'on clique.
  function snapToChurch(w) {
    if (!w || S.route.snapChurch === false || w.noSnap || w.direct) return Promise.resolve();
    var mpp = 156543.03392 * Math.cos(w.lat * Math.PI / 180) / Math.pow(2, map.getZoom());
    if (mpp < 0.55) return ensureAnchor(w);                         // très zoomé : on respecte le clic, mais un point loin de tout chemin est relié en pointillés
    var R = Math.min(1250, Math.max(100, 24 * mpp)), o = { lat: w.lat, lon: w.lon };
    return villageCenter(w.lat, w.lon, R).then(function (res) {
      if (res) return { lat: res.p.lat, lon: res.p.lon, what: res.what };
      return poiAround('lieu-dit habité', w.lat, w.lon, R).then(function (h) {
        h.sort(function (x, y) { return x.d - y.d; });
        if (h.length) return { lat: h[0].lat, lon: h[0].lon, what: 'le hameau' };
        return Promise.all([poiAround('col', w.lat, w.lon, Math.min(R, 400)), poiAround('sommet', w.lat, w.lon, Math.min(R, 300))]).then(function (r) {
          var all = r[0].map(function (x) { x.k = 'le col'; return x; }).concat(r[1].map(function (x) { x.k = 'le sommet'; return x; })).sort(function (x, y) { return x.d - y.d; });
          if (all.length) return { lat: all[0].lat, lon: all[0].lon, what: all[0].k, offtrail: true };
          return nearestRoadPoint(w.lat, w.lon, Math.max(R, 150)).then(function (rd) { return rd ? { lat: rd.lat, lon: rd.lon, what: 'le chemin le plus proche' } : null; });
        });
      });
    }).then(function (res) {
      var i = S.route.wps.indexOf(w); if (i < 0) return;
      if (!res) return ensureAnchor(w);                          // rien à proximité : on vérifie au moins la distance au chemin
      if (L.latLng(w.lat, w.lon).distanceTo(L.latLng(res.lat, res.lon)) < 8) return ensureAnchor(w);
      w.orig = o; w.moved = true; w.lat = res.lat; w.lon = res.lon; w.place = undefined;
      renderRouteMarkers(); renderWpList(); computeRoute(); persist(); fillPlaces(S.route);
      toast('Point placé sur ' + res.what + '. Clic droit sur le point pour le remettre où vous avez cliqué.', { kind: 'info', level: 'discret' });
      if (res.offtrail) ensureAnchor(w);
    }).catch(function () {});
  }
  function restoreWp(i) {
    var w = S.route.wps[i]; if (!w || !w.orig) return;
    w.lat = w.orig.lat; w.lon = w.orig.lon; w.moved = false; w.noSnap = true; w.rescued = false; w.place = undefined; delete w.orig;
    renderRouteMarkers(); renderWpList(); computeRoute(); persist(); fillPlaces(S.route);
  }
  // ----- Ordre de passage libre : pour une boucle, on cherche l'ordre le plus court (distance à vol d'oiseau) en gardant le départ.
  function bestOrder(w, loop) {
    var n = w.length, kx = Math.cos(w[0].lat * Math.PI / 180);
    function D(a, b) { return Math.hypot((w[a].lat - w[b].lat) * 110540, (w[a].lon - w[b].lon) * 111320 * kx); }
    function len(o) { var s = 0; for (var i = 0; i + 1 < o.length; i++) s += D(o[i], o[i + 1]); if (loop) s += D(o[o.length - 1], o[0]); return s; }
    var mid = []; for (var i = 1; i < (loop ? n : n - 1); i++) mid.push(i);
    var mk = function (m) { return loop ? [0].concat(m) : [0].concat(m, [n - 1]); };
    var cur = len(mk(mid)), best = mid.slice(), bl = cur;
    if (mid.length <= 8) {
      (function perm(a, k) {
        if (k === a.length) { var l = len(mk(a)); if (l < bl - 1e-6) { bl = l; best = a.slice(); } return; }
        for (var j = k; j < a.length; j++) { var x = a[k]; a[k] = a[j]; a[j] = x; perm(a, k + 1); x = a[k]; a[k] = a[j]; a[j] = x; }
      })(mid.slice(), 0);
    } else {
      // plus proche voisin puis 2-opt jusqu'à stabilisation
      var left = mid.slice(), o = [], last = 0;
      while (left.length) { var bi = 0, bd = Infinity; left.forEach(function (c, k) { var d = D(last, c); if (d < bd) { bd = d; bi = k; } }); last = left.splice(bi, 1)[0]; o.push(last); }
      var imp = true, it = 0;
      while (imp && it++ < 50) {
        imp = false;
        for (var a = 0; a < o.length - 1; a++) for (var b = a + 1; b < o.length; b++) {
          var t2 = o.slice(0, a).concat(o.slice(a, b + 1).reverse(), o.slice(b + 1));
          if (len(mk(t2)) < len(mk(o)) - 1e-6) { o = t2; imp = true; }
        }
      }
      if (len(mk(o)) < bl) { bl = len(mk(o)); best = o; }
    }
    return { order: mk(best), gain: cur > 0 ? 1 - bl / cur : 0 };
  }
  // Points reliés entre eux en ligne droite = un seul « bloc » : l'ordre interne est figé, le bloc se place comme un seul point
  // (dans un sens ou dans l'autre), et le calcul automatique de l'ordre de passage se fait normalement pour le reste.
  function blocksOf(w, loop) {
    var bl = [], i = 0, n = w.length;
    while (i < n) { var b = [i]; while (i + 1 < n && w[i + 1].direct) { i++; b.push(i); } bl.push(b); i++; }
    return bl;
  }
  function bestBlockOrder(w, loop) {
    var bl = blocksOf(w, loop), nb = bl.length, kx = Math.cos(w[0].lat * Math.PI / 180);
    function D(a, b) { return Math.hypot((w[a].lat - w[b].lat) * 110540, (w[a].lon - w[b].lon) * 111320 * kx); }
    var fixedEnd = !loop && nb > 1;
    var mid = []; for (var i = 1; i < (fixedEnd ? nb - 1 : nb); i++) mid.push(i);
    // longueur d'une suite de blocs, orientation de chaque bloc choisie au mieux (programmation dynamique)
    function evalOrder(ord) {
      var seq = [0].concat(ord, fixedEnd ? [nb - 1] : []), INF = 1e18, prev = null, res = [];
      seq.forEach(function (bi, k) {
        var b = bl[bi], opts = (k === 0 || (fixedEnd && k === seq.length - 1)) ? [0] : [0, 1], cur = [];
        opts.forEach(function (o) {
          var entry = o ? b[b.length - 1] : b[0], exit = o ? b[0] : b[b.length - 1], inner = 0;
          for (var q = 0; q + 1 < b.length; q++) inner += D(b[q], b[q + 1]);
          var best = INF, from = -1;
          if (!prev) best = inner; else prev.forEach(function (p, pi) { var c = p.cost + D(p.exit, entry) + inner; if (c < best) { best = c; from = pi; } });
          cur.push({ o: o, cost: best, exit: exit, entry: entry, from: from });
        });
        res.push(cur); prev = cur;
      });
      var bi2 = 0, bc = INF;
      prev.forEach(function (p, i2) { var c = p.cost + (loop ? D(p.exit, bl[0][0]) : 0); if (c < bc) { bc = c; bi2 = i2; } });
      var oris = new Array(seq.length), idx = bi2;
      for (var k = seq.length - 1; k >= 0; k--) { var st = res[k][idx]; oris[k] = st.o; idx = st.from; }
      return { len: bc, seq: seq, oris: oris };
    }
    var cur = evalOrder(mid), best = cur;
    if (mid.length <= 7) {
      (function perm(a, k) {
        if (k === a.length) { var e = evalOrder(a); if (e.len < best.len - 1e-6) best = e; return; }
        for (var j = k; j < a.length; j++) { var x = a[k]; a[k] = a[j]; a[j] = x; perm(a, k + 1); x = a[k]; a[k] = a[j]; a[j] = x; }
      })(mid.slice(), 0);
    } else {
      var left = mid.slice(), o = [], last = 0;
      while (left.length) { var bi = 0, bd = Infinity; left.forEach(function (c, k) { var d = D(bl[last][bl[last].length - 1], bl[c][0]); if (d < bd) { bd = d; bi = k; } }); last = left.splice(bi, 1)[0]; o.push(last); }
      var imp = true, it = 0;
      while (imp && it++ < 40) {
        imp = false;
        for (var a = 0; a < o.length - 1; a++) for (var b2 = a + 1; b2 < o.length; b2++) {
          var t2 = o.slice(0, a).concat(o.slice(a, b2 + 1).reverse(), o.slice(b2 + 1));
          if (evalOrder(t2).len < evalOrder(o).len - 1e-6) { o = t2; imp = true; }
        }
      }
      var e2 = evalOrder(o); if (e2.len < best.len) best = e2;
    }
    var order = [], flags = [];
    best.seq.forEach(function (bi, k) { var b = bl[bi].slice(); if (best.oris[k]) b.reverse(); b.forEach(function (x, q) { order.push(x); flags.push(q > 0); }); });
    return { order: order, flags: flags, gain: cur.len > 0 ? 1 - best.len / cur.len : 0 };
  }
  function reorderFree(focus) {
    var d = S.route;
    if (d.freeOrder === false || d.wps.length < 3) return;
    var hasDirect = d.wps.some(function (x) { return x.direct; });
    var r = hasDirect ? bestBlockOrder(d.wps, loopOf(d)) : bestOrder(d.wps, loopOf(d));
    if (r.gain < 0.002) return;
    var ws = d.wps; d.wps = r.order.map(function (k) { return ws[k]; });
    if (r.flags) d.wps.forEach(function (x, k) { if (r.flags[k]) x.direct = true; else delete x.direct; });
    renderRouteMarkers(); renderWpList(); computeRoute(); persist();
    var at = focus ? d.wps.indexOf(focus) : -1; if (at >= 0) select('route', at, true);
    toast(hasDirect ? 'Ordre de passage optimisé : les points reliés en ligne droite restent groupés.' : 'Ordre de passage optimisé : boucle la plus courte par les points choisis.');
  }
  function closeLoop() {
    if (S.route.wps.length < 3) { toast('Il faut au moins trois points pour faire une boucle : avec deux points, c’est un aller simple.', { kind: 'info' }); return; }
    if (S.route.loop) return;
    S.route.loop = true; syncRouteUi(); renderRouteMarkers(); computeRoute(); persist();
    toast('Boucle fermée : le tracé revient au point de départ.');
  }
  var routeLinks = [];
  function renderRouteMarkers() {
    routeMarkers.forEach(function (m) { gRoute.removeLayer(m); }); routeMarkers = [];
    routeLinks.forEach(function (l) { gRoute.removeLayer(l); }); routeLinks = [];
    // tronçons en azimut : azimut magnétique et distance au milieu du tronçon
    var ew0 = RT.route ? [] : effWps();
    ew0.forEach(function (q, k) {
      if (!k || !q.az || (k === ew0.length - 1 && loopOf(S.route) && q === S.route.wps[0])) return;
      var a = [ew0[k - 1].lat, ew0[k - 1].lon], b = [q.lat, q.lon], m = G.magAz(a, b);
      routeLinks.push(L.marker([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], { interactive: false, icon: L.divIcon({ className: 'az-label', html: '<span>' + m.az + '° · ' + G.fmtDist(m.dist) + '</span>', iconSize: [0, 0] }) }).addTo(gRoute));
    });
    S.route.wps.forEach(function (q) { if (q.anchor) { var ln = L.polyline([[q.lat, q.lon], [q.anchor.lat, q.anchor.lon]], { color: S.route.color, weight: 3, opacity: 0.95, dashArray: '2 7', lineCap: 'round', interactive: false }).addTo(gRoute); routeLinks.push(ln); } });
    var d = S.route, w = d.wps, closable = RT.tool === 'route' && w.length >= 3 && !d.loop;
    w.forEach(function (p, i) {
      var m = L.marker([p.lat, p.lon], { draggable: !VIEWER, icon: pin(lblOf(d, i), clsOf(d, i), i === 0 && closable ? 'closable' : ''), zIndexOffset: 1000 }).addTo(gRoute);
      m.bindTooltip(i === 0 && closable ? 'Cliquer pour fermer la boucle' : esc(nameOf(d, i)), { direction: 'top', offset: [0, -14] });
      m.on('dragstart', function () { select('route', i, true); });
      m.on('dragend', function () {
        var q = m.getLatLng(), old = S.route.wps[i]; S.route.wps[i] = { lat: q.lat, lon: q.lng, name: old.name };
        if (old.direct) S.route.wps[i].direct = true;                      // un point déplacé reste en ligne droite (ou en azimut)
        if (old.az) S.route.wps[i].az = true;
        renderWpList(); computeRoute(); persist(); fillPlaces(S.route); ensureAnchor(S.route.wps[i]); reorderFree(S.route.wps[i]);
      });
      m.on('click', function () { if (i === 0 && closable) closeLoop(); select('route', i, true); });
      m.on('contextmenu', function (e) { L.DomEvent.stop(e); select('route', i, true); showCtx(e.originalEvent.clientX, e.originalEvent.clientY, routePtMenu(i)); });
      routeMarkers.push(m);
    });
    renderWpList(); applySel();
  }
  // façon de rejoindre le point i depuis le précédent, telle qu'affichée dans la liste
  function legNote(w, i) {
    var p = w[i], q = w[i - 1]; if (!p || !q) return '';
    if (p.az) { var m = G.magAz([q.lat, q.lon], [p.lat, p.lon]); return ' · azimut ' + m.az + '° (contre ' + m.back + '°) · ' + G.fmtDist(m.dist); }
    return p.direct ? ' · en ligne droite' : '';
  }
  function renderWpList() {
    var d = S.route, w = d.wps, loop = loopOf(d);
    $('#wps-empty').hidden = w.length > 0;
    $('#wp-count').textContent = w.length ? '(' + w.length + ')' : '';
    $('#wps').innerHTML = w.map(function (p, i) {
      return '<li data-i="' + i + '"><span class="grip" draggable="true" title="Glisser pour changer l’ordre de passage">' + ic('grip') + '</span><span class="badge ' + clsOf(d, i) + '">' + lblOf(d, i) + '</span><div class="wp-main"><input class="wp-name" data-i="' + i + '" value="' + esc(p.name || p.place || '') + '" placeholder="' + esc(titleOf(d, i)) + '" aria-label="Nom du point (village ou hameau par défaut)">' +
        '<small>' + esc(titleOf(d, i)) + (p.place && p.name && p.name !== p.place ? ' · près de ' + esc(p.place) : '') + (i > 0 ? legNote(w, i) : '') + ' · ' + esc(fmtP([p.lat, p.lon])) + '</small></div><button class="ibtn danger" data-del="' + i + '" title="Retirer ce point (Suppr)" aria-label="Retirer">' + ic('x') + '</button></li>';
    }).join('') + (loop ? '<li class="ret"><span class="badge start">A</span><span>Arrivée : retour au départ</span></li>' : '');
    applySel();
  }
  (function wpListEvents() {
    var ul = $('#wps'), dragFrom = -1;
    ul.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]');
      if (del) { removeWp(+del.dataset.del); return; }
      var li = e.target.closest('li[data-i]'); if (!li) return;
      var i = +li.dataset.i; select('route', i); var w = S.route.wps[i]; if (w) panToIfHidden(L.latLng(w.lat, w.lon));
    });
    ul.addEventListener('input', function (e) {
      var inp = e.target.closest('.wp-name'); if (!inp) return;
      var o = S.route.wps[+inp.dataset.i]; if (!o) return;
      if (inp.value.trim() && inp.value.trim() !== o.place) o.name = inp.value.trim(); else delete o.name;
      persist();
    });
    ul.addEventListener('focusin', function (e) { var li = e.target.closest('li[data-i]'); if (li && e.target.matches('.wp-name')) select('route', +li.dataset.i); });
    ul.addEventListener('dragstart', function (e) {
      var g = e.target.closest('.grip'); if (!g) { e.preventDefault(); return; }
      var li = g.closest('li'); dragFrom = +li.dataset.i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragFrom));
      if (e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(li, 12, 12);
      li.classList.add('dragging');
    });
    ul.addEventListener('dragover', function (e) {
      var li = e.target.closest('li[data-i]'); if (!li || dragFrom < 0) return;
      e.preventDefault(); $$('#wps li').forEach(function (x) { x.classList.toggle('drop', x === li); });
    });
    ul.addEventListener('drop', function (e) {
      var li = e.target.closest('li[data-i]'); if (!li || dragFrom < 0) return;
      e.preventDefault(); var to = +li.dataset.i, from = dragFrom; dragFrom = -1;
      if (from !== to) moveWp(from, to);
    });
    ul.addEventListener('dragend', function () { dragFrom = -1; $$('#wps li').forEach(function (x) { x.classList.remove('dragging', 'drop'); }); });
  })();
  function moveWp(from, to) {
    var w = S.route.wps, x = w.splice(from, 1)[0]; w.splice(to, 0, x); normDirect();
    renderRouteMarkers(); computeRoute(); persist(); select('route', to, true);
    toast('Ordre de passage modifié : les points sont renumérotés.');
  }
  function normDirect() { var w = S.route.wps; if (w[0]) { delete w[0].direct; delete w[0].az; } }
  function removeWp(i) { S.route.wps.splice(i, 1); normDirect(); if (SEL && SEL.k === 'route') SEL = null; renderRouteMarkers(); computeRoute(); persist(); }
  function reverseRoute() {
    var w = S.route.wps; if (w.length < 2) { toast('Posez au moins deux points pour inverser le sens.'); return; }
    var n0 = w.length, fl = w.map(function (x) { return !!x.direct; }), lp = loopOf(S.route);
    S.route.wps = lp ? [w[0]].concat(w.slice(1).reverse()) : w.reverse();
    S.route.wps.forEach(function (x, k) { var f = k < 1 ? false : lp ? (k >= 2 && fl[n0 - k + 1]) : fl[n0 - k]; if (f) x.direct = true; else delete x.direct; });
    select(null); renderRouteMarkers(); computeRoute(); persist();
    toast('Sens du parcours inversé.');
  }
  $('#route-undo').addEventListener('click', function () { if (S.route.wps.length) removeWp(S.route.wps.length - 1); });
  $('#route-clear').addEventListener('click', function () { S.route.wps = []; select(null); renderRouteMarkers(); computeRoute(); persist(); });
  $('#route-reverse').addEventListener('click', reverseRoute);
  $$('#route-mode button').forEach(function (b) {
    b.addEventListener('click', function () { S.route.loop = b.dataset.v === 'loop'; syncRouteUi(); renderRouteMarkers(); computeRoute(); persist(); });
  });
  $('#route-opt').addEventListener('change', function () { S.route.opt = this.value; computeRoute(); persist(); });
  $('#speed').addEventListener('input', function () { S.speed = Math.max(1, +this.value || 5); renderRouteStats(); persist(); });
  $('#opt-motorway').addEventListener('change', function () { S.route.avoidMotorway = this.checked; computeRoute(); persist(); });
  $('#opt-free').addEventListener('change', function () { S.route.freeOrder = this.checked; if (this.checked) reorderFree(null); persist(); });
  $('#opt-church').addEventListener('change', function () { S.route.snapChurch = this.checked; persist(); });
  $('#opt-noback').addEventListener('change', function () { S.route.noBack = this.checked; computeRoute(); persist(); });
  $('#opt-national').addEventListener('change', function () { S.route.flagNat = this.checked; renderNatWarn(); persist(); });
  $('#max-on').addEventListener('change', function () { S.route.maxOn = this.checked; syncRouteUi(); onMaxChange(); persist(); });
  $('#max-km').addEventListener('input', function () { S.route.maxKm = Math.max(0, +this.value || 0); onMaxChange(); persist(); });
  $('#route-pdf').addEventListener('click', function () { openPdf(); });
  function onMaxChange() { restyleRoute(); renderRouteStats(); renderGauge(); refreshProfile(); }
  function syncRouteUi() {
    $$('#route-mode button').forEach(function (b) { b.classList.toggle('on', (b.dataset.v === 'loop') === !!S.route.loop); });
    $('#route-opt').value = S.route.opt; $('#speed').value = S.speed;
    $('#opt-motorway').checked = !!S.route.avoidMotorway; $('#opt-national').checked = !!S.route.flagNat; $('#opt-noback').checked = S.route.noBack !== false; $('#opt-church').checked = S.route.snapChurch !== false; $('#opt-free').checked = S.route.freeOrder !== false;
    $('#max-on').checked = !!S.route.maxOn; $('#max-km').value = S.route.maxKm; $('#max-km').disabled = !S.route.maxOn;
    syncNames();
  }
  function setRouteStatus(msg, err) { var el = $('#route-status'); el.textContent = msg || ''; el.className = 'status' + (err ? ' error' : ''); setNote('err', err ? msg : '', 'bad'); }
  function routeColor() { return overMax() ? '#c0262d' : S.route.color; }
  function restyleRoute() { if (routeLine) routeLine.setStyle({ color: routeColor() }); }
  // Tronçons à vol d'oiseau : le tracé plein est recouvert de blanc puis redessiné en pointillés, avec l'azimut et la distance au milieu.
  function drawDirects(group, res, col, scale) {
    var out = []; scale = scale || 1;
    (res && res.directs || []).forEach(function (u) {
      var a = res.line[u.from], b = res.line[u.to]; if (!a || !b) return;
      var seg = res.line.slice(u.from, u.to + 1), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = G.haversine(a, b), brg = G.bearing(a, b);
      out.push(L.polyline(seg, { color: '#fff', weight: 10 * scale, opacity: 1, lineCap: 'butt', interactive: false }).addTo(group));
      out.push(L.polyline(seg, { color: '#fff', weight: 8 * scale, opacity: .9, lineCap: 'round', interactive: false }).addTo(group));
      out.push(L.polyline(seg, { color: col, weight: 5 * scale, opacity: 1, dashArray: (1 * scale) + ' ' + (7 * scale), lineCap: 'round', interactive: false }).addTo(group));
      out.push(L.marker(mid, { interactive: false, keyboard: false, zIndexOffset: 900, icon: L.divIcon({ className: 'direct-lbl', iconSize: [0, 0], html: u.az ? (function (m) { return '<span class="is-az" style="--c:' + col + '" title="Azimut à la boussole ' + m.az + '° (contre-azimut ' + m.back + '°), ' + G.fmtDist(m.dist) + '">' + m.az + '° · ' + G.fmtDist(m.dist) + '</span>'; })(G.magAz(a, b))
        : '<span style="--c:' + col + '" title="En ligne droite : ' + G.fmtDist(d) + '">' + Math.round(((brg % 360) + 360) % 360) + '°</span>' }) }).addTo(group));
    });
    return out;
  }
  var directLayers = [];
  function clearRouteLines() {
    directLayers.forEach(function (l) { gRoute.removeLayer(l); }); directLayers = [];
    if (routeLine) { gRoute.removeLayer(routeLine); routeLine = null; }
    if (routeCasing) { gRoute.removeLayer(routeCasing); routeCasing = null; }
    if (backLine) { gRoute.removeLayer(backLine); backLine = null; }
  }
  // Redessine le calque itinéraire en cours d'édition (après activation d'un calque, par exemple).
  function refreshRouteView() {
    clearTimeout(routeTimer); if (RT.routeCtl) RT.routeCtl.abort();
    clearRouteLines(); syncRouteUi(); renderRouteMarkers();
    if (RT.route && RT.route.line) { drawRoute(); renderSteps(); renderRouteStats(); renderGauge(); renderNatWarn(); setRouteStatus(''); refreshProfile(); loadNature(); }
    else computeRoute();
    fillPlaces(S.route);
  }

  var routeTimer, backLine = null, legCache = {}, legQueue = [], legBusy = 0;
  function computeRoute() {
    clearTimeout(routeTimer);
    clearRouteLines();
    RT.route = null; if ($('#nature-box')) $('#nature-box').hidden = true; renderRouteStats(); renderGauge(); renderNatWarn(); $('#steps-box').hidden = true; renderLayerList(); renderStored();
    if (RT.routeCtl) RT.routeCtl.abort();
    var w = effWps();
    if (w.length < 2) {
      setRouteStatus(S.route.wps.length === 1 ? (S.route.loop ? 'Posez au moins deux autres points pour former la boucle.' : 'Posez l’arrivée sur la carte.') : (S.route.wps.length === 2 && S.route.loop ? 'Boucle : posez un troisième point. Avec deux points, l’itinéraire est un aller simple.' : ''));
      refreshProfile(); return;
    }
    setRouteStatus('Calcul de l’itinéraire…');
    var tag = S.route.id, tok = RT.rtTok = (RT.rtTok || 0) + 1;
    routeTimer = setTimeout(function () {
      var jobs = []; w.forEach(function (_, i) { if (i + 1 < w.length) jobs.push((isDir(w, i + 1) || navigator.onLine === false ? Promise.resolve(directLeg(w[i], w[i + 1])) : legFrom(w[i], w[i + 1])).catch(function (e) { e.leg = i; throw e; })); });
      Promise.all(jobs).then(function (legs) {
        if (tag !== S.route.id || tok !== RT.rtTok) return;
        RT.offlineRoute = navigator.onLine === false;
        var first = !RT.route;
        showRoute(assemble(legs), first);
        if (S.route.noBack) improveBack(legs, w, tok, tag);
      }).catch(function (e) {
        if (tok !== RT.rtTok) return;
        if (e && e.leg != null && /no path|Erreur 4|introuvable|impossible/i.test(e.message || '') && rescueLeg(e.leg, w, tok)) return;
        var emsg = 'Itinéraire impossible : ' + (e.message || 'service indisponible') + '. Rapprochez les points d’une route ou d’un chemin.';
        setRouteStatus(emsg, true); toast(emsg);
        refreshProfile();
      });
    }, 250);
  }
  // Placer le point suivant par azimut (degrés, boussole) et distance, depuis le dernier point de l'itinéraire
  $('#raim-add').addEventListener('click', function () {
    var w = S.route.wps, az = parseFloat(String($('#raim-az').value).replace(',', '.')), d = parseFloat(String($('#raim-d').value).replace(',', '.'));
    if (!w.length) { toast('Posez d’abord le point de départ sur la carte.', { kind: 'warn' }); return; }
    if (!isFinite(az) || az < 0 || az > 360) { toast('Azimut : un nombre de degrés entre 0 et 360.', { kind: 'warn' }); return; }
    if (!isFinite(d) || d <= 0 || d > 50000) { toast('Distance : un nombre de mètres (jusqu’à 50 km).', { kind: 'warn' }); return; }
    var last = w[w.length - 1], p = G.fromMagAz([last.lat, last.lon], az % 360, d);
    addWp(p, null, null, 'az'); $('#raim-d').value = ''; $('#raim-d').focus();
    panToIfHidden(L.latLng(p[0], p[1]));
  });
  $('#raim-d').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#raim-add').click(); } });


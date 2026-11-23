  /* ==== src/app/06-profil-lieux.js : altitudes, profil, noms de lieux ==== */
  // ---------- Altimétrie & profil ----------
  function lineKey(line) {
    return line.length + ':' + line[0].join(',') + ':' + line[Math.floor(line.length / 2)].join(',') + ':' + line[line.length - 1].join(',');
  }
  function fetchElev(points) {
    var chunks = [], i;
    for (i = 0; i < points.length; i += 150) chunks.push(points.slice(i, i + 150));
    return Promise.all(chunks.map(function (c) {
      var url = GP + '/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true&lon=' +
        encodeURIComponent(c.map(function (p) { return p.lon.toFixed(5); }).join('|')) + '&lat=' +
        encodeURIComponent(c.map(function (p) { return p.lat.toFixed(5); }).join('|'));
      return fetch(url).then(function (r) { if (!r.ok) throw new Error('Altimétrie indisponible (' + r.status + ')'); return r.json(); })
        .then(function (j) { return j.elevations; });
    })).then(function (parts) { return [].concat.apply([], parts); });
  }
  // Temps de marche indicatif : vitesse de Tobler selon la pente, ramenée à l'allure choisie (5 km/h à plat par défaut).
  function walkSecs(p, dist) {
    var sp = Math.max(1, S.speed || 5);
    if (!p || !p.pts || p.pts.length < 3) return dist / 1000 / sp * 3600;
    var z = p.pts.map(function (q) { return q.z; }), s = z.map(function (v, i) { return (z[Math.max(0, i - 1)] + v + z[Math.min(z.length - 1, i + 1)]) / 3; }), k = sp / 5.04, t = 0, last = 0;
    for (var i = 1; i < p.pts.length; i++) {
      var ds = Math.max(0.1, p.pts[i].d - p.pts[i - 1].d), sl = Math.max(-0.45, Math.min(0.45, (s[i] - s[i - 1]) / ds)), v = 6 * Math.exp(-3.5 * Math.abs(sl + 0.05)) * k;
      t += ds / 1000 / v * 3600; last = p.pts[i].d;
    }
    return t + Math.max(0, dist - last) / 1000 / sp * 3600;
  }
  function analyse(pts) {
    var z = pts.map(function (p) { return p.z; });
    var s = z.map(function (v, i) { var a = z[Math.max(0, i - 1)], b = z[Math.min(z.length - 1, i + 1)]; return (a + v + b) / 3; });
    var asc = 0, desc = 0, ref = s[0];
    for (var i = 1; i < s.length; i++) {
      var d = s[i] - ref;
      if (d >= 2) { asc += d; ref = s[i]; } else if (d <= -2) { desc -= d; ref = s[i]; }
    }
    var up = 0, down = 0;
    for (var j = 1; j < s.length; j++) { var dd = Math.max(1, pts[j].d - pts[j - 1].d), g = (s[j] - s[j - 1]) / dd * 100; if (g > up) up = g; if (-g > down) down = -g; }
    return { asc: asc, desc: desc, min: Math.min.apply(null, z), max: Math.max.apply(null, z), up: up, down: down };
  }
  function profileFor(line, knownEle) {
    var key = lineKey(line);
    if (RT.elevCache[key]) return Promise.resolve(RT.elevCache[key]);
    var len = G.pathLength(line), n = Math.max(30, Math.min(300, Math.round(len / 40)));
    var pts = G.resample(line, n), p;
    if (knownEle && knownEle.length === line.length) {
      var cum = G.cumDist(line);
      p = Promise.resolve(pts.map(function (q) {
        var j = 0; while (j < cum.length - 1 && cum[j] < q.d) j++;
        var v = knownEle[j]; return v == null ? 0 : v;
      }));
    } else p = fetchElev(pts);
    return p.then(function (zs) {
      var last = null;
      pts.forEach(function (q, i) {
        var v = zs[i];
        if (v == null || v < -500) v = last == null ? 0 : last;
        q.z = v; last = v;
      });
      var res = Object.assign({ pts: pts }, analyse(pts));
      RT.elevCache[key] = res; return res;
    });
  }

  var currentProfile = null;
  function sources() {
    var out = [];
    layersList().forEach(function (l) {
      if (!l.vis || l.empty) return;
      var line = l.type === 'route' ? (l.res && l.res.line) : l.type === 'az' ? l.data.pts : (l.data.mode === 'dist' ? l.data.pts : null);
      if (line && line.length > 1) out.push({ id: l.key, label: l.name, line: line });
    });
    if (S.mode === 'route') S.tracks.forEach(function (t) { if (t.show !== false) out.push({ id: 't' + t.id, label: t.name, line: t.coords, ele: t.ele }); });
    return out;
  }
  var profToken = 0, profHas = false;
  function chip(label, val, cls) { return '<span class="chip' + (cls ? ' ' + cls : '') + '">' + label + ' <b>' + val + '</b></span>'; }
  function refreshProfile() {
    var src = sources(), sel = $('#profile-src');
    sel.innerHTML = src.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.label) + '</option>'; }).join('');
    var cur = src.filter(function (s) { return s.id === S.profileSrc; })[0] || src[0];
    $('#pempty').hidden = !!cur; $('#profile').style.display = cur ? '' : 'none';
    if (profHas !== !!cur) { profHas = !!cur; applyDock(); }   // le profil n'apparaît qu'avec un tracé d'au moins deux points
    sel.style.display = src.length > 1 ? '' : 'none';
    if (!cur) { currentProfile = null; $('#pstats').innerHTML = ''; simSync(); return; }
    sel.value = cur.id;
    var tok = ++profToken;
    $('#pstats').innerHTML = chip('', 'Calcul du profil…');
    profileFor(cur.line, cur.ele).then(function (p) {
      if (tok !== profToken) return;
      currentProfile = p; currentProfile.src = cur.id; simSync();
      var over = cur.id === 'route' && overMax();
      $('#pstats').innerHTML = chip('Distance', G.fmtDist(p.pts[p.pts.length - 1].d), over ? 'bad' : '') + chip('D+', Math.round(p.asc) + ' m') + chip('D−', Math.round(p.desc) + ' m') +
        chip('Altitude', Math.round(p.min) + ' – ' + Math.round(p.max) + ' m');
      drawProfile();
      if (cur.id === 'route') renderRouteStats();
    }).catch(function (e) {
      if (tok !== profToken) return;
      currentProfile = null; $('#pstats').innerHTML = chip('', esc(e.message || 'Profil indisponible.'), 'bad');
      $('#profile').innerHTML = '';
    });
  }
  $('#profile-src').addEventListener('change', function () { S.profileSrc = this.value; persist(); refreshProfile(); });
  $('#dock-head').addEventListener('click', function (e) { if (!e.target.closest('select')) toggleDock(); });
  function toggleDock() { S.dockOpen = !S.dockOpen; applyDock(); persist(); }
  function applyDock() {
    var d = $('#dock');
    d.hidden = !(S.mode === 'route' || S.mode === 'az' || S.mode === 'meas') || !profHas;
    $('#app').classList.toggle('wide', S.mode === 'game');          // grand jeu : panneau plus large (le profil d'altitude est masqué)
    d.classList.toggle('closed', !S.dockOpen);
    d.style.height = S.dockH + 'px';
    $('#dock-toggle').setAttribute('aria-expanded', S.dockOpen);
    setTimeout(function () { map.invalidateSize(); drawProfile(); }, 60);
  }
  (function dockResize() {
    var g = $('#dock-grip');
    g.addEventListener('pointerdown', function (e) {
      e.preventDefault(); g.setPointerCapture(e.pointerId);
      var y0 = e.clientY, h0 = $('#dock').offsetHeight;
      function mv(ev) {
        S.dockH = Math.round(Math.max(130, Math.min(window.innerHeight * 0.6, h0 + (y0 - ev.clientY))));
        $('#dock').style.height = S.dockH + 'px'; map.invalidateSize(); drawProfile();
      }
      function up() { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); persist(); }
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
    });
  })();

  function niceStep(range, n) {
    var raw = range / n, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / mag;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
  }
  // Dessine un profil dans un <svg> ; uid distingue les dégradés quand plusieurs profils coexistent.
  function renderProfileSvg(svg, p, w, h, uid, marks) {
    uid = uid || 'pg';
    var m = { l: 46, r: 14, t: 12, b: 24 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
    var total = p.pts[p.pts.length - 1].d || 1;
    var lo = p.min, hi = p.max, pad = Math.max(5, (hi - lo) * 0.1);
    lo = Math.floor((lo - pad) / 10) * 10; hi = Math.ceil((hi + pad) / 10) * 10;
    var X = function (d) { return m.l + d / total * iw; }, Y = function (z) { return m.t + ih - (z - lo) / (hi - lo) * ih; };
    var ys = niceStep(hi - lo, Math.max(2, Math.floor(ih / 34))), xs = niceStep(total, Math.max(2, Math.floor(iw / 90)));
    var s = '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c6a24e" stop-opacity=".6"/><stop offset="1" stop-color="#c6a24e" stop-opacity=".08"/></linearGradient></defs>';
    for (var z = Math.ceil(lo / ys) * ys; z <= hi; z += ys)
      s += '<line class="grid" x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + Y(z) + '" y2="' + Y(z) + '"/><text class="ax" x="' + (m.l - 6) + '" y="' + (Y(z) + 4) + '" text-anchor="end">' + Math.round(z) + ' m</text>';
    for (var d = 0; d <= total + 1; d += xs)
      s += '<line class="grid v" x1="' + X(d) + '" x2="' + X(d) + '" y1="' + m.t + '" y2="' + (h - m.b) + '"/><text class="ax" x="' + X(d) + '" y="' + (h - 7) + '" text-anchor="middle">' + (total >= 2000 ? (d / 1000).toFixed(xs < 1000 ? 1 : 0).replace('.', ',') + ' km' : Math.round(d) + ' m') + '</text>';
    var line = p.pts.map(function (q, i) { return (i ? 'L' : 'M') + X(q.d).toFixed(1) + ' ' + Y(q.z).toFixed(1); }).join('');
    s += '<path d="' + line + 'L' + X(total).toFixed(1) + ' ' + (m.t + ih) + 'L' + m.l + ' ' + (m.t + ih) + 'Z" fill="url(#' + uid + ')"/>';
    s += '<path d="' + line + '" fill="none" stroke="#000761" stroke-width="2" stroke-linejoin="round"/>';
    (marks || []).forEach(function (mk) {
      var x = X(Math.min(total, mk.d)), y = Y(mk.z);
      s += '<line x1="' + x + '" x2="' + x + '" y1="' + y + '" y2="' + (m.t + ih) + '" stroke="#000761" stroke-opacity=".35" stroke-dasharray="3 3"/><circle cx="' + x + '" cy="' + y + '" r="8.5" fill="' + mk.c + '" stroke="#fff" stroke-width="2"/><text x="' + x + '" y="' + (y + 3.8) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">' + esc(mk.t) + '</text>';
    });
    s += '<g class="cur" visibility="hidden"><line y1="' + m.t + '" y2="' + (h - m.b) + '"/><circle r="4.5"/></g>';
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.innerHTML = s;
    svg._geom = { m: m, iw: iw, total: total, X: X, Y: Y };
  }
  function drawProfile() {
    if (!currentProfile || !S.dockOpen) return;
    var body = $('#dock-body'), w = Math.max(280, body.clientWidth), h = Math.max(90, body.clientHeight);
    var svg = $('#profile'); svg.setAttribute('width', w); svg.setAttribute('height', h);
    renderProfileSvg(svg, currentProfile, w, h, 'pg');
  }
  window.addEventListener('resize', function () { map.invalidateSize(); drawProfile(); });
  (function bindProfileHover() {
    var svg = $('#profile'), tip = $('#ptip');
    function leave() {
      var c = svg.querySelector('.cur'); if (c) c.setAttribute('visibility', 'hidden'); tip.hidden = true; gCursor.clearLayers();
    }
    function move(ev) {
      var g = svg._geom; if (!g || !currentProfile) return;
      var rect = svg.getBoundingClientRect(), cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
      var d = Math.max(0, Math.min(g.total, (cx - g.m.l) / g.iw * g.total)), pts = currentProfile.pts, i = 0;
      while (i < pts.length - 1 && pts[i + 1].d < d) i++;
      var a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
      var q = b.d > a.d ? (d - a.d) / (b.d - a.d) : 0, z = a.z + (b.z - a.z) * q;
      var slope = b.d > a.d ? (b.z - a.z) / (b.d - a.d) * 100 : 0;
      var c = svg.querySelector('.cur'); c.setAttribute('visibility', 'visible');
      c.querySelector('line').setAttribute('x1', g.X(d)); c.querySelector('line').setAttribute('x2', g.X(d));
      c.querySelector('circle').setAttribute('cx', g.X(d)); c.querySelector('circle').setAttribute('cy', g.Y(z));
      tip.hidden = false; tip.textContent = G.fmtDist(d) + ' · ' + Math.round(z) + ' m · pente ' + slope.toFixed(0) + ' %';
      tip.style.left = Math.min(rect.width - 200, Math.max(0, cx + 10)) + 'px';
      gCursor.clearLayers();
      L.circleMarker([a.lat + (b.lat - a.lat) * q, a.lon + (b.lon - a.lon) * q], { radius: 7, color: '#fff', weight: 2, fillColor: '#c6a24e', fillOpacity: 1, interactive: false }).addTo(gCursor);
    }
    svg.addEventListener('mousemove', move); svg.addEventListener('touchmove', move, { passive: true });
    svg.addEventListener('mouseleave', leave); svg.addEventListener('touchend', leave);
  })();

  // ---------- Noms de lieux (village ou hameau) ----------
  var PLACE = {};
  function placeFor(lat, lon) {
    var key = lat.toFixed(3) + ',' + lon.toFixed(3);
    if (PLACE[key] !== undefined) return Promise.resolve(PLACE[key]);
    function q(cat) {
      return fetch(GP + '/geocodage/reverse?index=poi&limit=1&lon=' + lon.toFixed(5) + '&lat=' + lat.toFixed(5) + '&category=' + encodeURIComponent(cat))
        .then(function (r) { return r.ok ? r.json() : { features: [] }; })
        .then(function (j) { var f = (j.features || [])[0]; return f ? (arr(f.properties.toponym || f.properties.name)[0] || '') : ''; })
        .catch(function () { return ''; });
    }
    // Le hameau (lieu-dit habité) s'il est tout proche, sinon la commune.
    return Promise.all([q('lieu-dit habité'), q('commune')]).then(function (r) { PLACE[key] = r[0] || r[1] || ''; return PLACE[key]; });
  }
  function fillPlaces(d) {
    return Promise.all(d.wps.map(function (w) {
      if (w.place !== undefined) return Promise.resolve();
      return placeFor(w.lat, w.lon).then(function (n) { w.place = n; });
    })).then(function () { if (d === S.route) { renderWpList(); renderSteps(); renderRouteMarkers(); } persist(); });
  }


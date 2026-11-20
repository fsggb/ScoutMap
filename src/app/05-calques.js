  /* ==== src/app/05-calques.js : modèle des calques (tracé ouvert + tracés stockés), empreinte d'un tracé ==== */
  // ---------- Calques : modèle ----------
  function inGroup(t) { return S.mode === 'game' || S.mode === 'meas' ? t === S.mode : (t === 'route' || t === 'az'); }
  // empreinte d'un tracé (ses points) : sert à reconnaître deux copies du même itinéraire
  function traceSig(t, d) {
    if (!d) return '';
    var pts = t === 'route' ? (d.wps || []).map(function (w) { return [w.lat, w.lon]; }) : t === 'az' ? (d.pts || []) : null;
    if (!pts || !pts.length) return '';
    return t + ':' + pts.map(function (p) { return (+p[0]).toFixed(5) + ',' + (+p[1]).toFixed(5); }).join(';');
  }
  function isEmpty(t, d) { return t === 'route' ? !d.wps.length : t === 'game' ? !d.shapes.length : !d.pts.length; }
  // Liste unifiée des calques de tracé (en cours d'édition + stockés), regroupés par type.
  function layersList(all) {
    var out = [];
    ['route', 'az', 'meas', 'game'].forEach(function (t) {
      var d = S[t];
      out.push({ type: t, id: d.id, key: t, active: true, name: d.name, color: d.color, vis: S.vis[t] !== false, data: d, res: t === 'route' ? RT.route : null, empty: isEmpty(t, d) });
    });
    S.layers.forEach(function (l) {
      out.push({ type: l.type, id: l.data.id, key: 'L' + l.data.id, active: false, name: l.data.name, color: l.data.color, vis: l.vis !== false, data: l.data, res: l.res || null, empty: false, item: l });
    });
    var order = { route: 0, az: 1, meas: 2, game: 3 };
    out.sort(function (a, b) { return order[a.type] - order[b.type] || a.id - b.id; });
    return all ? out : out.filter(function (l) { return inGroup(l.type); });   // seul le type en cours est visible
  }
  function archiveActive(t) {
    if (isEmpty(t, S[t])) return false;
    S.layers.push({ type: t, vis: S.vis[t] !== false, data: S[t], res: t === 'route' ? RT.route : null });
    return true;
  }
  function newLayer(t, opts) {
    var archived = archiveActive(t);
    if (archived || !S[t].id) {
      var n = S.layers.filter(function (l) { return l.type === t; }).length + 1;
      var prev = S[t]; S[t] = FRESH[t](prev, n);
      if (t === 'route') RT.route = null;
    }
    S.vis[t] = true; applyVis();
    if (t === 'route' && opts && opts.loop !== undefined) S.route.loop = opts.loop;
    renderType(t); setRail(t); persist();
  }
  function activate(id) {
    var l0 = S.layers.filter(function (l) { return l.data.id === id; })[0];
    if (l0 && l0.pid) { openProj(l0.pid); return; }   // un tracé de la bibliothèque affiché : on l'ouvre
    var i = -1;
    S.layers.forEach(function (l, k) { if (l.data.id === id) i = k; });
    if (i < 0) return;
    var it = S.layers.splice(i, 1)[0], t = it.type;
    archiveActive(t);
    S[t] = it.data; S.vis[t] = true; applyVis();
    RT.route = t === 'route' ? (it.res || null) : RT.route;
    if (t !== 'route') { /* rien : azimuts et mesures se redessinent depuis leurs points */ }
    select(null);
    renderType(t); setRail(t); setTool('pan'); persist();
    var b = layerBounds(t); if (b) fit(b, { padding: [70, 70], maxZoom: 17 });
  }
  function renderType(t) {
    if (t === 'route') refreshRouteView(); else if (t === 'az') renderAz(); else if (t === 'meas') renderMeas(); else if (window.SM && SM.game) SM.game.render();
    syncNames(); renderStored(); renderLayerList(); refreshProfile();
  }
  function removeLayer(key) {
    if (key === 'route') { S.route.wps = []; S.route.loop = false; RT.route = null; select(null); refreshRouteView(); }
    else if (key === 'az') { S.az.pts = []; select(null); renderAz(); }
    else if (key === 'meas') { S.meas.pts = []; select(null); renderMeas(); }
    else if (key === 'game') { S.game.shapes = []; if (window.SM && SM.game) SM.game.render(); renderLayerList(); }
    else if (key[0] === 'L') { S.layers = S.layers.filter(function (l) { return 'L' + l.data.id !== key; }); renderStored(); renderLayerList(); refreshProfile(); }
    persist();
  }
  function renameLayer(key, name) {
    name = (name || '').trim(); if (!name) return;
    var L0 = layersList().filter(function (l) { return l.key === key; })[0];
    if (L0) { L0.data.name = name; syncNames(); renderLayerList(); refreshProfile(); renderStored(); persist(); }
  }
  function syncNames() {
    $('#route-name').value = S.route.name; $('#az-name').value = S.az.name; $('#game-name').value = S.game.name;
  }
  [['route-name', 'route'], ['az-name', 'az'], ['game-name', 'game']].forEach(function (p) {
    $('#' + p[0]).addEventListener('input', function () { S[p[1]].name = this.value || ''; renderLayerList(); persist(); });
    $('#' + p[0]).addEventListener('change', function () { if (!this.value.trim()) { this.value = S[p[1]].name = 'Sans nom'; renderLayerList(); } });
  });
  $('#game-pdf').addEventListener('click', function () { openPdf(); });
  $('#az-print').addEventListener('click', function () { openPdf(); });

  // Calques stockés : dessin statique, clic = reprendre l'édition
  function renderStored() {
    gStored.clearLayers();
    S.layers.forEach(function (l) {
      if (l.vis === false || !inGroup(l.type)) return;
      var d = l.data, col = d.color, id = d.id;
      function click(e) { if (RT.tool === 'pan') { L.DomEvent.stopPropagation(e); activate(id); } }
      function ctxs(e) { L.DomEvent.stop(e); showCtx(e.originalEvent.clientX, e.originalEvent.clientY, storedMenu(id)); }
      function tip(layer) { layer.bindTooltip(esc(d.name) + ' – cliquer pour modifier', { sticky: true }); return layer; }
      if (l.type === 'route' && l.res) {
        L.polyline(l.res.line, { color: '#fff', weight: 8, opacity: 0.85, interactive: false, lineCap: 'round' }).addTo(gStored);
        tip(L.polyline(l.res.line, { color: col, weight: 4.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', className: 'stored-line' }).on('click', click).on('contextmenu', ctxs)).addTo(gStored);
        drawDirects(gStored, l.res, col, 0.9);
      }
      if (l.type === 'route') {
        d.wps.forEach(function (p, i) { L.marker([p.lat, p.lon], { icon: pin(lblOf(d, i), clsOf(d, i)), zIndexOffset: 500 }).on('click', click).on('contextmenu', ctxs).addTo(gStored); });
      } else if (l.type === 'az') {
        if (d.pts.length > 1) tip(L.polyline(d.pts, { color: col, weight: 4, dashArray: '10 6', opacity: 0.95, className: 'stored-line' }).on('click', click).on('contextmenu', ctxs)).addTo(gStored);
        d.pts.forEach(function (p, i) { L.marker(p, { icon: pin(String(i + 1), 'az'), zIndexOffset: 400 }).on('click', click).on('contextmenu', ctxs).addTo(gStored); });
      } else if (l.type === 'game') {
        if (window.SM && SM.game) SM.game.build(d, gStored, { stored: true, click: click, ctx: ctxs, tip: esc(d.name) + ' – cliquer pour modifier' });
      } else if (l.type === 'meas') {
        if (d.pts.length > 1) tip((d.mode === 'area' && d.pts.length > 2 ? L.polygon(d.pts, { color: col, weight: 3, fillColor: col, fillOpacity: 0.2, dashArray: '2 6', className: 'stored-line' }) : L.polyline(d.pts, { color: col, weight: 3, dashArray: '2 6', className: 'stored-line' })).on('click', click).on('contextmenu', ctxs)).addTo(gStored);
        d.pts.forEach(function (p) { L.circleMarker(p, { radius: 5, color: '#fff', weight: 2, fillColor: col, fillOpacity: 1, interactive: false }).addTo(gStored); });
      }
    });
  }


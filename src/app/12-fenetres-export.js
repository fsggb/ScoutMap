  /* ==== src/app/12-fenetres-export.js : liens #projet=, fenêtres Fonds et Échelle, export GPX, clic sur la carte ==== */
  // ---------- Fonds, couches, netteté (fenêtres flottantes) ----------
  // Les vignettes des fonds ne sont chargées qu'à la première ouverture du panneau.
  function loadThumbs() { $$('#base-grid img[data-src]').forEach(function (i) { if (i.dataset.src) { i.src = i.dataset.src; i.dataset.src = ''; var b = i.closest('button'); if (b && b.dataset.base === 'scan25' && SCAN25.cfg && SCAN25.cfg.hub) s25Thumb(i); } }); }
  // Version du site (identifiant du déploiement, lu dans l'adresse du script) et mise à jour forcée : efface le cache hors connexion et recharge.
  var SITE_V = (function () { var s = document.querySelector('script[src*="js/app.js"]'), m = s && /[?&]v=([0-9a-f]{6,})/.exec(s.src); return m ? m[1] : 'locale'; })();
  function forceUpdate() {
    var jobs = [];
    if (navigator.serviceWorker) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }));
    if (window.caches) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('sm-shell-') === 0; }).map(function (k) { return caches.delete(k); })); }));
    Promise.all(jobs).catch(function () {}).then(function () { toast('Mise à jour… rechargement'); setTimeout(function () { location.reload(); }, 400); });
  }
  function togglePop(id, force) {
    if (id === 'layer-pop') loadThumbs();
    if (id === 'off-pop' && window.SM && SM.offRender) SM.offRender();
    ['layer-pop', 'scale-pop', 'off-pop'].forEach(function (p) { $('#' + p).hidden = p !== id ? true : (force ? false : !$('#' + p).hidden); });
  }
  function closePops() { $('#layer-pop').hidden = true; $('#scale-pop').hidden = true; $('#off-pop').hidden = true; }
  $('#layer-btn').addEventListener('click', function () { togglePop('layer-pop'); });
  $('#scale-btn').addEventListener('click', function () { togglePop('scale-pop'); });
  $$('[data-close]').forEach(function (b) { b.addEventListener('click', function () { $('#' + b.dataset.close).hidden = true; }); });
  document.addEventListener('mousedown', function (e) {
    if (!e.target.closest('.pop,.layerbtn,.scalebtn,#open-basemaps')) closePops();
  });
  $('#base-grid').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.more) { baseMore = !baseMore; renderBaseGrid(); return; }
    if (!b.dataset.base) return;
    S.base = b.dataset.base; if (BASE_MAIN.indexOf(S.base) >= 0) baseMore = false;
    applyLayers(); renderBaseGrid(); persist();
  });
  $('#ov-grid').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { S.ov[b.dataset.ov] = !S.ov[b.dataset.ov]; applyLayers(); persist(); } });
  // Groupes de fonds : cartes actuelles, photographies, cartes anciennes (du plus récent au plus ancien)
  var BASEGROUPS = [['Cartes actuelles', ['plan', 'scan25', 'otm', 'osm', 'osmfr', 'cyclosm']], ['Photographies aériennes', ['ortho', 'esri', 'photo1950']], ['Cartes anciennes', ['carte1950', 'etat', 'cassiniroi', 'cassini']]];
  var BASEYEAR = { carte1950: '≈ 1950', etat: '1820-1866', cassiniroi: 'XVIIIe siècle', cassini: 'XVIIIe siècle', photo1950: '1950-1965' };
  // Un fond est déconseillé quand l'échelle demandée oblige à l'agrandir bien au-delà de sa finesse d'origine
  function baseFit(k, scale, lat) {
    var d = LAYERS[k]; if (!d || !scale) return { ok: true };
    var z = zoomFor(scale, lat == null ? 45 : lat), over = z - d.n;
    if (over > 1.6) return { ok: false, text: 'Trop flou à 1 : ' + Number(scale).toLocaleString('fr-FR') + ' (données prévues pour des échelles plus petites)' };
    return { ok: true };
  }
  function baseOrdered() { var out = []; BASEGROUPS.forEach(function (g) { g[1].forEach(function (k) { if (LAYERS[k] && !LAYERS[k].hidden && out.indexOf(k) < 0) out.push(k); }); }); BASES.forEach(function (k) { if (!LAYERS[k].hidden && out.indexOf(k) < 0) out.push(k); }); return out; }
  function groupOf(k) { for (var i = 0; i < BASEGROUPS.length; i++) if (BASEGROUPS[i][1].indexOf(k) >= 0) return BASEGROUPS[i][0]; return 'Autres'; }
  window.SM_baseMeta = { groups: BASEGROUPS, year: BASEYEAR, fit: baseFit, ordered: baseOrdered, groupOf: groupOf };
  // Choix par défaut : SCAN 25, puis photos aériennes récentes ; tous les autres fonds sont dans « Tous les fonds de carte… ».
  var BASE_MAIN = ['scan25', 'ortho'], BASE_MAIN_LBL = { scan25: 'SCAN 25 (carte IGN)', ortho: 'Photos aériennes récentes' }, baseMore = false;
  function baseBtn(k, sc, lat, lbl) {
    var f = baseFit(k, sc, lat), name = lbl || LAYERS[k].label;
    return '<button type="button" data-base="' + k + '" class="' + (f.ok ? '' : 'poor') + '" title="' + esc(LAYERS[k].label + (BASEYEAR[k] ? ' (' + BASEYEAR[k] + ')' : '') + (f.ok ? '' : ' : ' + f.text)) + '"><img alt="" data-src="' + thumbUrl(k) + '"><span>' + esc(name) + '</span>' + (f.ok ? '' : '<i class="bg-w">Déconseillé à cette échelle</i>') + '</button>';
  }
  function renderBaseGrid() {
    var sc = curScale(), lat = map.getCenter().lat, h = '<div class="base-main">', viewer = document.body.classList.contains('viewer');
    var main = BASE_MAIN.filter(function (k) { return LAYERS[k] && !LAYERS[k].hidden; });
    if (main.indexOf(S.base) < 0 && LAYERS[S.base]) main.push(S.base);   // fond choisi dans la bibliothèque : reste visible ici
    main.forEach(function (k) { h += baseBtn(k, sc, lat, BASE_MAIN_LBL[k]); });
    h += '</div>';
    if (!viewer) h += '<button type="button" class="base-more" data-more="1">' + (baseMore ? 'Masquer les autres fonds' : 'Tous les fonds de carte…') + '</button>';
    if (baseMore && !viewer) {
      BASEGROUPS.forEach(function (g) {
        var ks = g[1].filter(function (k) { return LAYERS[k] && !LAYERS[k].hidden && BASE_MAIN.indexOf(k) < 0; });
        if (!ks.length) return;
        h += '<h4 class="bg-h">' + esc(g[0]) + '</h4>';
        ks.forEach(function (k) { h += baseBtn(k, sc, lat); });
      });
    }
    $('#base-grid').innerHTML = h;
    $$('#base-grid button').forEach(function (b) { b.classList.toggle('on', b.dataset.base === S.base); });
    if (typeof loadThumbs === 'function' && !$('#layer-pop').hidden) loadThumbs();
  }
  (function () {
    var inp = $('#scan-key'), ok = $('#scan-key-ok'), del = $('#scan-key-del'); if (!inp) return;
    var box = inp.closest('.scan-key');
    if (SCAN25.cfg && SCAN25.cfg.hub) { box.innerHTML = '<b>SCAN 25 IGN</b><p>Activé pour tout le monde : la clé IGN est gardée par le serveur de la fédération, aucune saisie nécessaire.</p>'; return; }
    var own = ''; try { own = localStorage.getItem('scoutmap.scan25key') || ''; } catch (e) { /* ignoré */ }
    if (own) { inp.value = own; del.hidden = false; } else if (SCAN25.key) { inp.placeholder = 'Une clé est déjà intégrée au site'; }
    ok.addEventListener('click', function () {
      var v = inp.value.trim(); if (!/^[0-9a-f]{32}$/i.test(v) && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(v)) { toast('Collez la clé de 32 caractères, ou l’adresse du relais Apps Script (…/exec).'); return; }
      try { localStorage.setItem('scoutmap.scan25key', v); } catch (e) { toast('Impossible d’enregistrer la clé sur cet appareil.'); return; }
      S.base = 'scan25'; persist(); location.reload();
    });
    del.addEventListener('click', function () { try { localStorage.removeItem('scoutmap.scan25key'); } catch (e) { /* ignoré */ } if (S.base === 'scan25') S.base = 'plan'; persist(); location.reload(); });
  })();
  renderBaseGrid(); map.on('zoomend', function () { if (!$('#layer-pop').hidden) renderBaseGrid(); });
  var lb0 = $('#layer-btn'); if (lb0) lb0.addEventListener('click', function () { setTimeout(renderBaseGrid, 0); });
  $('#ov-grid').innerHTML = OVERS.map(function (k) { return '<button data-ov="' + k + '" title="' + esc(LAYERS[k].label) + '"><span class="ov-ic">' + ic(LAYERS[k].icon) + '</span><span>' + esc(LAYERS[k].label) + '</span></button>'; }).join('');

  // ---------- Export GPX ----------
  function gpxParts() {
    var parts = [];
    layersList().forEach(function (l) {
      if (l.empty || l.type === 'game') return;
      if (l.type === 'route') parts.push({ id: l.key, label: l.name + ' (' + l.data.wps.length + ' repères' + (l.res ? ', ' + G.fmtDist(l.res.dist) : '') + ')' });
      else if (l.type === 'az') parts.push({ id: l.key, label: l.name + ' (' + l.data.pts.length + ' points)' });
      else if (l.data.pts.length > 1) parts.push({ id: l.key, label: l.name });
    });
    if (S.mode === 'route') S.tracks.forEach(function (t) { parts.push({ id: 't' + t.id, label: 'Trace : ' + t.name }); });
    return parts;
  }
  function buildGpx(ids) {
    var body = '';
    layersList().forEach(function (l) {
      if (ids.indexOf(l.key) < 0 || l.empty) return;
      var d = l.data;
      if (l.type === 'route') {
        d.wps.forEach(function (p, i) { body += G.wptXml([p.lat, p.lon], nameOf(d, i)); });
        if (l.res) {
          var pr = RT.elevCache[lineKey(l.res.line)], ele = null;
          if (pr) { var cum = G.cumDist(l.res.line); ele = l.res.line.map(function (_, i) { var j = 0; while (j < pr.pts.length - 1 && pr.pts[j].d < cum[i]) j++; return pr.pts[j].z; }); }
          body += G.trkXml(d.name, l.res.line, ele, G.fmtDist(l.res.dist) + ' – à pied' + (loopOf(d) ? ' – boucle' : ''));
        }
      } else if (l.type === 'az') {
        var a = azParams(d);
        d.pts.forEach(function (p, i, pts) {
          var t = '';
          if (i > 0) t = 'Azimut ' + G.fmtAz(G.trueToUnit(G.bearing(pts[i - 1], p), a.unit, a.ref, a.decl), a.unit) + ' (' + (a.ref === 'mag' ? 'magnétique' : 'géographique') + '), ' + G.fmtDist(G.haversine(pts[i - 1], p));
          body += G.wptXml(p, 'Balise ' + (i + 1), t);
        });
        if (d.pts.length > 1) body += G.trkXml(d.name, d.pts, null);
      } else if (d.pts.length > 1) body += G.trkXml(d.name, d.pts, null);
    });
    S.tracks.forEach(function (t) { if (ids.indexOf('t' + t.id) >= 0) { body += G.trkXml(t.name, t.coords, t.ele); (t.wpts || []).forEach(function (w) { body += G.wptXml([w.lat, w.lon], w.name || 'Point'); }); } });
    return G.gpxDoc(body, S.name || 'ScoutMap ' + new Date().toLocaleDateString('fr-FR'));
  }
  function fileName() {
    var base = (S.name || 'scoutmap').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scoutmap';
    return base + '-' + new Date().toISOString().slice(0, 10) + '.gpx';
  }
  function download(name, text, mime) {
    var a = document.createElement('a'), u = URL.createObjectURL(new Blob([text], { type: mime }));
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
  }
  function openExport() {
    var parts = gpxParts();
    if (!parts.length) { toast(S.mode === 'game' ? 'Le GPX concerne les itinéraires, azimuts et mesures. Pour un grand jeu, utilisez l’export PDF.' : 'Rien à exporter dans ce type de travail : tracez d’abord quelque chose.'); return; }
    $('#export-opts').innerHTML = parts.map(function (p) { return '<label><input type="checkbox" value="' + esc(p.id) + '" checked> ' + esc(p.label) + '</label>'; }).join('');
    openDlg('dlg-export');
  }
  $('#export-cancel').addEventListener('click', function () { $('#dlg-export').close(); });
  $('#export-ok').addEventListener('click', function () {
    var ids = $$('#export-opts input:checked').map(function (i) { return i.value; });
    if (!ids.length) { toast('Cochez au moins un élément.'); return; }
    var gpx = buildGpx(ids); $('#dlg-export').close();
    download(fileName(), gpx, 'application/gpx+xml');
  });
  window.ScoutMap = { exportGpx: function () { return buildGpx(gpxParts().map(function (p) { return p.id; })); }, state: S, fileName: fileName };
  function openPdf(type) { if (window.SM && SM.openPdf) SM.openPdf(type); }
  $('#btn-pdf').addEventListener('click', function () { openPdf(); });

  // ---------- Coordonnées au curseur ----------
  var lastLL = null;
  map.on('mousemove', function (e) { lastLL = e.latlng; showCoords(); });
  function showCoords() { var p = lastLL || map.getCenter(); $('#coords').textContent = G.formatCoord('wgs', p.lat, p.lng); }
  $('#coords').addEventListener('click', function () {
    var t = this.textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Coordonnées copiées.'); }, function () { toast(t); });
  });

  // ---------- Clic carte & menu du point ----------
  map.on('click', function (e) {
    var p = [e.latlng.lat, e.latlng.lng];
    closePops();
    if (RT.tool === 'route') {
      // Un clic tout près du tracé insère le point dans le tronçon concerné (ordre de passage respecté).
      if (e.originalEvent && e.originalEvent.shiftKey && S.route.wps.length) { placeAs('direct', p); return; }
      var sg = segOf();
      if (sg === 'spot') { addSpot(p); return; }
      if (RT.route && pixelDistToRoute(e.latlng) <= 14) insertOnRoute(p);
      else if (sg !== 'route' && S.route.wps.length) addWp(p, null, null, sg);   // ligne droite ou azimut : le point reste là où on a cliqué
      else { addWp(p); var nw = S.route.wps[S.route.wps.length - 1]; snapToChurch(nw).then(function () { reorderFree(nw); }); }
    }
    else if (RT.tool === 'az') addAz(p);
    else if (RT.tool === 'meas') { ensureVisible('meas'); S.meas.pts.push(p); renderMeas(); persist(); select('meas', S.meas.pts.length - 1); }
    else if (RT.tool === 'game') { /* géré par game.js */ }
    else select(null);
  });
  function actionPopup(latlng, title, name) {
    var html = '<div class="pp"><b>' + esc(title) + '</b><small>' + esc(G.formatCoord('wgs', latlng.lat, latlng.lng)) + '</small><div class="pp-btns">' +
      (S.mode === 'az' ? '<button data-a="az">Point d’azimut</button>' : S.mode === 'meas' ? '<button data-a="meas">Point de mesure</button>' : S.mode === 'game' ? '<button data-a="gtext">Texte ici</button><button data-a="gcross">Croix ici</button>' : '<button data-a="start">Départ</button><button data-a="via">Étape</button><button data-a="end">Arrivée</button>') + '<button data-a="copy">Copier</button></div></div>';
    L.popup({ closeButton: true, offset: [0, -4] }).setLatLng(latlng).setContent(html).openOn(map);
    var el = document.querySelector('.leaflet-popup-content .pp');
    if (!el) return;
    el.addEventListener('click', function (ev) {
      var a = ev.target.dataset && ev.target.dataset.a; if (!a) return;
      var p = [latlng.lat, latlng.lng];
      map.closePopup();
      if (a === 'copy') copyCoords(p); else if (a === 'gtext' || a === 'gcross') { if (window.SM && SM.game) SM.game.addAt(a === 'gtext' ? 'text' : 'cross', p); } else placeAs(a, p, name);
    });
  }
  function copyCoords(p) { var t = G.formatCoord('wgs', p[0], p[1]); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Coordonnées copiées : ' + t); }, function () { toast(t); }); }
  // Pose un point à partir d'un menu : départ, étape, arrivée, azimut, mesure.
  function placeAs(a, p, name) {
    if (a === 'az') { addAz(p); setRail('az'); setTool('pan'); return; }
    if (a === 'meas') { ensureVisible('meas'); S.meas.pts.push(p); renderMeas(); persist(); setRail('meas'); setTool('pan'); return; }
    var w = S.route.wps, o = { lat: p[0], lon: p[1] }; if (name) o.name = name;
    ensureVisible('route');
    if (a === 'direct') { if (w.length) o.direct = true; w.push(o); }
    else if (a === 'start') w.unshift(o); else if (a === 'end') w.push(o);
    else if (w.length < 2) w.push(o); else w.splice(w.length - 1, 0, o);
    setRail('route'); setTool(a === 'direct' ? 'route' : 'pan'); renderRouteMarkers(); computeRoute(); persist(); fillPlaces(S.route);
    if (a === 'direct') toast('Point ajouté en ligne droite depuis le précédent (pointillés). Clic droit sur un point pour changer ce choix.');
  }


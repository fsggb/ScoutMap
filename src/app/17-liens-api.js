  /* ==== src/app/17-liens-api.js : liens d'action (?lieu=, ?itineraire=…), API interne window.SM (utilisée par les autres fichiers js/), fermeture de l'application ==== */
  // ---------- Liens d'action : la carte se prépare depuis l'adresse (utilisé par ChatGDB et par n'importe quel lien) ----------
  // ?lieu=Lyon | ?centre=45.76,4.83&zoom=12 | ?fond=ortho | ?couches=contour,hiking
  // ?itineraire=Lyon|Villeurbanne|45.7,4.9&boucle=1&titre=Sortie
  // Raccourcis de l'application installée (manifest.webmanifest) : ?nouveau=route|az|game · ?ouvrir=horsconnexion|bibliotheque
  (function appShortcuts() {
    var P; try { P = new URLSearchParams(location.search); } catch (e) { return; }
    var nv = P.get('nouveau'), ov = P.get('ouvrir');
    if (!nv && !ov) return;
    setTimeout(function () {
      if (nv && TYPES.indexOf(nv) >= 0) newProject(nv);
      else if (ov === 'horsconnexion') { if (window.SM && SM.settings) SM.settings.open('offline'); }
      else if (ov === 'bibliotheque') { showHome(false); if (!S.mode) setRail('route'); showSub('library'); }
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignoré */ }
    }, 300);
  })();
  // Application installée sur ordinateur : un fichier .gpx, .kml ou un PDF ScoutMap ouvert « avec ScoutMap » arrive ici
  if ('launchQueue' in window && window.launchQueue && launchQueue.setConsumer) {
    launchQueue.setConsumer(function (params) {
      if (!params || !params.files || !params.files.length) return;
      Promise.all(params.files.map(function (h) { return h.getFile(); })).then(function (fs) { openFiles(fs); }).catch(function () { toast('Ouverture du fichier impossible.'); });
    });
  }
  (function urlActions() {
    var P; try { P = new URLSearchParams(location.search); } catch (e) { return; }
    if (!['lieu', 'centre', 'fond', 'couches', 'itineraire'].some(function (k) { return P.has(k); })) return;
    showHome(false);
    var num = function (x) { var n = parseFloat(x); return isFinite(n) ? n : null; };
    var coordOf = function (t) { var m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ;]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(t || ''); if (!m) return null; var a = +m[1], b = +m[2]; return Math.abs(a) <= 90 && Math.abs(b) <= 180 ? [a, b] : null; };
    var geocode = function (q) {
      var c = coordOf(q); if (c) return Promise.resolve({ lat: c[0], lon: c[1], name: '' });
      return geoSearch(q.slice(0, 120), 1).then(function (fs) {
        var f = fs[0]; if (!f || !f.geometry || !f.geometry.coordinates) return null;
        var pr = f.properties || {}; return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: String(pr.toponym || pr.name || pr.label || q).slice(0, 80) };
      }).catch(function () { return null; });
    };
    var base = P.get('fond'); if (base && BASES && BASES.indexOf && BASES.indexOf(base) >= 0) S.base = base;
    else if (base && ['plan', 'ortho', 'otm', 'osm', 'osmfr', 'cyclosm', 'etat'].indexOf(base) >= 0) S.base = base;
    if (P.has('couches')) { var on = P.get('couches').split(','); OVERS.forEach(function (k) { S.ov[k] = on.indexOf(k) >= 0; }); }
    applyLayers();
    var z = num(P.get('zoom')), c0 = coordOf(P.get('centre'));
    if (c0) map.setView(c0, Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), z == null ? 12 : z)), { animate: false });
    var lieu = (P.get('lieu') || '').trim();
    if (lieu) geocode(lieu).then(function (g) {
      if (!g) { toast('Lieu introuvable : ' + lieu); return; }
      showHome(false);
      map.setView([g.lat, g.lon], Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), z == null ? 14 : z)), { animate: false });
      gSearch.clearLayers(); L.marker([g.lat, g.lon], { icon: pin('⌖', 'search') }).addTo(gSearch);
      actionPopup(L.latLng(g.lat, g.lon), g.name || lieu, g.name ? g.name : undefined);
    });
    var it = (P.get('itineraire') || '').split('|').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 12);
    if (it.length >= 2) Promise.all(it.map(geocode)).then(function (gs) {
      var ok = gs.map(function (g, i) { return g ? { lat: g.lat, lon: g.lon, name: coordOf(it[i]) ? undefined : it[i].slice(0, 80) } : null; }).filter(Boolean);
      if (ok.length < 2) { toast('Itinéraire impossible : lieux introuvables.'); return; }
      startType('route');
      S.route.wps = ok.map(function (o) { if (!o.name) delete o.name; return o; });
      S.route.loop = P.get('boucle') === '1';
      var t = (P.get('titre') || '').trim().slice(0, 80); if (t) { S.name = t; $('#proj-name').value = t; }
      syncRouteUi(); renderRouteMarkers(); computeRoute(); fillPlaces(S.route); persist();
      fit(L.latLngBounds(ok.map(function (o) { return [o.lat, o.lon]; })), { padding: [70, 70], maxZoom: 15 });
    });
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  })();

  loadDates();

  // API interne pour doc.js
  window.SM_test = { bestBlockOrder: bestBlockOrder, blocksOf: blocksOf };
  window.SM = {
    traceSig: traceSig, isMobile: isMobile, closePanel: function () { S.panelOpen = false; applyPanel(); persist(); }, ntfStow: ntfStow, DEF: DEF, DEF_BASE: DEF_BASE, saveDefaults: saveDefaults, forceUpdate: forceUpdate, appVersion: '2.7.0', build: SITE_V,
    applyLayers: applyLayers, loadProject: loadProject, ensureAnchor: ensureAnchor, renderRouteMarkers: renderRouteMarkers, hikeDraw: hikeDraw, hikeFailed: function () { return false; },
    openOffline: function () { showHome(false); togglePop('off-pop', true); },
    layerDate: layerDate, ovOn: ovOn, drawDirects: drawDirects, walkSecs: walkSecs, persist: persist, waterDraw: waterDraw, srcUrl: srcUrl,
    showSub: showSub, subOpen: function () { return SUB; }, version: SITE_V,
    S: S, RT: RT, G: G, map: map, esc: esc, ic: ic, sp: sp, toast: toast, ll: ll, pin: pin, tile: tile, LAYERS: LAYERS, SCALES: SCALES,
    profileFor: profileFor, lineKey: lineKey, renderProfileSvg: renderProfileSvg, stepText: stepText, stepMeta: stepMeta, stepName: stepName,
    loopOf: loopOf, effOf: effOf, lblOf: lblOf, clsOf: clsOf, titleOf: titleOf, nameOf: nameOf, azParams: azParams, azClosedOf: azClosedOf,
    layersList: layersList, fillPlaces: fillPlaces, scaleAt: scaleAt, zoomFor: zoomFor, curScale: curScale, niceScale: niceScale, fileName: fileName,
    setEditLock: function (on) {
      EDITLOCK = !!on; document.body.classList.toggle('live-locked', EDITLOCK);
      if (EDITLOCK) { setTool('pan'); select(null); }
      renderRouteMarkers(); renderAz();
    },
    // mention « Partage » : le travail partagé reste dans la bibliothèque du navigateur ; son identifiant est stable pour ne pas se dupliquer
    markShared: function (info) {
      var h = 0; for (var i = 0; i < info.room.length; i++) h = (h * 31 + info.room.charCodeAt(i)) >>> 0;
      if (info.role !== 'chef') info.pid = 7e12 + h;
      S.partage = info; if (info.pid) S.pid = info.pid;
      projAutosave(); if (SUB === 'library') renderMyLayers();
    },
    applyPointStyle: applyPointStyle, maskFor: maskFor,
    applyShared: applyShared, saveWork: function () { if (!VIEWER) projAutosave(); },
    wantOff: wantOff, openPdf: null, projLinkFor: projLinkFor, projLink: projLink, selected: function () { return []; },
    persist: persist, gGame: gGame, select: select, renderStored: renderStored, renderLayerList: renderLayerList, showCtx: showCtx, hideCtx: hideCtx,
    copyCoords: copyCoords, openDlg: openDlg, fit: fit, undoAction: undoAction, redoAction: redoAction, nid: nid, setMode: setMode, setRail: setRail, activate: activate,
    removeLayer: removeLayer, layerBounds: layerBounds, showHome: showHome, ensureVisible: ensureVisible, applyVis: applyVis, BASES: BASES
  };
  if (SM.game && SM.game.render) SM.game.render();
})();

  /* ==== src/app/15-commandes-demarrage.js : annuler / rétablir, menus du haut, raccourcis clavier, démarrage ==== */
  // ---------- Annuler / rétablir ----------
  function hRestore(json) {
    var o = JSON.parse(json);
    S.route = o.route; S.az = o.az; S.meas = o.meas; S.game = o.game || freshGame(null, 1); S.layers = o.layers; S.vis = o.vis; S.tracks = o.tracks; RT.route = o.res || null;
    select(null); applyVis(); syncRouteUi(); refreshRouteView(); renderAz(); renderMeas(); renderTracks(); renderStored(); renderLayerList(); if (window.SM && SM.game) SM.game.render();
    H.lastKey = hKey(); H.lastSnap = json; H.lastT = Date.now() - 1000; persist(); hButtons();
  }
  function undoAction() {
    if (!H.undo.length) { toast('Rien à annuler.'); return; }
    H.redo.push(hSnap()); hRestore(H.undo.pop()); hButtons(); toast('Annulé.');
  }
  function redoAction() {
    if (!H.redo.length) { toast('Rien à rétablir.'); return; }
    H.undo.push(hSnap()); hRestore(H.redo.pop()); hButtons(); toast('Rétabli.');
  }
  $('#btn-undo').addEventListener('click', undoAction);
  $('#btn-redo').addEventListener('click', redoAction);

  // ---------- Menus ----------
  function canUndo() { return S.rail === 'game' ? false : S.rail === 'route' ? S.route.wps.length > 0 : S.rail === 'az' ? S.az.pts.length > 0 : S.rail === 'meas' ? S.meas.pts.length > 0 : false; }
  function removeLast() {
    if (S.rail === 'route') $('#route-undo').click(); else if (S.rail === 'az') $('#az-undo').click(); else if (S.rail === 'meas') $('#meas-undo').click();
  }
  function openTuto(key) {
    if (typeof key !== 'string') key = ($('#home') && !$('#home').hidden) ? 'global' : (S.mode || 'global');
    var v = $('#tuto-video'); v.pause();
    v.setAttribute('poster', 'assets/tuto-poster-' + key + '.png'); v.setAttribute('src', 'assets/tuto-' + key + '.mp4'); v.load();
    $('#tuto-newtab').href = 'assets/tuto-' + key + '.mp4';
    $$('#tuto-tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === key); });
    openDlg('dlg-tuto');
  }
  $$('#tuto-tabs button').forEach(function (b) { b.addEventListener('click', function () { openTuto(b.dataset.t); }); });
  $$('[data-tuto]').forEach(function (b) { b.addEventListener('click', function () { openTuto(b.dataset.tuto); }); });
  $('#btn-tuto').addEventListener('click', function () { openTuto(); });
  $('#tuto-close').addEventListener('click', function () { var v = $('#tuto-video'); v.pause(); $('#dlg-tuto').close(); });
  $('#dlg-tuto').addEventListener('close', function () { $('#tuto-video').pause(); });
  var MENUS = {
    file: [
      { t: 'Accueil : mes travaux', i: 'home', a: function () { showHome(true); } },
      { t: 'Ouvrir un fichier (PDF ScoutMap, GPX, KML, GeoJSON)…', i: 'upload', k: 'Ctrl+O', a: function () { $('#file-gpx').click(); } },
      '-',
      { t: 'Enregistrer (page web .html : se rouvre ici, se partage)', i: 'download', k: 'Ctrl+S', a: function () { exportHtml(); } },
      { t: 'Exporter la trace en GPX (autres applications)', i: 'export', a: openExport },
      '-',
      { t: 'Imprimer ou enregistrer en PDF…', i: 'printer', k: 'Ctrl+P', a: function () { openPdf(); } }
    ],
    edit: [
      { t: 'Annuler', i: 'undo', k: 'Ctrl+Z', a: undoAction, dis: function () { return !H.undo.length; } },
      { t: 'Rétablir', i: 'redo', k: 'Ctrl+Y', a: redoAction, dis: function () { return !H.redo.length; } },
      '-',
      { t: 'Supprimer le point sélectionné', i: 'trash', k: 'Suppr', a: deleteSelected, dis: function () { return !SEL; } },
      { t: 'Inverser le sens de l’itinéraire', i: 'swap', a: reverseRoute, dis: function () { return S.route.wps.length < 2; } },
      '-',
      { t: 'Tout effacer…', i: 'trash', a: function () { resetAll(true); } }
    ],
    create: [
      { t: 'Simulation du parcours…', i: 'play', a: simOpen, dis: function () { return !currentProfile; } },
      { t: 'Hors connexion et application…', i: 'download', a: function () { togglePop('off-pop', true); } }
    ],
    view: [
      { t: 'Fond de carte et informations…', i: 'map', a: function () { togglePop('layer-pop', true); popTab('base'); } },
      { t: 'Recadrer sur le tracé', i: 'target', a: function () { $('#fit-all').click(); } },
      '-',
      { t: 'Panneau latéral', chk: function () { return S.panelOpen; }, a: togglePanel },
      { t: 'Profil d’altitude', chk: function () { return S.dockOpen; }, a: toggleDock },
      '-',
      { t: 'Échelle 1 : 25 000', a: function () { setScale(25000); } },
      { t: 'Échelle 1 : 10 000', g: 1, a: function () { setScale(10000); } },
      { t: 'Échelle 1 : 5 000', g: 1, a: function () { setScale(5000); } },
      { t: 'Échelle 1 : 50 000', a: function () { setScale(50000); } },
      { t: 'Voir toute la France', a: function () { map.setView([46.6, 2.5], 5.6); } }
    ],
    help: [
      { t: 'Mettre à jour le site (version ' + SITE_V + ')', i: 'download', a: forceUpdate },
      '-',
      { t: 'Tutoriel global', i: 'play', a: function () { openTuto('global'); } },
      { t: 'Tutoriel itinéraire', i: 'route', a: function () { openTuto('route'); } },
      { t: 'Tutoriel azimuts', i: 'compass', a: function () { openTuto('az'); } },
      { t: 'Tutoriel grand jeu', i: 'flag', a: function () { openTuto('game'); } },
      '-',
      { t: 'Contacter le service informatique : service-informatique@fsggb.fr', i: 'file', a: function () { window.location.href = 'mailto:service-informatique@fsggb.fr?subject=' + encodeURIComponent('ScoutMap'); } },
      { t: 'Raccourcis clavier', i: 'help', a: function () { openDlg('dlg-help'); } }
    ]
  };
  var openMenu = null;
  function showMenu(btn) {
    var items = (MENUS[btn.dataset.menu] || []).filter(function (it) { return it === '-' || !it.g || S.mode === 'game'; }), dd = $('#dropdown');
    $$('.menu-btn').forEach(function (b) { b.classList.toggle('on', b === btn); });
    dd.innerHTML = items.map(function (it, i) {
      if (it === '-') return '<div class="mi-sep"></div>';
      var dis = it.dis && it.dis();
      return '<button class="mi" role="menuitem" data-i="' + i + '"' + (dis ? ' disabled' : '') + '>' + (it.chk ? '<span class="mi-chk">' + (it.chk() ? ic('check') : '') + '</span>' : ic(it.i || 'chev-right')) + '<span>' + esc(it.t) + '</span>' + (it.k ? '<kbd>' + esc(it.k) + '</kbd>' : '') + '</button>';
    }).join('');
    var r = btn.getBoundingClientRect(); dd.style.left = Math.max(6, r.left) + 'px'; dd.style.top = (r.bottom + 4) + 'px'; dd.hidden = false;
    openMenu = btn; dd._items = items;
  }
  function hideMenu() { $('#dropdown').hidden = true; openMenu = null; $$('.menu-btn').forEach(function (b) { b.classList.remove('on'); }); }
  $$('.menu-btn').forEach(function (b) {
    b.addEventListener('click', function (e) { e.stopPropagation(); if (openMenu === b) hideMenu(); else showMenu(b); });
    b.addEventListener('mouseenter', function () { if (openMenu && openMenu !== b) showMenu(b); });
  });
  $('#dropdown').addEventListener('click', function (e) {
    var b = e.target.closest('.mi'); if (!b || b.disabled) return;
    var it = this._items[+b.dataset.i]; hideMenu(); it.a();
  });
  document.addEventListener('click', function (e) { if (openMenu && !e.target.closest('.dropdown')) hideMenu(); });

  // ---------- Clavier ----------
  document.addEventListener('keydown', function (e) {
    var tag = document.activeElement && document.activeElement.tagName, typing = /input|select|textarea/i.test(tag) || (document.activeElement && document.activeElement.isContentEditable);
    var mod = e.ctrlKey || e.metaKey;
    if (VIEWER && !(mod && e.key.toLowerCase() === 'p')) return;
    if (document.body.classList.contains('doc-open') || document.querySelector('dialog[open]')) return;
    if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); openPdf(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); exportHtml(); return; }
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#file-gpx').click(); return; }
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redoAction(); else undoAction(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redoAction(); return; }
    if (typing || mod || e.altKey) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && window.SM && SM.game && S.mode === 'game' && SM.game.hasSel()) { e.preventDefault(); SM.game.deleteSel(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && SEL) { e.preventDefault(); deleteSelected(); return; }
    var k = e.key.toLowerCase();
    if (k === 'escape') { hideMenu(); hideCtx(); closePops(); if (window.SM && SM.game && S.mode === 'game' && SM.game.escape()) return; if (SEL) select(null); else if (RT.tool !== 'pan') setTool('pan'); map.closePopup(); }

  });
  window.addEventListener('beforeunload', function () { if (VIEWER) return; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignoré */ } });

  // ---------- Démarrage ----------
  applyWpsCollapse(); curOff = wantOff(); buildTiles(); applyVis(); syncRouteUi(); $('#proj-name').value = S.name || ''; applyDock();
  renderRouteMarkers(); renderAz(); renderMeas(); renderTracks(); renderStored(); showCoords(); updateScaleUI();
  $$('.pane').forEach(function (p) { p.hidden = p.dataset.pane !== S.rail; });
  $$('[data-set]').forEach(function (d) { d.hidden = d.dataset.set !== S.mode; }); updateRailMode();
  $('#app').classList.toggle('nopanel', !S.panelOpen);
  updateRailMode(); applyDock();
  setTool(S.rail);
  if (S.route.wps.length > 1) computeRoute(); else refreshProfile();
  fillPlaces(S.route);
  H.ready = true; H.lastKey = hKey(); H.lastSnap = hSnap(); hButtons();
  (function bootMode() {
    var hash = location.hash || '';
    if (VIEWER) {
      document.body.classList.add('viewer'); showHome(false);
      if (!window.SM_LIVE_ROOM) { try { loadProject(JSON.parse($('#scoutmap-data').textContent)); } catch (e) { toast('Données du raid illisibles.'); } }
      S.panelOpen = false; $('#app').classList.add('nopanel'); setTool('pan');
      if (window.SM_LIVE_ROOM) { document.body.classList.add('live-guest'); showSub('share'); S.panelOpen = window.innerWidth > 860; applyPanel(); }   // invité : le volet latéral « Partage » (seul onglet) à la place de la page en lecture seule
      // la page seule s'ouvre cadrée sur le jeu (la mise en page est terminée après un court délai)
      if (!window.SM_LIVE_ROOM) setTimeout(function () { map.invalidateSize(); var b0 = layerBounds(S.rail === 'route' ? 'route' : S.rail); if (b0 && b0.isValid && b0.isValid()) fit(b0, { padding: [50, 50], maxZoom: 18 }); }, 500);
      $$('#base-grid button').forEach(function (b) { if (['otm', 'ortho', 'scan25'].indexOf(b.dataset.base) < 0) b.hidden = true; });
      $$('#pop-tabs [data-tab=sharp]').forEach(function (b) { b.hidden = true; });
      $('#btn-edit').hidden = !!window.SM_LIVE_ROOM;
      $('#btn-edit').addEventListener('click', function () { window.open(APP_URL + '#projet=' + b64e(JSON.stringify(projData(false))), '_blank'); });
      return;
    }
    if (/^#projet=/.test(hash)) {
      projDecode(hash.slice(8)).then(function (o) { loadProject(o); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } }).catch(function (er) { if (window.console) console.warn('Lien illisible :', er); showHome(true); toast('Lien illisible : le travail n’a pas pu être ouvert.'); });
      return;
    }
    showHome(true);
  })();


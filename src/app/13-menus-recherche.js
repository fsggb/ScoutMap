  /* ==== src/app/13-menus-recherche.js : menus contextuels (clic droit) et recherche de lieux ==== */
  // ---------- Menus contextuels (clic droit) ----------
  var ctxEl = document.createElement('div'); ctxEl.className = 'dropdown ctx'; ctxEl.id = 'ctxmenu'; ctxEl.hidden = true; ctxEl.setAttribute('role', 'menu'); document.body.appendChild(ctxEl);
  function hideCtx() { ctxEl.hidden = true; }
  function showCtx(x, y, items) {
    if (VIEWER) return;
    hideMenu();
    ctxEl.innerHTML = items.map(function (it, i) {
      if (it === '-') return '<div class="mi-sep"></div>';
      return '<button class="mi' + (it.danger ? ' danger' : '') + '" role="menuitem" data-i="' + i + '"' + (it.dis && it.dis() ? ' disabled' : '') + '>' + ic(it.i || 'chev-right') + '<span>' + esc(it.t) + '</span>' + (it.k ? '<kbd>' + esc(it.k) + '</kbd>' : '') + '</button>';
    }).join('');
    ctxEl._items = items; ctxEl.hidden = false;
    var r = ctxEl.getBoundingClientRect();
    ctxEl.style.left = Math.max(6, Math.min(x, window.innerWidth - r.width - 6)) + 'px'; ctxEl.style.top = Math.max(6, Math.min(y, window.innerHeight - r.height - 6)) + 'px';
  }
  ctxEl.addEventListener('click', function (e) { var b = e.target.closest('.mi'); if (!b || b.disabled) return; var it = ctxEl._items[+b.dataset.i]; hideCtx(); it.a(); });
  ctxEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('mousedown', function (e) { if (!e.target.closest('#ctxmenu')) hideCtx(); });
  window.addEventListener('blur', hideCtx); window.addEventListener('resize', hideCtx); window.addEventListener('wheel', hideCtx, { passive: true });
  map.on('movestart zoomstart', hideCtx);
  var CSEP = '-';
  function commonPt(p) { return [CSEP, { t: 'Copier les coordonnées', i: 'copy', a: function () { copyCoords(p); } }, { t: 'Centrer la carte ici', i: 'target', a: function () { map.panTo(L.latLng(p[0], p[1])); } }]; }
  function renameWp(i) {
    setRail('route'); setTool('pan'); select('route', i);
    var inp = $('#wps .wp-name[data-i="' + i + '"]'); if (inp) { inp.focus(); inp.select(); }
  }
  function setDirect(i, on) {
    var w = S.route.wps[i]; if (!w) return; if (on) w.direct = true; else delete w.direct;
    if (on === 'az') w.az = true; else delete w.az;
    renderRouteMarkers(); renderWpList(); computeRoute(); persist();
  }
  function routePtMenu(i) {
    var d = S.route, n = d.wps.length, p = [d.wps[i].lat, d.wps[i].lon], loop = loopOf(d);
    var m = [
      { t: 'Renommer…', i: 'edit', a: function () { renameWp(i); } },
      { t: 'Supprimer ce point', i: 'trash', k: 'Suppr', danger: true, a: function () { removeWp(i); } }
    ];
    if (i > 0) {
      var wi = d.wps[i], cur = wi.az ? 'az' : wi.direct ? 'direct' : 'route';
      if (cur !== 'az') m.unshift({ t: 'Rejoindre en azimut (boussole) depuis le point précédent', i: 'compass', a: function () { setDirect(i, 'az'); } });
      if (cur !== 'direct') m.unshift({ t: 'Rejoindre en ligne droite depuis le point précédent', i: 'route', a: function () { setDirect(i, true); } });
      if (cur !== 'route') m.unshift({ t: 'Rejoindre par le chemin le plus court', i: 'route', a: function () { setDirect(i, false); } });
    }
    if (d.wps[i].orig) m.unshift({ t: 'Remettre à l’endroit où j’ai cliqué', i: 'undo', a: function () { restoreWp(i); } });
    if (i === 0 && n >= 3 && !d.loop) m.push({ t: 'Fermer la boucle', i: 'loop', a: closeLoop });
    if (i > 0) m.push({ t: 'En faire le départ', i: 'pin', a: function () { moveWp(i, 0); } });
    if (i < n - 1 && !loop) m.push({ t: 'En faire l’arrivée', i: 'pin', a: function () { moveWp(i, n - 1); } });
    m.push({ t: 'Inverser le sens', i: 'swap', dis: function () { return n < 2; }, a: reverseRoute });
    return m.concat(commonPt(p));
  }
  function azPtMenu(i) {
    var p = S.az.pts[i], n = S.az.pts.length;
    var m = [{ t: 'Supprimer ce point', i: 'trash', k: 'Suppr', danger: true, a: function () { select('az', i); deleteSelected(); } }];
    if (i === 0 && n > 2 && !azClosed()) m.push({ t: 'Fermer le circuit', i: 'loop', a: closeAz });
    return m.concat(commonPt(p));
  }
  function measPtMenu(i) {
    var p = S.meas.pts[i];
    return [{ t: 'Supprimer ce point', i: 'trash', k: 'Suppr', danger: true, a: function () { select('meas', i); deleteSelected(); } }].concat(commonPt(p));
  }
  function routeLineMenu(latlng) {
    var p = [latlng.lat, latlng.lng];
    return [
      { t: 'Ajouter une étape ici', i: 'pin', a: function () { insertOnRoute(p); } },
      { t: 'Inverser le sens', i: 'swap', a: reverseRoute },
      { t: 'Simulation du parcours…', i: 'play', a: simOpen },
      { t: 'Feuille de route en PDF…', i: 'printer', a: function () { openPdf('simple'); } }
    ].concat(commonPt(p));
  }
  function storedMenu(id) {
    var key = 'L' + id;
    return [
      { t: 'Modifier ce calque', i: 'edit', a: function () { activate(id); } },
      { t: 'Masquer', i: 'eye-off', a: function () { var l = S.layers.filter(function (x) { return x.data.id === id; })[0]; if (l) { l.vis = false; renderStored(); renderLayerList(); refreshProfile(); persist(); } } },
      { t: 'Centrer la carte dessus', i: 'target', a: function () { var b = layerBounds(key); if (b) fit(b, { padding: [60, 60], maxZoom: 17 }); } },
      { t: 'Supprimer ce calque', i: 'trash', danger: true, a: function () { removeLayer(key); } }
    ];
  }
  function mapMenu(latlng) {
    var p = [latlng.lat, latlng.lng], m = [];
    if (S.mode === 'route') m = [
      { t: 'Placer un point en ligne droite (vol d’oiseau)', i: 'route', a: function () { placeAs('direct', p); } },
      CSEP,
      { t: 'Départ ici', i: 'pin', a: function () { placeAs('start', p); } },
      { t: 'Étape ici', i: 'pin', a: function () { placeAs('via', p); } },
      { t: 'Arrivée ici', i: 'pin', a: function () { placeAs('end', p); } }];
    else if (S.mode === 'az') m = [{ t: 'Point d’azimut ici', i: 'compass', a: function () { placeAs('az', p); } }];
    else if (S.mode === 'meas') m = [{ t: 'Point de mesure ici', i: 'ruler', a: function () { placeAs('meas', p); } }];
    else if (S.mode === 'game' && window.SM && SM.game) m = [
      { t: 'Texte ici', i: 'g-text', a: function () { SM.game.addAt('text', p); } },
      { t: 'Croix ici', i: 'g-cross', a: function () { SM.game.addAt('cross', p); } }];
    return m.concat(m.length ? [CSEP] : []).concat(commonPt(p).slice(1)).concat([CSEP,
      { t: 'Annuler', i: 'undo', k: 'Ctrl+Z', dis: function () { return !H.undo.length; }, a: undoAction },
      { t: 'Rétablir', i: 'redo', k: 'Ctrl+Y', dis: function () { return !H.redo.length; }, a: redoAction }
    ]);
  }
  // Diagramme d'altitude : clic droit
  (function profileCtx() {
    var svg = $('#profile');
    svg.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      var g = svg._geom; if (!g || !currentProfile) return;
      var rect = svg.getBoundingClientRect(), d = Math.max(0, Math.min(g.total, (e.clientX - rect.left - g.m.l) / g.iw * g.total)), pts = currentProfile.pts, i = 0;
      while (i < pts.length - 1 && pts[i + 1].d < d) i++;
      var a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)], q = b.d > a.d ? (d - a.d) / (b.d - a.d) : 0;
      var lat = a.lat + (b.lat - a.lat) * q, lon = a.lon + (b.lon - a.lon) * q, z = a.z + (b.z - a.z) * q, p = [lat, lon], label = G.fmtDist(d) + ' · ' + Math.round(z) + ' m';
      var m = [
        { t: 'Centrer la carte sur ce point (' + label + ')', i: 'target', a: function () { map.panTo(L.latLng(lat, lon)); L.circleMarker([lat, lon], { radius: 10, color: '#fff', weight: 3, fillColor: '#c6a24e', fillOpacity: 1, interactive: false }).addTo(gCursor); setTimeout(function () { gCursor.clearLayers(); if (SIM.open) { SIM.marker = null; SIM.trail = null; simRender(false); } }, 1800); } }
      ];
      if (currentProfile.src === 'route' && RT.route) m.push({ t: 'Ajouter une étape ici', i: 'pin', a: function () { insertOnRoute(p); } });
      m.push({ t: 'Lancer la simulation depuis ici', i: 'play', a: function () { simOpen(); if (SIM.open) { var j = 0; while (j < pts.length - 2 && pts[j + 1].d < d) j++; SIM.pos = SIM.t[j] + (SIM.t[j + 1] - SIM.t[j]) * q; simRender(true); simPlay(); } } });
      m.push(CSEP, { t: 'Copier : ' + label, i: 'copy', a: function () { var t = label + ' · ' + G.formatCoord('wgs', lat, lon); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Copié : ' + t); }, function () { toast(t); }); } });
      m.push({ t: S.dockOpen ? 'Réduire le profil' : 'Afficher le profil', i: 'mountain', a: toggleDock });
      showCtx(e.clientX, e.clientY, m);
    });
    $('#dock-head').addEventListener('contextmenu', function (e) { e.preventDefault(); showCtx(e.clientX, e.clientY, [{ t: S.dockOpen ? 'Réduire le profil' : 'Afficher le profil', i: 'mountain', a: toggleDock }, { t: 'Simulation du parcours…', i: 'play', a: simOpen }]); });
  })();
  // Liste des calques : clic droit sur une ligne
  $('#layer-list').addEventListener('contextmenu', function (e) {
    var li = e.target.closest('.lrow'); if (!li) return;
    e.preventDefault();
    var k = li.dataset.k;
    function act(a) { return function () { var b = li.querySelector('[data-a="' + a + '"]'); if (b) b.click(); }; }
    var items = [];
    if (li.querySelector('[data-a=edit]')) items.push({ t: 'Modifier ce calque', i: 'edit', a: act('edit') });
    if (li.querySelector('[data-a=vis]')) items.push({ t: 'Afficher / masquer', i: 'eye', a: act('vis') });
    items.push({ t: 'Renommer…', i: 'edit', a: function () { var n = li.querySelector('.lname'); if (n) n.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); } });
    if (li.querySelector('[data-a=inv]')) items.push({ t: 'Inverser le sens', i: 'swap', a: act('inv') });
    if (li.querySelector('[data-a=zoom]')) items.push({ t: 'Centrer la carte dessus', i: 'target', a: act('zoom') });
    if (li.querySelector('[data-a=del]')) items.push(CSEP, { t: 'Supprimer', i: 'trash', danger: true, a: act('del') });
    if (items.length) showCtx(e.clientX, e.clientY, items);
  });
  map.on('contextmenu', function (e) { if (window.SM && SM.game && SM.game.rightClick && SM.game.rightClick()) return; showCtx(e.originalEvent.clientX, e.originalEvent.clientY, mapMenu(e.latlng)); });

  // ---------- Recherche ----------
  var qTimer, qCtl, qItems = [], qAct = -1;
  function itemOf(f) {
    var p = f.properties || {}, poi = p._type === 'poi';
    if (poi) {
      var city = arr(p.city)[0] || '', pc = arr(p.postcode)[0] || '', cat = arr(p.category)[0] || '';
      return { t: arr(p.toponym || p.name)[0] || 'Lieu', s: [cat, (pc + ' ' + city).trim()].filter(Boolean).join(' · '), k: 'pin', poi: true, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], cat: arr(p.category).join(' ') };
    }
    return { t: p.name || p.label || 'Adresse', s: ((p.postcode || '') + ' ' + (p.city || '')).trim(), k: 'home', poi: false, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], cat: '' };
  }
  // Coordonnées de tous formats et liens de carte (Google Maps, OpenStreetMap, Géoportail…) : voir js/coords.js
  function parseCoord(v) {
    if (window.SMCoords) return SMCoords.parse(v);
    var m = /^\s*(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/.exec(v);
    if (!m) return null;
    var a = parseFloat(m[1].replace(',', '.')), b = parseFloat(m[2].replace(',', '.'));
    if (Math.abs(a) > 90 && Math.abs(b) <= 90) { var t = a; a = b; b = t; }
    return Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lon: b } : null;
  }
  // nom de lieu contenu dans un lien de carte sans coordonnées (ex. google.com/maps/place/Chamonix)
  function linkText(v) {
    var s = v; try { s = decodeURIComponent(v); } catch (e) { /* garde le texte */ }
    var m = /\/place\/([^/@?]+)/.exec(s) || /\/search\/([^/@?]+)/.exec(s) || /[?&](?:q|query|destination|daddr)=([^&]+)/.exec(s);
    return m ? m[1].replace(/\+/g, ' ').trim() : '';
  }
  function closeSuggest() { $('#suggest').hidden = true; qAct = -1; }
  function renderSuggest() {
    var ul = $('#suggest');
    ul.innerHTML = qItems.length ? qItems.map(function (it, i) {
      return '<li role="option" data-i="' + i + '"' + (i === qAct ? ' class="act"' : '') + '><span class="sg-ic">' + ic(it.k) + '</span><span class="sg-body"><span class="sg-t">' + esc(it.t) + '</span>' + (it.s ? '<span class="sg-s">' + esc(it.s) + '</span>' : '') + '</span></li>';
    }).join('') : '<li class="none">Aucun résultat</li>';
    ul.hidden = false;
  }
  // Recherche : les index « lieux » et « adresses » sont interrogés séparément (l'index combiné de la Géoplateforme est parfois très lent), avec délai maximal.
  function geoSearch(q, limit, signal) {
    function one(ix) {
      var ctl = new AbortController(), to = setTimeout(function () { ctl.abort(); }, 9000);
      if (signal) signal.addEventListener('abort', function () { ctl.abort(); });
      return fetch(GP + '/geocodage/search?q=' + encodeURIComponent(q) + '&index=' + ix + '&limit=' + limit, { signal: ctl.signal })
        .then(function (r) { return r.ok ? r.json() : { features: [] }; }).then(function (j) { clearTimeout(to); return j.features || []; })
        .catch(function (e) { clearTimeout(to); if (signal && signal.aborted) throw e; return []; });
    }
    return Promise.all([one('poi'), one('address')]).then(function (r) { return r[0].concat(r[1]).slice(0, limit); });
  }
  $('#q').addEventListener('input', function () {
    var v = this.value.trim(); clearTimeout(qTimer);
    $('#q-clear').hidden = !this.value;
    if (v.length < 2) { closeSuggest(); return; }
    var c = parseCoord(v);
    if (c) { qItems = [{ t: 'Aller à ce point', s: c.lat.toFixed(5) + ', ' + c.lon.toFixed(5) + (c.fmt && window.SMCoords ? ' · ' + SMCoords.label(c.fmt) : ''), k: 'target', coord: true, lat: c.lat, lon: c.lon }]; qAct = 0; renderSuggest(); return; }
    if (window.SMCoords && SMCoords.isShortLink(v)) {   // lien court Google Maps : le serveur ScoutHub lit l'adresse complète (un navigateur ne peut pas la lire lui-même)
      qItems = []; $('#suggest').innerHTML = '<li class="none">Lecture du lien Google Maps…</li>'; $('#suggest').hidden = false;
      var raw = v, lk = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
      fetch('https://scouthub.fsggb.workers.dev/lien?u=' + encodeURIComponent(lk)).then(function (r) { return r.json(); }).then(function (j) {
        if ($('#q').value.trim() !== raw) return;
        var full = j && j.url, c2 = full && SMCoords.parse(full);
        if (c2) { qItems = [{ t: 'Aller à ce lieu (lien Google Maps)', s: c2.lat.toFixed(5) + ', ' + c2.lon.toFixed(5), k: 'target', coord: true, lat: c2.lat, lon: c2.lon }]; qAct = 0; renderSuggest(); return; }
        var nm = full && linkText(full);
        if (nm) { $('#q').value = nm; $('#q').dispatchEvent(new Event('input')); return; }
        $('#suggest').innerHTML = '<li class="none">Ce lien ne donne pas de position lisible.</li>';
      }).catch(function () { $('#suggest').innerHTML = '<li class="none">Lien Google Maps illisible pour le moment : réessayez ou collez les coordonnées.</li>'; });
      return;
    }
    if (window.SMCoords && SMCoords.isLink(v)) { var lt = linkText(v); if (!lt) { qItems = []; $('#suggest').innerHTML = '<li class="none">Ce lien ne contient pas de position lisible.</li>'; $('#suggest').hidden = false; return; } v = lt; }
    if (v.length < 3) { closeSuggest(); return; }
    qTimer = setTimeout(function () {
      if (qCtl) qCtl.abort(); qCtl = new AbortController();
      geoSearch(v, 7, qCtl.signal)
        .then(function (fs) {
          qItems = fs.map(itemOf); qAct = qItems.length ? 0 : -1; renderSuggest();
        }).catch(function (e) { if (e.name !== 'AbortError') { qItems = []; $('#suggest').innerHTML = '<li class="none">Recherche indisponible</li>'; $('#suggest').hidden = false; } });
    }, 220);
  });
  function pick(i) {
    var it = qItems[i]; if (!it) return;
    closeSuggest(); $('#q').value = it.t; $('#q-clear').hidden = false; $('#q').blur();
    setScale(it.coord ? 25000 : it.poi ? (/sommet|montagne|col/i.test(it.cat) ? 50000 : 25000) : 10000, [it.lat, it.lon]);
    gSearch.clearLayers();
    L.marker([it.lat, it.lon], { icon: pin('⌖', 'search') }).addTo(gSearch);
    actionPopup(L.latLng(it.lat, it.lon), it.t, it.coord ? undefined : it.t);
  }
  $('#suggest').addEventListener('mousedown', function (e) { var li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pick(+li.dataset.i); } });
  $('#q').addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!qItems.length) return; e.preventDefault();
      qAct = (qAct + (e.key === 'ArrowDown' ? 1 : -1) + qItems.length) % qItems.length; renderSuggest();
    } else if (e.key === 'Enter') { e.preventDefault(); if (qItems.length) pick(Math.max(0, qAct)); }
    else if (e.key === 'Escape') { if (!$('#suggest').hidden) closeSuggest(); else this.blur(); }
  });
  $('#q').addEventListener('focus', function () { if (qItems.length && this.value.trim().length >= 2) renderSuggest(); });
  $('#q-clear').addEventListener('click', function () { $('#q').value = ''; this.hidden = true; closeSuggest(); qItems = []; gSearch.clearLayers(); map.closePopup(); $('#q').focus(); });
  document.addEventListener('mousedown', function (e) { if (!e.target.closest('.searchcard')) closeSuggest(); });



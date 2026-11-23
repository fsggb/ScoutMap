  /* ==== src/app/10-bibliotheque.js : panneau des calques, bibliothèque des tracés (sélection, impression groupée) ==== */
  // ---------- Panneau des calques ----------
  function layerMeta(l) {
    if (l.empty) return 'Vide';
    var d = l.data;
    if (l.type === 'route') return (loopOf(d) ? 'Boucle · ' : '') + (l.res ? G.fmtDist(l.res.dist) : d.wps.length + ' point(s)');
    if (l.type === 'az') return d.pts.length + ' points · ' + G.fmtDist(G.pathLength(d.pts));
    if (l.type === 'game') return d.shapes.length + (d.shapes.length > 1 ? ' éléments' : ' élément');
    return d.mode === 'area' ? G.fmtArea(G.areaM2(d.pts)) : G.fmtDist(G.pathLength(d.pts));
  }
  var TYPE_LABEL = { route: 'Itinéraire', az: 'Azimuts', meas: 'Mesure', game: 'Grand jeu' };
  function renderLayerList() {
    renderMyLayers();
    var el = $('#layer-list'); if (!el) return;
    var box = $('#tracks-box'); if (box) box.hidden = !S.tracks.length;
    el.innerHTML = S.tracks.map(function (t) {
      var v = t.show !== false;
      return '<li class="lrow' + (v ? '' : ' off') + '" data-k="t' + t.id + '"><button class="ibtn" data-a="vis" title="' + (v ? 'Masquer' : 'Afficher') + '" aria-label="Basculer">' + ic(v ? 'eye' : 'eye-off') + '</button><span class="lsw" style="background:' + t.color + '"></span>' +
        '<div class="lmeta"><b class="lname" data-a="rename" title="Double-clic pour renommer">' + esc(t.name) + '</b><small>Trace importée · ' + G.fmtDist(G.pathLength(t.coords)) + '</small></div>' +
        '<button class="ibtn" data-a="zoom" title="Centrer la carte" aria-label="Centrer">' + ic('target') + '</button><button class="ibtn danger" data-a="del" title="Supprimer" aria-label="Supprimer">' + ic('trash') + '</button></li>';
    }).join('');
  }
  function layerBounds(key) {
    var pts = [];
    if (key === 'route' || key === 'game' || key[0] === 'L') {
      var L0 = layersList().filter(function (l) { return l.key === key; })[0];
      if (L0 && L0.type === 'route') pts = L0.res ? L0.res.line : L0.data.wps.map(function (w) { return [w.lat, w.lon]; });
      else if (L0 && L0.type === 'game') pts = window.SM && SM.game ? SM.game.points(L0.data) : [];
      else if (L0) pts = L0.data.pts;
    } else if (key === 'az') pts = S.az.pts; else if (key === 'meas') pts = S.meas.pts;
    else { var t = findTrack(key.slice(1)); pts = t ? t.coords : []; }
    return pts.length ? L.latLngBounds(pts.map(ll)) : null;
  }
  $('#layer-list').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-a]'); if (!b) return;
    var k = b.closest('li').dataset.k, a = b.dataset.a;
    var L0 = layersList().filter(function (l) { return l.key === k; })[0];
    if (a === 'vis') {
      if (L0 && L0.active) { S.vis[L0.type] = !L0.vis; applyVis(); }
      else if (L0) { L0.item.vis = !L0.vis; renderStored(); }
      else { var t = findTrack(k.slice(1)); t.show = t.show === false; renderTracks(); }
      renderLayerList(); refreshProfile(); persist();
    } else if (a === 'zoom') {
      var bd = layerBounds(k); if (bd) fit(bd, bd.getNorthEast().equals(bd.getSouthWest()) ? { maxZoom: 16 } : { padding: [60, 60], maxZoom: 17 });
      S.profileSrc = k; refreshProfile();
    } else if (a === 'edit') { activate(L0.id); }
    else if (a === 'inv') { if (!L0.active) activate(L0.id); reverseRoute(); }
    else if (a === 'del') {
      if (k[0] === 't') { S.tracks = S.tracks.filter(function (t) { return 't' + t.id !== k; }); renderTracks(); persist(); }
      else removeLayer(k);
    }
  });
  $('#layer-list').addEventListener('dblclick', function (e) {
    var n = e.target.closest('.lname'); if (!n) return;
    var li = n.closest('li'), k = li.dataset.k, old = n.textContent;
    var inp = document.createElement('input'); inp.className = 'lname-in'; inp.value = old; inp.maxLength = 60;
    n.replaceWith(inp); inp.focus(); inp.select();
    var done = false;
    function commit(save) {
      if (done) return; done = true;
      var v = inp.value.trim();
      if (save && v) {
        if (k[0] === 't' && k !== 'route') { var t = findTrack(k.slice(1)); if (t) { t.name = v; renderTracks(); persist(); } } else renderLayerList(), renameLayer(k, v);
      } else renderLayerList();
    }
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') commit(true); else if (ev.key === 'Escape') commit(false); });
    inp.addEventListener('blur', function () { commit(true); });
  });

  // ---------- Bibliothèque : tous les tracés enregistrés dans ce navigateur ----------
  // Un clic ouvre un tracé ; l'œil l'affiche en plus sur la carte (et à l'impression) ; « Nouveau tracé » = retour à l'accueil + nouveau tracé.
  function libEntries() {
    var game = S.mode === 'game';
    return projList().filter(function (e) {
      var d = e.data || {};
      return game ? !!(d.game && d.game.shapes && d.game.shapes.length) : !!((d.route && !isEmpty('route', d.route)) || (d.az && !isEmpty('az', d.az)));
    }).sort(function (a, b) { return b.updated - a.updated; });
  }
  function libName(e) {
    var d = e.data || {}, n = e.name || '';
    if (d.name) return d.name;
    if (/ du \d{1,2}\/\d{1,2}\/\d{4}$/.test(n)) {   // ancien nom automatique : on préfère le nom donné au tracé
      var own = ['route', 'az', 'game'].filter(function (t) { return d[t] && d[t].name && !DEFAULT_NAME.test(d[t].name.trim()) && !isEmpty(t, Object.assign({ wps: [], pts: [], shapes: [] }, d[t])); })[0];
      if (own) return d[own].name.trim();
    }
    return n;
  }
  function libShown(pid) { return S.layers.some(function (l) { return l.pid === pid; }); }
  function libColor(t, taken) {
    var pal = t === 'route' ? ROUTE_PAL : AZ_PAL, i;
    for (i = 0; i < pal.length; i++) if (taken.indexOf(pal[i]) < 0) return pal[i];
    return pal[taken.length % pal.length];
  }
  function renderMyLayers() {
    var el = document.getElementById('lib-body'); if (!el) return;
    var game = S.mode === 'game';
    if (!VIEWER) projAutosave();
    var list = libEntries();
    var h = '<button type="button" class="btn-primary block" data-a="new">' + ic('plus') + 'Nouveau tracé</button>' +
      '<p class="help">' + (game ? 'Vos grands jeux enregistrés dans ce navigateur. Cliquez pour en ouvrir un.' : 'Vos tracés enregistrés dans ce navigateur. Cliquez sur un tracé pour l’ouvrir ; l’œil l’affiche aussi sur la carte, avec le tracé en cours (ils s’impriment alors tous).') + '</p>';
    var nsel = list.filter(function (e) { return LIBSEL[e.id]; }).length;
    if (list.length > 1 && !game) h += '<div class="lib-selbar' + (nsel ? ' on' : '') + '">' + (nsel
      ? '<b>' + nsel + ' sélectionné' + (nsel > 1 ? 's' : '') + '</b><button type="button" class="btn-ghost sm" data-a="sel-show">' + ic('eye') + 'Afficher</button><button type="button" class="btn-ghost sm" data-a="sel-print">' + ic('printer') + 'Imprimer</button><button type="button" class="btn-ghost sm" data-a="sel-hide">' + ic('eye-off') + 'Masquer</button><button type="button" class="linkbtn" data-a="sel-none">Aucun</button>'
      : '<small>Ctrl + clic ou Maj + clic pour en choisir plusieurs</small>') + '<button type="button" class="linkbtn" data-a="sel-all">Tout sélectionner</button></div>';
    h += '<ul class="layers lib-list">' + (list.length ? list.map(function (e) {
      var cur = e.id === S.pid, on = libShown(e.id), l0 = S.layers.filter(function (l) { return l.pid === e.id; })[0];
      var col = cur ? (S[S.mode === 'az' ? 'az' : 'route'].color) : (l0 ? l0.data.color : '#c9ccdc');
      return '<li class="lrow lib-row' + (cur ? ' active' : '') + (on ? ' on' : '') + (LIBSEL[e.id] ? ' picked' : '') + '" data-pid="' + e.id + '">' +
        (cur || game ? '<span class="lib-cur">' + (cur ? 'En cours' : '') + '</span>' : '<button class="ibtn" data-a="vis" title="' + (on ? 'Retirer de la carte' : 'Afficher aussi sur la carte') + '" aria-label="Afficher sur la carte">' + ic(on ? 'eye' : 'eye-off') + '</button>') +
        (game ? '' : '<span class="lsw" style="background:' + esc(col) + '"></span>') +
        '<div class="lmeta" data-a="open" title="' + (cur ? 'Tracé en cours' : 'Ouvrir ce tracé') + ' · double-clic : renommer"><b class="lname">' + esc(libName(e)) + '</b><small>' + esc((e.kinds || []).join(' · ')) + ' · ' + fmtWhen(e.updated) + '</small></div>' +
        (cur ? '' : '<button class="ibtn danger" data-a="del" title="Supprimer ce tracé" aria-label="Supprimer">' + ic('trash') + '</button>') + '</li>';
    }).join('') : '<li class="pr-none">Aucun tracé enregistré pour le moment : tracez sur la carte, il apparaîtra ici tout seul.</li>') + '</ul>';
    h += '<button type="button" class="btn-ghost block" data-a="file">' + ic('upload') + 'Importer un PDF, GPX ou KML…</button>';
    el.innerHTML = h;
  }
  // affiche à côté du tracé en cours les itinéraires et azimuts d'un tracé enregistré
  function addFromData(o, pid) {
    var src = [], n = 0, b = null;
    if (pid) { if (pid === S.pid) return 0; S.layers = S.layers.filter(function (l) { return l.pid !== pid; }); }   // jamais deux fois le même travail
    var have = {}; ['route', 'az'].forEach(function (t) { have[traceSig(t, S[t])] = 1; }); S.layers.forEach(function (l) { have[traceSig(l.type, l.data)] = 1; });
    ['route', 'az'].forEach(function (t) { if (o && o[t] && !isEmpty(t, o[t])) src.push({ t: t, data: o[t], res: t === 'route' ? (o.res || null) : null }); });
    // les tracés propres à ce travail seulement : pas les copies d'autres travaux qu'il affichait lui-même (source des doublons)
    ((o && o.layers) || []).forEach(function (l) { if (l && l.data && !l.pid && (l.type === 'route' || l.type === 'az')) src.push({ t: l.type, data: l.data, res: l.res || null }); });
    src = src.filter(function (x) { var k = traceSig(x.t, x.data); if (!k || have[k]) return false; have[k] = 1; return true; });
    src.forEach(function (x) {
      var t = x.t; if (isEmpty(t, x.data)) return;
      var taken = [S[t].color].concat(S.layers.filter(function (l) { return l.type === t; }).map(function (l) { return l.data.color; }));
      var d = Object.assign(FRESH[t](null, S.layers.length + 2), x.data); d.id = nid(); d.color = libColor(t, taken);
      if (t === 'route') d.wps = x.data.wps || []; else d.pts = x.data.pts || [];
      var res = x.res && x.res.line ? { line: x.res.line, dist: x.res.dist, dur: x.res.dur, bounds: x.res.bounds, directs: x.res.directs || [], nat: x.res.nat || [], portions: x.res.portions || [] } : null;
      S.layers.push({ type: t, vis: true, data: d, res: res, pid: pid || null }); n++;
      var pts = res ? res.line : (t === 'route' ? d.wps.map(function (w) { return [w.lat, w.lon]; }) : d.pts);
      if (pts.length) { var bb = L.latLngBounds(pts.map(ll)); b = b ? b.extend(bb) : bb; }
    });
    if (!n) { toast('Aucun itinéraire ni parcours dans ce tracé.'); return 0; }
    applyVis(); renderStored(); renderLayerList(); refreshProfile(); persist();
    if (b && b.isValid()) fit(b, { padding: [70, 70], maxZoom: 16 });
    return n;
  }
  function projLinkFor(items) {
    var o = { app: 'ScoutMap', v: 1, name: '', rail: 'route', base: S.base, ov: S.ov, grid: S.grid, layers: [] };
    var main = items.filter(function (x) { return x.type === 'route'; })[0] || items[0]; if (!main) return Promise.reject(new Error('rien'));
    items.forEach(function (it) {
      var rec = { type: it.type, vis: true, data: it.data, res: it.res || null };
      if (it === main) { o.rail = it.type; o.name = it.name || ''; o[it.type] = it.data; if (it.type === 'route' && it.res) o.res = it.res; }
      else o.layers.push(rec);
    });
    return projEncode(o).then(function (t) { return APP_URL + '#projet=' + t; });
  }
  function openProj(pid) {
    var e = projList().filter(function (x) { return x.id === pid; })[0]; if (!e) return;
    projAutosave(); loadProject(e.data, e.id); showSub(null);
  }
  function newTrace(t) {
    projAutosave();
    newProject(t || (S.mode === 'az' ? 'az' : S.mode === 'game' ? 'game' : 'route'));
  }
  // sélection de plusieurs tracés (Ctrl / Cmd + clic, Maj + clic pour une plage), puis Afficher, Imprimer ou Masquer d'un coup
  var LIBSEL = {}, libAnchor = 0;
  function libSelected() { return libEntries().filter(function (x) { return LIBSEL[x.id]; }); }
  function libShowSel() {
    var n = 0; libSelected().forEach(function (x) { if (x.id !== S.pid && !libShown(x.id)) n += addFromData(x.data, x.id) ? 1 : 0; });
    return n;
  }
  function libClick(e) {
    var host = e.target.closest('#lib-body'); if (!host) return;
    var b = e.target.closest('[data-a]'); if (!b) return;
    var a = b.dataset.a, li = b.closest('li'), pid = li ? +li.dataset.pid : 0;
    if (a === 'new') { newTrace(); return; }
    if (a === 'sel-all') { libEntries().forEach(function (x) { LIBSEL[x.id] = 1; }); renderMyLayers(); return; }
    if (a === 'sel-none') { LIBSEL = {}; renderMyLayers(); return; }
    if (a === 'sel-show') { libShowSel(); renderMyLayers(); return; }
    if (a === 'sel-hide') { var ids = libSelected().map(function (x) { return x.id; }); S.layers = S.layers.filter(function (l) { return ids.indexOf(l.pid) < 0; }); applyVis(); renderStored(); renderLayerList(); refreshProfile(); persist(); renderMyLayers(); return; }
    if (a === 'sel-print') {
      // n'imprime que la sélection : les autres tracés affichés sont retirés de la carte, la sélection y est ajoutée
      var keep = libSelected().map(function (x) { return x.id; });
      S.layers = S.layers.filter(function (l) { return !l.pid || keep.indexOf(l.pid) >= 0; });
      libShowSel(); applyVis(); renderStored(); renderLayerList(); persist(); renderMyLayers(); if (SM.openPdf) SM.openPdf({ group: true, pids: keep }); return;
    }
    if (a === 'open' && pid && (e.ctrlKey || e.metaKey || e.shiftKey)) {
      e.preventDefault();
      if (e.shiftKey && libAnchor) {
        var ls = libEntries().map(function (x) { return x.id; }), i0 = ls.indexOf(libAnchor), i1 = ls.indexOf(pid);
        if (i0 >= 0 && i1 >= 0) { if (!(e.ctrlKey || e.metaKey)) LIBSEL = {}; ls.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).forEach(function (id) { LIBSEL[id] = 1; }); }
      } else { if (LIBSEL[pid]) delete LIBSEL[pid]; else LIBSEL[pid] = 1; libAnchor = pid; }
      renderMyLayers(); return;
    }
    if (a === 'open' && pid) libAnchor = pid;
    if (a === 'file') { $('#file-layer').click(); return; }
    var ent = pid ? projList().filter(function (x) { return x.id === pid; })[0] : null; if (!ent) return;
    if (a === 'open') { if (pid !== S.pid) openProj(pid); else showSub(null); }
    else if (a === 'vis') {
      if (libShown(pid)) { S.layers = S.layers.filter(function (l) { return l.pid !== pid; }); applyVis(); renderStored(); renderLayerList(); refreshProfile(); persist(); }
      else addFromData(ent.data, pid);
    } else if (a === 'del') {
      if (!confirm('Supprimer « ' + ent.name + ' » de ce navigateur ?')) return;
      projStore(projList().filter(function (x) { return x.id !== pid; }));
      S.layers = S.layers.filter(function (l) { return l.pid !== pid; });
      renderStored(); renderLayerList(); refreshProfile(); persist();
    }
  }
  document.addEventListener('click', libClick);
  // renommer (double-clic sur le nom)
  document.addEventListener('dblclick', function (e) {
    var n = e.target.closest && e.target.closest('#lib-body .lib-row .lname'); if (!n) return;
    var li = n.closest('li'), pid = +li.dataset.pid, ent = projList().filter(function (x) { return x.id === pid; })[0]; if (!ent) return;
    var inp = document.createElement('input'); inp.className = 'lname-in'; inp.value = libName(ent); inp.maxLength = 60; n.replaceWith(inp); inp.focus(); inp.select();
    var done = false;
    function commit(save) {
      if (done) return; done = true; var v = inp.value.trim();
      if (save && v) {
        if (pid === S.pid) { S.name = v; $('#proj-name').value = v; persist(); projAutosave(); }
        else { var l = projList(); l.forEach(function (x) { if (x.id === pid) { x.name = v; if (x.data) x.data.name = v; } }); projStore(l); }
        // le tracé affiché sur la carte prend aussi le nouveau nom (pas de copie avec l'ancien nom à l'impression)
        S.layers.forEach(function (ly) { if (ly.pid === pid) ly.data.name = v; }); renderLayerList(); persist();
      }
      renderMyLayers();
    }
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') commit(true); else if (ev.key === 'Escape') commit(false); });
    inp.addEventListener('blur', function () { commit(true); });
  });
  ['route', 'az'].forEach(function (t) {
    var nb = document.getElementById(t + '-new'); if (nb) nb.addEventListener('click', function () { newTrace(t); });
    var lb = document.getElementById(t + '-lib'); if (lb) lb.addEventListener('click', function () { showSub('library'); });
  });
  // import : un PDF imprimé par ScoutMap devient un tracé de la bibliothèque ; un GPX / KML s'ajoute au tracé en cours
  $('#file-layer').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files); this.value = '';
    files.forEach(function (f) {
      if (/\.(gpx|kml|geojson)$/i.test(f.name)) { if (S.mode !== 'route' && S.mode !== 'az') setRail('route'); importGpx(f); return; }
      fileToProject(f).then(function (o) {
        if (!o) throw new Error('Ce fichier ne contient pas de travail ScoutMap.');
        var kinds = []; if (o.route && !isEmpty('route', o.route)) kinds.push('Itinéraire' + (o.res && o.res.dist ? ' ' + G.fmtDist(o.res.dist) : '')); if (o.az && !isEmpty('az', o.az)) kinds.push('Azimuts'); if (o.game && o.game.shapes && o.game.shapes.length) kinds.push('Grand jeu');
        if (!kinds.length) throw new Error('Aucun tracé dans ce fichier.');
        var name = o.name || (o.route && o.route.name) || f.name.replace(/\.[^.]+$/, '');
        var list = projList(); list.push({ id: nid(), name: name, updated: Date.now(), kinds: kinds, data: o }); projStore(list.slice(-60));
        renderMyLayers(); toast('« ' + name + ' » ajouté à la bibliothèque.');
      }).catch(function (er) { toast(er.message || 'Ouverture impossible.'); });
    });
  });
  $('#pop-tabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-tab]'); if (b) popTab(b.dataset.tab); });
  $('#ov-none').addEventListener('click', function () { OVERS.forEach(function (k) { S.ov[k] = false; }); applyLayers(); persist(); });
